const express = require('express');
const router = express.Router();
const ghlService = require('../services/ghlService');
const logger = require('../utils/logger');
const { authenticateSession } = require('../middleware/auth');
const { sanitizeLimit, sanitizeOffset, isValidDate } = require('../utils/sanitize');

/**
 * FEATURE 1: Download Conversations
 * Search and export conversations with advanced filtering
 */

/**
 * @route GET /api/conversations/download
 * @desc Download conversations for a location
 */
router.get('/download', authenticateSession, async (req, res) => {
  try {
    const { 
      locationId, 
      limit, 
      startDate, 
      endDate,
      lastMessageType,
      lastMessageDirection,
      status,
      lastMessageAction,
      sortBy,
      offset
    } = req.query;

    if (!locationId) {
      return res.status(400).json({
        success: false,
        error: 'locationId is required'
      });
    }

    // Validate date formats
    if (startDate && !isValidDate(startDate)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid startDate format. Use ISO 8601 format.'
      });
    }

    if (endDate && !isValidDate(endDate)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid endDate format. Use ISO 8601 format.'
      });
    }

    // Sanitize numeric parameters
    const sanitizedLimit = sanitizeLimit(limit, 20, 100);
    const sanitizedOffset = sanitizeOffset(offset, 0);

    logger.info('Downloading conversations', { locationId, limit: sanitizedLimit });

    // Build filters with all parameters
    const filters = { limit: sanitizedLimit };
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (sanitizedOffset > 0) filters.offset = sanitizedOffset;
    if (lastMessageType) filters.lastMessageType = lastMessageType;
    if (lastMessageDirection) filters.lastMessageDirection = lastMessageDirection;
    if (status) filters.status = status;
    if (lastMessageAction) filters.lastMessageAction = lastMessageAction;
    if (sortBy) filters.sortBy = sortBy;
    if (offset) filters.offset = offset;

    // Fetch conversations from API
    const result = await ghlService.searchConversations(locationId, filters);

    const conversations = result.conversations || [];

    res.json({
      success: true,
      message: 'Conversations downloaded successfully',
      data: {
        total: conversations.length,
        conversations: conversations.map(conv => ({
          id: conv.id,
          contactId: conv.contactId,
          contactName: conv.contactName,
          lastMessageDate: conv.lastMessageDate,
          lastMessageBody: conv.lastMessageBody,
          unreadCount: conv.unreadCount,
          type: conv.type
        }))
      },
      meta: {
        locationId,
        downloadedAt: new Date().toISOString(),
        filters
      }
    });

  } catch (error) {
    logger.error('Download conversations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download conversations',
      message: error.message
    });
  }
});

/**
 * @route GET /api/conversations/search
 * @desc Search conversations with filters
 */
router.get('/search', authenticateSession, async (req, res) => {
  try {
    const { locationId, ...filters } = req.query;

    if (!locationId) {
      return res.status(400).json({
        success: false,
        error: 'locationId is required'
      });
    }

    const result = await ghlService.searchConversations(locationId, filters);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('Search conversations error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/conversations/:conversationId
 * @desc Get specific conversation details
 */
router.get('/:conversationId', authenticateSession, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { locationId } = req.query;

    if (!locationId) {
      return res.status(400).json({
        success: false,
        error: 'locationId is required'
      });
    }

    const conversation = await ghlService.getConversation(locationId, conversationId);

    res.json({
      success: true,
      data: conversation
    });

  } catch (error) {
    logger.error('Get conversation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

