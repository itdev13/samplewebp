const express = require('express');
const router = express.Router();
const XenditService = require('../services/xenditService');
const GHLService = require('../services/ghlService');
const Payment = require('../models/Payment');
const encryption = require('../utils/encryption');
const { 
  verifyGHLToken, 
  verifyXenditCredentials, 
  verifyPaymentMethod 
} = require('../middleware/auth');
const { paymentLimiter } = require('../middleware/rateLimiter');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  validatePaymentCreation,
  validateVirtualAccount,
  validateEWallet,
  validatePaymentId,
  validatePagination
} = require('../middleware/validator');
const { 
  ApiResponse, 
  generateExternalId, 
  formatPhoneNumber,
  StatusMapper 
} = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * Create Payment
 * POST /api/payments/create
 */
router.post('/create',
  paymentLimiter,
  verifyGHLToken,
  verifyXenditCredentials,
  verifyPaymentMethod,
  validatePaymentCreation,
  asyncHandler(async (req, res) => {
    const { locationId, accessToken, location } = req;
    const {
      amount,
      currency,
      paymentMethod,
      opportunityId,
      contactId,
      description,
      customerName,
      customerEmail,
      customerPhone,
      bankCode,
      channelCode,
      retailOutletName,
      successUrl,
      failureUrl,
      items,
      metadata
    } = req.body;

    logger.info('Creating payment:', {
      locationId,
      paymentMethod,
      amount,
      currency
    });

    // Decrypt Xendit API key
    const xenditApiKey = encryption.decrypt(location.xenditApiKey);
    const xendit = new XenditService(xenditApiKey);
    const ghl = new GHLService(accessToken);

    // Get contact information if available
    let contactInfo = null;
    if (contactId) {
      try {
        contactInfo = await ghl.getContact(contactId);
      } catch (error) {
        logger.warn('Could not fetch contact info:', error.message);
      }
    }

    // Prepare customer data
    const customerData = {
      customerName: customerName || 
        (contactInfo?.firstName && contactInfo?.lastName 
          ? `${contactInfo.firstName} ${contactInfo.lastName}` 
          : contactInfo?.name || 'Customer'),
      customerEmail: customerEmail || contactInfo?.email || '',
      customerPhone: customerPhone || contactInfo?.phone || ''
    };

    // Format phone number
    if (customerData.customerPhone) {
      try {
        customerData.customerPhone = formatPhoneNumber(customerData.customerPhone);
      } catch (error) {
        logger.warn('Phone formatting failed:', error.message);
      }
    }

    // Generate external ID
    const externalId = generateExternalId(locationId);

    // Prepare payment data
    const paymentData = {
      externalId,
      amount: parseFloat(amount),
      currency: currency || location.defaultCurrency,
      description: description || `Payment for GoHighLevel Opportunity`,
      contactId,
      ...customerData,
      successUrl: successUrl || location.settings?.successRedirectUrl,
      failureUrl: failureUrl || location.settings?.failureRedirectUrl,
      invoiceDuration: location.settings?.invoiceDuration,
      items: items || [],
      metadata: {
        locationId,
        opportunityId,
        contactId,
        ...metadata
      }
    };

    // Add method-specific fields
    if (paymentMethod === 'virtual_account') {
      if (!bankCode) {
        return res.status(400).json(
          ApiResponse.error('Bank code is required for virtual account')
        );
      }
      paymentData.bankCode = bankCode;
    } else if (paymentMethod === 'ewallet') {
      if (!channelCode) {
        return res.status(400).json(
          ApiResponse.error('Channel code is required for e-wallet')
        );
      }
      if (!customerData.customerPhone) {
        return res.status(400).json(
          ApiResponse.error('Customer phone is required for e-wallet')
        );
      }
      paymentData.channelCode = channelCode;
    } else if (paymentMethod === 'retail_outlet') {
      if (!retailOutletName) {
        return res.status(400).json(
          ApiResponse.error('Retail outlet name is required')
        );
      }
      paymentData.retailOutletName = retailOutletName;
    }

    // Create payment with Xendit
    let xenditResponse;
    try {
      switch (paymentMethod) {
        case 'invoice':
          xenditResponse = await xendit.createInvoice(paymentData);
          break;
        case 'virtual_account':
          xenditResponse = await xendit.createVirtualAccount(paymentData);
          break;
        case 'ewallet':
          xenditResponse = await xendit.createEWalletCharge(paymentData);
          break;
        case 'qris':
          xenditResponse = await xendit.createQRIS(paymentData);
          break;
        case 'retail_outlet':
          xenditResponse = await xendit.createRetailOutlet(paymentData);
          break;
        default:
          return res.status(400).json(
            ApiResponse.error(`Payment method '${paymentMethod}' not yet implemented`)
          );
      }
    } catch (error) {
      logger.error('Xendit payment creation failed:', error);
      return res.status(500).json(
        ApiResponse.error('Failed to create payment with Xendit: ' + error.message)
      );
    }

    // Store payment in database
    const payment = new Payment({
      locationId,
      opportunityId,
      contactId,
      xenditId: xenditResponse.id || xenditResponse.external_id,
      externalId,
      amount: parseFloat(amount),
      currency: currency || location.defaultCurrency,
      paymentMethod,
      status: 'pending',
      xenditStatus: xenditResponse.status,
      paymentUrl: xenditResponse.invoice_url || xenditResponse.checkout_url || xenditResponse.actions?.desktop_web_checkout_url,
      description: description || `Payment for GoHighLevel Opportunity`,
      customerName: customerData.customerName,
      customerEmail: customerData.customerEmail,
      customerPhone: customerData.customerPhone,
      channelCode: channelCode || null,
      bankCode: bankCode || null,
      accountNumber: xenditResponse.account_number || null,
      qrCodeUrl: xenditResponse.qr_string || null,
      expiresAt: xenditResponse.expiry_date || xenditResponse.expires_at || xenditResponse.expiration_date,
      items: items || [],
      metadata: paymentData.metadata
    });

    await payment.save();

    logger.info('Payment created successfully:', {
      paymentId: payment._id,
      xenditId: payment.xenditId,
      externalId
    });

    // Update GHL opportunity if provided
    if (opportunityId) {
      try {
        await ghl.addOpportunityNote(
          opportunityId,
          `Payment request created via Xendit (${paymentMethod})\nAmount: ${amount} ${currency}\nPayment ID: ${payment.xenditId}`
        );
      } catch (error) {
        logger.warn('Could not add note to opportunity:', error.message);
      }
    }

    // Prepare response
    const response = {
      id: payment._id,
      xenditId: payment.xenditId,
      externalId: payment.externalId,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      paymentMethod: payment.paymentMethod,
      paymentUrl: payment.paymentUrl,
      qrCodeUrl: payment.qrCodeUrl,
      accountNumber: payment.accountNumber,
      bankCode: payment.bankCode,
      channelCode: payment.channelCode,
      expiresAt: payment.expiresAt,
      createdAt: payment.createdAt
    };

    res.json(ApiResponse.success(response, 'Payment created successfully'));
  })
);

