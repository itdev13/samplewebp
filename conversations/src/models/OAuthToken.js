const mongoose = require('mongoose');

const oauthTokenSchema = new mongoose.Schema({
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
  accessToken: {
    type: String,
    required: true
  },
  refreshToken: {
    type: String
  },
  tokenType: {
    type: String,
    default: 'Bearer'
  },
  expiresAt: {
    type: Date,
    required: true
  },
  scopes: [{
    type: String
  }],
  userType: {
    type: String,
    enum: ['Company', 'Location'],
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index for efficient lookups
oauthTokenSchema.index({ locationId: 1, isActive: 1 });
oauthTokenSchema.index({ companyId: 1, isActive: 1 });
oauthTokenSchema.index({ expiresAt: 1 });

// Method to check if token is expired
oauthTokenSchema.methods.isExpired = function() {
  return new Date() >= this.expiresAt;
};

// Method to check if token needs refresh (expires within 5 minutes)
oauthTokenSchema.methods.needsRefresh = function() {
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
  return this.expiresAt <= fiveMinutesFromNow;
};

// Static method to find active token
oauthTokenSchema.statics.findActiveToken = async function(locationId) {
  return this.findOne({
    locationId,
    isActive: true,
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('OAuthToken', oauthTokenSchema);

