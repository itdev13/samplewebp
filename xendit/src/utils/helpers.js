/**
 * API Response formatter
 */
class ApiResponse {
  static success(data, message = 'Success', statusCode = 200) {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    };
  }

  static error(message, statusCode = 500, errors = null) {
    const response = {
      success: false,
      message,
      timestamp: new Date().toISOString()
    };

    if (errors) {
      response.errors = errors;
    }

    return response;
  }

  static paginated(data, page, limit, total) {
    return {
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Status mapper between Xendit and GHL
 */
class StatusMapper {
  static xenditToGHL(xenditStatus) {
    const statusMap = {
      'PENDING': 'pending',
      'PAID': 'paid',
      'SETTLED': 'settled',
      'EXPIRED': 'expired',
      'FAILED': 'failed',
      'ACTIVE': 'pending',
      'INACTIVE': 'expired',
      'SUCCEEDED': 'paid',
      'REFUNDED': 'refunded',
      'VOIDED': 'cancelled'
    };

    return statusMap[xenditStatus?.toUpperCase()] || 'pending';
  }

  static ghlToXendit(ghlStatus) {
    const statusMap = {
      'pending': 'PENDING',
      'paid': 'PAID',
      'settled': 'SETTLED',
      'expired': 'EXPIRED',
      'failed': 'FAILED',
      'refunded': 'REFUNDED',
      'cancelled': 'VOIDED'
    };

    return statusMap[ghlStatus?.toLowerCase()] || 'PENDING';
  }
}

/**
 * Format currency amount
 */
const formatCurrency = (amount, currency = 'IDR') => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  });
  
  return formatter.format(amount);
};

/**
 * Generate external ID for payments
 */
const generateExternalId = (locationId, prefix = 'ghl') => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${locationId.substring(0, 8)}-${timestamp}-${random}`;
};

/**
 * Validate email format
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number format
 */
const isValidPhone = (phone) => {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  // Check if it's a valid length (10-15 digits)
  return cleaned.length >= 10 && cleaned.length <= 15;
};

/**
 * Format phone number to E.164 format
 */
const formatPhoneNumber = (phone, countryCode = '62') => {
  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Remove leading zeros
  cleaned = cleaned.replace(/^0+/, '');
  
  // Add country code if not present
  if (!cleaned.startsWith(countryCode)) {
    cleaned = countryCode + cleaned;
  }
  
  return '+' + cleaned;
};

/**
 * Sleep utility for delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry with exponential backoff
 */
const retryWithBackoff = async (fn, maxRetries = 3, initialDelay = 1000) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
};

/**
 * Safe JSON parse
 */
const safeJsonParse = (str, defaultValue = null) => {
  try {
    return JSON.parse(str);
  } catch (error) {
    return defaultValue;
  }
};

/**
 * Mask sensitive data for logging
 */
const maskSensitiveData = (data) => {
  const masked = { ...data };
  const sensitiveFields = ['apiKey', 'password', 'token', 'secret', 'accessToken', 'refreshToken'];
  
  sensitiveFields.forEach(field => {
    if (masked[field]) {
      masked[field] = '***masked***';
    }
  });
  
  return masked;
};

module.exports = {
  ApiResponse,
  StatusMapper,
  formatCurrency,
  generateExternalId,
  isValidEmail,
  isValidPhone,
  formatPhoneNumber,
  sleep,
  retryWithBackoff,
  safeJsonParse,
  maskSensitiveData
};

