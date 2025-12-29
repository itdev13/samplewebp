const ApiKey = require('../models/ApiKey');
const logger = require('../utils/logger');

/**
 * API Key Authentication Middleware
 * Validates API keys and enforces rate limits
 */

/**
 * Authenticate requests using API key
 */
const authenticateApiKey = async (req, res, next) => {
  try {
    // Get API key from header
    const authHeader = req.headers.authorization;
    console.log('authHeader', authHeader);
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid Authorization header',
        message: 'Please provide an API key in the format: Authorization: Bearer sk_live_...'
      });
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer '

    // Verify API key
    const apiKeyDoc = await ApiKey.verifyKey(apiKey);

    if (!apiKeyDoc) {
      logger.warn('Invalid API key attempt:', { 
        keyPreview: apiKey.slice(-8),
        ip: req.ip 
      });
      
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        message: 'The provided API key is invalid or has expired'
      });
    }

    // Check if key is from whitelisted IP (if whitelist is set)
    if (apiKeyDoc.ipWhitelist && apiKeyDoc.ipWhitelist.length > 0) {
      const clientIp = req.ip || req.connection.remoteAddress;
      if (!apiKeyDoc.ipWhitelist.includes(clientIp)) {
        logger.warn('API key used from non-whitelisted IP:', {
          keyPreview: apiKeyDoc.keyPreview,
          attemptedIp: clientIp,
          whitelist: apiKeyDoc.ipWhitelist
        });
        
        return res.status(403).json({
          success: false,
          error: 'IP not whitelisted',
          message: 'Your IP address is not authorized to use this API key'
        });
      }
    }

    // Check rate limits
    const rateLimitCheck = apiKeyDoc.checkRateLimit();
    
    if (!rateLimitCheck.allowed) {
      logger.warn('Rate limit exceeded:', {
        keyPreview: apiKeyDoc.keyPreview,
        locationId: apiKeyDoc.locationId,
        limit: rateLimitCheck.limit,
        used: rateLimitCheck.used
      });

      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        message: rateLimitCheck.reason,
        limit: rateLimitCheck.limit,
        used: rateLimitCheck.used,
        resetAt: new Date(apiKeyDoc.usage.lastResetDate.getFullYear(), 
                         apiKeyDoc.usage.lastResetDate.getMonth() + 1, 1)
      });
    }

    // Attach API key info to request
    req.apiKey = apiKeyDoc;
    req.locationId = apiKeyDoc.locationId;
    req.companyId = apiKeyDoc.companyId;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', apiKeyDoc.limits.requestsPerMonth);
    res.setHeader('X-RateLimit-Remaining', rateLimitCheck.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(
      apiKeyDoc.usage.lastResetDate.getFullYear(), 
      apiKeyDoc.usage.lastResetDate.getMonth() + 1, 1
    ).toISOString());

    // Increment usage counter (async, don't wait)
    apiKeyDoc.incrementUsage().catch(err => {
      logger.error('Failed to increment API usage:', err);
    });

    logger.info('API request authenticated:', {
      keyPreview: apiKeyDoc.keyPreview,
      locationId: apiKeyDoc.locationId,
      endpoint: req.path,
      remaining: rateLimitCheck.remaining
    });

    next();
  } catch (error) {
    logger.error('API key authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication error',
      message: 'An error occurred while authenticating your request'
    });
  }
};

/**
 * Check if API key has required scope
 */
const requireScope = (scope) => {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'API key required'
      });
    }

    if (!req.apiKey.hasScope(scope)) {
      logger.warn('Insufficient scope:', {
        keyPreview: req.apiKey.keyPreview,
        requiredScope: scope,
        availableScopes: req.apiKey.scopes
      });

      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: `This API key does not have the '${scope}' permission`,
        required: scope,
        available: req.apiKey.scopes
      });
    }

    next();
  };
};

/**
 * Optional API key auth (doesn't fail if no key, but attaches if present)
 */
const optionalApiKey = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const apiKey = authHeader.substring(7);
      const apiKeyDoc = await ApiKey.verifyKey(apiKey);
      
      if (apiKeyDoc) {
        req.apiKey = apiKeyDoc;
        req.locationId = apiKeyDoc.locationId;
        req.companyId = apiKeyDoc.companyId;
      }
    }
    
    next();
  } catch (error) {
    // Don't fail on optional auth errors
    next();
  }
};

module.exports = {
  authenticateApiKey,
  requireScope,
  optionalApiKey
};

