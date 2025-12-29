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

/**
 * Verify location exists and access code is valid
 */
const verifyLocation = async (req, res, next) => {
  try {
    const { locationId, code } = req.query || req.params || req.body;
    
    if (!locationId) {
      return res.status(400).json({
        success: false,
        error: 'Location ID is required'
      });
    }

    if (!code) {
      return res.status(401).json({
        success: false,
        error: 'Access code is required',
        message: 'Please provide a valid access code in the URL'
      });
    }

    const Location = require('../models/Location');
    const location = await Location.findOne({ locationId, isActive: true });

    if (!location) {
      return res.status(404).json({
        success: false,
        error: 'Location not found or inactive'
      });
    }

    // Verify access code
    if (location.accessCode !== code) {
      return res.status(403).json({
        success: false,
        error: 'Invalid access code',
        message: 'The access code provided is not valid for this location'
      });
    }

    req.location = location;
    next();
  } catch (error) {
    logger.error('Location verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify location'
    });
  }
};

module.exports = {
  verifyGHLToken,
  optionalAuth,
  generateToken,
  verifyLocation
};

