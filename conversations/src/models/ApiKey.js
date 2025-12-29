const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * API Key Model - Manages customer API keys for accessing the gateway
 */
const apiKeySchema = new mongoose.Schema({
  // The API key itself (stored directly)
  apiKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Last 8 characters of key for display (e.g., "sk_...abc123")
  keyPreview: {
    type: String,
    required: true
  },

  // Associated GHL location
  locationId: {
    type: String,
    required: true,
    index: true
  },

  companyId: {
    type: String,
    required: true,
    index: true
  },

  // API Key metadata
  name: {
    type: String,
    required: true,
    default: 'API Key'
  },

  description: {
    type: String
  },

  // Tier (single standard tier for all users)
  tier: {
    type: String,
    default: 'standard'
  },

  // Usage limits (standard for all users)
  limits: {
    requestsPerMonth: {
      type: Number,
      default: 100000 // 100k requests/month
    },
    requestsPerMinute: {
      type: Number,
      default: 100 // 100 requests/minute
    }
  },

  // Usage tracking
  usage: {
    currentMonth: {
      type: Number,
      default: 0
    },
    lastResetDate: {
      type: Date,
      default: Date.now
    },
    totalRequests: {
      type: Number,
      default: 0
    },
    lastUsedAt: {
      type: Date
    }
  },

  // Permissions/Scopes
  scopes: [{
    type: String,
    enum: [
      'conversations:read',
      'conversations:write',
      'messages:read',
      'messages:write',
      'webhooks:manage'
    ]
  }],

  // IP whitelist (optional security)
  ipWhitelist: [{
    type: String
  }],

  // Status
  isActive: {
    type: Boolean,
    default: true
  },

  // User who created the key
  createdBy: {
    userId: String,
    userEmail: String
  },

  lastRotatedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes
apiKeySchema.index({ locationId: 1, isActive: 1 });
apiKeySchema.index({ companyId: 1, isActive: 1 });
apiKeySchema.index({ 'usage.lastResetDate': 1 });

/**
 * Generate a new API key
 * @returns {string} - The raw API key (only shown once)
 */
apiKeySchema.statics.generateKey = function() {
  // Format: sk_live_32_random_characters
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `sk_live_${randomBytes}`;
};


/**
 * Get preview of key (last 8 chars)
 * @param {string} key - Raw API key
 * @returns {string} - Preview like "sk_...abc123"
 */
apiKeySchema.statics.getKeyPreview = function(key) {
  const last8 = key.slice(-8);
  return `sk_...${last8}`;
};

/**
 * Verify an API key
 * @param {string} key - Raw API key to verify
 * @returns {Object|null} - API key document if valid
 */
apiKeySchema.statics.verifyKey = async function(key) {
  const apiKey = await this.findOne({
    apiKey: key,
    isActive: true
  });

  return apiKey;
};

/**
 * Check if key is within rate limits
 */
apiKeySchema.methods.checkRateLimit = function() {
  // Check monthly limit
  if (this.usage.currentMonth >= this.limits.requestsPerMonth) {
    return {
      allowed: false,
      reason: 'Monthly quota exceeded',
      limit: this.limits.requestsPerMonth,
      used: this.usage.currentMonth
    };
  }

  return {
    allowed: true,
    remaining: this.limits.requestsPerMonth - this.usage.currentMonth
  };
};

/**
 * Increment usage counter
 */
apiKeySchema.methods.incrementUsage = async function() {
  const now = new Date();
  const lastReset = this.usage.lastResetDate;
  
  // Check if we need to reset monthly counter (new month)
  const resetMonth = lastReset.getMonth();
  const currentMonth = now.getMonth();
  const resetYear = lastReset.getFullYear();
  const currentYear = now.getFullYear();

  if (resetYear !== currentYear || resetMonth !== currentMonth) {
    // New month - reset counter
    this.usage.currentMonth = 1;
    this.usage.lastResetDate = now;
  } else {
    // Same month - increment
    this.usage.currentMonth += 1;
  }

  this.usage.totalRequests += 1;
  this.usage.lastUsedAt = now;

  await this.save();
};

/**
 * Check if API key has specific scope
 */
apiKeySchema.methods.hasScope = function(scope) {
  return this.scopes.includes(scope);
};

/**
 * Update limits (if needed for future customization)
 */
apiKeySchema.methods.updateLimits = function(requestsPerMonth, requestsPerMinute) {
  if (requestsPerMonth) {
    this.limits.requestsPerMonth = requestsPerMonth;
  }
  if (requestsPerMinute) {
    this.limits.requestsPerMinute = requestsPerMinute;
  }
};

module.exports = mongoose.model('ApiKey', apiKeySchema);

