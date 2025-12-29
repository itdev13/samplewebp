const mongoose = require('mongoose');
const logger = require('../utils/logger');

class Database {
  async connect() {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      logger.info('✅ MongoDB Connected');
    } catch (error) {
      logger.error('❌ MongoDB Connection Error:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      await mongoose.connection.close();
      logger.info('MongoDB Disconnected');
    } catch (error) {
      logger.error('MongoDB Disconnect Error:', error);
    }
  }

  isConnected() {
    return mongoose.connection.readyState === 1;
  }
}

module.exports = new Database();

