const express = require('express');
const router = express.Router();
const Location = require('../models/Location');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const path = require('path');

/**
 * GHL App Entry Point
 * This is where users land when they click your app icon in GHL sidebar
 * 
 * GHL automatically sends these query parameters:
 * - userId: The GHL user ID
 * - locationId: The location ID
 * - companyId: The company ID (for agency apps)
 * 
 * GET /app
 */
router.get('/', asyncHandler(async (req, res) => {
  const { userId, locationId, companyId } = req.query;
  
  logger.info('App accessed from GHL:', { userId, locationId, companyId });
  
  // Verify location exists in our database
  const location = await Location.findOne({ locationId });
  
  if (!location) {
    logger.warn('Location not found - user needs to install app:', { locationId });
    return res.status(404).send(`
      <html>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1>⚠️ App Not Installed</h1>
          <p>Please install the Conversations API Gateway from the GHL Marketplace first.</p>
          <a href="/oauth/authorize" style="display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 8px; margin-top: 20px;">
            Install Now
          </a>
        </body>
      </html>
    `);
  }
  
  if (!location.isActive) {
    logger.warn('Location is not active:', { locationId });
    return res.status(403).send(`
      <html>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1>⚠️ App Not Active</h1>
          <p>Your app installation is not active. Please reinstall or contact support.</p>
        </body>
      </html>
    `);
  }
  
  // Create session for this user
  req.session.userId = userId;
  req.session.locationId = locationId;
  req.session.companyId = companyId;
  req.session.authenticated = true;
  req.session.authenticatedAt = new Date();
  
  // Log access
  logger.info('User authenticated via GHL SSO:', {
    userId,
    locationId,
    locationName: location.name || location.companyName
  });
  
  // Redirect to developer portal with session
  res.redirect(`/developer.html?locationId=${locationId}`);
}));

/**
 * Session-based authentication middleware
 * Use this to protect your pages
 */
function requireSession(req, res, next) {
  if (!req.session.authenticated) {
    logger.warn('Unauthorized access attempt');
    return res.status(401).send(`
      <html>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1>🔒 Authentication Required</h1>
          <p>Please access this app through GoHighLevel.</p>
          <p style="margin-top: 20px; color: #666;">
            Open GHL → Click the app icon in the sidebar
          </p>
        </body>
      </html>
    `);
  }
  
  // Check if session is still valid (< 24 hours)
  const sessionAge = Date.now() - new Date(req.session.authenticatedAt).getTime();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  if (sessionAge > maxAge) {
    logger.warn('Session expired:', { age: sessionAge });
    req.session.destroy();
    return res.status(401).send(`
      <html>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1>⏰ Session Expired</h1>
          <p>Your session has expired. Please access the app again through GoHighLevel.</p>
        </body>
      </html>
    `);
  }
  
  next();
}

/**
 * Logout endpoint
 * GET /app/logout
 */
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.send(`
    <html>
      <body style="font-family: Arial; padding: 40px; text-align: center;">
        <h1>✅ Logged Out</h1>
        <p>You have been logged out successfully.</p>
      </body>
    </html>
  `);
});

module.exports = router;
module.exports.requireSession = requireSession;

