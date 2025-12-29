const Joi = require('joi');
const logger = require('../utils/logger');

/**
 * Validation Middleware using Joi
 */

/**
 * Validate export request
 */
const validateExportRequest = (req, res, next) => {
  const schema = Joi.object({
    locationId: Joi.string().required(),
    exportType: Joi.string().valid('pdf', 'csv', 'both').required(),
    filters: Joi.object({
      startDate: Joi.date().iso().optional(),
      endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
      contactId: Joi.string().optional(),
      contactName: Joi.string().optional(),
      conversationId: Joi.string().optional(),
      messageTypes: Joi.array().items(
        Joi.string().valid('SMS', 'Email', 'Call', 'WhatsApp', 'Facebook', 'Instagram', 'GMB')
      ).optional(),
      searchKeywords: Joi.string().max(500).optional()
    }).optional()
  });

  const { error } = schema.validate(req.body, { abortEarly: false });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    logger.warn('Validation failed:', { errors });

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

/**
 * Validate search conversation request
 */
const validateSearchRequest = (req, res, next) => {
  const schema = Joi.object({
    locationId: Joi.string().required(),
    query: Joi.string().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    contactId: Joi.string().optional(),
    limit: Joi.number().integer().min(1).max(100).default(20),
    page: Joi.number().integer().min(1).default(1)
  });

  const { error, value } = schema.validate(req.query, { abortEarly: false });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    logger.warn('Validation failed:', { errors });

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  req.validatedQuery = value;
  next();
};

/**
 * Validate location settings update
 */
const validateSettingsUpdate = (req, res, next) => {
  const schema = Joi.object({
    autoBackupEnabled: Joi.boolean().optional(),
    backupFrequency: Joi.string().valid('daily', 'weekly', 'monthly').optional(),
    defaultExportFormat: Joi.string().valid('pdf', 'csv', 'both').optional(),
    cloudStorageProvider: Joi.string().valid('none', 'googledrive', 'dropbox', 's3').optional(),
    cloudStorageConfig: Joi.object().optional(),
    whitelabelEnabled: Joi.boolean().optional(),
    customBranding: Joi.object({
      logoUrl: Joi.string().uri().optional(),
      companyName: Joi.string().max(100).optional(),
      primaryColor: Joi.string().pattern(/^#[0-9A-F]{6}$/i).optional()
    }).optional()
  }).min(1);

  const { error } = schema.validate(req.body, { abortEarly: false });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    logger.warn('Validation failed:', { errors });

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

/**
 * Validate webhook payload
 */
const validateWebhook = (req, res, next) => {
  const schema = Joi.object({
    type: Joi.string().required(),
    locationId: Joi.string().required(),
    timestamp: Joi.date().iso().required(),
    data: Joi.object().required()
  });

  const { error } = schema.validate(req.body, { abortEarly: false });

  if (error) {
    logger.warn('Webhook validation failed:', { error: error.message });

    return res.status(400).json({
      success: false,
      error: 'Invalid webhook payload'
    });
  }

  next();
};

/**
 * Validate pagination parameters
 */
const validatePagination = (req, res, next) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  });

  const { error, value } = schema.validate(req.query, { abortEarly: false, allowUnknown: true });

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'Invalid pagination parameters'
    });
  }

  req.pagination = value;
  next();
};

module.exports = {
  validateExportRequest,
  validateSearchRequest,
  validateSettingsUpdate,
  validateWebhook,
  validatePagination
};
