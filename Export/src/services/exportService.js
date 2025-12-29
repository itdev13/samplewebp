const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const moment = require('moment');
const logger = require('../utils/logger');
const ghlService = require('./ghlService');
const ExportJob = require('../models/ExportJob');
const ExportHistory = require('../models/ExportHistory');
const {
  generateJobId,
  formatFileSize,
  formatDate,
  formatPhoneNumber,
  generateExportFilename
} = require('../utils/helpers');

/**
 * Export Service
 * Handles conversation exports to PDF and CSV
 */
class ExportService {
  constructor() {
    this.exportDir = process.env.EXPORT_STORAGE_PATH || path.join(process.cwd(), 'exports');
    this.ensureExportDirectory();
  }

  /**
   * Ensure export directory exists
   */
  ensureExportDirectory() {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
      logger.info(`Created export directory: ${this.exportDir}`);
    }
  }

  /**
   * Create a new export job
   * @param {Object} params - Export parameters
   * @returns {Object} - Export job
   */
  async createExportJob(params) {
    const {
      locationId,
      companyId,
      userId,
      userEmail,
      exportType,
      filters
    } = params;

    const jobId = generateJobId();

    const exportJob = new ExportJob({
      jobId,
      locationId,
      companyId,
      userId,
      userEmail,
      exportType,
      filters,
      status: 'pending'
    });

    await exportJob.save();
    
    logger.info(`Created export job: ${jobId}`, { locationId, exportType });

    // Start processing in background
    this.processExport(jobId).catch(error => {
      logger.error(`Export job ${jobId} failed:`, error);
    });

    return exportJob;
  }

  /**
   * Process export job
   * @param {string} jobId - Job ID
   */
  async processExport(jobId) {
    const job = await ExportJob.findOne({ jobId });
    
    if (!job) {
      throw new Error(`Export job not found: ${jobId}`);
    }

    try {
      // Update status to processing
      job.status = 'processing';
      job.startedAt = new Date();
      await job.save();

      logger.info(`Processing export job: ${jobId}`);

      // Fetch messages from GHL
      const messages = await this.fetchMessages(job);

      // Update progress
      await job.updateProgress(50, 'processing');

      // Generate export files
      const files = await this.generateExportFiles(job, messages);

      // Mark job as completed
      await job.markCompleted({
        totalMessages: messages.length,
        files
      });

      // Create history entry
      await this.createHistoryEntry(job, messages, files);

      logger.logExport({
        jobId,
        locationId: job.locationId,
        status: 'completed',
        messageCount: messages.length,
        fileCount: files.length
      });

    } catch (error) {
      logger.error(`Export job ${jobId} failed:`, error);
      await job.markFailed(error);
      throw error;
    }
  }

  /**
   * Fetch messages based on job filters
   * @param {Object} job - Export job
   * @returns {Array} - Messages
   */
  async fetchMessages(job) {
    const { locationId, filters } = job;

    logger.info(`Fetching messages for job: ${job.jobId}`, { locationId, filters });

    const exportFilters = {};

    if (filters.startDate) {
      exportFilters.startDate = filters.startDate;
    }

    if (filters.endDate) {
      exportFilters.endDate = filters.endDate;
    }

    if (filters.contactId) {
      exportFilters.contactId = filters.contactId;
    }

    // Fetch all messages with pagination
    const messages = await ghlService.exportAllMessages(
      locationId,
      exportFilters,
      (fetched, total) => {
        const progress = Math.min(Math.floor((fetched / total) * 40), 40);
        job.updateProgress(progress, 'processing').catch(err => {
          logger.error('Failed to update progress:', err);
        });
      }
    );

    // Apply additional filters
    let filteredMessages = messages;

    if (filters.messageTypes && filters.messageTypes.length > 0) {
      filteredMessages = filteredMessages.filter(msg => 
        filters.messageTypes.includes(msg.type)
      );
    }

    if (filters.searchKeywords) {
      const keywords = filters.searchKeywords.toLowerCase();
      filteredMessages = filteredMessages.filter(msg => 
        msg.body && msg.body.toLowerCase().includes(keywords)
      );
    }

    logger.info(`Fetched ${filteredMessages.length} messages for export`);

    return filteredMessages;
  }

  /**
   * Generate export files based on type
   * @param {Object} job - Export job
   * @param {Array} messages - Messages to export
   * @returns {Array} - Generated files
   */
  async generateExportFiles(job, messages) {
    const files = [];

    if (job.exportType === 'pdf' || job.exportType === 'both') {
      const pdfFile = await this.generatePDF(job, messages);
      files.push(pdfFile);
    }

    if (job.exportType === 'csv' || job.exportType === 'both') {
      const csvFile = await this.generateCSV(job, messages);
      files.push(csvFile);
    }

    // If both files, create a zip
    if (files.length > 1) {
      const zipFile = await this.createZip(job, files);
      files.push(zipFile);
    }

    return files;
  }

  /**
   * Generate PDF export
   * @param {Object} job - Export job
   * @param {Array} messages - Messages
   * @returns {Object} - PDF file info
   */
  async generatePDF(job, messages) {
    const filename = generateExportFilename({
      locationId: job.locationId,
      exportType: 'pdf',
      dateRange: {
        start: job.filters.startDate,
        end: job.filters.endDate
      },
      contactName: job.filters.contactName
    });

    const filepath = path.join(this.exportDir, filename);
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = fs.createWriteStream(filepath);

    doc.pipe(stream);

    // Add header
    doc.fontSize(20).text('Conversation Export', { align: 'center' });
    doc.moveDown();

    // Add metadata
    doc.fontSize(10);
    doc.text(`Export Date: ${formatDate(new Date())}`);
    doc.text(`Location ID: ${job.locationId}`);
    
    if (job.filters.startDate && job.filters.endDate) {
      doc.text(`Date Range: ${formatDate(job.filters.startDate, 'YYYY-MM-DD')} to ${formatDate(job.filters.endDate, 'YYYY-MM-DD')}`);
    }
    
    doc.text(`Total Messages: ${messages.length}`);
    doc.moveDown();

    // Add horizontal line
    doc.strokeColor('#aaaaaa')
       .lineWidth(1)
       .moveTo(50, doc.y)
       .lineTo(550, doc.y)
       .stroke();
    
    doc.moveDown();

    // Group messages by conversation
    const conversationGroups = this.groupMessagesByConversation(messages);

    // Add each conversation
    Object.entries(conversationGroups).forEach(([conversationId, convMessages]) => {
      const firstMessage = convMessages[0];
      
      // Conversation header
      doc.fontSize(14).fillColor('#000000').text(`Conversation`, { underline: true });
      doc.fontSize(10);
      doc.text(`Contact: ${firstMessage.contactName || 'Unknown'}`);
      
      if (firstMessage.contactPhone) {
        doc.text(`Phone: ${formatPhoneNumber(firstMessage.contactPhone)}`);
      }
      
      doc.text(`Messages: ${convMessages.length}`);
      doc.moveDown(0.5);

      // Add messages
      convMessages.forEach((message, index) => {
        // Check if we need a new page
        if (doc.y > 700) {
          doc.addPage();
        }

        const timestamp = formatDate(message.dateAdded, 'YYYY-MM-DD HH:mm:ss');
        const direction = message.direction === 'inbound' ? '◄' : '►';
        const messageType = message.type || 'SMS';

        doc.fontSize(9).fillColor('#666666');
        doc.text(`${timestamp} ${direction} [${messageType}]`, { continued: false });
        
        doc.fontSize(10).fillColor('#000000');
        doc.text(message.body || '[No content]', {
          width: 500,
          align: 'left'
        });
        
        doc.moveDown(0.5);

        // Add separator between messages
        if (index < convMessages.length - 1) {
          doc.strokeColor('#eeeeee')
             .lineWidth(0.5)
             .moveTo(70, doc.y)
             .lineTo(540, doc.y)
             .stroke();
          doc.moveDown(0.3);
        }
      });

      doc.moveDown();

      // Add separator between conversations
      doc.strokeColor('#cccccc')
         .lineWidth(1)
         .moveTo(50, doc.y)
         .lineTo(550, doc.y)
         .stroke();
      
      doc.moveDown();
    });

    // Add footer
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor('#999999');
      doc.text(
        `Page ${i + 1} of ${pages.count}`,
        50,
        doc.page.height - 50,
        { align: 'center' }
      );
    }

    doc.end();

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    const stats = fs.statSync(filepath);

    logger.info(`Generated PDF: ${filename} (${formatFileSize(stats.size)})`);

    return {
      type: 'pdf',
      filename,
      filepath,
      downloadUrl: `/api/exports/download/${job.jobId}/${filename}`,
      size: stats.size
    };
  }

  /**
   * Generate CSV export
   * @param {Object} job - Export job
   * @param {Array} messages - Messages
   * @returns {Object} - CSV file info
   */
  async generateCSV(job, messages) {
    const filename = generateExportFilename({
      locationId: job.locationId,
      exportType: 'csv',
      dateRange: {
        start: job.filters.startDate,
        end: job.filters.endDate
      },
      contactName: job.filters.contactName
    });

    const filepath = path.join(this.exportDir, filename);

    // Prepare data for CSV
    const csvData = messages.map(msg => ({
      'Date/Time': formatDate(msg.dateAdded, 'YYYY-MM-DD HH:mm:ss'),
      'Conversation ID': msg.conversationId || '',
      'Message ID': msg.id || '',
      'Direction': msg.direction || '',
      'Type': msg.type || '',
      'Contact Name': msg.contactName || '',
      'Contact Phone': msg.contactPhone || '',
      'Contact Email': msg.contactEmail || '',
      'Message Body': msg.body || '',
      'Status': msg.status || '',
      'User ID': msg.userId || '',
      'Location ID': job.locationId
    }));

    // Generate CSV
    const parser = new Parser({
      fields: [
        'Date/Time',
        'Conversation ID',
        'Message ID',
        'Direction',
        'Type',
        'Contact Name',
        'Contact Phone',
        'Contact Email',
        'Message Body',
        'Status',
        'User ID',
        'Location ID'
      ]
    });

    const csv = parser.parse(csvData);

    // Write to file
    fs.writeFileSync(filepath, csv);

    const stats = fs.statSync(filepath);

    logger.info(`Generated CSV: ${filename} (${formatFileSize(stats.size)})`);

    return {
      type: 'csv',
      filename,
      filepath,
      downloadUrl: `/api/exports/download/${job.jobId}/${filename}`,
      size: stats.size
    };
  }

  /**
   * Create ZIP archive of multiple files
   * @param {Object} job - Export job
   * @param {Array} files - Files to zip
   * @returns {Object} - ZIP file info
   */
  async createZip(job, files) {
    const filename = generateExportFilename({
      locationId: job.locationId,
      exportType: 'zip',
      dateRange: {
        start: job.filters.startDate,
        end: job.filters.endDate
      }
    }).replace('.zip', '') + '.zip';

    const filepath = path.join(this.exportDir, filename);
    const output = fs.createWriteStream(filepath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    // Add files to archive
    files.forEach(file => {
      if (file.type !== 'zip') {
        archive.file(file.filepath, { name: file.filename });
      }
    });

    await archive.finalize();

    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      archive.on('error', reject);
    });

    const stats = fs.statSync(filepath);

    logger.info(`Generated ZIP: ${filename} (${formatFileSize(stats.size)})`);

    return {
      type: 'zip',
      filename,
      filepath,
      downloadUrl: `/api/exports/download/${job.jobId}/${filename}`,
      size: stats.size
    };
  }

  /**
   * Group messages by conversation
   * @param {Array} messages - Messages
   * @returns {Object} - Grouped messages
   */
  groupMessagesByConversation(messages) {
    const groups = {};

    messages.forEach(message => {
      const convId = message.conversationId || 'unknown';
      if (!groups[convId]) {
        groups[convId] = [];
      }
      groups[convId].push(message);
    });

    // Sort messages within each conversation by date
    Object.keys(groups).forEach(convId => {
      groups[convId].sort((a, b) => 
        new Date(a.dateAdded) - new Date(b.dateAdded)
      );
    });

    return groups;
  }

  /**
   * Create history entry for completed export
   * @param {Object} job - Export job
   * @param {Array} messages - Messages
   * @param {Array} files - Generated files
   */
  async createHistoryEntry(job, messages, files) {
    const conversationGroups = this.groupMessagesByConversation(messages);
    
    const contactsIncluded = Object.values(conversationGroups).map(convMessages => ({
      contactId: convMessages[0].contactId,
      contactName: convMessages[0].contactName,
      messageCount: convMessages.length
    }));

    const history = new ExportHistory({
      jobId: job.jobId,
      locationId: job.locationId,
      companyId: job.companyId,
      userId: job.userId,
      userEmail: job.userEmail,
      exportType: job.exportType,
      exportSummary: {
        totalConversations: Object.keys(conversationGroups).length,
        totalMessages: messages.length,
        dateRange: {
          start: job.filters.startDate,
          end: job.filters.endDate
        },
        messageTypes: [...new Set(messages.map(m => m.type))],
        contactsIncluded
      },
      files,
      status: 'success',
      initiatedAt: job.createdAt,
      completedAt: job.completedAt,
      processingDuration: job.completedAt - job.startedAt,
      exportReason: job.isScheduled ? 'scheduled' : 'manual'
    });

    await history.save();
    logger.info(`Created export history entry for job: ${job.jobId}`);
  }

  /**
   * Get export job status
   * @param {string} jobId - Job ID
   * @returns {Object} - Job status
   */
  async getExportStatus(jobId) {
    const job = await ExportJob.findOne({ jobId });
    
    if (!job) {
      throw new Error('Export job not found');
    }

    return {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      results: job.results,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt
    };
  }

  /**
   * Get file path for download
   * @param {string} jobId - Job ID
   * @param {string} filename - Filename
   * @returns {string} - File path
   */
  async getDownloadPath(jobId, filename) {
    const job = await ExportJob.findOne({ jobId });
    
    if (!job) {
      throw new Error('Export job not found');
    }

    const file = job.results.files.find(f => f.filename === filename);
    
    if (!file) {
      throw new Error('File not found');
    }

    if (!fs.existsSync(file.filepath)) {
      throw new Error('File has been deleted or expired');
    }

    return file.filepath;
  }
}

module.exports = new ExportService();
