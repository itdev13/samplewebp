const express = require('express');
const router = express.Router();
const multer = require('multer');
const nodemailer = require('nodemailer');
const fs = require('fs');
const logger = require('../utils/logger');
const { authenticateSession } = require('../middleware/auth');

// Configure multer for support attachments
const upload = multer({
  dest: 'uploads/support/',
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed (JPEG, PNG, GIF, WebP)'));
    }
  }
});

// Email transporter (configure with your email service)
// For Gmail: Use App Password from https://myaccount.google.com/apppasswords
// For other services: Update configuration below
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SUPPORT_EMAIL_USER,
    pass: process.env.SUPPORT_EMAIL_PASSWORD
  },
  // Fallback for Gmail issues
  tls: {
    rejectUnauthorized: false
  }
});

// Verify email configuration on startup
transporter.verify((error, success) => {
  if (error) {
    logger.warn('⚠️  Email configuration issue:', error.message);
    logger.warn('Support tickets will fail until email is properly configured');
    logger.info('💡 Gmail users: Generate App Password at https://myaccount.google.com/apppasswords');
  } else {
    logger.info('✅ Email service ready');
  }
});

/**
 * @route POST /api/support/ticket
 * @desc Submit support ticket
 */
router.post('/ticket', authenticateSession, upload.array('images', 5), async (req, res) => {
  try {
    const { name, email, subject, message, locationId, userId } = req.body;

    // Validation
    if (!email || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: 'Email, subject, and message are required'
      });
    }

    logger.info('Support ticket received', { email, subject, locationId });

    // Prepare email content
    const emailHtml = `
      <h2>New Support Ticket - ConvoVault</h2>
      <hr/>
      <p><strong>From:</strong> ${name || 'Not provided'}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Location ID:</strong> ${locationId || 'Not provided'}</p>
      <p><strong>User ID:</strong> ${userId || 'Not provided'}</p>
      <hr/>
      <h3>Message:</h3>
      <p>${message.replace(/\n/g, '<br/>')}</p>
      ${req.files && req.files.length > 0 ? '<hr/><p><strong>Attachments:</strong> ' + req.files.length + ' image(s) attached</p>' : ''}
    `;

    // Prepare attachments
    const attachments = req.files ? req.files.map(file => ({
      filename: file.originalname,
      path: file.path
    })) : [];

    
    // Send email
    await transporter.sendMail({
      from: email,
      to: 'rapiddev21@gmail.com',
      subject: `[ConvoVault Support] ${subject}`,
      html: emailHtml,
      attachments: attachments
    });

    // Clean up uploaded files
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }

    logger.info('✅ Support ticket sent successfully', { email });

    res.json({
      success: true,
      message: 'Support ticket submitted successfully. We will get back to you soon!'
    });

  } catch (error) {
    logger.error('Support ticket error:', error);

    // Clean up files on error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to submit support ticket',
      message: error.message
    });
  }
});

module.exports = router;