/**
 * Get Payment Status
 * GET /api/payments/:paymentId
 */
router.get('/:paymentId',
  verifyGHLToken,
  validatePaymentId,
  asyncHandler(async (req, res) => {
    const { locationId } = req;
    const { paymentId } = req.params;

    const payment = await Payment.findOne({
      $or: [
        { _id: paymentId },
        { xenditId: paymentId },
        { externalId: paymentId }
      ],
      locationId
    });

    if (!payment) {
      return res.status(404).json(ApiResponse.error('Payment not found'));
    }

    res.json(ApiResponse.success(payment));
  })
);

/**
 * Get Payment List
 * GET /api/payments
 */
router.get('/',
  verifyGHLToken,
  validatePagination,
  asyncHandler(async (req, res) => {
    const { locationId } = req;
    const { 
      page = 1, 
      limit = 20, 
      status, 
      paymentMethod,
      startDate,
      endDate
    } = req.query;

    const query = { locationId };

    if (status) {
      query.status = status;
    }

    if (paymentMethod) {
      query.paymentMethod = paymentMethod;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;
    const total = await Payment.countDocuments(query);
    const payments = await Payment.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json(ApiResponse.paginated(payments, page, limit, total));
  })
);

/**
 * Sync Payment Status with Xendit
 * POST /api/payments/:paymentId/sync
 */
router.post('/:paymentId/sync',
  verifyGHLToken,
  verifyXenditCredentials,
  validatePaymentId,
  asyncHandler(async (req, res) => {
    const { locationId, location } = req;
    const { paymentId } = req.params;

    const payment = await Payment.findOne({
      $or: [{ _id: paymentId }, { xenditId: paymentId }],
      locationId
    });

    if (!payment) {
      return res.status(404).json(ApiResponse.error('Payment not found'));
    }

    // Decrypt Xendit API key and get status
    const xenditApiKey = encryption.decrypt(location.xenditApiKey);
    const xendit = new XenditService(xenditApiKey);

    try {
      const xenditPayment = await xendit.getPaymentStatus(
        payment.xenditId,
        payment.paymentMethod
      );

      // Update payment status
      const oldStatus = payment.status;
      payment.xenditStatus = xenditPayment.status;
      payment.status = StatusMapper.xenditToGHL(xenditPayment.status);

      if (payment.status === 'paid' && !payment.paidAt) {
        payment.paidAt = new Date();
      }

      await payment.save();

      logger.info('Payment status synced:', {
        paymentId: payment._id,
        oldStatus,
        newStatus: payment.status
      });

      res.json(ApiResponse.success(payment, 'Payment status synced successfully'));
    } catch (error) {
      logger.error('Failed to sync payment status:', error);
      return res.status(500).json(
        ApiResponse.error('Failed to sync payment status: ' + error.message)
      );
    }
  })
);

/**
 * Get Available Payment Methods
 * GET /api/payments/methods/available
 */
router.get('/methods/available',
  verifyGHLToken,
  verifyXenditCredentials,
  asyncHandler(async (req, res) => {
    const { location } = req;
    const xenditApiKey = encryption.decrypt(location.xenditApiKey);
    const xendit = new XenditService(xenditApiKey);

    const methods = [
      {
        value: 'invoice',
        name: 'Payment Invoice',
        description: 'Create a payment invoice link',
        supportedCurrencies: ['IDR', 'PHP', 'USD'],
        enabled: location.isPaymentMethodEnabled('invoice')
      },
      {
        value: 'virtual_account',
        name: 'Virtual Account',
        description: 'Bank virtual account payment',
        supportedCurrencies: ['IDR'],
        enabled: location.isPaymentMethodEnabled('virtual_account'),
        banks: xendit.getAvailableBanks()
      },
      {
        value: 'ewallet',
        name: 'E-Wallet',
        description: 'E-wallet payment (OVO, DANA, etc.)',
        supportedCurrencies: ['IDR', 'PHP'],
        enabled: location.isPaymentMethodEnabled('ewallet'),
        channels: xendit.getAvailableEWallets()
      },
      {
        value: 'qris',
        name: 'QRIS',
        description: 'QR Code Indonesian Standard',
        supportedCurrencies: ['IDR'],
        enabled: location.isPaymentMethodEnabled('qris')
      },
      {
        value: 'retail_outlet',
        name: 'Retail Outlet',
        description: 'Pay at retail stores',
        supportedCurrencies: ['IDR'],
        enabled: location.isPaymentMethodEnabled('retail_outlet'),
        outlets: xendit.getAvailableRetailOutlets()
      }
    ];

    const enabledMethods = methods.filter(m => m.enabled);

    res.json(ApiResponse.success({
      all: methods,
      enabled: enabledMethods
    }));
  })
);

module.exports = router;

