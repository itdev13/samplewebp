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
  // Location details from GHL
  name: {
    type: String,
    default: ''
  },
  companyName: {
    type: String,
    default: ''
  },
  email: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  address: {
    type: String,
    default: ''
  },
  website: {
    type: String,
    default: ''
  },
  accessCode: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  uninstalledAt: {
    type: Date,
    default: null
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

module.exports = mongoose.model('Location', locationSchema);

