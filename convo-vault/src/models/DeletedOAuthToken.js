const mongoose = require('mongoose');

/**
 * Deleted OAuth Token Schema
 * Archives OAuth tokens when app is uninstalled for audit trail
 */
const deletedOAuthTokenSchema = new mongoose.Schema({
  // Original token data
  companyId: {
    type: String,
    required: true,
    index: true
  },
  
  locationId: {
    type: String,
    index: true
  },
  
  accessToken: {
    type: String,
    required: true
  },
  
  refreshToken: {
    type: String,
    required: true
  },
  
  // Original token metadata
  originalCreatedAt: {
    type: Date,
    required: true
  },
  
  originalExpiresAt: {
    type: Date
  },
  
  // Deletion/Uninstall info
  deletedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  deletionReason: {
    type: String,
    enum: ['app_uninstall', 'manual_revoke', 'security_incident', 'token_expired'],
    default: 'app_uninstall'
  },
  
  // Link to installation record
  installationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Installation'
  },
  
  // Uninstall webhook data
  uninstallWebhookData: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Auto-delete after 90 days for compliance
  autoDeleteAt: {
    type: Date,
    default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
    // Note: Index created separately below with TTL
  }
  
}, {
  timestamps: true
});

// TTL index - auto-delete documents after 90 days
deletedOAuthTokenSchema.index({ autoDeleteAt: 1 }, { expireAfterSeconds: 0 });

// Index for querying
deletedOAuthTokenSchema.index({ companyId: 1, locationId: 1, deletedAt: -1 });

module.exports = mongoose.model('DeletedOAuthToken', deletedOAuthTokenSchema);

