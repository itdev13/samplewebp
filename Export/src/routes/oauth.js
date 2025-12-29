const express = require('express');
const router = express.Router();
const ghlService = require('../services/ghlService');
const OAuthToken = require('../models/OAuthToken');
const Location = require('../models/Location');
const logger = require('../utils/logger');
const { generateSecureToken } = require('../utils/encryption');
const { asyncHandler } = require('../middleware/errorHandler');
const { oauthLimiter } = require('../middleware/rateLimiter');
const { getErrorMessage } = require('../utils/helpers');

/**
 * OAuth Routes
 * Handles GoHighLevel OAuth flow
 */

/**
 * @route GET /oauth/authorize
 * @desc Initiate OAuth flow
 */

// router.get('/authorize', oauthLimiter, (req, res) => {
//   const { redirectUrl } = req.query;
  
//   const scopes = [
//     'conversations.readonly',
//     'conversations/message.readonly',
//     'locations.readonly',
//     'contacts.readonly'
//   ].join(' ');
//   const state = generateSecureToken();
//       res.cookie('oauth_state', state, {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === 'production',
//       sameSite: 'lax',
//       maxAge: 10 * 60 * 1000 // 10 minutes
//     });
//   const authUrl = `${process.env.GHL_OAUTH_URL}/authorize?` +
//     `client_id=${process.env.GHL_CLIENT_ID}&` +
//     `response_type=code&` +
//     `redirect_uri=${encodeURIComponent(process.env.GHL_REDIRECT_URI)}&` +
//     `scope=${scopes}&` +
//     `state=${redirectUrl || ''}`;
  
//   res.redirect(authUrl);
// });


router.get('/authorize', oauthLimiter, (req, res) => {
  try {
    // Get authorization URL
    const authUrl = ghlService.getAuthorizationUrl(state);

      // Extract location and company IDs from token data

    logger.info('OAuth authorization initiated', {
      state: state.substring(0, 8) + '...',
      baseUrl: process.env.BASE_URL || process.env.APP_URL
    });

    // Redirect to GHL authorization page
    res.redirect(authUrl);
  } catch (error) {
    logger.error('OAuth authorization error:', error);
    res.status(500).send('Authorization failed. Please try again.');
  }
});

/**
 * @route GET /oauth/callback
 * @desc OAuth callback endpoint
 */
router.get('/callback', oauthLimiter, asyncHandler(async (req, res) => {
  const { code, state, error, error_description } = req.query;

  // Check for OAuth errors
  if (error) {
    logger.error('OAuth callback error:', { error, error_description });
    return res.redirect(`/error?message=${encodeURIComponent(error_description || error)}`);
  }

  if (!code) {
    logger.error('No authorization code received');
    return res.redirect('/error?message=No authorization code received');
  }

  try {
    // Exchange code for tokens
    const tokenData = await ghlService.getAccessToken(code);

    logger.info('OAuth tokens obtained:', {
      userType: tokenData.userType,
      locationId: tokenData.locationId || 'N/A (Agency)',
      companyId: tokenData.companyId,
      userId: tokenData.userId
    });

    // Save or update OAuth token
    const expiresAt = new Date(Date.now() + tokenData.expiresIn * 1000);

    // Determine query based on token type
    const query = tokenData.locationId 
      ? { locationId: tokenData.locationId } // Sub-Account token
      : { companyId: tokenData.companyId, userType: 'Company' }; // Agency token

    await OAuthToken.findOneAndUpdate(
      query,
      {
        locationId: tokenData.locationId || null,
        companyId: tokenData.companyId,
        userType: tokenData.userType,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        tokenType: tokenData.tokenType,
        expiresAt: expiresAt,
        scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
        userId: tokenData.userId,
        isActive: true,
        grantedAt: new Date()
      },
      { upsert: true, new: true }
    );

    logger.info('OAuth token saved to database', {
      userType: tokenData.userType,
      query
    });

    // Create or update location record (for Sub-Account tokens)
    if (tokenData.locationId) {
      // Fetch location details from GHL API
      let locationDetails = {
        name: 'Loading...', // Temporary name
        address: null,
        city: null,
        state: null,
        country: null
      };

      try {
        const ghlLocation = await ghlService.getLocation(tokenData.locationId);
        locationDetails = {
          name: ghlLocation.name || ghlLocation.companyName || tokenData.locationId,
          address: ghlLocation.address,
          city: ghlLocation.city,
          state: ghlLocation.state,
          country: ghlLocation.country
        };
        logger.info('Fetched location details:', { 
          locationId: tokenData.locationId, 
          name: locationDetails.name 
        });
      } catch (error) {
        logger.warn('Failed to fetch location details, using locationId as name:', {
          locationId: tokenData.locationId,
          error: getErrorMessage(error)
        });
        locationDetails.name = tokenData.locationId; // Fallback to locationId
      }

      await Location.findOneAndUpdate(
        { locationId: tokenData.locationId },
        {
          locationId: tokenData.locationId,
          companyId: tokenData.companyId,
          name: locationDetails.name,
          address: locationDetails.address,
          city: locationDetails.city,
          state: locationDetails.state,
          country: locationDetails.country,
          isActive: true,
          installedAt: new Date(),
          subscriptionTier: 'trial', // Default to trial
          subscriptionStatus: 'active'
        },
        { upsert: true, new: true }
      );

      logger.logOAuth('installation_completed', {
        type: 'sub-account',
        locationId: tokenData.locationId,
        companyId: tokenData.companyId,
        locationName: locationDetails.name
      });

      // Redirect to configure page with locationId
      res.redirect(`/configure.html?locationId=${tokenData.locationId}`);
    } else {
      // Agency-level installation
      logger.logOAuth('installation_completed', {
        type: 'agency',
        companyId: tokenData.companyId,
        userId: tokenData.userId
      });

      // Redirect to configure page (agency level)
      res.redirect(`/configure.html?companyId=${tokenData.companyId}&isAgency=true`);
    }
  } catch (error) {
    logger.error('OAuth callback processing error:', getErrorMessage(error));
    res.redirect(`/error?message=${encodeURIComponent('Failed to complete authorization')}`);
  }
}));

