const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * Rate limiting configurations for different endpoint types
 */

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path
    });
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later.',
      retryAfter: '5 minutes'
    });
  }
});

// Strict rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // Limit each IP to 5 auth attempts per windowMs
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '5 minutes'
  },
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path
    });
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Rate limiter for file uploads
const uploadLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 10, // Limit each user to 10 uploads per 30 minutes
  message: {
    success: false,
    error: 'Upload limit exceeded. Maximum 10 files per 30 minutes.',
    retryAfter: '1 hour'
  },
  handler: (req, res) => {
    logger.warn('Upload rate limit exceeded', {
      ip: req.ip,
      userId: req.user?.userId
    });
    res.status(429).json({
      success: false,
      error: 'Upload limit exceeded. Maximum 10 files per 30 minutes.',
      retryAfter: '30 minutes'
    });
  }
});

// Rate limiter for export/download endpoints
const exportLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 50, // Limit each user to 50 exports per 30 minutes
  message: {
    success: false,
    error: 'Export limit exceeded. Maximum 50 exports per 30 minutes.',
    retryAfter: '30 minutes'
  }
});

// Webhook rate limiter (lenient for GHL webhooks)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Allow 100 webhooks per minute
  message: {
    success: false,
    error: 'Webhook rate limit exceeded'
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  uploadLimiter,
  exportLimiter,
  webhookLimiter
};

