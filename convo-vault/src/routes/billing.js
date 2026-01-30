const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');
const billingService = require('../services/billingService');
const ghlService = require('../services/ghlService');
const BillingTransaction = require('../models/BillingTransaction');
const ExportJob = require('../models/ExportJob');
const OAuthToken = require('../models/OAuthToken');
const logger = require('../utils/logger');
const { logError, getUserFriendlyMessage } = require('../utils/errorLogger');
const { authenticateSession } = require('../middleware/auth');

// Initialize AWS Lambda client
const lambda = new AWS.Lambda({
  region: process.env.AWS_REGION || 'us-east-1'
});

const LAMBDA_FUNCTION_NAME = process.env.EXPORT_LAMBDA_FUNCTION_NAME || 'convo-vault-export';

/**
 * Billing Routes - Handle export pricing, charges, and job management
 */

// Maximum date range for exports (1 year in milliseconds)
const MAX_DATE_RANGE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Validate date range doesn't exceed 1 year
 */
function validateDateRange(startDate, endDate) {
  if (!startDate || !endDate) return { valid: true };

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { valid: false, error: 'Invalid date format' };
  }

  if (end - start > MAX_DATE_RANGE_MS) {
    return { valid: false, error: 'Date range cannot exceed 1 year' };
  }

  if (end < start) {
    return { valid: false, error: 'End date must be after start date' };
  }

  return { valid: true };
}

/**
 * @route POST /api/billing/estimate
 * @desc Get cost estimate for export
 */
router.post('/estimate', authenticateSession, async (req, res) => {
  try {
    const { locationId, exportType, filters } = req.body;

    if (!locationId) {
      return res.status(400).json({
        success: false,
        error: 'locationId is required'
      });
    }

    if (!exportType || !['conversations', 'messages'].includes(exportType)) {
      return res.status(400).json({
        success: false,
        error: 'exportType must be "conversations" or "messages"'
      });
    }

    // Validate date range
    const dateValidation = validateDateRange(filters?.startDate, filters?.endDate);
    if (!dateValidation.valid) {
      return res.status(400).json({
        success: false,
        error: dateValidation.error
      });
    }

    logger.info('Calculating export estimate', { locationId, exportType, filters });

    let counts = {
      conversations: 0,
      smsMessages: 0,
      emailMessages: 0
    };

    if (exportType === 'conversations') {
      // Fetch first page of conversations to estimate count
      const result = await ghlService.searchConversations(locationId, {
        ...filters,
        limit: 100
      });

      // Use total from response if available, otherwise use fetched count
      const total = result.total || result.conversations?.length || 0;
      counts.conversations = total;

    } else if (exportType === 'messages') {
      // Fetch first page of messages to estimate count and types
      const result = await ghlService.exportMessages(locationId, {
        ...filters,
        limit: 100
      });

      const messages = result.messages || [];
      const total = result.total || messages.length;

      // Count message types from sample
      // Email = TYPE_EMAIL or type 3, everything else = text message
      let textCount = 0, emailCount = 0;
      messages.forEach(msg => {
        const type = String(msg.type || '').toLowerCase();
        if (type.includes('email') || type === '3' || type === 'type_email') {
          emailCount++;
        } else {
          textCount++; // SMS, WhatsApp, Call, GMB, FB, etc.
        }
      });

      // Extrapolate if we have more items than sample
      if (messages.length > 0 && total > messages.length) {
        const ratio = total / messages.length;
        counts.smsMessages = Math.round(textCount * ratio);
        counts.emailMessages = Math.round(emailCount * ratio);
      } else {
        counts.smsMessages = textCount;
        counts.emailMessages = emailCount;
      }
    }

    // Get access token to fetch actual prices from GHL
    const tokenData = await ghlService.getValidToken(locationId);
    const accessToken = tokenData.accessToken || tokenData;

    // Calculate estimate with actual GHL meter prices
    const estimate = await billingService.calculateEstimateWithPrices(counts, accessToken, locationId);

    res.json({
      success: true,
      data: {
        estimate,
        filters,
        exportType,
        discountTiers: billingService.getDiscountTiers(),
        unitPrices: billingService.getUnitPrices()
      }
    });

  } catch (error) {
    logError('Estimate calculation error', error, {
      locationId: req.body?.locationId,
      exportType: req.body?.exportType
    });

    res.status(500).json({
      success: false,
      error: 'Failed to calculate estimate',
      message: getUserFriendlyMessage(error)
    });
  }
});

/**
 * @route POST /api/billing/charge-and-export
 * @desc Check funds, charge wallet, create job, trigger Lambda
 */
