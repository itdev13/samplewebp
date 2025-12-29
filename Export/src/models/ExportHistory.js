const mongoose = require('mongoose');

/**
 * Export History Model - Audit log for all exports
 */
const exportHistorySchema = new mongoose.Schema({
  // Reference to export job
  jobId: {
    type: String,
    required: true,
    index: true
  },

  // Location info
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

  // User info
  userId: {
    type: String,
    required: true
  },

  userEmail: {
    type: String
  },

  userName: {
    type: String
  },

  // Export details
  exportType: {
    type: String,
    enum: ['pdf', 'csv', 'both'],
    required: true
  },

  // What was exported
  exportSummary: {
    totalConversations: {
      type: Number,
      default: 0
    },
    totalMessages: {
      type: Number,
      default: 0
    },
    dateRange: {
      start: Date,
      end: Date
    },
    messageTypes: [String],
    contactsIncluded: [{
      contactId: String,
      contactName: String,
      messageCount: Number
    }]
  },

  // Files generated
  files: [{
    type: {
      type: String,
      enum: ['pdf', 'csv', 'zip']
    },
    filename: String,
    fileSize: Number,
    downloadUrl: String,
    downloadCount: {
      type: Number,
      default: 0
    },
    lastDownloadedAt: Date
  }],

  // Status
  status: {
    type: String,
    enum: ['success', 'failed', 'partial'],
    required: true
  },

  // Timing
  initiatedAt: {
    type: Date,
    required: true
  },

  completedAt: {
    type: Date
  },

  processingDuration: {
    type: Number // in milliseconds
  },

  // Compliance and audit
  exportReason: {
    type: String,
    enum: ['manual', 'scheduled', 'compliance', 'backup', 'legal_request', 'other'],
    default: 'manual'
  },

  notes: {
    type: String
  },

  // IP address and user agent for audit
  ipAddress: {
    type: String
  },

  userAgent: {
    type: String
  },

  // Retention
  retainUntil: {
    type: Date
  },

  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for audit queries
exportHistorySchema.index({ locationId: 1, createdAt: -1 });
exportHistorySchema.index({ userId: 1, createdAt: -1 });
exportHistorySchema.index({ companyId: 1, status: 1 });
exportHistorySchema.index({ initiatedAt: -1 });
exportHistorySchema.index({ retainUntil: 1 });

// Static method to get export statistics
exportHistorySchema.statics.getLocationStats = async function(locationId, startDate, endDate) {
  const stats = await this.aggregate([
    {
      $match: {
        locationId,
        initiatedAt: {
          $gte: startDate,
          $lte: endDate
        },
        status: 'success'
      }
    },
    {
      $group: {
        _id: null,
        totalExports: { $sum: 1 },
        totalMessages: { $sum: '$exportSummary.totalMessages' },
        totalConversations: { $sum: '$exportSummary.totalConversations' },
        avgProcessingTime: { $avg: '$processingDuration' }
      }
    }
  ]);

  return stats[0] || {
    totalExports: 0,
    totalMessages: 0,
    totalConversations: 0,
    avgProcessingTime: 0
  };
};

// Static method to get user activity
exportHistorySchema.statics.getUserActivity = async function(userId, limit = 10) {
  return await this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('exportType exportSummary status initiatedAt completedAt files');
};

// Method to record file download
exportHistorySchema.methods.recordDownload = async function(fileIndex) {
  if (this.files[fileIndex]) {
    this.files[fileIndex].downloadCount += 1;
    this.files[fileIndex].lastDownloadedAt = new Date();
    await this.save();
  }
};

module.exports = mongoose.model('ExportHistory', exportHistorySchema);
