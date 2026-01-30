const AWS = require('aws-sdk');
const axios = require('axios');
const { MongoClient, ObjectId } = require('mongodb');
const nodemailer = require('nodemailer');

// Initialize AWS services
const s3 = new AWS.S3();
const lambda = new AWS.Lambda();

// Environment variables
const S3_BUCKET = process.env.S3_BUCKET || 'convo-vault-exports';
const MONGODB_URI = process.env.MONGODB_URI;
const GHL_API_URL = process.env.GHL_API_URL || 'https://services.leadconnectorhq.com';
const GHL_OAUTH_URL = process.env.GHL_OAUTH_URL || 'https://services.leadconnectorhq.com/oauth';
const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID;
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET;

// Email configuration
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@vaultsuite.store';

// Batch processing configuration
const BATCH_SIZE = 10;           // Records per Lambda invocation
const API_PAGE_SIZE = 100;          // Records per GHL API call
const API_MESSAGES_PAGE_SIZE = 10;
const TIMEOUT_BUFFER_MS = 14 * 60 * 1000;  // 2 min buffer before timeout

// MongoDB client (reused across warm invocations)
let dbClient = null;

/**
 * Sleep helper
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get MongoDB connection
 */
async function getDb() {
  if (!dbClient) {
    dbClient = new MongoClient(MONGODB_URI);
    await dbClient.connect();
  }
  return dbClient.db();
}

/**
 * Refresh GHL access token
 * Returns both the new access token and new refresh token
 */
async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams();
  params.append('client_id', GHL_CLIENT_ID);
  params.append('client_secret', GHL_CLIENT_SECRET);
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refreshToken);

  const response = await axios.post(`${GHL_OAUTH_URL}/token`, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token
  };
}

/**
 * Fetch a single page of conversations
 */
async function fetchConversationsPage(locationId, accessToken, filters, skip) {
  const params = {
    locationId,
    limit: API_PAGE_SIZE,
    skip,
    ...filters
  };

  // Convert date filters to timestamps
  if (params.startDate) {
    params.startDate = new Date(params.startDate).getTime();
  }
  if (params.endDate) {
    params.endDate = new Date(params.endDate).getTime();
  }

  const response = await axios.get(`${GHL_API_URL}/conversations/search`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28'
    },
    params
  });

  return {
    data: response.data.conversations || [],
    hasMore: (response.data.conversations || []).length === API_PAGE_SIZE
  };
}

/**
 * Fetch a single page of messages
 */
async function fetchMessagesPage(locationId, accessToken, filters, cursor) {
  const params = {
    locationId,
    limit: API_MESSAGES_PAGE_SIZE,
    ...filters
  };

  // Convert date filters to timestamps
  if (params.startDate) {
    params.startDate = new Date(params.startDate).getTime();
  }
  if (params.endDate) {
    params.endDate = new Date(params.endDate).getTime();
  }

  if (cursor) {
    params.cursor = cursor;
  }

  const response = await axios.get(`${GHL_API_URL}/conversations/messages/export`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28'
    },
    params
  });

  console.log("response: ", JSON.stringify(response.data));

  return {
    data: response.data.messages || [],
    nextCursor: response.data.nextCursor || null
  };
}

/**
 * Escape CSV value
 */
function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '');
  return `"${str}"`;
}

/**
 * Convert conversations to CSV format
 */
function conversationsToCSV(conversations, includeHeader = true) {
  const header = includeHeader
    ? 'ID,ContactID,ContactName,ContactEmail,ContactPhone,Type,LastMessageType,LastMessageDate,UnreadCount,DateAdded\n'
    : '';

  const rows = conversations.map(conv => {
    return [
      escapeCsv(conv.id),
      escapeCsv(conv.contactId),
      escapeCsv(conv.contactName || conv.fullName),
      escapeCsv(conv.email),
      escapeCsv(conv.phone),
      escapeCsv(conv.type),
      escapeCsv(conv.lastMessageType),
      escapeCsv(conv.lastMessageDate),
      escapeCsv(conv.unreadCount || 0),
      escapeCsv(conv.dateAdded)
    ].join(',');
  }).join('\n');

  return header + rows + (rows.length > 0 ? '\n' : '');
}

/**
 * Convert messages to CSV format
 */
function messagesToCSV(messages, includeHeader = true) {
  const header = includeHeader
    ? 'Date,ConversationID,ContactID,Type,Direction,Status,Message\n'
    : '';

  const rows = messages.map(msg => {
    const date = msg.dateAdded ? new Date(msg.dateAdded).toISOString() : '';
    const direction = msg.direction || msg?.meta?.email?.direction || 'outbound';

    return [
      escapeCsv(date),
      escapeCsv(msg.conversationId),
      escapeCsv(msg.contactId),
      escapeCsv(msg.type),
      escapeCsv(direction),
      escapeCsv(msg.status),
      escapeCsv(msg.body)
    ].join(',');
  }).join('\n');

  return header + rows + (rows.length > 0 ? '\n' : '');
}

