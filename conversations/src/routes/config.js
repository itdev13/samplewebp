const express = require('express');
const router = express.Router();
const Location = require('../models/Location');
const encryption = require('../utils/encryption');
const { verifyGHLToken, optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { 
  validateConfigUpdate, 
  validateLocationId 
} = require('../middleware/validator');
const { ApiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * Verify Access Code
 * GET /api/config/:locationId/verify?code=xyz
 */
router.get('/:locationId/verify',
  validateLocationId,
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;
    const { code } = req.query;

    const location = await Location.findOne({ locationId });

    if (!location) {
      return res.json(ApiResponse.success({
        valid: false,
        message: 'Location not found'
      }));
    }

    if (!code || location.accessCode !== code) {
      return res.json(ApiResponse.success({
        valid: false,
        message: 'Invalid access code'
      }));
    }

    // Code is valid
    res.json(ApiResponse.success({
      valid: true,
      location: {
        locationId: location.locationId,
        name: location.name || 'Unknown Location',
        companyName: location.companyName || location.name || 'Unknown Company'
      }
    }));
  })
);

/**
 * Get Configuration
 * GET /api/config/:locationId
 */
router.get('/:locationId',
  optionalAuth,
  validateLocationId,
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;
    const { code } = req.query;

    const location = await Location.findOne({ locationId });

    if (!location) {
      return res.json(ApiResponse.success({
        configured: false,
        message: 'Location not configured'
      }));
    }

    // Verify access code if provided
    const hasValidCode = code && location.accessCode === code;

    // Return config without sensitive data
    const config = {
      locationId: location.locationId,
      companyId: location.companyId,
      name: location.name || 'Unknown Location',
      companyName: location.companyName || location.name || 'Unknown Company',
      email: location.email || '',
      phone: location.phone || '',
      hasValidAccess: hasValidCode,
      configured: !!location.xenditApiKey,
      isActive: location.isActive,
      enabledPaymentMethods: location.enabledPaymentMethods,
      defaultCurrency: location.defaultCurrency,
      settings: {
        invoiceDuration: location.settings?.invoiceDuration,
        autoCapture: location.settings?.autoCapture,
        sendEmailNotification: location.settings?.sendEmailNotification,
        sendSmsNotification: location.settings?.sendSmsNotification,
        successRedirectUrl: location.settings?.successRedirectUrl,
        failureRedirectUrl: location.settings?.failureRedirectUrl
      },
      createdAt: location.createdAt,
      updatedAt: location.updatedAt
    };

    res.json(ApiResponse.success(config));
  })
);

/**
 * Save/Update Configuration (No auth required for initial setup)
 * POST /api/config/:locationId
 */
router.post('/:locationId',
  validateLocationId,
  validateConfigUpdate,
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;
    const {
      xenditApiKey,
      xenditWebhookToken,
      enabledPaymentMethods,
      defaultCurrency,
      settings
    } = req.body;

    let location = await Location.findOne({ locationId });

    if (!location) {
      // Create new location if doesn't exist
      location = new Location({
        locationId,
        companyId: req.body.companyId || 'unknown' // Will be updated from OAuth
      });
    }

    // Update fields
    if (xenditApiKey) {
      location.xenditApiKey = encryption.encrypt(xenditApiKey);
    }

    if (xenditWebhookToken) {
      location.xenditWebhookToken = encryption.encrypt(xenditWebhookToken);
    }

    if (enabledPaymentMethods) {
      location.enabledPaymentMethods = enabledPaymentMethods;
    }

    if (defaultCurrency) {
      location.defaultCurrency = defaultCurrency;
    }

    if (settings) {
      location.settings = {
        ...location.settings,
        ...settings
      };
    }

    // Activate location if Xendit API key is provided
    if (xenditApiKey) {
      location.isActive = true;
    }

    await location.save();

    logger.info('Configuration saved:', {
      locationId,
      isActive: location.isActive
    });

    res.json(ApiResponse.success({
      locationId: location.locationId,
      configured: true,
      isActive: location.isActive
    }, 'Configuration saved successfully'));
  })
);

/**
 * Update Configuration
 * PUT /api/config/:locationId
 */
router.put('/:locationId',
  verifyGHLToken,
  validateLocationId,
  validateConfigUpdate,
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;
    const updates = req.body;

    const location = await Location.findOne({ locationId });

    if (!location) {
      return res.status(404).json(ApiResponse.error('Location not found'));
    }


    if (typeof updates.isActive !== 'undefined') {
      location.isActive = updates.isActive;
    }

    if (updates.name) {
      location.name = updates.name;
    }

    if (updates.companyName) {
      location.companyName = updates.companyName;
    }

    await location.save();

    logger.info('Configuration updated:', { locationId });

    res.json(ApiResponse.success({
      locationId: location.locationId,
      isActive: location.isActive
    }, 'Configuration updated successfully'));
  })
);

/**
 * Delete Configuration
 * DELETE /api/config/:locationId
 */
router.delete('/:locationId',
  verifyGHLToken,
  validateLocationId,
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;

    const location = await Location.findOne({ locationId });

    if (!location) {
      return res.status(404).json(ApiResponse.error('Location not found'));
    }

    // Soft delete - deactivate instead of removing
    location.isActive = false;
    await location.save();

    logger.info('Configuration deactivated:', { locationId });

    res.json(ApiResponse.success(null, 'Configuration deleted successfully'));
  })
);

/**
 * Test Xendit Connection
 * POST /api/config/:locationId/test
 */
router.post('/:locationId/test',
  verifyGHLToken,
  validateLocationId,
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json(ApiResponse.error('API key is required'));
    }

    try {
      const XenditService = require('../services/xenditService');
      const xendit = new XenditService(apiKey);
      
      // Try to get available banks (simple API call to test connection)
      const banks = xendit.getAvailableBanks();
      
      res.json(ApiResponse.success({
        connected: true,
        availableMethods: banks.length > 0
      }, 'Xendit connection successful'));
    } catch (error) {
      logger.error('Xendit connection test failed:', error);
      res.status(400).json(
        ApiResponse.error('Failed to connect to Xendit: ' + error.message)
      );
    }
  })
);

module.exports = router;