router.post('/charge-and-export', authenticateSession, async (req, res) => {
  try {
    const { locationId, exportType, format, filters, notificationEmail } = req.body;
    const { companyId, userId } = req.user;

    if (!locationId) {
      return res.status(400).json({
        success: false,
        error: 'locationId is required'
      });
    }

    if (!exportType || !['conversations', 'messages'].includes(exportType)) {
      return res.status(400).json({
        success: false,
        error: 'exportType must be "conversations" or "messages"'
      });
    }

    // Validate date range
    const dateValidation = validateDateRange(filters?.startDate, filters?.endDate);
    if (!dateValidation.valid) {
      return res.status(400).json({
        success: false,
        error: dateValidation.error
      });
    }

    logger.info('Starting charge-and-export', { locationId, exportType, companyId });

    // Step 1: Get counts for billing
    let counts = {
      conversations: 0,
      smsMessages: 0,
      emailMessages: 0
    };
    let totalItems = 0;

    if (exportType === 'conversations') {
      const result = await ghlService.searchConversations(locationId, {
        ...filters,
        limit: 100
      });
      totalItems = result.total || result.conversations?.length || 0;
      counts.conversations = totalItems;
    } else {
      const result = await ghlService.exportMessages(locationId, {
        ...filters,
        limit: 100
      });
      const messages = result.messages || [];
      totalItems = result.total || messages.length;

      // Count types from sample and extrapolate
      // Email = TYPE_EMAIL or type 3, everything else = text message
      let textCount = 0, emailCount = 0;
      messages.forEach(msg => {
        const type = String(msg.type || '').toLowerCase();
        if (type.includes('email') || type === '3' || type === 'type_email') emailCount++;
        else textCount++; // SMS, WhatsApp, Call, GMB, FB, etc.
      });

      if (messages.length > 0 && totalItems > messages.length) {
        const ratio = totalItems / messages.length;
        counts.smsMessages = Math.round(textCount * ratio);
        counts.emailMessages = Math.round(emailCount * ratio);
      } else {
        counts.smsMessages = textCount;
        counts.emailMessages = emailCount;
      }
    }

    if (totalItems === 0) {
      return res.status(400).json({
        success: false,
        error: 'No items found matching the filters'
      });
    }

    // Step 2: Get access token for billing API
    const tokenData = await ghlService.getValidToken(locationId);
    const accessToken = tokenData.accessToken || tokenData;

    // Step 3: Calculate pricing with actual GHL meter prices
    const estimate = await billingService.calculateEstimateWithPrices(counts, accessToken, locationId);

    // Step 4: Check wallet funds
    const hasFunds = await billingService.hasFunds(companyId, accessToken);
    // if (!hasFunds) {
    //   return res.status(402).json({
    //     success: false,
    //     error: 'Insufficient wallet balance',
    //     message: 'Please add funds to your GHL wallet to continue'
    //   });
    // }

    // Step 5: Create billing transaction (pending)
    const meterCharges = billingService.buildMeterCharges(counts);

    const transaction = await BillingTransaction.create({
      locationId,
      companyId,
      type: `export_${exportType}`,
      itemCounts: {
        ...counts,
        total: totalItems
      },
      pricing: {
        baseAmount: estimate.baseAmount,
        discountPercent: estimate.discountPercent,
        discountAmount: estimate.discountAmount,
        finalAmount: estimate.finalAmount
      },
      meterCharges,
      status: 'pending',
      userId
    });

    // Step 6: Charge wallet
    try {
      const chargeResult = await billingService.chargeWallet(companyId, accessToken, meterCharges);

      // Update transaction with charge IDs
      transaction.ghlChargeId = chargeResult.charges.map(c => c.chargeId).join(',');
      transaction.status = 'charged';
      await transaction.save();

    } catch (chargeError) {
      // Mark transaction as failed
      transaction.status = 'failed';
      transaction.errorMessage = chargeError.message;
      await transaction.save();

      return res.status(402).json({
        success: false,
        error: 'Payment failed',
        message: chargeError.message
      });
    }

    // Step 7: Get refresh token for Lambda to use
    const oauthToken = await OAuthToken.findActiveToken(locationId);
    if (!oauthToken || !oauthToken.refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'No valid OAuth token found for this location'
      });
    }

    // Step 8: Create export job with refresh token
    const exportJob = await ExportJob.create({
      locationId,
      companyId,
      billingTransactionId: transaction._id,
      exportType,
      format: format || 'csv',
      filters: {
        channel: filters?.channel || null,
        startDate: filters?.startDate ? new Date(filters.startDate) : null,
        endDate: filters?.endDate ? new Date(filters.endDate) : null,
        contactId: filters?.contactId || null
      },
      totalItems,
      status: 'pending',
      notificationEmail: notificationEmail || null,
      userId,
      refreshToken: oauthToken.refreshToken  // Store for Lambda
    });

    // Update transaction with job reference
    transaction.exportJobId = exportJob._id;
    await transaction.save();

    // Step 9: Trigger Lambda function
    try {
      const lambdaParams = {
        FunctionName: LAMBDA_FUNCTION_NAME,
        InvocationType: 'Event',  // Async invocation
        Payload: JSON.stringify({
          exportJobId: exportJob._id.toString()
        })
      };

      const lambdaResult = await lambda.invoke(lambdaParams).promise();

      // Update job status
      exportJob.status = 'processing';
      exportJob.startedAt = new Date();
      exportJob.lambdaRequestId = lambdaResult.$response?.requestId || null;
      await exportJob.save();

      logger.info('Lambda triggered successfully', {
        jobId: exportJob._id,
        requestId: lambdaResult.$response?.requestId
      });

    } catch (lambdaError) {
      // Lambda invocation failed - mark job but don't fail the request
      // Job can be retried later
      logger.error('Lambda invocation failed', {
        jobId: exportJob._id,
        error: lambdaError.message
      });

      exportJob.status = 'pending';
      exportJob.errorMessage = `Lambda invocation failed: ${lambdaError.message}`;
      await exportJob.save();
    }

    logger.info('Export job created', {
      jobId: exportJob._id,
      transactionId: transaction._id,
      totalItems
    });

    res.json({
      success: true,
      message: 'Export started successfully',
      data: {
        jobId: exportJob._id,
        transactionId: transaction._id,
        totalItems,
        estimatedAmount: estimate.finalAmountDollars,
        status: exportJob.status
      }
    });

  } catch (error) {
    logError('Charge and export error', error, {
      locationId: req.body?.locationId,
      exportType: req.body?.exportType
    });

    res.status(500).json({
      success: false,
      error: 'Failed to start export',
      message: getUserFriendlyMessage(error)
    });
  }
});

