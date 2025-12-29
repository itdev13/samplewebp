require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const path = require('path');
const logger = require('./utils/logger');

/**
 * Conversations API Gateway Server
 * Provides OAuth-authenticated access to GHL Conversations API
 */
class Server {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3001;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Trust proxy for rate limiting
    this.app.set('trust proxy', 1);

    // Security
    this.app.use(helmet({
      contentSecurityPolicy: false // Allow inline scripts for HTML pages
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(cookieParser());

    // Session management (for GHL SSO authentication)
    const session = require('express-session');
    const MongoStore = require('connect-mongo');
    
    this.app.use(session({
      secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'fallback-secret-change-in-production',
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        touchAfter: 24 * 3600 // Lazy session update (24 hours)
      }),
      cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        sameSite: 'lax'
      }
    }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      next();
    });

    // Serve static files
    this.app.use(express.static(path.join(__dirname, '../public')));
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'conversations-api-gateway'
      });
    });

    // OAuth routes (for app installation)
    const oauthRoutes = require('./routes/oauth');
    this.app.use('/oauth', oauthRoutes);

    // App routes (GHL sidebar app entry point)
    const appRoutes = require('./routes/app');
    this.app.use('/app', appRoutes);

    // Configuration routes (manage settings)
    const configRoutes = require('./routes/config');
    this.app.use('/api/config', configRoutes);

    // API Key management routes (for customers)
    const apiKeyRoutes = require('./routes/apiKeys');
    this.app.use('/api/keys', apiKeyRoutes);

    // Public API Gateway routes (the main product!)
    const apiRoutes = require('./routes/api');
    this.app.use('/api/v1', apiRoutes);

    // Serve index page
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.path}`
      });
    });
  }

  setupErrorHandling() {
    const { errorHandler } = require('./middleware/errorHandler');
    this.app.use(errorHandler);
  }

  async connectDatabase() {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      logger.info('✅ Connected to MongoDB');
      logger.info(`📊 Database: ${mongoose.connection.name}`);
    } catch (error) {
      logger.error('❌ MongoDB connection error:', error);
      process.exit(1);
    }
  }

  async start() {
    try {
      // Connect to database
      await this.connectDatabase();

      // Start server
      this.server = this.app.listen(this.port, () => {
        logger.info('🚀 Conversations API Gateway started');
        logger.info(`📍 Port: ${this.port}`);
        logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`🔗 Base URL: ${process.env.BASE_URL || `http://localhost:${this.port}`}`);
        logger.info(`📡 API Endpoint: /api/v1`);
        logger.info(`🔑 API Key Management: /api/keys`);
        logger.info(`👤 OAuth: /oauth/authorize`);
        console.log('');
        console.log('✅ Server is ready!');
        console.log('');
        console.log('📖 API Documentation: http://localhost:' + this.port + '/docs');
        console.log('🔐 Developer Portal: http://localhost:' + this.port + '/dashboard.html');
        console.log('');
      });

      // Graceful shutdown
      process.on('SIGTERM', () => this.shutdown('SIGTERM'));
      process.on('SIGINT', () => this.shutdown('SIGINT'));

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async shutdown(signal) {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    if (this.server) {
      this.server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await mongoose.connection.close();
          logger.info('MongoDB connection closed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    }
  }
}

// Start server
const server = new Server();
server.start();

module.exports = Server;