/**
 * Convert to JSON format
 */
function toJSON(data, exportType, isFirst, isLast) {
  if (isFirst && isLast) {
    // Single batch - return complete JSON
    return JSON.stringify({
      [exportType]: data,
      exportedAt: new Date().toISOString(),
      totalCount: data.length
    }, null, 2);
  } else if (isFirst) {
    // First batch - open JSON array
    return `{"${exportType}":[` + data.map(d => JSON.stringify(d)).join(',');
  } else if (isLast) {
    // Last batch - close JSON array
    const items = data.length > 0 ? ',' + data.map(d => JSON.stringify(d)).join(',') : '';
    return items + `],"exportedAt":"${new Date().toISOString()}"}`;
  } else {
    // Middle batch - just data with leading comma
    return ',' + data.map(d => JSON.stringify(d)).join(',');
  }
}

/**
 * Update job progress in database
 */
async function updateJob(db, jobId, updates) {
  await db.collection('exportjobs').updateOne(
    { _id: new ObjectId(jobId) },
    {
      $set: {
        ...updates,
        lastProcessedAt: new Date()
      }
    }
  );
}

/**
 * Send email notification with download link
 */
async function sendEmail(email, downloadUrl, jobDetails) {
  if (!SMTP_HOST || !SMTP_USER) {
    console.log('SMTP not configured, skipping email notification');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT),
      secure: SMTP_PORT === '465',
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: 'Your ConvoVault Export is Ready',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10B981;">Your Export is Ready!</h2>
          <p>Your ${jobDetails.exportType} export has been completed successfully.</p>

          <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Export Details:</strong></p>
            <ul style="margin: 10px 0;">
              <li>Type: ${jobDetails.exportType}</li>
              <li>Format: ${jobDetails.format.toUpperCase()}</li>
              <li>Total Items: ${jobDetails.totalItems.toLocaleString()}</li>
            </ul>
          </div>

          <p>
            <a href="${downloadUrl}"
               style="display: inline-block; background: #10B981; color: white; padding: 12px 24px;
                      text-decoration: none; border-radius: 6px; font-weight: bold;">
              Download Export
            </a>
          </p>

          <p style="color: #6B7280; font-size: 14px; margin-top: 20px;">
            This download link will expire in 7 days.
          </p>

          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">

          <p style="color: #9CA3AF; font-size: 12px;">
            This email was sent by ConvoVault. If you didn't request this export, please ignore this email.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully to:', email);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error.message);
    return false;
  }
}

/**
 * Extract exportJobId from event (handles both normal and durable execution formats)
 */
function extractExportJobId(event) {
  // Direct invocation format
  if (event.exportJobId) {
    return event.exportJobId;
  }

  // Durable execution format - payload is nested
  if (event.InitialExecutionState?.Operations?.[0]?.ExecutionDetails?.InputPayload) {
    try {
      const payload = JSON.parse(event.InitialExecutionState.Operations[0].ExecutionDetails.InputPayload);
      return payload.exportJobId;
    } catch (e) {
      console.error('Failed to parse durable execution payload:', e.message);
    }
  }

  return undefined;
}

/**
 * Main Lambda handler with batch processing
 */
