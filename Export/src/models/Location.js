const mongoose = require('mongoose');

/**
 * Location Model - Stores GHL location information
 */
const locationSchema = new mongoose.Schema({
  // GHL Location ID
  locationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // GHL Company/Agency ID
  companyId: {
    type: String,
    required: true,
    index: true
  },

  // Location details
  name: {
    type: String,
    required: true
  },

  address: {
    type: String
  },

  city: {
    type: String
  },

  state: {
    type: String
  },

  country: {
    type: String
  },

  // Subscription tier
  subscriptionTier: {
    type: String,
    enum: ['starter', 'professional', 'enterprise', 'trial'],
    default: 'trial'
  },

  subscriptionStatus: {
    type: String,
    enum: ['active', 'inactive', 'cancelled', 'past_due'],
    default: 'active'
  },

  subscriptionStartDate: {
    type: Date
  },

  subscriptionEndDate: {
    type: Date
  },

  // Usage limits based on tier
  limits: {
    maxLocations: {
      type: Number,
      default: 5
    },
    maxMessagesPerExport: {
      type: Number,
      default: 10000
    },
    exportRetentionDays: {
      type: Number,
      default: 30
    }
  },

  // Usage statistics
  stats: {
    totalExports: {
      type: Number,
      default: 0
    },
    totalMessagesExported: {
      type: Number,
      default: 0
    },
    lastExportDate: {
      type: Date
    }
  },

  // Settings
  settings: {
    autoBackupEnabled: {
      type: Boolean,
      default: false
    },
    backupFrequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'weekly'
    },
    defaultExportFormat: {
      type: String,
      enum: ['pdf', 'csv', 'both'],
      default: 'pdf'
    },
    cloudStorageProvider: {
      type: String,
      enum: ['none', 'googledrive', 'dropbox', 's3'],
      default: 'none'
    },
    cloudStorageConfig: {
      type: mongoose.Schema.Types.Mixed
    },
    whitelabelEnabled: {
      type: Boolean,
      default: false
    },
    customBranding: {
      logoUrl: String,
      companyName: String,
      primaryColor: String
    }
  },

  // App installation status
  isActive: {
    type: Boolean,
    default: true
  },

  installedAt: {
    type: Date,
    default: Date.now
  },

  uninstalledAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for better query performance
locationSchema.index({ companyId: 1, isActive: 1 });
locationSchema.index({ subscriptionStatus: 1 });
locationSchema.index({ 'subscriptionEndDate': 1 });

// Virtual for checking if subscription is active
locationSchema.virtual('isSubscriptionActive').get(function() {
  if (this.subscriptionStatus !== 'active') return false;
  if (this.subscriptionEndDate && this.subscriptionEndDate < new Date()) return false;
  return true;
});

// Method to check if export is allowed
locationSchema.methods.canExport = function() {
  return this.isActive && this.isSubscriptionActive;
};

// Method to update usage stats
locationSchema.methods.updateExportStats = async function(messageCount) {
  this.stats.totalExports += 1;
  this.stats.totalMessagesExported += messageCount;
  this.stats.lastExportDate = new Date();
  await this.save();
};

module.exports = mongoose.model('Location', locationSchema);
