const { body, param, query, validationResult } = require('express-validator');
const { ApiResponse } = require('../utils/helpers');

/**
 * Validation result handler
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value
    }));
    
    return res.status(400).json(
      ApiResponse.error('Validation failed', 400, formattedErrors)
    );
  }
  
  next();
};

/**
 * Validate payment creation
 */
const validatePaymentCreation = [
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number'),
  
  body('currency')
    .optional()
    .isIn(['IDR', 'PHP', 'USD', 'SGD', 'MYR', 'THB'])
    .withMessage('Invalid currency'),
  
  body('paymentMethod')
    .isIn(['invoice', 'virtual_account', 'ewallet', 'credit_card', 'qris', 'retail_outlet'])
    .withMessage('Invalid payment method'),
  
  body('contactId')
    .optional()
    .isString()
    .withMessage('Contact ID must be a string'),
  
  body('opportunityId')
    .optional()
    .isString()
    .withMessage('Opportunity ID must be a string'),
  
  body('customerEmail')
    .optional()
    .isEmail()
    .withMessage('Invalid email address'),
  
  body('customerPhone')
    .optional()
    .isMobilePhone()
    .withMessage('Invalid phone number'),
  
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  
  handleValidationErrors
];

/**
 * Validate virtual account specific fields
 */
const validateVirtualAccount = [
  body('bankCode')
    .notEmpty()
    .withMessage('Bank code is required for virtual account'),
  
  body('bankCode')
    .isIn(['BCA', 'BNI', 'BRI', 'MANDIRI', 'PERMATA', 'BSI', 'BJB', 'SAHABAT_SAMPOERNA'])
    .withMessage('Invalid bank code'),
  
  handleValidationErrors
];

/**
 * Validate e-wallet specific fields
 */
const validateEWallet = [
  body('channelCode')
    .notEmpty()
    .withMessage('Channel code is required for e-wallet'),
  
  body('channelCode')
    .isIn(['OVO', 'DANA', 'LINKAJA', 'SHOPEEPAY', 'GCASH', 'GRABPAY', 'PAYMAYA'])
    .withMessage('Invalid channel code'),
  
  body('customerPhone')
    .notEmpty()
    .withMessage('Customer phone is required for e-wallet'),
  
  handleValidationErrors
];

/**
 * Validate configuration update
 */
const validateConfigUpdate = [
  body('xenditApiKey')
    .optional()
    .isString()
    .isLength({ min: 10 })
    .withMessage('Invalid Xendit API key'),
  
  body('enabledPaymentMethods')
    .optional()
    .isArray()
    .withMessage('Enabled payment methods must be an array'),
  
  body('enabledPaymentMethods.*')
    .optional()
    .isIn(['invoice', 'virtual_account', 'ewallet', 'credit_card', 'qris', 'retail_outlet'])
    .withMessage('Invalid payment method'),
  
  body('defaultCurrency')
    .optional()
    .isIn(['IDR', 'PHP', 'USD', 'SGD', 'MYR', 'THB'])
    .withMessage('Invalid currency'),
  
  handleValidationErrors
];

/**
 * Validate location ID parameter
 */
const validateLocationId = [
  param('locationId')
    .isString()
    .isLength({ min: 10 })
    .withMessage('Invalid location ID'),
  
  handleValidationErrors
];

/**
 * Validate payment ID parameter
 */
const validatePaymentId = [
  param('paymentId')
    .isString()
    .notEmpty()
    .withMessage('Invalid payment ID'),
  
  handleValidationErrors
];

/**
 * Validate pagination query
 */
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  validatePaymentCreation,
  validateVirtualAccount,
  validateEWallet,
  validateConfigUpdate,
  validateLocationId,
  validatePaymentId,
  validatePagination
};

