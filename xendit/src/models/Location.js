const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  locationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  companyId: {
    type: String,
    required: true,
    index: true
  },
  xenditApiKey: {
    type: String,
    required: false, // Will be added after OAuth in config step
    default: ''
  },
  xenditWebhookToken: {
    type: String
  },
  enabledPaymentMethods: [{
    type: String,
    enum: ['invoice', 'virtual_account', 'ewallet', 'credit_card', 'qris', 'retail_outlet']
  }],
  defaultCurrency: {
    type: String,
    default: 'IDR',
    enum: ['IDR', 'PHP', 'USD', 'SGD', 'MYR', 'THB']
  },
  settings: {
    invoiceDuration: { type: Number, default: 86400 },
    autoCapture: { type: Boolean, default: true },
    sendEmailNotification: { type: Boolean, default: true },
    sendSmsNotification: { type: Boolean, default: false },
    successRedirectUrl: String,
    failureRedirectUrl: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes
locationSchema.index({ companyId: 1, locationId: 1 });
locationSchema.index({ isActive: 1 });

// Virtual for display name
locationSchema.virtual('displayName').get(function() {
  return `Location ${this.locationId}`;
});

// Method to check if payment method is enabled
locationSchema.methods.isPaymentMethodEnabled = function(method) {
  return this.enabledPaymentMethods.includes(method);
};

module.exports = mongoose.model('Location', locationSchema);

