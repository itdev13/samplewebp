const express = require('express');
const router = express.Router();
const Location = require('../models/Location');
const logger = require('../utils/logger');
const { verifyLocation } = require('../middleware/auth');
const { validateSettingsUpdate } = require('../middleware/validator');
const { apiLimiter } = require('../middleware/rateLimiter');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Configuration Routes
 * Handles location settings and preferences
 */

/**
 * @route GET /api/config/:locationId
 * @desc Get location configuration
 */
router.get(
  '/:locationId',
  apiLimiter,
  verifyLocation,
  asyncHandler(async (req, res) => {
    const location = req.location;

    res.json({
      success: true,
      data: {
        locationId: location.locationId,
        name: location.name,
        subscriptionTier: location.subscriptionTier,
        subscriptionStatus: location.subscriptionStatus,
        subscriptionEndDate: location.subscriptionEndDate,
        limits: location.limits,
        settings: location.settings,
        stats: location.stats
      }
    });
  })
);

/**
 * @route PUT /api/config/:locationId/settings
 * @desc Update location settings
 */
router.put(
  '/:locationId/settings',
  apiLimiter,
  verifyLocation,
  validateSettingsUpdate,
  asyncHandler(async (req, res) => {
    const location = req.location;
    const updates = req.body;

    // Update settings
    Object.keys(updates).forEach(key => {
      if (location.settings[key] !== undefined || key in location.settings) {
        location.settings[key] = updates[key];
      } else {
        location.settings[key] = updates[key];
      }
    });

    location.markModified('settings');
    await location.save();

    logger.info('Location settings updated:', {
      locationId: location.locationId,
      updates: Object.keys(updates)
    });

    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings: location.settings
    });
  })
);

/**
 * @route GET /api/config/:locationId/subscription
 * @desc Get subscription details
 */
router.get(
  '/:locationId/subscription',
  apiLimiter,
  verifyLocation,
  asyncHandler(async (req, res) => {
    const location = req.location;

    res.json({
      success: true,
      subscription: {
        tier: location.subscriptionTier,
        status: location.subscriptionStatus,
        startDate: location.subscriptionStartDate,
        endDate: location.subscriptionEndDate,
        isActive: location.isSubscriptionActive,
        limits: location.limits
      }
    });
  })
);

/**
 * @route PUT /api/config/:locationId/subscription
 * @desc Update subscription (for admin/webhook use)
 */
router.put(
  '/:locationId/subscription',
  apiLimiter,
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;
    const { tier, status, endDate } = req.body;

    const location = await Location.findOne({ locationId });

    if (!location) {
      return res.status(404).json({
        success: false,
        error: 'Location not found'
      });
    }

    // Update subscription
    if (tier) {
      location.subscriptionTier = tier;

      // Update limits based on tier
      switch (tier) {
        case 'starter':
          location.limits.maxLocations = 5;
          location.limits.maxMessagesPerExport = 10000;
          location.limits.exportRetentionDays = 30;
          break;
        case 'professional':
          location.limits.maxLocations = 25;
          location.limits.maxMessagesPerExport = 50000;
          location.limits.exportRetentionDays = 90;
          break;
        case 'enterprise':
          location.limits.maxLocations = 999999;
          location.limits.maxMessagesPerExport = 999999;
          location.limits.exportRetentionDays = 365;
          break;
        case 'trial':
          location.limits.maxLocations = 1;
          location.limits.maxMessagesPerExport = 1000;
          location.limits.exportRetentionDays = 7;
          break;
      }
    }

    if (status) {
      location.subscriptionStatus = status;
    }

    if (endDate) {
      location.subscriptionEndDate = new Date(endDate);
    }

    await location.save();

    logger.info('Subscription updated:', {
      locationId,
      tier,
      status
    });

    res.json({
      success: true,
      message: 'Subscription updated successfully',
      subscription: {
        tier: location.subscriptionTier,
        status: location.subscriptionStatus,
        endDate: location.subscriptionEndDate,
        limits: location.limits
      }
    });
  })
);

/**
 * @route GET /api/config/:locationId/usage
 * @desc Get usage statistics
 */
router.get(
  '/:locationId/usage',
  apiLimiter,
  verifyLocation,
  asyncHandler(async (req, res) => {
    const location = req.location;

    // Calculate usage percentages
    const usagePercentage = location.limits.maxMessagesPerExport 
      ? (location.stats.totalMessagesExported / location.limits.maxMessagesPerExport) * 100 
      : 0;

    res.json({
      success: true,
      usage: {
        totalExports: location.stats.totalExports,
        totalMessagesExported: location.stats.totalMessagesExported,
        lastExportDate: location.stats.lastExportDate,
        limits: location.limits,
        usagePercentage: Math.round(usagePercentage * 100) / 100
      }
    });
  })
);

/**
 * @route POST /api/config/:locationId/test-connection
 * @desc Test GHL API connection
 */
router.post(
  '/:locationId/test-connection',
  apiLimiter,
  verifyLocation,
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;
    const ghlService = require('../services/ghlService');

    try {
      // Try to fetch location details
      const locationDetails = await ghlService.getLocation(locationId);

      res.json({
        success: true,
        message: 'Connection successful',
        location: {
          id: locationDetails.id,
          name: locationDetails.name,
          address: locationDetails.address
        }
      });
    } catch (error) {
      logger.error('Connection test failed:', error);
      res.status(500).json({
        success: false,
        error: 'Connection test failed',
        details: error.message
      });
    }
  })
);

/**
 * @route POST /api/config/:locationId/sync
 * @desc Sync location details from GHL API
 */
router.post(
  '/:locationId/sync',
  apiLimiter,
  verifyLocation,
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;
    const location = req.location;
    const ghlService = require('../services/ghlService');

    try {
      // Fetch latest location details from GHL
      const ghlLocation = await ghlService.getLocation(locationId);

      // Update location in database
      location.name = ghlLocation.name || ghlLocation.companyName || locationId;
      location.address = ghlLocation.address;
      location.city = ghlLocation.city;
      location.state = ghlLocation.state;
      location.country = ghlLocation.country;

      await location.save();

      logger.info('Location details synced:', {
        locationId,
        name: location.name
      });

      res.json({
        success: true,
        message: 'Location details synced successfully',
        location: {
          locationId: location.locationId,
          name: location.name,
          address: location.address,
          city: location.city,
          state: location.state,
          country: location.country
        }
      });
    } catch (error) {
      logger.error('Failed to sync location details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to sync location details',
        details: error.message
      });
    }
  })
);

/**
 * @route DELETE /api/config/:locationId
 * @desc Delete location configuration (uninstall)
 */
router.delete(
  '/:locationId',
  apiLimiter,
  asyncHandler(async (req, res) => {
    const { locationId } = req.params;

    await Location.findOneAndUpdate(
      { locationId },
      {
        isActive: false,
        uninstalledAt: new Date()
      }
    );

    logger.info('Location uninstalled:', { locationId });

    res.json({
      success: true,
      message: 'Configuration deleted successfully'
    });
  })
);

module.exports = router;

