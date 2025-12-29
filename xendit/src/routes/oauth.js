const express = require('express');
const router = express.Router();
const GHLService = require('../services/ghlService');
const OAuthToken = require('../models/OAuthToken');
const Location = require('../models/Location');
const { generateToken } = require('../middleware/auth');
const { oauthLimiter } = require('../middleware/rateLimiter');
const { asyncHandler } = require('../middleware/errorHandler');
const { ApiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * OAuth Authorization - Initiate OAuth flow
 * GET /oauth/authorize
 */
router.get('/authorize', oauthLimiter, (req, res) => {
  const { redirectUrl } = req.query;
  
  const authUrl = `${process.env.GHL_OAUTH_URL}/authorize?` +
    `client_id=${process.env.GHL_CLIENT_ID}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(process.env.GHL_REDIRECT_URI)}&` +
    `scope=locations.read locations.write contacts.read contacts.write opportunities.read opportunities.write payments.write&` +
    `state=${redirectUrl || ''}`;
  
  res.redirect(authUrl);
});

/**
 * OAuth Callback - Handle OAuth callback from GHL
 * GET /oauth/callback
 */
router.get('/callback', oauthLimiter, asyncHandler(async (req, res) => {
  const { code, state } = req.query;
  
  if (!code) {
    return res.status(400).json(ApiResponse.error('Authorization code is required'));
  }

  try {
    // Exchange code for tokens
    const tokenData = await GHLService.exchangeCodeForToken(code);
    
    logger.info('OAuth token received:', {
      locationId: tokenData.locationId,
      companyId: tokenData.companyId,
      userType: tokenData.userType
    });

    // Extract location and company IDs from token data
    const locationId = tokenData.locationId;
    const companyId = tokenData.companyId;
    
    logger.info('Processing OAuth for location:', { locationId, companyId });

    // Deactivate old tokens
    await OAuthToken.updateMany(
      { locationId, isActive: true },
      { isActive: false }
    );

    // Store new OAuth token
    const oauthToken = new OAuthToken({
      locationId,
      companyId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenType: tokenData.token_type || 'Bearer',
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      scopes: tokenData.scope?.split(' ') || [],
      userType: tokenData.userType || 'Location',
      isActive: true
    });

    await oauthToken.save();

    // Create or update location entry
    let location = await Location.findOne({ locationId });
    
    if (!location) {
      location = new Location({
        locationId,
        companyId,
        xenditApiKey: '', // ⚠️ Empty - will be configured in separate step
        enabledPaymentMethods: ['invoice', 'virtual_account', 'ewallet'],
        isActive: false // Will be activated after Xendit config
      });
      await location.save();
      
      logger.info(`New location created: ${locationId} - Awaiting Xendit configuration`);
    }

    // Generate JWT for app
    const appToken = generateToken(locationId, companyId);

    // Redirect to configuration page
    // User needs to enter Xendit API key in the next step
    if (state) {
      // Redirect to GHL with success, they'll show config page
      return res.redirect(`${state}?success=true&locationId=${locationId}&needsConfig=true`);
    }

    // Redirect to our configuration page
    res.redirect(`/configure.html?locationId=${locationId}&token=${appToken}`);

  } catch (error) {
    logger.error('OAuth callback error:', error);
    
    if (state) {
      return res.redirect(`${state}?error=${encodeURIComponent(error.message)}`);
    }
    
    res.status(500).json(ApiResponse.error('OAuth authorization failed'));
  }
}));

/**
 * Refresh Token
 * POST /oauth/refresh
 */
router.post('/refresh', oauthLimiter, asyncHandler(async (req, res) => {
  const { locationId, refreshToken } = req.body;
  
  if (!locationId || !refreshToken) {
    return res.status(400).json(
      ApiResponse.error('Location ID and refresh token are required')
    );
  }

  // Find token
  const token = await OAuthToken.findOne({ locationId, refreshToken });
  
  if (!token) {
    return res.status(404).json(ApiResponse.error('Token not found'));
  }

  // Refresh token
  const newTokenData = await GHLService.refreshAccessToken(refreshToken);
  
  // Update token
  token.accessToken = newTokenData.access_token;
  token.refreshToken = newTokenData.refresh_token;
  token.expiresAt = new Date(Date.now() + newTokenData.expires_in * 1000);
  await token.save();
  
  // Generate new app token
  const appToken = generateToken(locationId, token.companyId);

  res.json(ApiResponse.success({
    token: appToken,
    expiresAt: token.expiresAt
  }, 'Token refreshed successfully'));
}));

/**
 * Revoke Token
 * POST /oauth/revoke
 */
router.post('/revoke', oauthLimiter, asyncHandler(async (req, res) => {
  const { locationId } = req.body;
  
  if (!locationId) {
    return res.status(400).json(ApiResponse.error('Location ID is required'));
  }

  // Deactivate all tokens for location
  await OAuthToken.updateMany(
    { locationId },
    { isActive: false }
  );
  
  // Deactivate location
  await Location.updateOne(
    { locationId },
    { isActive: false }
  );

  logger.info(`OAuth tokens revoked for location: ${locationId}`);

  res.json(ApiResponse.success(null, 'Token revoked successfully'));
}));

/**
 * Get OAuth Status
 * GET /oauth/status/:locationId
 */
router.get('/status/:locationId', asyncHandler(async (req, res) => {
  const { locationId } = req.params;
  
  const token = await OAuthToken.findActiveToken(locationId);
  
  if (!token) {
    return res.json(ApiResponse.success({
      connected: false,
      message: 'Not connected'
    }));
  }

  res.json(ApiResponse.success({
    connected: true,
    expiresAt: token.expiresAt,
    needsRefresh: token.needsRefresh(),
    scopes: token.scopes
  }));
}));

module.exports = router;

