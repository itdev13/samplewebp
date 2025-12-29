require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const database = require('./config/database');
const logger = require('./utils/logger');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

// Import routes
const oauthRoutes = require('./routes/oauth');
const exportRoutes = require('./routes/exports');
const configRoutes = require('./routes/config');

/**
 * SMS & Conversations Export App Server
 */
class Server {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3002;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandlers();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Trust proxy - required for rate limiting behind reverse proxies
    // Set to 1 to trust the first proxy (nginx, cloudflare, etc.)
    this.app.set('trust proxy', 1);

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"]
        }
      }
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
      credentials: true
    }));

    // Body parsers
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Cookie parser
    this.app.use(cookieParser());

    // Static files
    this.app.use(express.static(path.join(__dirname, '../public')));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      next();
    });

    // Health check (no rate limiting)
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        status: 'healthy',
        app: process.env.APP_NAME || 'GHL Conversations Export',
        version: process.env.APP_VERSION || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: database.isConnected() ? 'connected' : 'disconnected'
      });
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // OAuth routes
    this.app.use('/oauth', oauthRoutes);

    // API routes with rate limiting
    this.app.use('/api/exports', apiLimiter, exportRoutes);
    this.app.use('/api/config', apiLimiter, configRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        app: 'GHL Conversations Export',
        version: '1.0.0',
        endpoints: {
          oauth: {
            authorize: '/oauth/authorize',
            callback: '/oauth/callback',
            status: '/oauth/status?locationId=xxx'
          },
          exports: {
            create: 'POST /api/exports/create',
            status: 'GET /api/exports/status/:jobId',
            download: 'GET /api/exports/download/:jobId/:filename',
            history: 'GET /api/exports/history?locationId=xxx',
            jobs: 'GET /api/exports/jobs?locationId=xxx',
            stats: 'GET /api/exports/stats?locationId=xxx'
          },
          config: {
            get: 'GET /api/config/:locationId',
            updateSettings: 'PUT /api/config/:locationId/settings',
            subscription: 'GET /api/config/:locationId/subscription',
            usage: 'GET /api/config/:locationId/usage',
            testConnection: 'POST /api/config/:locationId/test-connection'
          }
        }
      });
    });

    // Error page
    this.app.get('/error', (req, res) => {
      const message = req.query.message || 'An error occurred';
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error - GHL Conversations Export</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0;
              background: #f5f5f5;
            }
            .container { 
              text-align: center; 
              padding: 40px;
              background: white;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              max-width: 500px;
            }
            h1 { color: #e74c3c; }
            p { color: #666; margin: 20px 0; }
            a { 
              display: inline-block;
              margin-top: 20px;
              padding: 10px 20px;
              background: #3498db;
              color: white;
              text-decoration: none;
              border-radius: 5px;
            }
            a:hover { background: #2980b9; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⚠️ Error</h1>
            <p>${message}</p>
            <a href="/oauth/authorize">Try Again</a>
          </div>
        </body>
        </html>
      `);
    });
  }

  /**
   * Setup error handlers
   */
  setupErrorHandlers() {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  /**
   * Start the server
   */
  async start() {
    try {
      // Connect to database
      await database.connect();

      // Start Express server
      this.server = this.app.listen(this.port, () => {
        const appUrl = process.env.BASE_URL || process.env.APP_URL || `http://localhost:${this.port}`;
        
        logger.info('='.repeat(50));
        logger.info(`🚀 SMS & Conversations Export App Started`);
        logger.info('='.repeat(50));
        logger.info(`📡 Server running on port: ${this.port}`);
        logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`📊 Database: ${database.isConnected() ? '✅ Connected' : '❌ Disconnected'}`);
        logger.info(`🔐 OAuth: ${process.env.GHL_CLIENT_ID ? '✅ Configured' : '❌ Not configured'}`);
        logger.info(`🌐 Base URL: ${appUrl}`);
        logger.info('='.repeat(50));
        logger.info(`\n💡 App URL: ${appUrl}`);
        logger.info(`🔗 OAuth Authorize: ${appUrl}/oauth/authorize\n`);
      });

      // Graceful shutdown
      this.setupGracefulShutdown();
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Setup graceful shutdown
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`\n${signal} received. Starting graceful shutdown...`);

      // Stop accepting new connections
      this.server.close(async () => {
        logger.info('HTTP server closed');

        try {
          // Close database connection
          await database.disconnect();
          logger.info('Database connection closed');

          logger.info('✅ Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    // Listen for termination signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('UNHANDLED_REJECTION');
    });
  }
}

// Create and start server
const server = new Server();
server.start();

module.exports = server;
