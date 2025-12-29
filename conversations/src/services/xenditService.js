const axios = require('axios');
const logger = require('../utils/logger');
const { StatusMapper, retryWithBackoff } = require('../utils/helpers');

/**
 * Xendit Service - Handles all Xendit API interactions
 */
class XenditService {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('Xendit API key is required');
    }

    this.apiKey = apiKey;
    this.baseURL = process.env.XENDIT_API_URL || 'https://api.xendit.co';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      auth: {
        username: apiKey,
        password: ''
      },
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('Xendit API Error:', {
          endpoint: error.config?.url,
          status: error.response?.status,
          message: error.response?.data?.message || error.message
        });
        throw error;
      }
    );
  }

  /**
   * Create Invoice Payment
   */
  async createInvoice(data) {
    try {
      const payload = {
        external_id: data.externalId,
        amount: data.amount,
        currency: data.currency || 'IDR',
        payer_email: data.customerEmail,
        description: data.description || 'Payment via GoHighLevel',
        invoice_duration: data.invoiceDuration || 86400, // 24 hours
        success_redirect_url: data.successUrl,
        failure_redirect_url: data.failureUrl,
        customer: {
          given_names: data.customerName,
          email: data.customerEmail,
          mobile_number: data.customerPhone
        },
        customer_notification_preference: {
          invoice_created: ['email'],
          invoice_reminder: ['email'],
          invoice_paid: ['email']
        },
        items: data.items || [],
        fees: data.fees || []
      };

      const response = await this.client.post('/v2/invoices', payload);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to create invoice');
    }
  }

  /**
   * Create Virtual Account
   */
  async createVirtualAccount(data) {
    try {
      const payload = {
        external_id: data.externalId,
        bank_code: data.bankCode,
        name: data.customerName,
        expected_amount: data.amount,
        is_closed: true,
        is_single_use: true,
        expiration_date: data.expiresAt || this.getDefaultExpiration()
      };

      const response = await this.client.post('/callback_virtual_accounts', payload);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to create virtual account');
    }
  }

  /**
   * Create E-Wallet Charge
   */
  async createEWalletCharge(data) {
    try {
      const payload = {
        reference_id: data.externalId,
        currency: data.currency || 'IDR',
        amount: data.amount,
        checkout_method: 'ONE_TIME_PAYMENT',
        channel_code: data.channelCode, // OVO, DANA, LINKAJA, SHOPEEPAY
        channel_properties: {
          mobile_number: data.customerPhone,
          success_redirect_url: data.successUrl,
          failure_redirect_url: data.failureUrl
        },
        customer: {
          reference_id: data.contactId,
          mobile_number: data.customerPhone,
          given_names: data.customerName,
          email: data.customerEmail
        },
        metadata: data.metadata || {}
      };

      const response = await this.client.post('/ewallets/charges', payload);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to create e-wallet charge');
    }
  }

  /**
   * Create QRIS Payment
   */
  async createQRIS(data) {
    try {
      const payload = {
        external_id: data.externalId,
        type: 'DYNAMIC',
        callback_url: data.callbackUrl,
        amount: data.amount,
        currency: data.currency || 'IDR'
      };

      const response = await this.client.post('/qr_codes', payload);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to create QRIS');
    }
  }

  /**
   * Create Retail Outlet Payment
   */
  async createRetailOutlet(data) {
    try {
      const payload = {
        external_id: data.externalId,
        retail_outlet_name: data.retailOutletName, // ALFAMART, INDOMARET
        name: data.customerName,
        expected_amount: data.amount,
        expiration_date: data.expiresAt || this.getDefaultExpiration()
      };

      const response = await this.client.post('/fixed_payment_code', payload);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to create retail outlet payment');
    }
  }

  /**
   * Get Invoice Status
   */
  async getInvoiceStatus(invoiceId) {
    try {
      const response = await this.client.get(`/v2/invoices/${invoiceId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get invoice status');
    }
  }

  /**
   * Get Virtual Account Status
   */
  async getVirtualAccountStatus(id) {
    try {
      const response = await this.client.get(`/callback_virtual_accounts/${id}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get virtual account status');
    }
  }

  /**
   * Get E-Wallet Charge Status
   */
  async getEWalletStatus(chargeId) {
    try {
      const response = await this.client.get(`/ewallets/charges/${chargeId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get e-wallet status');
    }
  }

  /**
   * Get QRIS Status
   */
  async getQRISStatus(externalId) {
    try {
      const response = await this.client.get(`/qr_codes/${externalId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get QRIS status');
    }
  }

  /**
   * Get Payment Status by Method
   */
  async getPaymentStatus(paymentId, method) {
    switch (method) {
      case 'invoice':
        return await this.getInvoiceStatus(paymentId);
      case 'virtual_account':
        return await this.getVirtualAccountStatus(paymentId);
      case 'ewallet':
        return await this.getEWalletStatus(paymentId);
      case 'qris':
        return await this.getQRISStatus(paymentId);
      default:
        throw new Error(`Unsupported payment method: ${method}`);
    }
  }

  /**
   * Get available banks for Virtual Account
   */
  getAvailableBanks() {
    return [
      { code: 'BCA', name: 'Bank Central Asia', country: 'ID' },
      { code: 'BNI', name: 'Bank Negara Indonesia', country: 'ID' },
      { code: 'BRI', name: 'Bank Rakyat Indonesia', country: 'ID' },
      { code: 'MANDIRI', name: 'Bank Mandiri', country: 'ID' },
      { code: 'PERMATA', name: 'Permata Bank', country: 'ID' },
      { code: 'BSI', name: 'Bank Syariah Indonesia', country: 'ID' },
      { code: 'BJB', name: 'Bank BJB', country: 'ID' },
      { code: 'SAHABAT_SAMPOERNA', name: 'Sahabat Sampoerna', country: 'ID' }
    ];
  }

  /**
   * Get available e-wallet channels
   */
  getAvailableEWallets() {
    return [
      { code: 'OVO', name: 'OVO', country: 'ID' },
      { code: 'DANA', name: 'DANA', country: 'ID' },
      { code: 'LINKAJA', name: 'LinkAja', country: 'ID' },
      { code: 'SHOPEEPAY', name: 'ShopeePay', country: 'ID' },
      { code: 'GCASH', name: 'GCash', country: 'PH' },
      { code: 'GRABPAY', name: 'GrabPay', country: 'ID,PH,SG' },
      { code: 'PAYMAYA', name: 'PayMaya', country: 'PH' }
    ];
  }

  /**
   * Get available retail outlets
   */
  getAvailableRetailOutlets() {
    return [
      { code: 'ALFAMART', name: 'Alfamart', country: 'ID' },
      { code: 'INDOMARET', name: 'Indomaret', country: 'ID' }
    ];
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature, token) {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', token);
    const digest = hmac.update(JSON.stringify(payload)).digest('hex');
    
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
    } catch (error) {
      return false;
    }
  }

  /**
   * Get default expiration (24 hours from now)
   */
  getDefaultExpiration() {
    const date = new Date();
    date.setHours(date.getHours() + 24);
    return date.toISOString();
  }

  /**
   * Handle API errors
   */
  handleError(error, defaultMessage) {
    const response = error.response;
    
    if (response) {
      const errorMessage = response.data?.message || response.data?.error_code || defaultMessage;
      const err = new Error(errorMessage);
      err.statusCode = response.status;
      err.code = response.data?.error_code;
      return err;
    }
    
    return new Error(defaultMessage + ': ' + error.message);
  }
}

module.exports = XenditService;

