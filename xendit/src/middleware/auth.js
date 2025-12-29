const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const OAuthToken = require('../models/OAuthToken');
const Location = require('../models/Location');

/**
 * Verify GHL JWT token from request
 */
const verifyGHLToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token required'
      });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user info to request
    req.user = decoded;
    req.locationId = decoded.locationId;
    req.companyId = decoded.companyId;
    
    // Get access token for GHL API calls
    const oauthToken = await OAuthToken.findActiveToken(decoded.locationId);
    
    if (!oauthToken) {
      return res.status(401).json({
        success: false,
        message: 'OAuth token not found or expired'
      });
    }

    req.accessToken = oauthToken.accessToken;
    
    next();
  } catch (error) {
    logger.error('Token verification error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

/**
 * Verify location has valid Xendit credentials
 */
const verifyXenditCredentials = async (req, res, next) => {
  try {
    const { locationId } = req;
    
    const location = await Location.findOne({ locationId, isActive: true });
    
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found or not configured'
      });
    }

    if (!location.xenditApiKey) {
      return res.status(400).json({
        success: false,
        message: 'Xendit credentials not configured. Please configure your API key first.'
      });
    }

    req.location = location;
    next();
  } catch (error) {
    logger.error('Credential verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify credentials'
    });
  }
};

/**
 * Optional auth - doesn't fail if token is missing
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      req.user = decoded;
      req.locationId = decoded.locationId;
      req.companyId = decoded.companyId;
      
      const oauthToken = await OAuthToken.findActiveToken(decoded.locationId);
      if (oauthToken) {
        req.accessToken = oauthToken.accessToken;
      }
    }
    
    next();
  } catch (error) {
    // Continue without auth
    next();
  }
};

/**
 * Verify webhook signature from Xendit
 */
const verifyXenditWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-callback-token'] || req.headers['webhook-signature'];
    
    if (!signature) {
      logger.warn('Webhook signature missing');
      return res.status(401).json({
        success: false,
        message: 'Webhook signature required'
      });
    }

    // Verify signature if webhook verification is enabled
    if (process.env.XENDIT_WEBHOOK_VERIFY === 'true') {
      // Signature verification will be done in the webhook handler
      // with location-specific token
      req.webhookSignature = signature;
    }
    
    next();
  } catch (error) {
    logger.error('Webhook verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Webhook verification failed'
    });
  }
};

/**
 * Check if payment method is enabled for location
 */
const verifyPaymentMethod = async (req, res, next) => {
  try {
    const { location } = req;
    const { paymentMethod } = req.body;
    
    if (!paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Payment method is required'
      });
    }

    if (!location.isPaymentMethodEnabled(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: `Payment method '${paymentMethod}' is not enabled for this location`
      });
    }

    next();
  } catch (error) {
    logger.error('Payment method verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify payment method'
    });
  }
};

/**
 * Generate JWT token for location
 */
const generateToken = (locationId, companyId, expiresIn = '7d') => {
  return jwt.sign(
    {
      locationId,
      companyId,
      type: 'location_access'
    },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

module.exports = {
  verifyGHLToken,
  verifyXenditCredentials,
  optionalAuth,
  verifyXenditWebhook,
  verifyPaymentMethod,
  generateToken
};

