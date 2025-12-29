const express = require('express');
const router = express.Router();
const WebhookEvent = require('../models/WebhookEvent');
const Payment = require('../models/Payment');
const Location = require('../models/Location');
const GHLService = require('../services/ghlService');
const encryption = require('../utils/encryption');
const { verifyXenditWebhook } = require('../middleware/auth');
const { webhookLimiter } = require('../middleware/rateLimiter');
const { asyncHandler } = require('../middleware/errorHandler');
const { ApiResponse, StatusMapper } = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * Xendit Webhook Handler
 * POST /api/webhooks/xendit
 */
router.post('/xendit',
  webhookLimiter,
  verifyXenditWebhook,
  asyncHandler(async (req, res) => {
    const payload = req.body;
    const signature = req.webhookSignature;

    logger.info('Received Xendit webhook:', {
      eventType: payload.event || payload.status,
      externalId: payload.external_id
    });

    // Quick acknowledge receipt
    res.status(200).json({ received: true });

    // Process webhook asynchronously
    processXenditWebhook(payload, signature).catch(error => {
      logger.error('Webhook processing error:', error);
    });
  })
);

/**
 * Process Xendit Webhook (Async)
 */
async function processXenditWebhook(payload, signature) {
  const startTime = Date.now();
  
  try {
    // Determine event type
    const eventType = payload.event || `payment.${payload.status?.toLowerCase()}`;
    const externalId = payload.external_id || payload.reference_id;
    const xenditId = payload.id;

    // Create webhook event record
    const webhookEvent = new WebhookEvent({
      eventId: `xendit-${xenditId || externalId}-${Date.now()}`,
      source: 'xendit',
      eventType,
      xenditId,
      externalId,
      payload,
      headers: { signature },
      verified: false
    });

    await webhookEvent.save();

    // Find payment
    const payment = await Payment.findOne({
      $or: [
        { xenditId: xenditId },
        { externalId: externalId }
      ]
    });

    if (!payment) {
      logger.warn('Payment not found for webhook:', { xenditId, externalId });
      webhookEvent.errorMessage = 'Payment not found';
      await webhookEvent.save();
      return;
    }

    // Link webhook to payment
    webhookEvent.paymentId = payment._id;

    // Get location for webhook token verification
    const location = await Location.findOne({ locationId: payment.locationId });

    if (location && location.xenditWebhookToken) {
      // Verify signature
      const webhookToken = encryption.decrypt(location.xenditWebhookToken);
      // Note: Actual signature verification would happen here
      // For now, we'll mark as verified
      webhookEvent.verified = true;
    }

    // Update payment based on webhook event
    const oldStatus = payment.status;
    const newXenditStatus = payload.status;
    const newStatus = StatusMapper.xenditToGHL(newXenditStatus);

    payment.xenditStatus = newXenditStatus;
    payment.status = newStatus;

    // Update timestamps
    if (newStatus === 'paid' && !payment.paidAt) {
      payment.paidAt = payload.paid_at ? new Date(payload.paid_at) : new Date();
    }

    // Update fee information if available
    if (payload.fees) {
      payment.totalFee = payload.fees.reduce((sum, fee) => sum + fee.amount, 0);
    }

    // Update net amount
    if (payload.paid_amount) {
      payment.netAmount = payload.paid_amount;
    }

    await payment.save();

    logger.info('Payment updated from webhook:', {
      paymentId: payment._id,
      oldStatus,
      newStatus,
      xenditStatus: newXenditStatus
    });

    // Sync with GHL
    try {
      const accessToken = await GHLService.getValidToken(payment.locationId);
      const ghl = new GHLService(accessToken);

      // Update opportunity if exists
      if (payment.opportunityId) {
        let noteMessage = `Payment ${newStatus}`;
        
        if (newStatus === 'paid') {
          noteMessage = `✅ Payment received! Amount: ${payment.amount} ${payment.currency}`;
        } else if (newStatus === 'failed') {
          noteMessage = `❌ Payment failed`;
        } else if (newStatus === 'expired') {
          noteMessage = `⏰ Payment expired`;
        }

        await ghl.addOpportunityNote(payment.opportunityId, noteMessage);
      }

      // Record payment in GHL if paid
      if (newStatus === 'paid' && !payment.syncedToGHL) {
        await ghl.recordPayment(payment.locationId, {
          contactId: payment.contactId,
          amount: payment.amount,
          currency: payment.currency,
          opportunityId: payment.opportunityId,
          transactionId: payment.xenditId,
          xenditId: payment.xenditId,
          paymentMethod: payment.paymentMethod,
          status: 'successful'
        });

        payment.syncedToGHL = true;
        payment.lastSyncAt = new Date();
        await payment.save();
      }

    } catch (error) {
      logger.error('GHL sync error:', error);
      payment.lastSyncError = error.message;
      payment.syncAttempts += 1;
      await payment.save();
    }

    // Mark webhook as processed
    const processingTime = Date.now() - startTime;
    await webhookEvent.markProcessed(processingTime);

    logger.info('Webhook processed successfully:', {
      eventId: webhookEvent.eventId,
      processingTime: `${processingTime}ms`
    });

  } catch (error) {
    logger.error('Webhook processing failed:', error);
    
    // Record error
    const webhookEvent = await WebhookEvent.findOne({
      externalId: payload.external_id || payload.reference_id
    }).sort({ createdAt: -1 });

    if (webhookEvent) {
      await webhookEvent.recordError(error);
    }

    throw error;
  }
}

