const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
  // Event Identification
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  source: {
    type: String,
    required: true,
    enum: ['xendit', 'ghl'],
    index: true
  },
  eventType: {
    type: String,
    required: true,
    index: true
  },
  
  // Related Entities
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    index: true
  },
  xenditId: {
    type: String,
    index: true
  },
  externalId: {
    type: String,
    index: true
  },
  
  // Event Data
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  headers: {
    type: Map,
    of: String
  },
  
  // Processing Status
  processed: {
    type: Boolean,
    default: false,
    index: true
  },
  processedAt: {
    type: Date,
    index: true
  },
  
  // Error Handling
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 3
  },
  errorMessage: {
    type: String
  },
  errorStack: {
    type: String
  },
  
  // Verification
  verified: {
    type: Boolean,
    default: false
  },
  signature: {
    type: String
  },
  
  // Metadata
  processingTime: {
    type: Number // milliseconds
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Compound indexes
webhookEventSchema.index({ source: 1, eventType: 1, createdAt: -1 });
webhookEventSchema.index({ processed: 1, retryCount: 1, createdAt: 1 });
webhookEventSchema.index({ paymentId: 1, eventType: 1 });
webhookEventSchema.index({ externalId: 1, source: 1 });

// TTL index - remove processed events after 30 days
webhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 2592000 });

// Method to check if event can be retried
webhookEventSchema.methods.canRetry = function() {
  return !this.processed && this.retryCount < this.maxRetries;
};

// Method to mark as processed
webhookEventSchema.methods.markProcessed = async function(processingTime) {
  this.processed = true;
  this.processedAt = new Date();
  if (processingTime) {
    this.processingTime = processingTime;
  }
  return this.save();
};

// Method to record error
webhookEventSchema.methods.recordError = async function(error) {
  this.retryCount += 1;
  this.errorMessage = error.message;
  this.errorStack = error.stack;
  return this.save();
};

// Static method to find pending events for retry
webhookEventSchema.statics.findPendingRetries = async function(limit = 10) {
  return this.find({
    processed: false,
    retryCount: { $lt: 3 }
  })
  .sort({ createdAt: 1 })
  .limit(limit);
};

// Static method to get event statistics
webhookEventSchema.statics.getStatistics = async function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          source: '$source',
          eventType: '$eventType',
          processed: '$processed'
        },
        count: { $sum: 1 },
        avgProcessingTime: { $avg: '$processingTime' }
      }
    }
  ]);
};

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);

