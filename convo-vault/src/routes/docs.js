const express = require('express');
const router = express.Router();
const path = require('path');
const { authenticateSession } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * Protected API Documentation Route
 * Serves API docs only to authenticated users
 */

/**
 * @route GET /api/docs
 * @desc Serve API documentation (requires authentication)
 * @access Protected
 */
router.get('/', (req, res) => {
  try {
    // Check for token in query param (for navigation from frontend)
    const token = req.query.token;
    const authHeader = req.headers.authorization;
    
    if (!token && !authHeader) {
      return res.status(401).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Unauthorized - ConvoVault</title>
          <style>
            body { font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
            .container { text-align: center; background: white; padding: 40px; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
            h1 { color: #f56565; }
            p { color: #4a5568; margin: 20px 0; }
            a { color: #667eea; text-decoration: none; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔒 Unauthorized Access</h1>
            <p>API documentation is only accessible from within the ConvoVault app.</p>
            <a href="https://convo.vaultsuite.store">← Back to App</a>
          </div>
        </body>
        </html>
      `);
    }
    
    logger.info('📚 API docs accessed');
    
    // Serve the HTML file from protected views folder
    res.sendFile(path.join(__dirname, '../views/api-docs.html'));
  } catch (error) {
    logger.error('Error serving API docs:', error);
    res.status(500).send('Error loading API documentation');
  }
});

module.exports = router;

