const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * Rate Limiting Middleware
 */

/**
 * General API rate limiter
 */
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded:', {
      ip: req.ip,
      path: req.path
    });
    res.status(429).json({
      success: false,
      error: 'Too many requests. Please try again later.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * Strict rate limiter for export operations
 */
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 exports per hour per IP
  message: {
    success: false,
    error: 'Export limit reached. Please try again later.'
  },
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    logger.warn('Export rate limit exceeded:', {
      ip: req.ip,
      locationId: req.body.locationId
    });
    res.status(429).json({
      success: false,
      error: 'Export limit reached. Maximum 10 exports per hour.',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

/**
 * OAuth rate limiter
 */
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 OAuth attempts per 15 minutes
  message: {
    success: false,
    error: 'Too many OAuth attempts. Please try again later.'
  },
  handler: (req, res) => {
    logger.warn('OAuth rate limit exceeded:', {
      ip: req.ip
    });
    res.status(429).json({
      success: false,
      error: 'Too many authorization attempts. Please try again in 15 minutes.'
    });
  }
});

/**
 * Download rate limiter
 */
const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 downloads per 15 minutes
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    logger.warn('Download rate limit exceeded:', {
      ip: req.ip
    });
    res.status(429).json({
      success: false,
      error: 'Too many download requests. Please try again later.'
    });
  }
});

/**
 * Webhook rate limiter (more lenient)
 */
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 webhooks per minute
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    logger.warn('Webhook rate limit exceeded:', {
      ip: req.ip
    });
    res.status(429).json({
      success: false,
      error: 'Too many webhook requests'
    });
  }
});

module.exports = {
  apiLimiter,
  exportLimiter,
  oauthLimiter,
  downloadLimiter,
  webhookLimiter
};
