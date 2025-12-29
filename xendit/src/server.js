require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const connectDB = require('./config/database');
const logger = require('./utils/logger');

// Import routes
const oauthRoutes = require('./routes/oauth');
const paymentRoutes = require('./routes/payments');
const webhookRoutes = require('./routes/webhooks');
const configRoutes = require('./routes/config');

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (important for rate limiting behind reverse proxies)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Compression
app.use(compression());

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files (for configuration pages)
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '2.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'GHL Xendit Payment Gateway',
    version: '2.0.0',
    status: 'running',
    documentation: '/api/docs',
    endpoints: {
      oauth: '/oauth',
      payments: '/api/payments',
      webhooks: '/api/webhooks',
      config: '/api/config'
    }
  });
});

// Apply rate limiting to API routes
app.use('/api', apiLimiter);

// Mount routes
app.use('/oauth', oauthRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/config', configRoutes);

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Start listening
    const server = app.listen(PORT, () => {
      logger.info('='.repeat(50));
      logger.info('🚀 GHL Xendit Payment Gateway Server Started');
      logger.info('='.repeat(50));
      logger.info(`📡 Server running on port ${PORT}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🔗 Base URL: ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
      logger.info(`📊 MongoDB: Connected`);
      logger.info('='.repeat(50));
      logger.info('Available Endpoints:');
      logger.info(`  OAuth:    ${process.env.BASE_URL || `http://localhost:${PORT}`}/oauth`);
      logger.info(`  Payments: ${process.env.BASE_URL || `http://localhost:${PORT}`}/api/payments`);
      logger.info(`  Webhooks: ${process.env.BASE_URL || `http://localhost:${PORT}`}/api/webhooks`);
      logger.info(`  Config:   ${process.env.BASE_URL || `http://localhost:${PORT}`}/api/config`);
      logger.info('='.repeat(50));
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal) => {
      logger.info(`\n${signal} received, shutting down gracefully...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        // Close database connection
        const mongoose = require('mongoose');
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
        
        logger.info('Process terminated gracefully');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('UNHANDLED_REJECTION');
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;