/**
 * @route POST /oauth/refresh
 * @desc Manually refresh OAuth token
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const { locationId } = req.body;

  if (!locationId) {
    return res.status(400).json({
      success: false,
      error: 'Location ID is required'
    });
  }

  const tokenDoc = await OAuthToken.findOne({ locationId, isActive: true });

  if (!tokenDoc) {
    return res.status(404).json({
      success: false,
      error: 'OAuth token not found'
    });
  }

  try {
    const refreshToken = tokenDoc.getRefreshToken();
    const newTokenData = await ghlService.refreshAccessToken(refreshToken);

    // Update token
    tokenDoc.accessToken = newTokenData.accessToken;
    tokenDoc.refreshToken = newTokenData.refreshToken;
    tokenDoc.expiresAt = new Date(Date.now() + newTokenData.expiresIn * 1000);
    tokenDoc.lastRefreshedAt = new Date();
    await tokenDoc.save();

    logger.info('OAuth token manually refreshed:', { locationId });

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      expiresAt: tokenDoc.expiresAt
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh token'
    });
  }
}));

/**
 * @route POST /oauth/disconnect
 * @desc Disconnect OAuth integration
 */
router.post('/disconnect', asyncHandler(async (req, res) => {
  const { locationId } = req.body;

  if (!locationId) {
    return res.status(400).json({
      success: false,
      error: 'Location ID is required'
    });
  }

  // Deactivate OAuth token
  await OAuthToken.findOneAndUpdate(
    { locationId },
    { isActive: false }
  );

  // Mark location as inactive
  await Location.findOneAndUpdate(
    { locationId },
    { 
      isActive: false,
      uninstalledAt: new Date()
    }
  );

  logger.logOAuth('disconnected', { locationId });

  res.json({
    success: true,
    message: 'OAuth integration disconnected successfully'
  });
}));

/**
 * @route GET /oauth/status
 * @desc Check OAuth connection status
 */
router.get('/status', asyncHandler(async (req, res) => {
  const { locationId } = req.query;

  if (!locationId) {
    return res.status(400).json({
      success: false,
      error: 'Location ID is required'
    });
  }

  const tokenDoc = await OAuthToken.findOne({ locationId });
  const location = await Location.findOne({ locationId });

  if (!tokenDoc || !location) {
    return res.json({
      success: true,
      connected: false,
      message: 'Not connected'
    });
  }

  const isConnected = tokenDoc.isActive && location.isActive;
  const isExpired = tokenDoc.isExpired();
  const needsRefresh = tokenDoc.needsRefresh();

  res.json({
    success: true,
    connected: isConnected,
    expired: isExpired,
    needsRefresh: needsRefresh,
    expiresAt: tokenDoc.expiresAt,
    lastRefreshed: tokenDoc.lastRefreshedAt,
    scopes: tokenDoc.scopes
  });
}));

module.exports = router;
