const crypto = require('crypto');

/**
 * Encryption Utilities
 * AES-256-CBC encryption for sensitive data
 */

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');
const IV = Buffer.from(process.env.ENCRYPTION_IV || '', 'hex');

/**
 * Encrypt text
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted text with IV prepended
 */
function encrypt(text) {
  try {
    if (!text) return '';
    
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
      throw new Error('Invalid encryption key. Must be 32 bytes (64 hex characters)');
    }

    if (!IV || IV.length !== 16) {
      throw new Error('Invalid IV. Must be 16 bytes (32 hex characters)');
    }

    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, IV);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Prepend IV for future decryption
    return IV.toString('hex') + ':' + encrypted;
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt text
 * @param {string} encryptedText - Encrypted text with IV prepended
 * @returns {string} - Decrypted plain text
 */
function decrypt(encryptedText) {
  try {
    if (!encryptedText) return '';
    
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
      throw new Error('Invalid encryption key. Must be 32 bytes (64 hex characters)');
    }

    // Split IV and encrypted data
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted text format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Generate a random secure token
 * @param {number} length - Length of token in bytes (default 32)
 * @returns {string} - Random hex token
 */
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash a string using SHA-256
 * @param {string} text - Text to hash
 * @returns {string} - Hashed text
 */
function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Create HMAC signature
 * @param {string} data - Data to sign
 * @param {string} secret - Secret key
 * @returns {string} - HMAC signature
 */
function createHmac(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Verify HMAC signature
 * @param {string} data - Original data
 * @param {string} signature - Signature to verify
 * @param {string} secret - Secret key
 * @returns {boolean} - True if signature is valid
 */
function verifyHmac(data, signature, secret) {
  const expectedSignature = createHmac(data, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

module.exports = {
  encrypt,
  decrypt,
  generateSecureToken,
  hash,
  createHmac,
  verifyHmac
};
