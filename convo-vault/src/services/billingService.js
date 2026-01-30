const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Billing Service - Handle pricing calculations and GHL Marketplace billing
 */

// Meter IDs for GHL Marketplace billing
const METER_IDS = {
  conversations: '697bc5c63b7d446bf5348be6',
  smsWhatsapp: '697bc3ef3b7d44be52347d87',
  email: '697bc4342605e37af1f2f385'
};

// Unit prices in cents (must match GHL meter config)
const UNIT_PRICES = {
  conversations: 5,    // 5 cents per conversation
  smsWhatsapp: 5,      // 5 cents per SMS/WhatsApp message
  email: 3             // 3 cents per email message
};

// Volume discount tiers
const DISCOUNT_TIERS = [
  { min: 0, max: 1000, discount: 0 },
  { min: 1000, max: 2000, discount: 20 },
  { min: 2000, max: 5000, discount: 40 },
  { min: 5000, max: 8000, discount: 50 },
  { min: 8000, max: 30000, discount: 60 },
  { min: 30000, max: Infinity, discount: 70 }
];

class BillingService {
  constructor() {
    this.baseURL = process.env.GHL_API_URL || 'https://services.leadconnectorhq.com';
  }

  /**
   * Get discount percentage based on total items
   */
  getDiscountPercent(totalItems) {
    for (const tier of DISCOUNT_TIERS) {
      if (totalItems >= tier.min && totalItems < tier.max) {
        return tier.discount;
      }
    }
    return 70; // Max discount for 30000+
  }

  /**
   * Get all discount tiers (for displaying to user)
   */
  getDiscountTiers() {
    return DISCOUNT_TIERS.map(tier => ({
      range: tier.max === Infinity ? `${tier.min}+` : `${tier.min}-${tier.max}`,
      discount: tier.discount
    }));
  }

  /**
   * Calculate pricing estimate for export
   * @param {Object} counts - Item counts { conversations, smsMessages, whatsappMessages, emailMessages }
   * @returns {Object} Pricing estimate with breakdown
   */
  calculateEstimate(counts) {
    const {
      conversations = 0,
      smsMessages = 0,
      whatsappMessages = 0,
      emailMessages = 0
    } = counts;

    // Calculate base amounts (in cents)
    const conversationsCost = conversations * UNIT_PRICES.conversations;
    const smsWhatsappCost = (smsMessages + whatsappMessages) * UNIT_PRICES.smsWhatsapp;
    const emailCost = emailMessages * UNIT_PRICES.email;

    const baseAmount = conversationsCost + smsWhatsappCost + emailCost;
    const totalItems = conversations + smsMessages + whatsappMessages + emailMessages;

    // Calculate discount
    const discountPercent = this.getDiscountPercent(totalItems);
    const discountAmount = Math.floor(baseAmount * (discountPercent / 100));
    const finalAmount = baseAmount - discountAmount;

    return {
      itemCounts: {
        conversations,
        smsMessages,
        whatsappMessages,
        emailMessages,
        total: totalItems
      },
      breakdown: {
        conversations: {
          count: conversations,
          unitPrice: UNIT_PRICES.conversations,
          subtotal: conversationsCost
        },
        smsWhatsapp: {
          count: smsMessages + whatsappMessages,
          unitPrice: UNIT_PRICES.smsWhatsapp,
          subtotal: smsWhatsappCost
        },
        email: {
          count: emailMessages,
          unitPrice: UNIT_PRICES.email,
          subtotal: emailCost
        }
      },
      baseAmount,
      discountPercent,
      discountAmount,
      finalAmount,
      finalAmountDollars: (finalAmount / 100).toFixed(2)
    };
  }

  /**
   * Check if wallet has sufficient funds
   * @param {string} companyId - Company ID
   * @param {string} accessToken - GHL access token
   * @returns {boolean} Whether wallet has funds
   */
  async hasFunds(companyId, accessToken) {
    try {
      const response = await axios.get(
        `${this.baseURL}/marketplace/billing/charges/has-funds`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Version': '2021-07-28'
          },
          params: { companyId }
        }
      );

      logger.info('Wallet funds check:', { companyId, hasFunds: response.data.hasFunds });
      return response.data.hasFunds === true;
    } catch (error) {
      logger.error('Failed to check wallet funds:', {
        companyId,
        error: error.response?.data || error.message
      });
      throw new Error('Unable to verify wallet balance');
    }
  }

  /**
   * Charge wallet using GHL Billing API
   * @param {string} companyId - Company ID
   * @param {string} accessToken - GHL access token
   * @param {Array} meterCharges - Array of { meterId, qty, description }
   * @returns {Object} Charge result with charge IDs
   */
  async chargeWallet(companyId, accessToken, meterCharges) {
    try {
      const chargeResults = [];

      for (const charge of meterCharges) {
        if (charge.qty <= 0) continue;

        logger.info('Charging wallet:', {
          companyId,
          meterId: charge.meterId,
          qty: charge.qty
        });

        const response = await axios.post(
          `${this.baseURL}/marketplace/billing/charges`,
          {
            companyId,
            meterId: charge.meterId,
            qty: charge.qty
          },
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'Version': '2021-07-28'
            }
          }
        );

        chargeResults.push({
          meterId: charge.meterId,
          qty: charge.qty,
          chargeId: response.data.chargeId || response.data.id || response.data._id,
          success: true
        });

        logger.info('Wallet charge successful:', {
          meterId: charge.meterId,
          chargeId: chargeResults[chargeResults.length - 1].chargeId
        });
      }

      return {
        success: true,
        charges: chargeResults,
        totalCharges: chargeResults.length
      };
    } catch (error) {
      logger.error('Failed to charge wallet:', {
        companyId,
        error: error.response?.data || error.message
      });
      throw new Error(error.response?.data?.message || 'Payment failed. Please check your wallet balance.');
    }
  }

  /**
   * Build meter charges array from item counts
   * @param {Object} counts - Item counts
   * @returns {Array} Array of meter charges for GHL API
   */
  buildMeterCharges(counts) {
    const charges = [];

    if (counts.conversations > 0) {
      charges.push({
        meterId: METER_IDS.conversations,
        qty: counts.conversations,
        description: 'Conversation exports'
      });
    }

    const smsWhatsappCount = (counts.smsMessages || 0) + (counts.whatsappMessages || 0);
    if (smsWhatsappCount > 0) {
      charges.push({
        meterId: METER_IDS.smsWhatsapp,
        qty: smsWhatsappCount,
        description: 'SMS/WhatsApp message exports'
      });
    }

    if (counts.emailMessages > 0) {
      charges.push({
        meterId: METER_IDS.email,
        qty: counts.emailMessages,
        description: 'Email message exports'
      });
    }

    return charges;
  }

  /**
   * Get meter IDs (for reference)
   */
  getMeterIds() {
    return { ...METER_IDS };
  }

  /**
   * Get unit prices (for reference)
   */
  getUnitPrices() {
    return { ...UNIT_PRICES };
  }
}

module.exports = new BillingService();