exports.handler = async (event, context) => {
  console.log('Lambda invoked with event:', JSON.stringify(event, null, 2));

  const exportJobId = extractExportJobId(event);
  console.log('Extracted exportJobId:', exportJobId);

  if (!exportJobId) {
    console.error('No exportJobId found in event');
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing exportJobId' }) };
  }

  const db = await getDb();

  // Load job from database
  const job = await db.collection('exportjobs').findOne({
    _id: new ObjectId(exportJobId)
  });

  if (!job) {
    console.error('Job not found:', exportJobId);
    return { statusCode: 404, body: JSON.stringify({ error: 'Job not found' }) };
  }

  if (job.status === 'completed') {
    console.log('Job already completed:', exportJobId);
    return { statusCode: 200, body: JSON.stringify({ message: 'Already completed' }) };
  }

  if (job.status === 'failed' && job.retryCount >= job.maxRetries) {
    console.log('Job failed and max retries exceeded:', exportJobId);
    return { statusCode: 400, body: JSON.stringify({ error: 'Max retries exceeded' }) };
  }

  // Fetch OAuth token from oauthtokens collection
  const oauthToken = await db.collection('oauthtokens').findOne({
    locationId: job.locationId,
    isActive: true
  });

  if (!oauthToken || !oauthToken.refreshToken) {
    console.error('No valid OAuth token found for location:', job.locationId);
    await updateJob(db, exportJobId, {
      status: 'failed',
      errorMessage: 'No valid OAuth token found. Please reconnect your account.'
    });
    return { statusCode: 401, body: JSON.stringify({ error: 'No valid OAuth token found' }) };
  }

  // Token state from OAuthToken collection
  let accessToken = oauthToken.accessToken;
  let refreshToken = oauthToken.refreshToken;

  /**
   * Refresh token and update OAuthToken collection
   */
  async function refreshAndUpdateToken() {
    console.log('Refreshing access token...');
    const tokenData = await refreshAccessToken(refreshToken);
    accessToken = tokenData.accessToken;
    refreshToken = tokenData.refreshToken;

    // Update tokens in OAuthToken collection (single source of truth)
    await db.collection('oauthtokens').updateOne(
      { _id: oauthToken._id },
      {
        $set: {
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        }
      }
    );
    console.log('Tokens refreshed and saved to OAuthToken collection');
    return accessToken;
  }

  try {

    // Initialize or get S3 multipart upload
    let uploadId = job.s3Upload?.uploadId;
    let parts = job.s3Upload?.parts || [];
    const s3Key = job.s3Upload?.key || `exports/${job.companyId}/${job.locationId}/${exportJobId}.${job.format}`;

    if (!uploadId) {
      // Start new multipart upload
      console.log('Starting S3 multipart upload...');
      const multipart = await s3.createMultipartUpload({
        Bucket: S3_BUCKET,
        Key: s3Key,
        ContentType: job.format === 'json' ? 'application/json' : 'text/csv',
        ContentDisposition: `attachment; filename="${job.exportType}_export.${job.format}"`
      }).promise();

      uploadId = multipart.UploadId;
      console.log('Multipart upload started:', uploadId);

      // Save to DB
      await updateJob(db, exportJobId, {
        's3Upload.uploadId': uploadId,
        's3Upload.bucket': S3_BUCKET,
        's3Upload.key': s3Key,
        's3Upload.parts': [],
        status: 'processing',
        startedAt: job.startedAt || new Date()
      });
    }

    // Fetch batch of records
    let cursor = job.cursor;
    let skip = job.exportType === 'conversations' ? (job.processedItems || 0) : 0;
    let records = [];
    let recordsFetched = 0;
    let hasMoreData = true;

    console.log(`Starting batch. Cursor: ${cursor}, Skip: ${skip}, Already processed: ${job.processedItems || 0}`);

    while (recordsFetched < BATCH_SIZE && hasMoreData) {
      // Check if approaching timeout
      const remaining = context.getRemainingTimeInMillis();
      if (remaining < TIMEOUT_BUFFER_MS) {
        console.log(`Approaching timeout (${remaining}ms remaining), saving progress...`);
        break;
      }

      // Fetch page based on export type, with 401 retry
      let pageResult;
      try {
        if (job.exportType === 'conversations') {
          pageResult = await fetchConversationsPage(job.locationId, accessToken, job.filters || {}, skip);
        } else {
          pageResult = await fetchMessagesPage(job.locationId, accessToken, job.filters || {}, cursor);
        }
      } catch (fetchError) {
        // If 401, refresh token and retry once
        if (fetchError.response?.status === 401) {
          console.log('Got 401, refreshing token and retrying...');
          await refreshAndUpdateToken();

          if (job.exportType === 'conversations') {
            pageResult = await fetchConversationsPage(job.locationId, accessToken, job.filters || {}, skip);
          } else {
            pageResult = await fetchMessagesPage(job.locationId, accessToken, job.filters || {}, cursor);
          }
        } else {
          throw fetchError;
        }
      }

      if (job.exportType === 'conversations') {
        hasMoreData = pageResult.hasMore;
        skip += pageResult.data.length;
      } else {
        cursor = pageResult.nextCursor;
        hasMoreData = !!cursor;
      }

      records.push(...pageResult.data);
      recordsFetched += pageResult.data.length;

      console.log(`Fetched page: ${pageResult.data.length} records. Total this batch: ${recordsFetched}`);

      // No more data available - use correct page size for each type
      const pageSize = job.exportType === 'conversations' ? API_PAGE_SIZE : API_MESSAGES_PAGE_SIZE;
      if (pageResult.data.length < pageSize) {
        hasMoreData = false;
        cursor = null;
      }

      // Rate limiting (GHL: 100 req/10 sec)
      if (hasMoreData && recordsFetched < BATCH_SIZE) {
        await sleep(100);
      }
    }

    console.log(`Batch complete. Fetched ${records.length} records. Has more: ${hasMoreData || !!cursor}`);

    // Convert to format and upload as S3 part
    if (records.length > 0) {
      const isFirstPart = parts.length === 0;
      const isLastPart = !hasMoreData && !cursor;

      let content;
      if (job.format === 'json') {
        content = toJSON(records, job.exportType, isFirstPart, isLastPart);
      } else {
        content = job.exportType === 'conversations'
          ? conversationsToCSV(records, isFirstPart)
          : messagesToCSV(records, isFirstPart);
      }

      const partNumber = parts.length + 1;
      console.log(`Uploading S3 part ${partNumber} (${Buffer.byteLength(content)} bytes)...`);

      const uploadResult = await s3.uploadPart({
        Bucket: S3_BUCKET,
        Key: s3Key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: content
      }).promise();

      parts.push({
        partNumber,
        etag: uploadResult.ETag,
        size: Buffer.byteLength(content)
      });

      console.log(`Part ${partNumber} uploaded. ETag: ${uploadResult.ETag}`);
    }

    // Update progress in DB
    const processedItems = (job.processedItems || 0) + records.length;
    const currentBatch = (job.currentBatch || 0) + 1;

    await updateJob(db, exportJobId, {
      cursor: cursor,
      processedItems,
      currentBatch,
      's3Upload.parts': parts
    });

    // Check if more data exists
    if (hasMoreData || cursor) {
      // More data - invoke next Lambda
      console.log(`More data available. Processed so far: ${processedItems}. Invoking next Lambda...`);

      await lambda.invoke({
        FunctionName: context.functionName,
        InvocationType: 'Event',  // Async
        Qualifier: '$LATEST',     // Required for durable functions
        Payload: JSON.stringify({ exportJobId })
      }).promise();

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'Batch complete, next Lambda invoked',
          processedItems,
          batch: currentBatch
        })
      };

    } else {
      // No more data - finalize
      console.log('All data fetched. Finalizing multipart upload...');

      // Complete multipart upload
      if (parts.length > 0) {
        await s3.completeMultipartUpload({
          Bucket: S3_BUCKET,
          Key: s3Key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts.map(p => ({
              PartNumber: p.partNumber,
              ETag: p.etag
            }))
          }
        }).promise();

        console.log('Multipart upload completed');
      }

      // Generate signed download URL (7 days)
      const downloadUrl = s3.getSignedUrl('getObject', {
        Bucket: S3_BUCKET,
        Key: s3Key,
        Expires: 7 * 24 * 60 * 60
      });

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Update job as completed
      await updateJob(db, exportJobId, {
        status: 'completed',
        s3Key,
        s3Bucket: S3_BUCKET,
        downloadUrl,
        downloadUrlExpiresAt: expiresAt,
        completedAt: new Date(),
        totalBatches: currentBatch
      });

      // Send email notification
      let emailSent = false;
      if (job.notificationEmail) {
        emailSent = await sendEmail(job.notificationEmail, downloadUrl, {
          exportType: job.exportType,
          format: job.format,
          totalItems: processedItems
        });

        await updateJob(db, exportJobId, { emailSent });
      }

      console.log(`Export completed successfully. Total: ${processedItems} items, ${currentBatch} batches`);

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'Export completed',
          processedItems,
          totalBatches: currentBatch,
          downloadUrl,
          emailSent
        })
      };
    }

  } catch (error) {
    console.error('Export batch failed:', error);

    // Increment retry count
    const retryCount = (job.retryCount || 0) + 1;

    if (retryCount < (job.maxRetries || 3)) {
      // Retry - invoke self again
      console.log(`Retrying... Attempt ${retryCount + 1}`);

      await updateJob(db, exportJobId, { retryCount });

      // Wait a bit before retry
      await sleep(5000);

      await lambda.invoke({
        FunctionName: context.functionName,
        InvocationType: 'Event',
        Payload: JSON.stringify({ exportJobId })
      }).promise();

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          message: 'Error occurred, retrying...',
          retryCount,
          error: error.message
        })
      };

    } else {
      // Max retries exceeded - abort multipart upload and fail
      console.error('Max retries exceeded. Failing job.');

      // Try to abort multipart upload
      if (job.s3Upload?.uploadId) {
        try {
          await s3.abortMultipartUpload({
            Bucket: S3_BUCKET,
            Key: job.s3Upload.key,
            UploadId: job.s3Upload.uploadId
          }).promise();
          console.log('Multipart upload aborted');
        } catch (abortError) {
          console.error('Failed to abort multipart upload:', abortError.message);
        }
      }

      await updateJob(db, exportJobId, {
        status: 'failed',
        errorMessage: error.message,
        completedAt: new Date()
      });

      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: error.message
        })
      };
    }
  }
};
