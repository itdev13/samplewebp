const express = require('express');
const router = express.Router();
const GHLService = require('../services/ghlService');
const { authenticateApiKey, requireScope } = require('../middleware/apiKeyAuth');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * Public API Gateway Routes
 * Proxies requests to GHL Conversations API
 * 
 * Base URL: /api/v1
 * Authentication: Bearer token (API key)
 */

/**
 * @route GET /api/v1/conversations/search
 * @desc Search conversations for a location
 * @access Requires API key with 'conversations:read' scope
 */
router.get(
  '/conversations/search',
  authenticateApiKey,
  requireScope('conversations:read'),
  asyncHandler(async (req, res) => {
    const { locationId } = req;
    const filters = { ...req.query, locationId };

    logger.info('API Gateway: Search conversations', {
      locationId,
      filters,
      apiKeyPreview: req.apiKey.keyPreview
    });

    try {
      // Proxy to GHL API with automatic 401 handling
      const result = await GHLService.makeAuthenticatedRequest(
        locationId,
        (ghl) => ghl.searchConversations(filters)
      );

      res.json({
        success: true,
        data: result,
        meta: {
          locationId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('API Gateway error: search conversations', {
        error: error.message,
        locationId
      });

      res.status(error.response?.status || 500).json({
        success: false,
        error: 'Failed to search conversations',
        message: error.message,
        code: error.response?.status
      });
    }
  })
);

/**
 * @route GET /api/v1/conversations/:conversationId
 * @desc Get a specific conversation by ID
 * @access Requires API key with 'conversations:read' scope
 */
router.get(
  '/conversations/:conversationId',
  authenticateApiKey,
  requireScope('conversations:read'),
  asyncHandler(async (req, res) => {
    const { locationId } = req;
    const { conversationId } = req.params;

    logger.info('API Gateway: Get conversation', {
      locationId,
      conversationId,
      apiKeyPreview: req.apiKey.keyPreview
    });

    try {
      // Proxy to GHL API with automatic 401 handling
      const result = await GHLService.makeAuthenticatedRequest(
        locationId,
        (ghl) => ghl.getConversation(conversationId)
      );

      res.json({
        success: true,
        data: result,
        meta: {
          locationId,
          conversationId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('API Gateway error: get conversation', {
        error: error.message,
        locationId,
        conversationId
      });

      res.status(error.response?.status || 500).json({
        success: false,
        error: 'Failed to get conversation',
        message: error.message,
        code: error.response?.status
      });
    }
  })
);

/**
 * @route GET /api/v1/conversations/:conversationId/messages
 * @desc Get messages for a specific conversation
 * @access Requires API key with 'messages:read' scope
 */
router.get(
  '/conversations/:conversationId/messages',
  authenticateApiKey,
  requireScope('messages:read'),
  asyncHandler(async (req, res) => {
    const { locationId } = req;
    const { conversationId } = req.params;
    const { limit, lastMessageId, type } = req.query;

    logger.info('API Gateway: Get conversation messages', {
      locationId,
      conversationId,
      limit,
      type,
      apiKeyPreview: req.apiKey.keyPreview
    });

    try {
      // Proxy to GHL API with automatic 401 handling
      const result = await GHLService.makeAuthenticatedRequest(
        locationId,
        (ghl) => ghl.getConversationMessages(conversationId, { limit, lastMessageId, type })
      );

      // Apply filters if provided
      let messages = result.messages || result;
      
      if (type) {
        messages = messages.filter(msg => msg.type === type);
      }

      if (limit) {
        messages = messages.slice(0, parseInt(limit));
      }

      res.json({
        success: true,
        data: {
          messages,
          conversationId,
          total: messages.length
        },
        meta: {
          locationId,
          conversationId,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('API Gateway error: get messages', {
        error: error.message,
        locationId,
        conversationId
      });

      res.status(error.response?.status || 500).json({
        success: false,
        error: 'Failed to get messages',
        message: error.message,
        code: error.response?.status
      });
    }
  })
);

/**
 * @route GET /api/v1/messages/export
 * @desc Export messages with advanced filtering
 * @access Requires API key with 'messages:read' scope
 */
router.get(
  '/messages/export',
  authenticateApiKey,
  requireScope('messages:read'),
  asyncHandler(async (req, res) => {
    const { locationId } = req;
    const { 
      startDate, 
      endDate, 
      contactId, 
      channel = 'SMS',
      limit = 100 
    } = req.query;

    logger.info('API Gateway: Export messages', {
      locationId,
      startDate,
      endDate,
      channel,
      apiKeyPreview: req.apiKey.keyPreview
    });

    try {
      const options = {
        locationId,
        channel,
        limit: parseInt(limit)
      };

      if (startDate) options.startDate = startDate;
      if (endDate) options.endDate = endDate;
      if (contactId) options.contactId = contactId;

      // Proxy to GHL API with automatic 401 handling
      const result = await GHLService.makeAuthenticatedRequest(
        locationId,
        (ghl) => ghl.exportMessages(options)
      );

      res.json({
        success: true,
        data: result,
        meta: {
          locationId,
          filters: options,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('API Gateway error: export messages', {
        error: error.message,
        locationId
      });

      res.status(error.response?.status || 500).json({
        success: false,
        error: 'Failed to export messages',
        message: error.message,
        code: error.response?.status
      });
    }
  })
);

/**
 * @route GET /api/v1/health
 * @desc Health check endpoint (no auth required)
 * @access Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

/**
 * @route GET /api/v1/usage
 * @desc Get API key usage statistics
 * @access Requires API key
 */
router.get(
  '/usage',
  authenticateApiKey,
  asyncHandler(async (req, res) => {
    const apiKey = req.apiKey;

    res.json({
      success: true,
      data: {
        tier: apiKey.tier,
        limits: apiKey.limits,
        usage: {
          currentMonth: apiKey.usage.currentMonth,
          totalRequests: apiKey.usage.totalRequests,
          lastUsedAt: apiKey.usage.lastUsedAt,
          remaining: apiKey.limits.requestsPerMonth - apiKey.usage.currentMonth
        },
        resetDate: new Date(
          apiKey.usage.lastResetDate.getFullYear(),
          apiKey.usage.lastResetDate.getMonth() + 1,
          1
        )
      }
    });
  })
);

module.exports = router;

