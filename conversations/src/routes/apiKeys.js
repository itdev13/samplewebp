const express = require('express');
const router = express.Router();
const ApiKey = require('../models/ApiKey');
const { verifyLocation } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * API Key Management Routes
 * For customers to create and manage their API keys
 */

/**
 * @route GET /api/keys
 * @desc Get all API keys for a location
 */
router.get(
  '/',
  apiLimiter,
  verifyLocation,
  asyncHandler(async (req, res) => {
    const { locationId } = req.query;

    const apiKeys = await ApiKey.find({ 
      locationId, 
      isActive: true 
    }).select('-keyHash').sort({ createdAt: -1 });

    res.json({
      success: true,
      data: apiKeys.map(key => ({
        id: key._id,
        name: key.name,
        keyPreview: key.keyPreview,
        tier: key.tier,
        scopes: key.scopes,
        limits: key.limits,
      usage: key.usage,
      createdAt: key.createdAt,
      lastUsedAt: key.usage.lastUsedAt
    }))
    });
  })
);

/**
 * @route POST /api/keys
 * @desc Create a new API key
 */
router.post(
  '/',
  apiLimiter,
  verifyLocation,
  asyncHandler(async (req, res) => {
    const location = req.location;
    const { name, description, scopes } = req.body;

    // Validate scopes
    const validScopes = [
      'conversations:read',
      'conversations:write',
      'messages:read',
      'messages:write',
      'webhooks:manage'
    ];

    const requestedScopes = scopes || ['conversations:read', 'messages:read'];
    const invalidScopes = requestedScopes.filter(s => !validScopes.includes(s));

    if (invalidScopes.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid scopes',
        invalidScopes,
        validScopes
      });
    }

    // Generate new API key
    const rawKey = ApiKey.generateKey();
    const keyPreview = ApiKey.getKeyPreview(rawKey);

    // Create API key document
    const apiKey = new ApiKey({
      apiKey: rawKey,
      keyPreview,
      locationId: location.locationId,
      companyId: location.companyId,
      name: name || 'API Key',
      description,
      tier: 'standard',
      scopes: requestedScopes,
      createdBy: {
        userId: req.body.userId,
        userEmail: req.body.userEmail
      }
    });

    // Set standard limits for all users
    apiKey.limits.requestsPerMonth = 100000; // 100k requests/month
    apiKey.limits.requestsPerMinute = 100; // 100 requests/minute

    await apiKey.save();

    logger.info('API key created:', {
      locationId: location.locationId,
      keyPreview,
      scopes: requestedScopes
    });

    // Return the raw key (only time it's shown)
    res.json({
      success: true,
      message: 'API key created successfully',
      data: {
        id: apiKey._id,
        key: rawKey, // ⚠️ Save this! Won't be shown again
        keyPreview,
        name: apiKey.name,
        tier: apiKey.tier,
        scopes: apiKey.scopes,
        limits: apiKey.limits,
        createdAt: apiKey.createdAt
      },
      warning: 'Save this API key securely. It will not be shown again.'
    });
  })
);

/**
 * @route PUT /api/keys/:keyId
 * @desc Update an API key (name, scopes, etc.)
 */
router.put(
  '/:keyId',
  apiLimiter,
  verifyLocation,
  asyncHandler(async (req, res) => {
    const { keyId } = req.params;
    const { locationId } = req.query;
    const { name, description, scopes, isActive } = req.body;

    const apiKey = await ApiKey.findOne({ 
      _id: keyId, 
      locationId 
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    // Update fields
    if (name) apiKey.name = name;
    if (description !== undefined) apiKey.description = description;
    if (scopes) apiKey.scopes = scopes;
    if (isActive !== undefined) apiKey.isActive = isActive;

    await apiKey.save();

    logger.info('API key updated:', {
      keyPreview: apiKey.keyPreview,
      updates: { name, description, scopes, isActive }
    });

    res.json({
      success: true,
      message: 'API key updated successfully',
      data: {
        id: apiKey._id,
        name: apiKey.name,
        keyPreview: apiKey.keyPreview,
        scopes: apiKey.scopes,
        isActive: apiKey.isActive
      }
    });
  })
);

/**
 * @route DELETE /api/keys/:keyId
 * @desc Revoke an API key
 */
router.delete(
  '/:keyId',
  apiLimiter,
  verifyLocation,
  asyncHandler(async (req, res) => {
    const { keyId } = req.params;
    const { locationId } = req.query;

    const apiKey = await ApiKey.findOne({ 
      _id: keyId, 
      locationId 
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    // Soft delete - mark as inactive
    apiKey.isActive = false;
    await apiKey.save();

    logger.info('API key revoked:', {
      keyPreview: apiKey.keyPreview,
      locationId
    });

    res.json({
      success: true,
      message: 'API key revoked successfully'
    });
  })
);

/**
 * @route POST /api/keys/:keyId/rotate
 * @desc Rotate an API key (generate new key)
 */
router.post(
  '/:keyId/rotate',
  apiLimiter,
  verifyLocation,
  asyncHandler(async (req, res) => {
    const { keyId } = req.params;
    const { locationId } = req.query;

    const oldKey = await ApiKey.findOne({ 
      _id: keyId, 
      locationId 
    });

    if (!oldKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    // Generate new key
    const rawKey = ApiKey.generateKey();
    const keyPreview = ApiKey.getKeyPreview(rawKey);

    // Update existing key
    oldKey.apiKey = rawKey;
    oldKey.keyPreview = keyPreview;
    oldKey.lastRotatedAt = new Date();
    await oldKey.save();

    logger.info('API key rotated:', {
      oldPreview: oldKey.keyPreview,
      newPreview: keyPreview,
      locationId
    });

    res.json({
      success: true,
      message: 'API key rotated successfully',
      data: {
        id: oldKey._id,
        key: rawKey, // ⚠️ Save this! Won't be shown again
        keyPreview,
        name: oldKey.name
      },
      warning: 'Save this new API key. The old key is now invalid.'
    });
  })
);

/**
 * @route GET /api/keys/:keyId/usage
 * @desc Get detailed usage statistics for an API key
 */
router.get(
  '/:keyId/usage',
  apiLimiter,
  verifyLocation,
  asyncHandler(async (req, res) => {
    const { keyId } = req.params;
    const { locationId } = req.query;

    const apiKey = await ApiKey.findOne({ 
      _id: keyId, 
      locationId 
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    res.json({
      success: true,
      data: {
        keyPreview: apiKey.keyPreview,
        tier: apiKey.tier,
        limits: apiKey.limits,
        usage: {
          currentMonth: apiKey.usage.currentMonth,
          totalRequests: apiKey.usage.totalRequests,
          lastUsedAt: apiKey.usage.lastUsedAt,
          percentUsed: Math.round((apiKey.usage.currentMonth / apiKey.limits.requestsPerMonth) * 100),
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

