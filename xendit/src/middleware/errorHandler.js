const logger = require('../utils/logger');
const { ApiResponse } = require('../utils/helpers');

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log error
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    body: req.body
  });

  // Default error response
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error';
    
    const errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
    
    return res.status(statusCode).json(ApiResponse.error(message, statusCode, errors));
  }

  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate entry';
    const field = Object.keys(err.keyPattern)[0];
    message = `${field} already exists`;
  }

  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Mongoose connection error
  if (err.name === 'MongooseServerSelectionError') {
    statusCode = 503;
    message = 'Database connection error';
  }

  // Axios errors (from API calls)
  if (err.isAxiosError) {
    statusCode = err.response?.status || 500;
    message = err.response?.data?.message || err.message;
  }

  // Send error response
  res.status(statusCode).json(ApiResponse.error(message, statusCode));
};

/**
 * 404 Not Found handler
 */
const notFound = (req, res) => {
  res.status(404).json(ApiResponse.error(`Route ${req.originalUrl} not found`, 404));
};

/**
 * Async error wrapper
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  notFound,
  asyncHandler
};

