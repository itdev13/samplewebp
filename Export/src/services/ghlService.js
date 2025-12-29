const axios = require('axios');
const logger = require('../utils/logger');
const OAuthToken = require('../models/OAuthToken');
const { retryWithBackoff, getErrorMessage } = require('../utils/helpers');

/**
 * GoHighLevel API Service
 * Handles OAuth and API interactions with GHL
 * 
 * OAuth Flow:
 * - For Sub-Account (Location) apps: Tokens include locationId
 * - For Agency apps: Tokens include companyId but no locationId
 * - The userType field indicates: "Location" or "Company"
 * 
 * Reference: https://marketplace.gohighlevel.com/docs/Authorization/TargetUserAgency
 */
class GHLService {
  constructor() {
    this.baseURL = 'https://services.leadconnectorhq.com';
    this.authURL = 'https://services.leadconnectorhq.com/oauth';
    this.clientId = process.env.GHL_CLIENT_ID;
    this.clientSecret = process.env.GHL_CLIENT_SECRET;
    this.redirectUri = process.env.GHL_REDIRECT_URI;
    
    // Validate configuration
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      logger.error('Missing GHL OAuth configuration', {
        hasClientId: !!this.clientId,
        hasClientSecret: !!this.clientSecret,
        hasRedirectUri: !!this.redirectUri
      });
    }
  }

  /**
   * Get authorization URL for OAuth flow
   * @param {string} state - State parameter for CSRF protection
   * @returns {string} - Authorization URL
   */
  getAuthorizationUrl(state) {
    const scopes = [
      'conversations.readonly',
      'conversations/message.readonly',
      'locations.readonly',
      'contacts.readonly'
    ].join(' ');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: scopes,
      state: state
    });

    const authUrl = `${this.authURL}/authorize?${params.toString()}`;
    logger.info('Authorization URL generated', { 
      redirectUri: this.redirectUri,
      scopes: scopes.split(' ')
    });

    return authUrl;
  }

  /**
   * Exchange authorization code for access token
   * @param {string} code - Authorization code
   * @returns {Object} - Token data
   */
  async getAccessToken(code) {
    try {
      logger.info('Exchanging authorization code for access token');

      // GHL OAuth expects application/x-www-form-urlencoded
      const params = new URLSearchParams();
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      
      // Note: user_type is optional. GHL will determine it based on the authorization context.
      // For Sub-Account apps: userType will be "Location"
      // For Agency apps: userType will be "Company"
      console.log(params,'params');
      console.log(`${this.authURL}/token`,'url');
      console.log(this.clientId,'clientId');
      console.log(this.clientSecret,'clientSecret');
      console.log(code,'code');

      const response = await axios.post(`${this.authURL}/token`, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });



      const data = response.data;
      
      logger.logOAuth('token_obtained', {
        userType: data.userType,
        companyId: data.companyId,
        locationId: data.locationId || 'N/A (Agency-level token)',
        userId: data.userId
      });

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenType: data.token_type || 'Bearer',
        expiresIn: data.expires_in,
        scope: data.scope,
        locationId: data.locationId || null, // May be null for Agency-level tokens
        companyId: data.companyId,
        userId: data.userId,
        userType: data.userType, // "Location" or "Company"
        refreshTokenId: data.refreshTokenId
      };
    } catch (error) {
      // Enhanced error logging
      if (error.response) {
        logger.error('Token exchange failed:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      } else {
        logger.error('Token exchange error:', error.message);
      }
      throw new Error(`OAuth token exchange failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Refresh access token
   * @param {string} refreshToken - Refresh token
   * @returns {Object} - New token data
   */
  async refreshAccessToken(refreshToken) {
    try {
      logger.info('Refreshing access token');

      // Create URL-encoded form data
      const params = new URLSearchParams();
      params.append('client_id', this.clientId);
      params.append('client_secret', this.clientSecret);
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', refreshToken);

      const response = await axios.post(`${this.authURL}/token`, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      logger.logOAuth('token_refreshed', {
        userType: response.data.userType,
        companyId: response.data.companyId,
        locationId: response.data.locationId || 'N/A'
      });

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        tokenType: response.data.token_type || 'Bearer',
        expiresIn: response.data.expires_in,
        scope: response.data.scope
      };
    } catch (error) {
      logger.error('Failed to refresh token:', {
        error: getErrorMessage(error),
        status: error.response?.status
      });
      throw new Error(`Token refresh failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get valid access token for a location (refresh if needed)
   * @param {string} locationId - Location ID
   * @returns {string} - Valid access token
   */
  async getValidToken(locationId) {
    const tokenDoc = await OAuthToken.findOne({ locationId, isActive: true });
    
    if (!tokenDoc) {
      throw new Error('No OAuth token found for location');
    }

    // If token needs refresh
    if (tokenDoc.needsRefresh()) {
      logger.info(`Token needs refresh for location: ${locationId}`);
      
      const refreshToken = tokenDoc.getRefreshToken();
      const newTokenData = await this.refreshAccessToken(refreshToken);

      // Update token in database
      tokenDoc.accessToken = newTokenData.accessToken;
      tokenDoc.refreshToken = newTokenData.refreshToken;
      tokenDoc.expiresAt = new Date(Date.now() + newTokenData.expiresIn * 1000);
      tokenDoc.lastRefreshedAt = new Date();
      await tokenDoc.save();
    }

    return tokenDoc.getAccessToken();
  }

  /**
   * Make authenticated API request to GHL
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {string} locationId - Location ID
   * @param {Object} data - Request data
   * @param {Object} params - Query parameters
   * @returns {Object} - API response
   */
  async apiRequest(method, endpoint, locationId, data = null, params = null) {
    try {
      const accessToken = await this.getValidToken(locationId);
      
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28'
        }
      };

      if (data) config.data = data;
      if (params) config.params = params;

      const startTime = Date.now();
      const response = await axios(config);
      const duration = Date.now() - startTime;

      logger.logApiCall(method, endpoint, response.status, duration);

      return response.data;
    } catch (error) {
      logger.error(`API request failed: ${method} ${endpoint}`, {
        error: getErrorMessage(error),
        status: error.response?.status
      });
      throw error;
    }
  }

  /**
   * Search conversations
   * @param {string} locationId - Location ID
   * @param {Object} filters - Search filters
   * @returns {Object} - Conversations data
   */
  async searchConversations(locationId, filters = {}) {
    const params = {
      locationId: locationId,
      limit: filters.limit || 100,
      ...filters
    };

    return await this.apiRequest(
      'GET',
      '/conversations/search',
      locationId,
      null,
      params
    );
  }

  /**
   * Get conversation by ID
   * @param {string} locationId - Location ID
   * @param {string} conversationId - Conversation ID
   * @returns {Object} - Conversation data
   */
  async getConversation(locationId, conversationId) {
    return await this.apiRequest(
      'GET',
      `/conversations/${conversationId}`,
      locationId
    );
  }

  /**
   * Export messages by location (with pagination)
   * @param {string} locationId - Location ID
   * @param {Object} options - Export options
   * @returns {Object} - Messages data with pagination
   */
  async exportMessages(locationId, options = {}) {
    try {
      const params = {
        locationId: locationId,
        channel: options.channel || 'SMS', // Required by GHL API
        limit: options.limit || 100
      };

      // Add optional filters
      if (options.cursor) {
        params.cursor = options.cursor;
      }

      // Add date filters if provided
      if (options.startDate) {
        params.startDate = new Date(options.startDate).toISOString();
      }
      if (options.endDate) {
        params.endDate = new Date(options.endDate).toISOString();
      }

      // Add contact filter if provided
      if (options.contactId) {
        params.contactId = options.contactId;
      }

      logger.info('Exporting messages with params:', { 
        locationId, 
        channel: params.channel,
        hasStartDate: !!params.startDate,
        hasEndDate: !!params.endDate,
        limit: params.limit
      });

      const response = await this.apiRequest(
        'GET',
        '/conversations/messages/export',
        locationId,
        null,
        params
      );

      return response;
    } catch (error) {
      logger.error('Failed to export messages:', getErrorMessage(error));
      throw error;
    }
  }

  /**
   * Export all messages with pagination handling
   * @param {string} locationId - Location ID
   * @param {Object} filters - Export filters
   * @param {Function} onProgress - Progress callback
   * @returns {Array} - All messages
   */
  async exportAllMessages(locationId, filters = {}, onProgress = null) {
    const allMessages = [];
    let cursor = null;
    let totalFetched = 0;

    try {
      do {
        const options = {
          ...filters,
          limit: 100
        };

        if (cursor) {
          options.cursor = cursor;
        }

        const response = await this.exportMessages(locationId, options);
        
        if (response.messages && response.messages.length > 0) {
          allMessages.push(...response.messages);
          totalFetched += response.messages.length;

          if (onProgress) {
            onProgress(totalFetched, response.total || totalFetched);
          }
        }

        cursor = response.nextCursor || null;

        // Respect rate limits
        if (cursor) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } while (cursor);

      logger.info(`Exported ${totalFetched} messages for location ${locationId}`);
      
      return allMessages;
    } catch (error) {
      logger.error('Failed to export all messages:', getErrorMessage(error));
      throw error;
    }
  }

  /**
   * Get messages by conversation ID
   * @param {string} locationId - Location ID
   * @param {string} conversationId - Conversation ID
   * @returns {Array} - Messages
   */
  async getConversationMessages(locationId, conversationId) {
    return await this.apiRequest(
      'GET',
      `/conversations/messages`,
      locationId,
      null,
      { conversationId }
    );
  }

  /**
   * Get location details
   * @param {string} locationId - Location ID
   * @returns {Object} - Location details
   */
  async getLocation(locationId) {
    const response = await this.apiRequest(
      'GET',
      `/locations/${locationId}`,
      locationId
    );
    
    logger.info('GHL Location API Response:', {
      locationId,
      response: JSON.stringify(response).substring(0, 500) // Log first 500 chars
    });
    
    // GHL API returns nested data, extract the location object
    return response.location || response;
  }

  /**
   * Get contact details
   * @param {string} locationId - Location ID
   * @param {string} contactId - Contact ID
   * @returns {Object} - Contact details
   */
  async getContact(locationId, contactId) {
    return await this.apiRequest(
      'GET',
      `/contacts/${contactId}`,
      locationId
    );
  }
}

module.exports = new GHLService();
