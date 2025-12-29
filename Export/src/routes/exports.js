const express = require('express');
const router = express.Router();
const path = require('path');
const exportService = require('../services/exportService');
const ExportJob = require('../models/ExportJob');
const ExportHistory = require('../models/ExportHistory');
const logger = require('../utils/logger');
const { verifyLocation, verifySubscription, checkExportLimits } = require('../middleware/auth');
const { validateExportRequest, validatePagination } = require('../middleware/validator');
const { exportLimiter, downloadLimiter, apiLimiter } = require('../middleware/rateLimiter');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Export Routes
 * Handles conversation export operations
 */

/**
 * @route POST /api/exports/create
 * @desc Create a new export job
 */
router.post(
  '/create',
  exportLimiter,
  validateExportRequest,
  verifyLocation,
  verifySubscription,
  checkExportLimits,
  asyncHandler(async (req, res) => {
    const { locationId, exportType, filters } = req.body;
    const location = req.location;

    logger.info('Creating export job:', { locationId, exportType });

    // Create export job
    const job = await exportService.createExportJob({
      locationId,
      companyId: location.companyId,
      userId: req.body.userId || 'system',
      userEmail: req.body.userEmail,
      exportType,
      filters: filters || {}
    });

    res.json({
      success: true,
      message: 'Export job created successfully',
      jobId: job.jobId,
      status: job.status,
      statusUrl: `/api/exports/status/${job.jobId}`
    });
  })
);

/**
 * @route GET /api/exports/status/:jobId
 * @desc Get export job status
 */
router.get(
  '/status/:jobId',
  apiLimiter,
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    const status = await exportService.getExportStatus(jobId);

    res.json({
      success: true,
      ...status
    });
  })
);

/**
 * @route GET /api/exports/download/:jobId/:filename
 * @desc Download export file
 */
router.get(
  '/download/:jobId/:filename',
  downloadLimiter,
  asyncHandler(async (req, res) => {
    const { jobId, filename } = req.params;

    logger.info('Download requested:', { jobId, filename });

    const filepath = await exportService.getDownloadPath(jobId, filename);
    
    // Ensure absolute path for res.sendFile()
    const absolutePath = path.resolve(filepath);

    logger.info('Resolved file path:', { filepath, absolutePath });

    // Determine content type
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (ext === '.pdf') {
      contentType = 'application/pdf';
    } else if (ext === '.csv') {
      contentType = 'text/csv';
    } else if (ext === '.zip') {
      contentType = 'application/zip';
    }

    // Set headers for download
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send file with absolute path
    res.sendFile(absolutePath, (err) => {
      if (err) {
        logger.error('File download error:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Failed to download file'
          });
        }
      } else {
        logger.info('File downloaded successfully:', { jobId, filename });
      }
    });
  })
);

/**
 * @route GET /api/exports/history
 * @desc Get export history for a location
 */
router.get(
  '/history',
  apiLimiter,
  verifyLocation,
  validatePagination,
  asyncHandler(async (req, res) => {
    const { locationId } = req.query;
    const { page, limit, sortBy, sortOrder } = req.pagination;

    const skip = (page - 1) * limit;

    const query = { locationId, isArchived: false };

    // Apply filters if provided
    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.startDate && req.query.endDate) {
      query.initiatedAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    const total = await ExportHistory.countDocuments(query);
    
    const history = await ExportHistory.find(query)
      .sort({ [sortBy || 'createdAt']: sortOrder === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v');

    res.json({
      success: true,
      data: history,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  })
);

/**
 * @route GET /api/exports/jobs
 * @desc Get all export jobs for a location
 */
router.get(
  '/jobs',
  apiLimiter,
  verifyLocation,
  validatePagination,
  asyncHandler(async (req, res) => {
    const { locationId } = req.query;
    const { page, limit, sortBy, sortOrder } = req.pagination;

    const skip = (page - 1) * limit;

    const query = { locationId };

    // Filter by status if provided
    if (req.query.status) {
      query.status = req.query.status;
    }

    const total = await ExportJob.countDocuments(query);
    
    const jobs = await ExportJob.find(query)
      .sort({ [sortBy || 'createdAt']: sortOrder === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v');

    res.json({
      success: true,
      data: jobs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  })
);

/**
 * @route DELETE /api/exports/:jobId
 * @desc Cancel or delete an export job
 */
router.delete(
  '/:jobId',
  apiLimiter,
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    const job = await ExportJob.findOne({ jobId });

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Export job not found'
      });
    }

    // If job is pending or processing, cancel it
    if (job.status === 'pending' || job.status === 'processing') {
      job.status = 'cancelled';
      await job.save();
    }

    // Mark as deleted
    job.isDeleted = true;
    await job.save();

    logger.info('Export job deleted:', { jobId });

    res.json({
      success: true,
      message: 'Export job deleted successfully'
    });
  })
);

/**
 * @route GET /api/exports/stats
 * @desc Get export statistics for a location
 */
router.get(
  '/stats',
  apiLimiter,
  verifyLocation,
  asyncHandler(async (req, res) => {
    const { locationId } = req.query;
    const location = req.location;

    // Get date range (default: last 30 days)
    const startDate = req.query.startDate 
      ? new Date(req.query.startDate) 
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const endDate = req.query.endDate 
      ? new Date(req.query.endDate) 
      : new Date();

    // Get statistics from ExportHistory
    const stats = await ExportHistory.getLocationStats(locationId, startDate, endDate);

    // Get job status counts
    const statusCounts = await ExportJob.aggregate([
      { $match: { locationId } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const statusMap = {};
    statusCounts.forEach(item => {
      statusMap[item._id] = item.count;
    });

    res.json({
      success: true,
      stats: {
        ...stats,
        statusCounts: statusMap,
        subscriptionTier: location.subscriptionTier,
        limits: location.limits,
        locationStats: location.stats
      }
    });
  })
);

module.exports = router;
