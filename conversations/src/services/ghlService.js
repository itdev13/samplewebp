const axios = require('axios');
const logger = require('../utils/logger');
const { retryWithBackoff } = require('../utils/helpers');
const OAuthToken = require('../models/OAuthToken');

/**
 * GoHighLevel API Service
 */
class GHLService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseURL = process.env.GHL_API_URL || 'https://services.leadconnectorhq.com';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28'
      },
      timeout: 30000
    });

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        logger.error('GHL API Error:', {
          endpoint: error.config?.url,
          status: error.response?.status,
          message: error.response?.data?.message || error.message
        });
        throw error;
      }
    );
  }

  /**
   * Exchange authorization code for access token
   */
  static async exchangeCodeForToken(code) {
    try {
      // GHL OAuth expects application/x-www-form-urlencoded
      const params = new URLSearchParams();
      console.log(process.env.GHL_CLIENT_ID);
      console.log(process.env.GHL_CLIENT_SECRET);
      console.log(code);
      params.append('client_id', process.env.GHL_CLIENT_ID);
      params.append('client_secret', process.env.GHL_CLIENT_SECRET);
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      
      const response = await axios.post(
        `${process.env.GHL_OAUTH_URL}/token`,
        params,
        {
          headers: { 
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      logger.info('OAuth token exchange successful');
      return response.data;
    } catch (error) {
      // Better error logging
      if (error.response) {
        logger.error('Token exchange failed:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers
        });
      } else {
        logger.error('Token exchange error:', error.message);
      }
      throw new Error('Failed to exchange code for token: ' + (error.response?.data?.message || error.message));
    }
  }

  /**
   * Refresh access token
   */
  static async refreshAccessToken(refreshToken) {
    try {
      // Create URL-encoded form data
      const params = new URLSearchParams();
      params.append('client_id', process.env.GHL_CLIENT_ID);
      params.append('client_secret', process.env.GHL_CLIENT_SECRET);
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', refreshToken);
      
      const response = await axios.post(
        `${process.env.GHL_OAUTH_URL}/token`,
        params.toString(),
        {
          headers: { 
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Token refresh error:', error.response?.data || error.message);
      throw new Error('Failed to refresh token');
    }
  }

  /**
   * Get location information
   */
  async getLocation(locationId) {
    try {
      const response = await this.client.get(`/locations/${locationId}`);
      return response.data.location;
    } catch (error) {
      throw this.handleError(error, 'Failed to get location');
    }
  }

  /**
   * Get contact information
   */
  async getContact(contactId) {
    try {
      const response = await this.client.get(`/contacts/${contactId}`);
      return response.data.contact;
    } catch (error) {
      throw this.handleError(error, 'Failed to get contact');
    }
  }

  /**
   * Create or update contact
   */
  async upsertContact(locationId, contactData) {
    try {
      const response = await this.client.post('/contacts/upsert', {
        locationId,
        ...contactData
      });
      return response.data.contact;
    } catch (error) {
      throw this.handleError(error, 'Failed to upsert contact');
    }
  }

  /**
   * Get opportunity
   */
  async getOpportunity(opportunityId) {
    try {
      const response = await this.client.get(`/opportunities/${opportunityId}`);
      return response.data.opportunity;
    } catch (error) {
      throw this.handleError(error, 'Failed to get opportunity');
    }
  }

  /**
   * Update opportunity
   */
  async updateOpportunity(opportunityId, updates) {
    try {
      const response = await this.client.put(`/opportunities/${opportunityId}`, updates);
      return response.data.opportunity;
    } catch (error) {
      throw this.handleError(error, 'Failed to update opportunity');
    }
  }

  /**
   * Update opportunity status
   */
  async updateOpportunityStatus(opportunityId, status) {
    try {
      const response = await this.client.put(`/opportunities/${opportunityId}/status`, {
        status
      });
      return response.data.opportunity;
    } catch (error) {
      throw this.handleError(error, 'Failed to update opportunity status');
    }
  }

  /**
   * Add note to opportunity
   */
  async addOpportunityNote(opportunityId, note) {
    try {
      const response = await this.client.post(`/opportunities/${opportunityId}/notes`, {
        body: note
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to add opportunity note');
    }
  }

  /**
   * Create payment transaction
   */
  async createTransaction(locationId, transactionData) {
    try {
      const payload = {
        locationId,
        amount: transactionData.amount,
        currency: transactionData.currency || 'USD',
        contactId: transactionData.contactId,
        name: transactionData.name || 'Payment',
        description: transactionData.description,
        entitySourceType: 'opportunity',
        entityId: transactionData.opportunityId,
        paymentMode: 'xendit',
        ...transactionData
      };

      const response = await this.client.post('/payments/transactions', payload);
      return response.data.transaction;
    } catch (error) {
      throw this.handleError(error, 'Failed to create transaction');
    }
  }

  /**
   * Update transaction status
   */
  async updateTransaction(transactionId, status, metadata = {}) {
    try {
      const response = await this.client.put(`/payments/transactions/${transactionId}`, {
        status,
        ...metadata
      });
      return response.data.transaction;
    } catch (error) {
      throw this.handleError(error, 'Failed to update transaction');
    }
  }

  /**
   * Record payment
   */
  async recordPayment(locationId, paymentData) {
    try {
      const payload = {
        locationId,
        contactId: paymentData.contactId,
        amount: paymentData.amount,
        currency: paymentData.currency || 'USD',
        paymentMode: 'xendit',
        paymentProvider: 'xendit',
        transactionId: paymentData.transactionId,
        opportunityId: paymentData.opportunityId,
        entitySourceType: 'opportunity',
        entityId: paymentData.opportunityId,
        status: paymentData.status || 'successful',
        meta: {
          xenditId: paymentData.xenditId,
          paymentMethod: paymentData.paymentMethod,
          ...paymentData.metadata
        }
      };

      const response = await this.client.post('/payments/orders', payload);
      return response.data.order;
    } catch (error) {
      logger.warn('Failed to record payment in GHL:', error.message);
      // Don't throw error as this is not critical
      return null;
    }
  }

  /**
   * Add tag to contact
   */
  async addTagToContact(contactId, tag) {
    try {
      const response = await this.client.post(`/contacts/${contactId}/tags`, {
        tags: [tag]
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to add tag to contact');
    }
  }

  /**
   * Create task
   */
  async createTask(contactId, taskData) {
    try {
      const response = await this.client.post('/contacts/tasks', {
        contactId,
        ...taskData
      });
      return response.data.task;
    } catch (error) {
      throw this.handleError(error, 'Failed to create task');
    }
  }

  /**
   * Search conversations
   */
  async searchConversations(params = {}) {
    try {
      const response = await this.client.get('/conversations/search', {
        params: {
          locationId: params.locationId,
          limit: params.limit || 20,
          offset: params.offset || 0,
          query: params.query,
          status: params.status,
          assignedTo: params.assignedTo,
          startDate: params.startDate,
          endDate: params.endDate
        }
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to search conversations');
    }
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId) {
    try {
      const response = await this.client.get(`/conversations/${conversationId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get conversation');
    }
  }

  /**
   * Get messages for a conversation
   */
  async getConversationMessages(conversationId, params = {}) {
    try {
      const response = await this.client.get(`/conversations/${conversationId}/messages`, {
        params: {
          limit: params.limit || 20,
          lastMessageId: params.lastMessageId,
          type: params.type
        }
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get conversation messages');
    }
  }

  /**
   * Send message in conversation
   */
  async sendMessage(conversationId, message) {
    try {
      const response = await this.client.post(`/conversations/${conversationId}/messages`, {
        type: message.type || 'SMS',
        message: message.message,
        html: message.html,
        subject: message.subject
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to send message');
    }
  }

  /**
   * Export messages with filters
   */
  async exportMessages(options = {}) {
    try {
      const response = await this.client.get('/conversations/messages', {
        params: {
          locationId: options.locationId,
          startDate: options.startDate,
          endDate: options.endDate,
          contactId: options.contactId,
          type: options.channel,
          limit: options.limit || 100
        }
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to export messages');
    }
  }

  /**
   * Send SMS
   */
  async sendSMS(contactId, message) {
    try {
      const response = await this.client.post('/conversations/messages', {
        type: 'SMS',
        contactId,
        message
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to send SMS');
    }
  }

  /**
   * Send Email
   */
  async sendEmail(contactId, subject, body) {
    try {
      const response = await this.client.post('/conversations/messages', {
        type: 'Email',
        contactId,
        subject,
        html: body
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to send email');
    }
  }

  /**
   * Get custom fields for location
   */
  async getCustomFields(locationId) {
    try {
      const response = await this.client.get(`/locations/${locationId}/customFields`);
      return response.data.customFields;
    } catch (error) {
      throw this.handleError(error, 'Failed to get custom fields');
    }
  }

  /**
   * Update contact custom field
   */
  async updateContactCustomField(contactId, fieldId, value) {
    try {
      const response = await this.client.put(`/contacts/${contactId}/customFields/${fieldId}`, {
        value
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to update custom field');
    }
  }

  /**
   * Get user info (for OAuth)
   */
  async getUserInfo() {
    try {
      const response = await this.client.get('/oauth/userinfo');
      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get user info');
    }
  }

  /**
   * Handle API errors
   */
  handleError(error, defaultMessage) {
    const response = error.response;
    
    if (response) {
      const errorMessage = response.data?.message || response.data?.error || defaultMessage;
      const err = new Error(errorMessage);
      err.statusCode = response.status;
      err.code = response.data?.code;
      return err;
    }
    
    return new Error(defaultMessage + ': ' + error.message);
  }

  /**
   * Make authenticated request with automatic 401 handling
   * If request fails with 401, refreshes token and retries ONCE
   * 
   * Usage:
   *   const data = await GHLService.makeAuthenticatedRequest(
   *     locationId,
   *     (ghl) => ghl.getContact(contactId)
   *   );
   */
  static async makeAuthenticatedRequest(locationId, requestFn, retryCount = 0) {
    try {
      // Get current token
      const token = await OAuthToken.findActiveToken(locationId);
      
      if (!token) {
        throw new Error('No active token found for location');
      }

      // Make the request
      const ghlService = new GHLService(token.accessToken);
      return await requestFn(ghlService);
      
    } catch (error) {
      // If 401 Unauthorized and haven't retried yet, refresh and retry
      if (error.response?.status === 401 && retryCount === 0) {
        logger.info(`🔄 Got 401 for location ${locationId}, refreshing token...`);
        
        const token = await OAuthToken.findActiveToken(locationId);
        if (!token || !token.refreshToken) {
          throw new Error('No refresh token available - user needs to reconnect');
        }

        try {
          // Refresh the token
          const newTokenData = await this.refreshAccessToken(token.refreshToken);
          
          // Update in database
          token.accessToken = newTokenData.access_token;
          token.refreshToken = newTokenData.refresh_token;
          token.expiresAt = new Date(Date.now() + newTokenData.expires_in * 1000);
          await token.save();
          
          logger.info(`✅ Token refreshed successfully for location ${locationId}`);
          
          // Retry the request ONCE
          return await this.makeAuthenticatedRequest(locationId, requestFn, retryCount + 1);
          
        } catch (refreshError) {
          logger.error(`❌ Token refresh failed for location ${locationId}:`, refreshError);
          
          // Mark token as inactive - user needs to reconnect
          token.isActive = false;
          await token.save();
          
          throw new Error('Token refresh failed - please reconnect your account');
        }
      }
      
      // Other errors or already retried, just throw
      throw error;
    }
  }

  /**
   * Get valid token for location (simple version)
   * Use makeAuthenticatedRequest instead for automatic retry
   */
  static async getValidToken(locationId) {
    const token = await OAuthToken.findActiveToken(locationId);
    
    if (!token) {
      throw new Error('No active token found for location');
    }

    return token.accessToken;
  }
}

module.exports = GHLService;

