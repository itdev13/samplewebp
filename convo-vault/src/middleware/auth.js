const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate session JWT tokens
 * Used for protecting API endpoints in the dashboard
 */
const authenticateSession = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'No authentication token provided'
    });
  }

  try {
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user info to request object
    req.user = {
      userId: decoded.userId,
      locationId: decoded.locationId,
      companyId: decoded.companyId,
      locationName: decoded.locationName
    };
    
    logger.info('Session authenticated', { 
      userId: req.user.userId, 
      locationId: req.user.locationId 
    });
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Session expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    logger.error('Invalid session token:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication token'
    });
  }
};

/**
 * Optional: Middleware to check if user has access to specific location
 */
const requireLocationAccess = (req, res, next) => {
  const requestedLocationId = req.query.locationId || req.params.locationId || req.body.locationId;
  
  if (!requestedLocationId) {
    return res.status(400).json({
      success: false,
      error: 'locationId is required'
    });
  }
  
  // Check if the authenticated user's location matches the requested location
  if (req.user.locationId !== requestedLocationId) {
    logger.warn('Location access denied', {
      userLocationId: req.user.locationId,
      requestedLocationId
    });
    
    return res.status(403).json({
      success: false,
      error: 'Access denied to this sub-account'
    });
  }
  
  next();
};

module.exports = {
  authenticateSession,
  requireLocationAccess
};

