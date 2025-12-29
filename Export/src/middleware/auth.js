const Location = require('../models/Location');
const OAuthToken = require('../models/OAuthToken');
const logger = require('../utils/logger');

/**
 * Authentication Middleware
 */

/**
 * Verify location has valid OAuth token and active subscription
 */
async function verifyLocation(req, res, next) {
  try {
    const locationId = req.params.locationId || req.body.locationId || req.query.locationId;

    if (!locationId) {
      return res.status(400).json({
        success: false,
        error: 'Location ID is required'
      });
    }

    // Check if location exists and is active
    const location = await Location.findOne({ locationId, isActive: true });

    if (!location) {
      return res.status(404).json({
        success: false,
        error: 'Location not found or inactive'
      });
    }

    // Check if OAuth token exists
    const token = await OAuthToken.findValidToken(locationId);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'OAuth token not found. Please reconnect your account.'
      });
    }

    // Attach to request
    req.location = location;
    req.oauthToken = token;

    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}

/**
 * Verify subscription is active and has export permissions
 */
async function verifySubscription(req, res, next) {
  try {
    const location = req.location;

    if (!location) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Check if subscription is active
    if (!location.canExport()) {
      return res.status(403).json({
        success: false,
        error: 'Subscription inactive or expired. Please upgrade your plan.',
        subscriptionStatus: location.subscriptionStatus,
        subscriptionEndDate: location.subscriptionEndDate
      });
    }

    next();
  } catch (error) {
    logger.error('Subscription verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Subscription verification failed'
    });
  }
}

/**
 * Check export limits based on subscription tier
 */
async function checkExportLimits(req, res, next) {
  try {
    const location = req.location;

    if (!location) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Get export limits based on tier
    const limits = location.limits;

    // Check if user has reached daily/monthly limits
    // This is a placeholder - implement actual limit checking based on your business logic
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // You can add more sophisticated limit checking here
    // For example: daily export count, monthly message limit, etc.

    req.exportLimits = limits;

    next();
  } catch (error) {
    logger.error('Export limits check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check export limits'
    });
  }
}

/**
 * Verify API key (for external integrations)
 */
async function verifyApiKey(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key required'
      });
    }

    // Find location by API key (you'll need to add apiKey field to Location model)
    // This is a placeholder implementation
    const location = await Location.findOne({ 
      'settings.apiKey': apiKey,
      isActive: true 
    });

    if (!location) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }

    req.location = location;
    req.isApiRequest = true;

    next();
  } catch (error) {
    logger.error('API key verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'API key verification failed'
    });
  }
}

/**
 * Optional auth - continues even if not authenticated
 */
async function optionalAuth(req, res, next) {
  try {
    const locationId = req.params.locationId || req.query.locationId;

    if (locationId) {
      const location = await Location.findOne({ locationId, isActive: true });
      if (location) {
        req.location = location;
      }
    }

    next();
  } catch (error) {
    logger.error('Optional auth error:', error);
    next(); // Continue anyway
  }
}

module.exports = {
  verifyLocation,
  verifySubscription,
  checkExportLimits,
  verifyApiKey,
  optionalAuth
};
