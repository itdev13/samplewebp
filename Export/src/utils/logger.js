const winston = require('winston');
const path = require('path');
const fs = require('fs');

/**
 * Winston Logger Configuration
 */

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Helper to safely stringify objects (handles circular references)
const safeStringify = (obj) => {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    // Skip Error objects' circular references
    if (key === 'config' || key === 'request' || key === 'response') {
      return '[Circular]';
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
};

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      try {
        msg += ` ${safeStringify(meta)}`;
      } catch (error) {
        msg += ` [Unable to stringify metadata]`;
      }
    }
    return msg;
  })
);

// Create transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.LOG_LEVEL || 'info'
  }),

  // Error log file
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }),

  // Combined log file
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  })
];

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports,
  exitOnError: false
});

// Add export log file for tracking exports
logger.add(new winston.transports.File({
  filename: path.join(logsDir, 'exports.log'),
  level: 'info',
  format: logFormat,
  maxsize: 10485760, // 10MB
  maxFiles: 10
}));

/**
 * Log export activity
 */
logger.logExport = function(data) {
  this.info('EXPORT_ACTIVITY', {
    type: 'export',
    ...data
  });
};

/**
 * Log API calls
 */
logger.logApiCall = function(method, endpoint, statusCode, duration) {
  this.info('API_CALL', {
    method,
    endpoint,
    statusCode,
    duration: `${duration}ms`
  });
};

/**
 * Log OAuth events
 */
logger.logOAuth = function(event, data) {
  this.info('OAUTH_EVENT', {
    event,
    ...data
  });
};

// Handle uncaught exceptions
logger.exceptions.handle(
  new winston.transports.File({ 
    filename: path.join(logsDir, 'exceptions.log') 
  })
);

// Handle unhandled promise rejections
logger.rejections.handle(
  new winston.transports.File({ 
    filename: path.join(logsDir, 'rejections.log') 
  })
);

module.exports = logger;
