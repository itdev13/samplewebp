const mongoose = require('mongoose');

/**
 * OAuth Token Model - Stores GHL OAuth tokens
 */
const oauthTokenSchema = new mongoose.Schema({
  // GHL Location ID (null for Agency-level tokens)
  locationId: {
    type: String,
    required: false, // Not required for Agency-level tokens
    sparse: true, // Allows multiple null values
    index: true
  },

  // GHL Company ID
  companyId: {
    type: String,
    required: true,
    index: true
  },

  // User Type: "Location" or "Company" (Agency)
  userType: {
    type: String,
    enum: ['Location', 'Company'],
    required: true
  },

  // OAuth tokens (stored as plain text)
  accessToken: {
    type: String,
    required: true
  },

  refreshToken: {
    type: String,
    required: true
  },

  // Token metadata
  tokenType: {
    type: String,
    default: 'Bearer'
  },

  expiresAt: {
    type: Date,
    required: true
  },

  // OAuth scopes
  scopes: [{
    type: String
  }],

  // User info
  userId: {
    type: String
  },

  userEmail: {
    type: String
  },

  // Token status
  isActive: {
    type: Boolean,
    default: true
  },

  lastRefreshedAt: {
    type: Date
  },

  // Metadata
  grantedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
oauthTokenSchema.index({ expiresAt: 1 });
oauthTokenSchema.index({ isActive: 1 });
oauthTokenSchema.index({ companyId: 1, locationId: 1 });
oauthTokenSchema.index({ companyId: 1, userType: 1 });

// Method to get access token (returns plain text)
oauthTokenSchema.methods.getAccessToken = function() {
  return this.accessToken;
};

// Method to get refresh token (returns plain text)
oauthTokenSchema.methods.getRefreshToken = function() {
  return this.refreshToken;
};

// Method to check if token is expired
oauthTokenSchema.methods.isExpired = function() {
  return new Date() >= this.expiresAt;
};

// Method to check if token needs refresh (expires in < 5 minutes)
oauthTokenSchema.methods.needsRefresh = function() {
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  return fiveMinutesFromNow >= this.expiresAt;
};

// Static method to find valid token by locationId
oauthTokenSchema.statics.findValidToken = async function(locationId) {
  const token = await this.findOne({
    locationId,
    isActive: true,
    expiresAt: { $gt: new Date() }
  });
  return token;
};

// Static method to find Agency-level token by companyId
oauthTokenSchema.statics.findCompanyToken = async function(companyId) {
  const token = await this.findOne({
    companyId,
    userType: 'Company',
    isActive: true,
    expiresAt: { $gt: new Date() }
  });
  return token;
};

// Static method to find any valid token (Location or Company)
oauthTokenSchema.statics.findAnyValidToken = async function(identifier) {
  // Try locationId first
  let token = await this.findOne({
    locationId: identifier,
    isActive: true,
    expiresAt: { $gt: new Date() }
  });
  
  // If not found, try companyId
  if (!token) {
    token = await this.findOne({
      companyId: identifier,
      isActive: true,
      expiresAt: { $gt: new Date() }
    });
  }
  
  return token;
};

module.exports = mongoose.model('OAuthToken', oauthTokenSchema);