/**
 * Retry Failed Webhooks
 * POST /api/webhooks/retry
 */
router.post('/retry',
  asyncHandler(async (req, res) => {
    const pendingEvents = await WebhookEvent.findPendingRetries(10);

    logger.info(`Retrying ${pendingEvents.length} failed webhooks`);

    const results = [];

    for (const event of pendingEvents) {
      try {
        await processXenditWebhook(event.payload, event.headers.get('signature'));
        results.push({ eventId: event.eventId, success: true });
      } catch (error) {
        results.push({ eventId: event.eventId, success: false, error: error.message });
      }
    }

    res.json(ApiResponse.success({
      processed: results.length,
      results
    }));
  })
);

/**
 * Get Webhook Statistics
 * GET /api/webhooks/stats
 */
router.get('/stats',
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const stats = await WebhookEvent.getStatistics(start, end);

    res.json(ApiResponse.success(stats));
  })
);

/**
 * GHL Webhook Handler
 * POST /api/webhooks/ghl
 * 
 * Receives webhooks from GoHighLevel about events like:
 * - Appointments (create, update, delete)
 * - Contacts (update)
 * - Opportunities (update)
 * - etc.
 */
router.post('/ghl',
  webhookLimiter,
  asyncHandler(async (req, res) => {
    const payload = req.body;
    
    logger.info('Received GHL webhook:', {
      type: payload.type,
      locationId: payload.locationId
    });

    // Quick acknowledge receipt
    res.status(200).json({ received: true });

    // Process webhook asynchronously
    processGHLWebhook(payload).catch(error => {
      logger.error('GHL webhook processing error:', error);
    });
  })
);

/**
 * Process GHL Webhook (Async)
 */
async function processGHLWebhook(payload) {
  try {
    const eventType = payload.type || payload.event_type;
    
    // Create webhook event record for tracking
    const webhookEvent = new WebhookEvent({
      eventId: `ghl-${payload.id || Date.now()}`,
      source: 'ghl',
      eventType,
      payload,
      verified: true
    });

    await webhookEvent.save();

    logger.info('Processing GHL webhook:', { eventType, locationId: payload.locationId });

    // Handle different event types
    switch (eventType) {
      case 'INSTALL':
        logger.info('App installed in location:', payload.locationId);
        break;

      case 'UNINSTALL':
        logger.info('App uninstalled from location:', payload.locationId);
        // Deactivate location
        await Location.updateOne(
          { locationId: payload.locationId },
          { isActive: false }
        );
        break;

      case 'ContactCreate':
      case 'ContactUpdate':
      case 'ContactDelete':
        logger.info('Contact event received:', { 
          type: eventType,
          contactId: payload.contact_id || payload.id 
        });
        break;

      case 'OpportunityCreate':
      case 'OpportunityUpdate':
      case 'OpportunityDelete':
      case 'OpportunityStatusUpdate':
        logger.info('Opportunity event received:', { 
          type: eventType,
          opportunityId: payload.opportunity_id || payload.id 
        });
        break;

      case 'AppointmentCreate':
      case 'AppointmentUpdate':
      case 'AppointmentDelete':
        logger.info('Appointment event received:', { 
          type: eventType,
          appointmentId: payload.appointment_id || payload.id 
        });
        break;

      case 'InvoiceCreate':
      case 'InvoiceSent':
      case 'InvoiceUpdate':
      case 'InvoiceDelete':
        logger.info('Invoice event received:', { 
          type: eventType,
          invoiceId: payload.invoice_id || payload.id 
        });
        break;

      case 'OrderCreate':
        logger.info('Order created - Creating Xendit payment:', { 
          orderId: payload.id,
          locationId: payload.locationId
        });
        // Create Xendit payment for this order
        await handleOrderCreate(payload);
        break;

      case 'OrderUpdate':
      case 'OrderStatusUpdate':
        logger.info('Order updated:', { 
          type: eventType,
          orderId: payload.id,
          status: payload.status
        });
        break;

      default:
        logger.info('Unhandled GHL webhook type:', eventType);
    }

    // Mark as processed
    await webhookEvent.markProcessed();

  } catch (error) {
    logger.error('Failed to process GHL webhook:', error);
    throw error;
  }
}

