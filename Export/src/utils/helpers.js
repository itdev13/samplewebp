const moment = require('moment');
const crypto = require('crypto');

/**
 * Helper Utilities
 */

/**
 * Generate a unique job ID
 * @returns {string} - Unique job ID
 */
function generateJobId() {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return `export_${timestamp}_${random}`;
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format date for display
 * @param {Date} date - Date to format
 * @param {string} format - Moment format string
 * @returns {string} - Formatted date
 */
function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
  return moment(date).format(format);
}

/**
 * Get date range from filter string
 * @param {string} range - Range string (e.g., 'last7days', 'last30days', 'thismonth')
 * @returns {Object} - Start and end dates
 */
function getDateRange(range) {
  const now = moment();
  let startDate, endDate;

  switch (range) {
    case 'today':
      startDate = now.startOf('day').toDate();
      endDate = now.endOf('day').toDate();
      break;
    case 'yesterday':
      startDate = now.subtract(1, 'day').startOf('day').toDate();
      endDate = now.endOf('day').toDate();
      break;
    case 'last7days':
      startDate = now.subtract(7, 'days').startOf('day').toDate();
      endDate = moment().endOf('day').toDate();
      break;
    case 'last30days':
      startDate = now.subtract(30, 'days').startOf('day').toDate();
      endDate = moment().endOf('day').toDate();
      break;
    case 'thismonth':
      startDate = now.startOf('month').toDate();
      endDate = moment().endOf('month').toDate();
      break;
    case 'lastmonth':
      startDate = now.subtract(1, 'month').startOf('month').toDate();
      endDate = now.subtract(1, 'month').endOf('month').toDate();
      break;
    case 'thisyear':
      startDate = now.startOf('year').toDate();
      endDate = moment().endOf('year').toDate();
      break;
    default:
      startDate = now.subtract(30, 'days').startOf('day').toDate();
      endDate = moment().endOf('day').toDate();
  }

  return { startDate, endDate };
}

/**
 * Sanitize filename for safe file system use
 * @param {string} filename - Original filename
 * @returns {string} - Sanitized filename
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-z0-9_\-\.]/gi, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
}

/**
 * Generate export filename
 * @param {Object} options - Export options
 * @returns {string} - Generated filename
 */
function generateExportFilename(options) {
  const {
    locationId,
    exportType,
    dateRange,
    contactName
  } = options;

  const timestamp = moment().format('YYYY-MM-DD_HHmmss');
  const parts = ['conversations'];

  if (contactName) {
    parts.push(sanitizeFilename(contactName));
  }

  if (dateRange) {
    const start = moment(dateRange.start).format('YYYY-MM-DD');
    const end = moment(dateRange.end).format('YYYY-MM-DD');
    parts.push(`${start}_to_${end}`);
  }

  parts.push(timestamp);

  const filename = parts.join('_');
  const extension = exportType === 'csv' ? 'csv' : 'pdf';

  return `${filename}.${extension}`;
}

/**
 * Parse phone number to standard format
 * @param {string} phone - Phone number
 * @returns {string} - Formatted phone number
 */
function formatPhoneNumber(phone) {
  if (!phone) return '';
  
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Format based on length
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11) {
    return `+${cleaned.slice(0, 1)} (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  
  return phone;
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Calculate pagination metadata
 * @param {number} total - Total items
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {Object} - Pagination metadata
 */
function getPaginationMeta(total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage,
    hasPrevPage
  };
}

/**
 * Validate email address
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * Sleep/delay function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Initial delay in ms
 * @returns {Promise} - Result of function
 */
async function retryWithBackoff(fn, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const backoffDelay = delay * Math.pow(2, i);
      await sleep(backoffDelay);
    }
  }
}

/**
 * Chunk array into smaller arrays
 * @param {Array} array - Array to chunk
 * @param {number} size - Chunk size
 * @returns {Array} - Array of chunks
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Extract error message from error object
 * @param {Error} error - Error object
 * @returns {string} - Error message
 */
function getErrorMessage(error) {
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  if (error.message) {
    return error.message;
  }
  return 'An unknown error occurred';
}

module.exports = {
  generateJobId,
  formatFileSize,
  formatDate,
  getDateRange,
  sanitizeFilename,
  generateExportFilename,
  formatPhoneNumber,
  truncateText,
  getPaginationMeta,
  isValidEmail,
  sleep,
  retryWithBackoff,
  chunkArray,
  getErrorMessage
};
