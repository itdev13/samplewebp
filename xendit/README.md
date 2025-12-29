# 🚀 GHL Xendit Payment Gateway Integration

A **production-ready** payment gateway integration between **GoHighLevel** and **Xendit** payment platform. Accept payments from customers across Southeast Asia using multiple payment methods including Virtual Accounts, E-Wallets, QRIS, Credit Cards, and more.

## ✨ Features

### 💳 **Multiple Payment Methods**
- **Payment Invoices** - Send payment links via email/SMS
- **Virtual Accounts** - Bank transfers (BCA, BNI, BRI, Mandiri, Permata, BSI, BJB)
- **E-Wallets** - OVO, DANA, LinkAja, ShopeePay, GCash, PayMaya, GrabPay
- **QRIS** - QR Code Indonesian Standard
- **Retail Outlets** - Alfamart, Indomaret
- **Credit Cards** - Visa, Mastercard, Amex (coming soon)

### 🌍 **Multi-Currency Support**
- IDR (Indonesian Rupiah)
- PHP (Philippine Peso)
- USD (US Dollar)
- SGD (Singapore Dollar)
- MYR (Malaysian Ringgit)
- THB (Thai Baht)

### 🔄 **Real-time Sync**
- Automatic payment status updates
- Webhook integration with Xendit
- Sync payment status to GHL opportunities
- Real-time notifications

### 🔐 **Security**
- AES-256 encryption for API keys
- JWT-based authentication
- Webhook signature verification
- Secure credential storage
- Rate limiting & DDoS protection

### 📊 **Advanced Features**
- Transaction history & analytics
- Payment retry mechanism
- Webhook event logging
- Failed payment handling
- Automatic opportunity updates

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  GoHighLevel Platform                        │
└─────────────┬───────────────────────────────────┬───────────┘
              │                                   │
              │ OAuth & API                       │ Webhooks
              ▼                                   ▼
┌─────────────────────────────────────────────────────────────┐
│              YOUR INTEGRATION SERVER                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  OAuth   │  │ Payments │  │ Webhooks │  │  Config  │   │
│  │  Routes  │  │  Routes  │  │  Routes  │  │  Routes  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │              │             │          │
│  ┌────▼─────────────▼──────────────▼─────────────▼──────┐  │
│  │        Services & Business Logic                      │  │
│  │  - XenditService  - GHLService  - Encryption         │  │
│  └────┬───────────────────────────────────────────┬──────┘  │
│       │                                           │          │
│  ┌────▼────────┐                         ┌────────▼──────┐  │
│  │   MongoDB   │                         │  External     │  │
│  │   Database  │                         │  APIs         │  │
│  └─────────────┘                         └───────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Prerequisites

