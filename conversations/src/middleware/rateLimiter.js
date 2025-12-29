const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * General API rate limiter
 */
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later'
    });
  }
});

/**
 * Strict rate limiter for OAuth endpoints
 */
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    message: 'Too many OAuth attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Payment creation rate limiter
 */
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: {
    success: false,
    message: 'Too many payment requests, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Webhook rate limiter (more lenient)
 */
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: {
    success: false,
    message: 'Too many webhook requests'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for known IPs (Xendit, GHL)
    const trustedIPs = (process.env.TRUSTED_IPS || '').split(',');
    return trustedIPs.includes(req.ip);
  }
});

module.exports = {
  apiLimiter,
  oauthLimiter,
  paymentLimiter,
  webhookLimiter
};

