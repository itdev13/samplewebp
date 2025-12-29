const express = require('express');
const router = express.Router();
const { Location } = require('../models');
const { verifyLocationAccess } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validate, locationSettingsSchema } = require('../middleware/validator');
const logger = require('../utils/logger');

/**
 * Get location details
 * GET /locations/:locationId
 */
router.get('/:locationId',
  verifyLocationAccess,
  asyncHandler(async (req, res) => {
    const { locationId, location } = req;

    res.json({
      success: true,
      data: {
        locationId: location.locationId,
        name: location.name,
        email: location.email,
        phone: location.phone,
        timezone: location.timezone,
        isActive: location.isActive,
        settings: location.settings,
        exportConfig: location.exportConfig,
        lastExportAt: location.lastExportAt,
        installationDate: location.installationDate
      }
    });
  })
);

/**
 * Update location settings
 * PUT /locations/:locationId/settings
 */
router.put('/:locationId/settings',
  verifyLocationAccess,
  validate(locationSettingsSchema),
  asyncHandler(async (req, res) => {
    const { locationId, location } = req;
    const settings = req.body;

    // Update export configuration
    await location.update({
      exportConfig: {
        ...location.exportConfig,
        ...settings
      }
    });

    logger.info(`Location settings updated: ${locationId}`);

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: {
        exportConfig: location.exportConfig
      }
    });
  })
);

/**
 * Get location stats
 * GET /locations/:locationId/stats
 */
router.get('/:locationId/stats',
  verifyLocationAccess,
  asyncHandler(async (req, res) => {
    const { locationId } = req;

    // Import models here to avoid circular dependency
    const { ExportJob, ExportHistory } = require('../models');

    // Get export statistics
    const totalExports = await ExportHistory.count({
      where: { locationId, isDeleted: false }
    });

    const activeJobs = await ExportJob.count({
      where: {
        locationId,
        status: ['queued', 'processing']
      }
    });

    const completedJobs = await ExportJob.count({
      where: {
        locationId,
        status: 'completed'
      }
    });

    const failedJobs = await ExportJob.count({
      where: {
        locationId,
        status: 'failed'
      }
    });

    // Get recent export
    const recentExport = await ExportHistory.findOne({
      where: { locationId, isDeleted: false },
      order: [['createdAt', 'DESC']]
    });

    // Calculate total storage used
    const exports = await ExportHistory.findAll({
      where: { locationId, isDeleted: false },
      attributes: ['fileSize']
    });

    const totalStorageUsed = exports.reduce((sum, exp) => sum + (exp.fileSize || 0), 0);

    res.json({
      success: true,
      data: {
        totalExports,
        activeJobs,
        completedJobs,
        failedJobs,
        totalStorageUsed,
        lastExportAt: recentExport?.createdAt || null
      }
    });
  })
);

module.exports = router;

