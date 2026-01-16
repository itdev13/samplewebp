const express = require('express');
const router = express.Router();
const Analytics = require('../models/Analytics');
const logger = require('../utils/logger');

/**
 * Analytics Routes
 * Lightweight usage tracking
 */

/**
 * Track an event
 */
router.post('/track', async (req, res) => {
  try {
    const { locationId, userId, eventType, metadata } = req.body;

    if (!locationId || !userId || !eventType) {
      return res.status(400).json({
        success: false,
        error: 'locationId, userId, and eventType are required'
      });
    }

    await Analytics.track(locationId, userId, eventType, metadata);

    res.json({ success: true });
  } catch (error) {
    logger.error('Analytics tracking error:', error);
    // Don't fail - analytics is non-critical
    res.json({ success: false, error: error.message });
  }
});

/**
 * Get usage stats for a location
 */
router.get('/stats', async (req, res) => {
  try {
    const { locationId, days } = req.query;

    if (!locationId) {
      return res.status(400).json({
        success: false,
        error: 'locationId is required'
      });
    }

    const daysNum = parseInt(days) || 30;

    // Get stats in parallel
    const [dailyActiveUsers, featureUsage, totalUsers] = await Promise.all([
      Analytics.getDailyActiveUsers(locationId, daysNum),
      Analytics.getFeatureUsage(locationId, daysNum),
      Analytics.getTotalUsers(locationId)
    ]);

    res.json({
      success: true,
      stats: {
        totalUniqueUsers: totalUsers,
        dailyActiveUsers,
        featureUsage,
        period: `Last ${daysNum} days`
      }
    });

  } catch (error) {
    logger.error('Error getting analytics stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

