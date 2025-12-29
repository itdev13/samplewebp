const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // GHL Identifiers
  locationId: {
    type: String,
    required: true,
    index: true
  },
  opportunityId: {
    type: String,
    index: true
  },
  contactId: {
    type: String,
    index: true
  },
  
  // Xendit Identifiers
  xenditId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  externalId: {
    type: String,
    required: true,
    index: true
  },
  
  // Payment Details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: 'IDR',
    enum: ['IDR', 'PHP', 'USD', 'SGD', 'MYR', 'THB']
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['invoice', 'virtual_account', 'ewallet', 'credit_card', 'qris', 'retail_outlet']
  },
  
  // Status Tracking
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'paid', 'settled', 'failed', 'expired', 'cancelled', 'refunded'],
    default: 'pending',
    index: true
  },
  xenditStatus: {
    type: String
  },
  
  // Payment Information
  paymentUrl: {
    type: String
  },
  description: {
    type: String,
    maxlength: 500
  },
  
  // Customer Information
  customerName: String,
  customerEmail: String,
  customerPhone: String,
  
  // Payment Channel Specific
  channelCode: String, // For ewallet, retail outlet
  bankCode: String,    // For virtual account
  accountNumber: String, // VA number
  qrCodeUrl: String,   // For QRIS
  
  // Timestamps
  paidAt: {
    type: Date,
    index: true
  },
  expiresAt: {
    type: Date,
    index: true
  },
  settledAt: Date,
  
  // Fee Information
  adminFee: Number,
  totalFee: Number,
  netAmount: Number,
  
  // Additional Data
  items: [{
    name: String,
    quantity: Number,
    price: Number,
    category: String
  }],
  
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  
  // Error Tracking
  errorCode: String,
  errorMessage: String,
  
  // Sync Status with GHL
  syncedToGHL: {
    type: Boolean,
    default: false
  },
  syncAttempts: {
    type: Number,
    default: 0
  },
  lastSyncAt: Date,
  lastSyncError: String
}, {
  timestamps: true
});

// Compound indexes for efficient queries
paymentSchema.index({ locationId: 1, status: 1 });
paymentSchema.index({ locationId: 1, createdAt: -1 });
paymentSchema.index({ opportunityId: 1, status: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ syncedToGHL: 1, status: 1 });
paymentSchema.index({ expiresAt: 1, status: 1 });

// Virtual for total amount including fees
paymentSchema.virtual('totalAmount').get(function() {
  return this.amount + (this.totalFee || 0);
});

// Virtual for payment age in hours
paymentSchema.virtual('ageInHours').get(function() {
  return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60));
});

// Method to check if payment is expired
paymentSchema.methods.isExpired = function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt && this.status === 'pending';
};

// Method to check if payment can be refunded
paymentSchema.methods.canRefund = function() {
  return ['paid', 'settled'].includes(this.status);
};

// Static method to get payment statistics
paymentSchema.statics.getStatistics = async function(locationId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        locationId,
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        avgAmount: { $avg: '$amount' }
      }
    }
  ]);
};

// Pre-save middleware to update timestamps
paymentSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status === 'paid' && !this.paidAt) {
      this.paidAt = new Date();
    } else if (this.status === 'settled' && !this.settledAt) {
      this.settledAt = new Date();
    }
  }
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);

