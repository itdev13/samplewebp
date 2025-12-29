# 📐 Architecture Documentation

## System Overview

The GHL Xendit Payment Gateway is a Node.js-based integration server that connects GoHighLevel (GHL) with Xendit payment platform. It follows a microservices-inspired architecture with clear separation of concerns.

## Architecture Layers

### 1. API Gateway Layer
- **Purpose**: Handle HTTP requests and route to appropriate handlers
- **Components**:
  - Express.js server
  - CORS middleware
  - Rate limiting
  - Request/response logging
  - Security headers (Helmet)

### 2. Authentication & Authorization Layer
- **OAuth 2.0 Flow**: Standard OAuth implementation for GHL
- **JWT Tokens**: Stateless authentication for API requests
- **Middleware**:
  - `verifyGHLToken`: Validates JWT tokens
  - `verifyXenditCredentials`: Ensures location has valid Xendit setup
  - `optionalAuth`: For public endpoints that benefit from auth

### 3. Business Logic Layer
- **Services**:
  - `XenditService`: All Xendit API interactions
  - `GHLService`: All GoHighLevel API interactions
  - `Encryption`: AES-256 encryption for sensitive data

### 4. Data Access Layer
- **MongoDB Models**:
  - `Location`: Store location configuration
  - `Payment`: Track all payment transactions
  - `OAuthToken`: Manage OAuth tokens
  - `WebhookEvent`: Log webhook events

### 5. Integration Layer
- **External APIs**:
  - Xendit API (payments)
  - GoHighLevel API (CRM operations)

## Data Flow

### Payment Creation Flow

```
1. User initiates payment in GHL
   ↓
2. GHL calls /api/payments/create with JWT
   ↓
3. Middleware validates token & credentials
   ↓
4. Payment route handler receives request
   ↓
5. XenditService creates payment
   ↓
6. Payment stored in MongoDB
   ↓
7. GHL opportunity updated (optional)
   ↓
8. Response sent to user with payment URL
```

### Webhook Processing Flow

```
1. Xendit sends webhook to /api/webhooks/xendit
   ↓
2. Immediate 200 OK response (acknowledge)
   ↓
3. Async processing begins
   ↓
4. WebhookEvent created in database
   ↓
5. Find associated Payment record
   ↓
6. Verify signature (if configured)
   ↓
7. Update Payment status
   ↓
8. Sync to GHL (update opportunity)
   ↓
9. Mark WebhookEvent as processed
```

## Database Schema

### Location Collection
```javascript
{
  _id: ObjectId,
  locationId: String (indexed, unique),
  companyId: String (indexed),
  xenditApiKey: String (encrypted),
  xenditWebhookToken: String (encrypted),
  enabledPaymentMethods: [String],
  defaultCurrency: String,
  settings: {
    invoiceDuration: Number,
    autoCapture: Boolean,
    sendEmailNotification: Boolean,
    successRedirectUrl: String,
    failureRedirectUrl: String
  },
  isActive: Boolean,
  metadata: Map,
  createdAt: Date,
  updatedAt: Date
}
```

### Payment Collection
```javascript
{
  _id: ObjectId,
  locationId: String (indexed),
  opportunityId: String (indexed),
  contactId: String (indexed),
  xenditId: String (indexed, unique),
  externalId: String (indexed),
  amount: Number,
  currency: String,
  paymentMethod: String,
  status: String (indexed),
  xenditStatus: String,
  paymentUrl: String,
  description: String,
  customerName: String,
  customerEmail: String,
  customerPhone: String,
  channelCode: String,
  bankCode: String,
  accountNumber: String,
  qrCodeUrl: String,
  paidAt: Date,
  expiresAt: Date,
  settledAt: Date,
  adminFee: Number,
  totalFee: Number,
  netAmount: Number,
  items: [{
    name: String,
    quantity: Number,
    price: Number
  }],
  metadata: Map,
  errorCode: String,
  errorMessage: String,
  syncedToGHL: Boolean,
  syncAttempts: Number,
  lastSyncAt: Date,
  lastSyncError: String,
  createdAt: Date,
  updatedAt: Date
}
```

