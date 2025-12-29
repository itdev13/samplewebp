# 🚀 Quick Start Guide

Get your GHL Xendit Payment Gateway running in 10 minutes!

## Step 1: Install Dependencies (2 minutes)

```bash
npm install
```

## Step 2: Setup Environment (3 minutes)

1. **Copy environment template:**
```bash
cp .env.example .env
```

2. **Generate encryption keys:**
```bash
# Generate 32-character encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

3. **Edit `.env` file:**
```env
# Your domain
BASE_URL=https://your-domain.com

# MongoDB (use local or Atlas)
MONGODB_URI=mongodb://localhost:27017/ghl-xendit

# GHL Credentials (Already set!)
GHL_CLIENT_ID=69035bb47ddd385551737f5c-mhdeym94
GHL_CLIENT_SECRET=add8201c-d369-49d3-8bb1-1d7a539ecdcf
GHL_REDIRECT_URI=https://your-domain.com/oauth/callback

# Security (paste generated keys)
ENCRYPTION_KEY=<paste-32-char-key-here>
JWT_SECRET=<paste-jwt-secret-here>
```

## Step 3: Start MongoDB (1 minute)

**Option A: Local MongoDB**
```bash
mongod
```

**Option B: MongoDB Atlas (Cloud)**
1. Create free cluster at [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Get connection string
3. Update `MONGODB_URI` in `.env`

## Step 4: Start Server (1 minute)

```bash
# Development
npm run dev

# Production
npm start
```

✅ Server is running at http://localhost:3000

## Step 5: Get Xendit API Key (3 minutes)

1. Go to [https://dashboard.xendit.co/register](https://dashboard.xendit.co/register)
2. Sign up and verify email
3. Complete basic KYB
4. Go to **Settings → Developers → API Keys**
5. Copy your **secret key** (starts with `xnd_`)

## Step 6: Configure First Location

**Via API:**
```bash
curl -X POST http://localhost:3000/api/config/your_location_id \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "xenditApiKey": "xnd_development_...",
    "enabledPaymentMethods": ["invoice", "virtual_account", "ewallet"],
    "defaultCurrency": "IDR"
  }'
```

**Via GHL:**
1. Install app in GHL location
2. Authorize OAuth
3. Enter Xendit API key in settings

## Step 7: Create Test Payment

```bash
curl -X POST http://localhost:3000/api/payments/create \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100000,
    "currency": "IDR",
    "paymentMethod": "invoice",
    "customerEmail": "test@example.com",
    "customerName": "Test Customer",
    "description": "Test payment"
  }'
```

## 🎉 You're Done!

Your payment gateway is now ready to accept payments!

## Next Steps

1. **Test in Sandbox**: Use Xendit test mode
2. **Deploy to Production**: Use Heroku, Railway, or your server
3. **Submit to GHL Marketplace**: Get approved and list your app
4. **Go Live**: Start accepting real payments!

## Need Help?

- 📖 [Full Documentation](README.md)
- 🐛 [Troubleshooting](README.md#troubleshooting)
- 💬 Support: support@yourcompany.com

## Common Issues

**MongoDB won't start?**
```bash
# Check if already running
ps aux | grep mongod

# Start manually
sudo systemctl start mongod
```

**Port 3000 already in use?**
```bash
# Change port in .env
PORT=4000
```

**Can't connect to Xendit?**
- Verify API key is correct
- Check internet connection
- Try test mode first

---

**Ready to accept payments? Let's go! 🚀**