/**
 * @route GET /api/billing/export-status/:jobId
 * @desc Get export job status
 */
router.get('/export-status/:jobId', authenticateSession, async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await ExportJob.findById(jobId).populate('billingTransactionId');

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Export job not found'
      });
    }

    // Verify user has access (same location)
    if (job.locationId !== req.query.locationId && job.locationId !== req.body?.locationId) {
      // Allow if user is from same company
      if (job.companyId !== req.user?.companyId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
    }

    res.json({
      success: true,
      data: {
        jobId: job._id,
        exportType: job.exportType,
        format: job.format,
        status: job.status,
        progress: {
          total: job.totalItems,
          processed: job.processedItems,
          percent: job.totalItems > 0 ? Math.round((job.processedItems / job.totalItems) * 100) : 0
        },
        downloadUrl: job.status === 'completed' ? job.downloadUrl : null,
        downloadUrlExpiresAt: job.downloadUrlExpiresAt,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
        billing: job.billingTransactionId ? {
          amount: (job.billingTransactionId.pricing.finalAmount / 100).toFixed(2),
          status: job.billingTransactionId.status
        } : null
      }
    });

  } catch (error) {
    logError('Get export status error', error, { jobId: req.params?.jobId });

    res.status(500).json({
      success: false,
      error: 'Failed to get export status'
    });
  }
});

/**
 * @route GET /api/billing/export-history
 * @desc Get recent export jobs for location
 */
router.get('/export-history', authenticateSession, async (req, res) => {
  try {
    const { locationId, limit } = req.query;

    if (!locationId) {
      return res.status(400).json({
        success: false,
        error: 'locationId is required'
      });
    }

    const jobs = await ExportJob.getRecentJobs(locationId, parseInt(limit) || 20);

    res.json({
      success: true,
      data: {
        total: jobs.length,
        jobs: jobs.map(job => ({
          jobId: job._id,
          exportType: job.exportType,
          format: job.format,
          status: job.status,
          totalItems: job.totalItems,
          processedItems: job.processedItems,
          downloadUrl: job.status === 'completed' ? job.downloadUrl : null,
          downloadUrlExpiresAt: job.downloadUrlExpiresAt,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          billing: job.billingTransactionId ? {
            amount: (job.billingTransactionId.pricing.finalAmount / 100).toFixed(2)
          } : null
        }))
      }
    });

  } catch (error) {
    logError('Get export history error', error, { locationId: req.query?.locationId });

    res.status(500).json({
      success: false,
      error: 'Failed to get export history'
    });
  }
});

/**
 * @route GET /api/billing/pricing
 * @desc Get current pricing information
 */
router.get('/pricing', async (req, res) => {
  res.json({
    success: true,
    data: {
      unitPrices: billingService.getUnitPrices(),
      discountTiers: billingService.getDiscountTiers(),
      maxDateRange: '1 year'
    }
  });
});

module.exports = router;
