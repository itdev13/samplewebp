const mongoose = require('mongoose');

/**
 * Export Job Model - Tracks conversation export jobs
 */
const exportJobSchema = new mongoose.Schema({
  // Job identification
  jobId: {
    type: String,
    required: true,
    unique: true,
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

  // User who initiated the export
  userId: {
    type: String,
    required: true
  },

  userEmail: {
    type: String
  },

  // Export parameters
  exportType: {
    type: String,
    enum: ['pdf', 'csv', 'both'],
    required: true
  },

  // Filters applied
  filters: {
    startDate: {
      type: Date
    },
    endDate: {
      type: Date
    },
    contactId: {
      type: String
    },
    contactName: {
      type: String
    },
    conversationId: {
      type: String
    },
    messageTypes: [{
      type: String,
      enum: ['SMS', 'Email', 'Call', 'WhatsApp', 'Facebook', 'Instagram', 'GMB']
    }],
    searchKeywords: {
      type: String
    }
  },

  // Job status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },

  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },

  // Results
  results: {
    totalConversations: {
      type: Number,
      default: 0
    },
    totalMessages: {
      type: Number,
      default: 0
    },
    exportedMessages: {
      type: Number,
      default: 0
    },
    fileSize: {
      type: Number, // in bytes
      default: 0
    },
    files: [{
      type: {
        type: String,
        enum: ['pdf', 'csv', 'zip']
      },
      filename: String,
      filepath: String,
      downloadUrl: String,
      size: Number
    }]
  },

  // Error details
  error: {
    message: String,
    code: String,
    timestamp: Date
  },

  // Processing metadata
  startedAt: {
    type: Date
  },

  completedAt: {
    type: Date
  },

  // Scheduled export
  isScheduled: {
    type: Boolean,
    default: false
  },

  scheduleFrequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly']
  },

  nextScheduledRun: {
    type: Date
  },

  // File retention
  expiresAt: {
    type: Date
  },

  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for performance
exportJobSchema.index({ locationId: 1, status: 1 });
exportJobSchema.index({ userId: 1, createdAt: -1 });
exportJobSchema.index({ expiresAt: 1 });
exportJobSchema.index({ isScheduled: 1, nextScheduledRun: 1 });
exportJobSchema.index({ status: 1, createdAt: -1 });

// Virtual for calculating processing time
exportJobSchema.virtual('processingTime').get(function() {
  if (this.startedAt && this.completedAt) {
    return this.completedAt - this.startedAt;
  }
  return null;
});

// Method to update progress (atomic update to prevent parallel save errors)
exportJobSchema.methods.updateProgress = async function(progress, status) {
  const update = { progress };
  if (status) update.status = status;
  
  // Use findByIdAndUpdate for atomic operation
  const updated = await this.constructor.findByIdAndUpdate(
    this._id,
    { $set: update },
    { new: true }
  );
  
  // Update current instance with new values
  if (updated) {
    this.progress = updated.progress;
    if (status) this.status = updated.status;
  }
};

// Method to mark as completed (atomic update)
exportJobSchema.methods.markCompleted = async function(results) {
  const expirationDays = 30; // TODO: Get from location settings
  const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);
  
  const updated = await this.constructor.findByIdAndUpdate(
    this._id,
    {
      $set: {
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
        results: { ...this.results, ...results },
        expiresAt
      }
    },
    { new: true }
  );
  
  // Update current instance
  if (updated) {
    this.status = updated.status;
    this.progress = updated.progress;
    this.completedAt = updated.completedAt;
    this.results = updated.results;
    this.expiresAt = updated.expiresAt;
  }
};

// Method to mark as failed (atomic update)
exportJobSchema.methods.markFailed = async function(error) {
  const updated = await this.constructor.findByIdAndUpdate(
    this._id,
    {
      $set: {
        status: 'failed',
        completedAt: new Date(),
        error: {
          message: error.message,
          code: error.code || 'EXPORT_ERROR',
          timestamp: new Date()
        }
      }
    },
    { new: true }
  );
  
  // Update current instance
  if (updated) {
    this.status = updated.status;
    this.completedAt = updated.completedAt;
    this.error = updated.error;
  }
};

// Static method to cleanup expired jobs
exportJobSchema.statics.cleanupExpired = async function() {
  const expiredJobs = await this.find({
    expiresAt: { $lt: new Date() },
    isDeleted: false
  });

  // Mark as deleted (actual file cleanup would happen separately)
  await this.updateMany(
    { expiresAt: { $lt: new Date() }, isDeleted: false },
    { $set: { isDeleted: true } }
  );

  return expiredJobs;
};

module.exports = mongoose.model('ExportJob', exportJobSchema);