### OAuthToken Collection
```javascript
{
  _id: ObjectId,
  locationId: String (indexed),
  companyId: String (indexed),
  accessToken: String,
  refreshToken: String,
  tokenType: String,
  expiresAt: Date (indexed),
  scopes: [String],
  userType: String,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### WebhookEvent Collection
```javascript
{
  _id: ObjectId,
  eventId: String (indexed, unique),
  source: String (indexed),
  eventType: String (indexed),
  paymentId: ObjectId (indexed),
  xenditId: String (indexed),
  externalId: String (indexed),
  payload: Mixed,
  headers: Map,
  processed: Boolean (indexed),
  processedAt: Date (indexed, TTL: 30 days),
  retryCount: Number,
  maxRetries: Number,
  errorMessage: String,
  errorStack: String,
  verified: Boolean,
  signature: String,
  processingTime: Number,
  metadata: Map,
  createdAt: Date,
  updatedAt: Date
}
```

## Security Architecture

### 1. Data Encryption
- **Algorithm**: AES-256-CBC
- **What's Encrypted**:
  - Xendit API keys
  - Webhook tokens
  - Sensitive customer data
- **Key Management**: Environment variable (ENCRYPTION_KEY)

### 2. Authentication
- **OAuth 2.0**: Standard implementation
- **JWT**: HS256 algorithm
- **Token Storage**: MongoDB (encrypted)
- **Token Refresh**: Automatic when needed

### 3. API Security
- **Rate Limiting**: Per-endpoint limits
- **CORS**: Configurable origins
- **Helmet**: Security headers
- **Input Validation**: express-validator
- **SQL Injection**: MongoDB driver prevents
- **XSS**: Express escapes by default

### 4. Webhook Security
- **Signature Verification**: HMAC-SHA256
- **HTTPS Only**: SSL/TLS required
- **Idempotency**: Event ID tracking
- **Retry Logic**: Exponential backoff

## Scalability Considerations

### Horizontal Scaling
- **Stateless Design**: No session storage
- **Database Connection Pooling**: Configured
- **Load Balancing Ready**: No sticky sessions needed

### Vertical Scaling
- **Connection Limits**: Configurable pool size
- **Memory Management**: Efficient queries
- **CPU Usage**: Async/await throughout

### Database Optimization
- **Indexes**: All frequently queried fields
- **TTL Indexes**: Auto-delete old webhooks
- **Compound Indexes**: For complex queries
- **Query Optimization**: Lean() for read-only

## Error Handling Strategy

### 1. API Errors
- Standardized error responses
- HTTP status codes
- Error codes for client handling
- Detailed logging (no sensitive data)

### 2. Webhook Failures
- Automatic retry (up to 3 times)
- Exponential backoff
- Error tracking in database
- Manual retry endpoint

### 3. Database Errors
- Connection retry logic
- Graceful degradation
- Error logging
- Alert on critical failures

## Monitoring & Observability

### Logging
- **Winston**: Structured logging
- **Levels**: error, warn, info, debug
- **Rotation**: 5MB per file, 5 files max
- **Format**: JSON for production

### Metrics
- Request count
- Response time
- Error rate
- Payment success rate
- Database query time

### Health Checks
- `/health`: Basic server health
- MongoDB connectivity
- External API availability

## Performance Optimization

### 1. Database
- Connection pooling (10 connections)
- Efficient indexes
- Lean queries
- Projection (select fields)

### 2. API Calls
- Timeout handling (30s)
- Retry with backoff
- Async/await for parallelism
- Request caching (where appropriate)

### 3. Memory
- Stream large responses
- Garbage collection monitoring
- Connection cleanup

## Deployment Architecture

### Single Server
```
Internet → Nginx (SSL) → Node.js → MongoDB
```

### High Availability
```
Internet → Load Balancer → [Node.js, Node.js, Node.js] → MongoDB Cluster
```

### Microservices (Future)
```
Internet → API Gateway → [
  Auth Service,
  Payment Service,
  Webhook Service,
  Sync Service
] → MongoDB + Redis
```

## Technology Stack

- **Runtime**: Node.js 16+
- **Framework**: Express.js
- **Database**: MongoDB 4.4+
- **ODM**: Mongoose
- **Security**: Helmet, crypto-js
- **Validation**: express-validator
- **Logging**: Winston
- **Testing**: Jest (future)

## API Design Principles

1. **RESTful**: Standard HTTP methods
2. **Versioned**: /api/v1 (future)
3. **Consistent**: Standard response format
4. **Documented**: OpenAPI/Swagger (future)
5. **Paginated**: Limit/offset for lists
6. **Filtered**: Query parameters
7. **Sorted**: Flexible sorting

## Best Practices Implemented

1. **Separation of Concerns**: Routes, services, models
2. **DRY**: Reusable utilities and middleware
3. **Error Handling**: Try-catch with asyncHandler
4. **Validation**: Input validation on all endpoints
5. **Security**: Multiple layers
6. **Logging**: Comprehensive
7. **Testing**: Ready for Jest (future)
8. **Documentation**: Inline comments
9. **Configuration**: Environment-based
10. **Scalability**: Designed for growth

## Future Enhancements

1. **Redis Caching**: Reduce database load
2. **Queue System**: Bull for background jobs
3. **GraphQL API**: Alternative to REST
4. **Real-time Updates**: WebSockets
5. **Analytics Dashboard**: Payment insights
6. **Multi-tenancy**: Better isolation
7. **API Versioning**: v2, v3, etc.
8. **Microservices**: Split into services
9. **Containerization**: Docker & Kubernetes
10. **Testing**: Comprehensive test suite

---

**Last Updated**: 2024
**Version**: 2.0.0