- **Node.js** 16+ and npm/yarn
- **MongoDB** 4.4+ (local or cloud)
- **GoHighLevel** Marketplace account
- **Xendit** account ([Sign up](https://dashboard.xendit.co/register))
- **Public domain** with SSL (for webhooks)

## 🚀 Quick Start

### 1. Clone & Install

```bash
# Install dependencies
npm install

# or with yarn
yarn install
```

### 2. Environment Setup

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Server
NODE_ENV=production
PORT=3000
BASE_URL=https://your-domain.com

# MongoDB
MONGODB_URI=mongodb://localhost:27017/ghl-xendit

# GHL Credentials (Already configured)
GHL_CLIENT_ID=69035bb47ddd385551737f5c-mhdeym94
GHL_CLIENT_SECRET=add8201c-d369-49d3-8bb1-1d7a539ecdcf
GHL_REDIRECT_URI=https://your-domain.com/oauth/callback

# Security (IMPORTANT: Generate new keys!)
ENCRYPTION_KEY=your-32-character-encryption-key-here
JWT_SECRET=your-jwt-secret-key-change-this
```

### 3. Generate Encryption Keys

```bash
# Generate secure encryption key (32 characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy the generated keys to your `.env` file.

### 4. Start MongoDB

```bash
# If using local MongoDB
mongod

# Or use MongoDB Atlas (cloud)
# Update MONGODB_URI in .env with your connection string
```

### 5. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

You should see:

```
==================================================
🚀 GHL Xendit Payment Gateway Server Started
==================================================
📡 Server running on port 3000
🌍 Environment: production
🔗 Base URL: https://your-domain.com
📊 MongoDB: Connected
==================================================
```

## 🔧 Configuration

### GoHighLevel Setup

1. **Log in to GHL Marketplace**
   - Go to [https://marketplace.gohighlevel.com/apps](https://marketplace.gohighlevel.com/apps)
   - Click "Create App"

2. **Configure OAuth**
   - Redirect URI: `https://your-domain.com/oauth/callback`
   - Scopes: locations, contacts, opportunities, payments

3. **Upload Manifest**
   - Upload `ghl-app-manifest.json`
   - Set webhook URL: `https://your-domain.com/api/webhooks/xendit`

### Xendit Setup

1. **Create Xendit Account**
   - Sign up at [https://dashboard.xendit.co/register](https://dashboard.xendit.co/register)
   - Complete KYB verification

2. **Get API Keys**
   - Go to Settings → Developers → API Keys
   - Copy your **secret key** (starts with `xnd_`)

3. **Configure Webhooks** (Optional but recommended)
   - Go to Settings → Webhooks
   - Add webhook URL: `https://your-domain.com/api/webhooks/xendit`
   - Copy verification token

## 📡 API Endpoints

### OAuth

```
GET  /oauth/authorize          - Start OAuth flow
GET  /oauth/callback           - OAuth callback
POST /oauth/refresh            - Refresh access token
POST /oauth/revoke             - Revoke access token
GET  /oauth/status/:locationId - Check OAuth status
```

### Payments

```
POST /api/payments/create               - Create payment
GET  /api/payments/:paymentId           - Get payment details
GET  /api/payments                      - List payments
POST /api/payments/:paymentId/sync      - Sync payment status
GET  /api/payments/methods/available    - Get available methods
```

### Configuration

```
GET    /api/config/:locationId      - Get configuration
POST   /api/config/:locationId      - Save configuration
PUT    /api/config/:locationId      - Update configuration
DELETE /api/config/:locationId      - Delete configuration
POST   /api/config/:locationId/test - Test Xendit connection
```

### Webhooks

```
POST /api/webhooks/xendit    - Receive Xendit webhooks
POST /api/webhooks/retry     - Retry failed webhooks
GET  /api/webhooks/stats     - Webhook statistics
```

## 💡 Usage Examples

### Create Payment (Invoice)

```javascript
POST /api/payments/create
Authorization: Bearer <jwt_token>

{
  "amount": 100000,
  "currency": "IDR",
  "paymentMethod": "invoice",
  "contactId": "contact_123",
  "opportunityId": "opp_456",
  "customerName": "John Doe",
  "customerEmail": "john@example.com",
  "customerPhone": "+628123456789",
  "description": "Payment for services",
  "items": [
    {
      "name": "Service A",
      "quantity": 1,
      "price": 100000
    }
  ]
}
```

Response:
```javascript
{
  "success": true,
  "message": "Payment created successfully",
  "data": {
    "id": "payment_id",
    "xenditId": "inv_xyz123",
    "status": "pending",
    "amount": 100000,
    "currency": "IDR",
    "paymentUrl": "https://checkout.xendit.co/web/inv_xyz123",
    "expiresAt": "2024-01-02T00:00:00Z"
  }
}
```

### Create Virtual Account Payment

```javascript
POST /api/payments/create

{
  "amount": 500000,
  "currency": "IDR",
  "paymentMethod": "virtual_account",
  "bankCode": "BCA",
  "customerName": "Jane Doe",
  "customerEmail": "jane@example.com",
  "opportunityId": "opp_789"
}
```

### Create E-Wallet Payment

```javascript
POST /api/payments/create

{
  "amount": 250000,
  "currency": "IDR",
  "paymentMethod": "ewallet",
  "channelCode": "OVO",
  "customerPhone": "+628123456789",
  "customerName": "Bob Smith",
  "opportunityId": "opp_abc"
}
```

## 🔐 Security Best Practices

1. **Environment Variables**
   - Never commit `.env` to version control
   - Use strong, unique encryption keys
   - Rotate keys regularly

2. **API Keys**
   - Store Xendit keys encrypted in database
   - Use separate keys for dev/production
   - Implement key rotation

3. **Webhooks**
   - Always verify webhook signatures
   - Use HTTPS only
   - Implement retry logic with exponential backoff

4. **Rate Limiting**
   - Configured per endpoint
   - OAuth: 10 requests/15min
   - Payments: 20 requests/min
   - API: 100 requests/15min

## 📊 Database Models

### Location
- Stores GHL location configuration
- Encrypted Xendit API keys
- Payment method preferences
- Currency settings

### Payment
- Payment transactions
- Status tracking
- Customer information
- Xendit payment IDs

### OAuthToken
- GHL OAuth tokens
- Token refresh handling
- Expiry management

### WebhookEvent
- Webhook event log
- Retry tracking
- Processing status

## 🐛 Troubleshooting

### MongoDB Connection Issues

```bash
# Check MongoDB status
systemctl status mongod

# Check connection
mongo --eval "db.adminCommand('ping')"
```

### OAuth Issues

- Verify GHL_CLIENT_ID and GHL_CLIENT_SECRET
- Check redirect URI matches exactly
- Ensure BASE_URL is correct

### Webhook Issues

- Verify public domain is accessible
- Check webhook URL in Xendit dashboard
- Verify SSL certificate is valid

### Payment Creation Fails

- Verify Xendit API key is correct
- Check payment method is enabled
- Verify customer information is complete

## 📈 Monitoring & Logging

View logs:
```bash
# Development
tail -f logs/combined.log

# Production
pm2 logs ghl-xendit
```

## 🚢 Deployment

### Option 1: PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start src/server.js --name ghl-xendit

# Save PM2 configuration
pm2 save

# Setup auto-start
pm2 startup
```

### Option 2: Docker

```bash
# Build image
docker build -t ghl-xendit .

# Run container
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name ghl-xendit \
  ghl-xendit
```

### Option 3: Heroku

```bash
# Login to Heroku
heroku login

# Create app
heroku create your-app-name

# Add MongoDB addon
heroku addons:create mongodb:small

# Deploy
git push heroku main
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Test with coverage
npm run test:coverage

# Test specific endpoint
curl -X POST http://localhost:3000/api/payments/create \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 100000, "currency": "IDR", "paymentMethod": "invoice"}'
```

## 📚 Additional Resources

- [Xendit API Documentation](https://developers.xendit.co/)
- [GoHighLevel API Documentation](https://highlevel.stoplight.io/)
- [MongoDB Documentation](https://docs.mongodb.com/)

## 🤝 Support

- Email: support@yourcompany.com
- Documentation: https://yourcompany.com/docs
- Issues: https://github.com/yourcompany/ghl-xendit/issues

## 📄 License

MIT License - see LICENSE file for details

## 🎉 You're Ready!

Your GHL Xendit Payment Gateway is now ready to accept payments!

**Next Steps:**
1. Complete Xendit verification
2. Test payments in sandbox mode
3. Submit to GHL Marketplace
4. Go live and start earning!

---

**Built with ❤️ for GoHighLevel community**

