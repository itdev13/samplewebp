const CryptoJS = require('crypto-js');

/**
 * Encryption utility using AES-256
 */
class Encryption {
  constructor() {
    this.key = process.env.ENCRYPTION_KEY;
    
    if (!this.key) {
      throw new Error('ENCRYPTION_KEY must be set in environment variables');
    }

    if (this.key.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters long');
    }
  }

  /**
   * Encrypt sensitive data
   * @param {string} text - Plain text to encrypt
   * @returns {string} Encrypted text
   */
  encrypt(text) {
    if (!text) {
      throw new Error('Text to encrypt cannot be empty');
    }

    try {
      const encrypted = CryptoJS.AES.encrypt(text, this.key).toString();
      return encrypted;
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt encrypted data
   * @param {string} encryptedText - Encrypted text
   * @returns {string} Decrypted plain text
   */
  decrypt(encryptedText) {
    if (!encryptedText) {
      throw new Error('Encrypted text cannot be empty');
    }

    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedText, this.key);
      const plainText = decrypted.toString(CryptoJS.enc.Utf8);
      
      if (!plainText) {
        throw new Error('Decryption resulted in empty string');
      }
      
      return plainText;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Hash data (one-way)
   * @param {string} text - Text to hash
   * @returns {string} Hashed text
   */
  hash(text) {
    if (!text) {
      throw new Error('Text to hash cannot be empty');
    }

    return CryptoJS.SHA256(text).toString();
  }

  /**
   * Generate random string
   * @param {number} length - Length of random string
   * @returns {string} Random string
   */
  generateRandomString(length = 32) {
    return CryptoJS.lib.WordArray.random(length / 2).toString();
  }

  /**
   * Verify HMAC signature
   * @param {string} data - Data to verify
   * @param {string} signature - Signature to verify against
   * @param {string} secret - Secret key
   * @returns {boolean} Verification result
   */
  verifyHmac(data, signature, secret) {
    try {
      const expectedSignature = CryptoJS.HmacSHA256(data, secret).toString();
      return expectedSignature === signature;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
module.exports = new Encryption();