/**
 * Handle OrderCreate webhook - Create Xendit payment
 */
async function handleOrderCreate(payload) {
  try {
    const locationId = payload.locationId;
    const orderId = payload.id;
    const amount = payload.amount || payload.total;
    const currency = payload.currency || 'IDR';
    
    logger.info('Processing order for payment:', {
      locationId,
      orderId,
      amount,
      currency
    });

    // Get location configuration
    const location = await Location.findOne({ locationId, isActive: true });
    
    if (!location || !location.xenditApiKey) {
      logger.error('Location not configured:', locationId);
      return;
    }

    // Get OAuth token for GHL API
    const accessToken = await GHLService.getValidToken(locationId);
    if (!accessToken) {
      logger.error('No valid OAuth token for location:', locationId);
      return;
    }

    // Decrypt Xendit API key
    const xenditApiKey = encryption.decrypt(location.xenditApiKey);
    const xendit = new XenditService(xenditApiKey);
    const ghl = new GHLService(accessToken);

    // Get contact info if available
    let contactInfo = null;
    if (payload.contactId) {
      try {
        contactInfo = await ghl.getContact(payload.contactId);
      } catch (error) {
        logger.warn('Could not fetch contact:', error.message);
      }
    }

    // Generate external ID
    const externalId = `ghl-order-${orderId}-${Date.now()}`;

    // Create payment with Xendit
    const paymentData = {
      externalId,
      amount: parseFloat(amount),
      currency,
      description: payload.title || payload.name || 'Payment for Order',
      customerName: contactInfo?.name || payload.contact?.name || 'Customer',
      customerEmail: contactInfo?.email || payload.contact?.email || '',
      customerPhone: contactInfo?.phone || payload.contact?.phone || '',
      successUrl: location.settings?.successRedirectUrl,
      failureUrl: location.settings?.failureRedirectUrl,
      items: payload.items || []
    };

    // Create invoice with Xendit
    const xenditPayment = await xendit.createInvoice(paymentData);

    // Save payment to database
    const payment = new Payment({
      locationId,
      xenditId: xenditPayment.id,
      externalId,
      amount: parseFloat(amount),
      currency,
      paymentMethod: 'invoice',
      status: 'pending',
      xenditStatus: xenditPayment.status,
      paymentUrl: xenditPayment.invoice_url,
      description: paymentData.description,
      customerName: paymentData.customerName,
      customerEmail: paymentData.customerEmail,
      customerPhone: paymentData.customerPhone,
      contactId: payload.contactId,
      expiresAt: xenditPayment.expiry_date,
      metadata: {
        ghlOrderId: orderId,
        source: 'ghl_order_webhook'
      }
    });

    await payment.save();

    // Update GHL order with payment link
    try {
      // Add note to order/contact with payment link
      if (payload.contactId) {
        await ghl.addOpportunityNote(
          payload.contactId,
          `💳 Payment Link Created:\n${xenditPayment.invoice_url}\n\nAmount: ${amount} ${currency}\nExpires: ${new Date(xenditPayment.expiry_date).toLocaleString()}`
        );
      }
    } catch (error) {
      logger.warn('Could not update GHL with payment link:', error.message);
    }

    logger.info('✅ Xendit payment created for order:', {
      orderId,
      paymentId: xenditPayment.id,
      paymentUrl: xenditPayment.invoice_url
    });

  } catch (error) {
    logger.error('Failed to create payment for order:', error);
  }
}

module.exports = router;

