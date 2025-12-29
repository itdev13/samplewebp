# GoHighLevel Payment Provider Setup Guide

## 🎯 Complete These 4 Mandatory Steps

You need to fill in the Payment Provider configuration at:
**Modules → Payment Providers → xendit → Edit**

---

## Step 1: Basic Info ✅

Fill in these fields:

### Provider Configuration
```
Provider Name: Xendit
Display Name: Xendit Payment Gateway
Description: Accept payments via Virtual Accounts, E-Wallets, Credit Cards, and Payment Invoices across Indonesia, Philippines, and Singapore
```

### Logo/Branding
```
Logo URL: https://www.xendit.co/wp-content/uploads/2023/03/xendit-logo.svg
Icon URL: https://xendit.co/favicon.ico
Brand Color: #00ADE6 (Xendit blue)
```

### Provider Details
```
Provider Type: Payment Gateway
Category: Payments
Supported Regions: Indonesia (ID), Philippines (PH), Singapore (SG)
```

### Live Mode Settings
```
☑️ Enable Live Mode
☑️ Enable Test Mode
Test Mode Label: "Xendit Sandbox Mode"
```

---

## Step 2: Profile Details ✅

### API Endpoints Configuration

**Important**: Replace `https://362e2fa02303.ngrok-free.app` with your actual domain when in production.

```
Base URL: https://362e2fa02303.ngrok-free.app

Create Payment Endpoint: /api/payments/create
Payment Status Endpoint: /api/payments/status/{paymentId}
Payment Methods Endpoint: /api/payments/methods
Config Endpoint: /api/config/{locationId}
```

### Configuration Fields for Users

These fields will be shown to users when they configure your payment provider:

#### Field 1: Xendit API Key
```
Field Name: xenditApiKey
Field Label: Xendit API Key
Field Type: Password
Required: Yes
Placeholder: xnd_development_... or xnd_production_...
Help Text: Get your API key from Xendit Dashboard (https://dashboard.xendit.co/settings/developers)
Order: 1
```

#### Field 2: Webhook Token (Optional)
```
Field Name: webhookToken
Field Label: Webhook Verification Token
Field Type: Password
Required: No
Placeholder: Optional webhook token
Help Text: Optional token for webhook signature verification. Configure this in Xendit Dashboard under Settings → Webhooks
Order: 2
```

#### Field 3: Payment Methods
```
Field Name: paymentMethods
Field Label: Enabled Payment Methods
Field Type: Multi-select
Required: No
Options:
  - invoice (Payment Invoice)
  - virtual_account (Virtual Account)
  - ewallet (E-Wallet)
  - credit_card (Credit Card)
Default Selection: invoice, virtual_account, ewallet
Help Text: Select which payment methods you want to enable for your customers
Order: 3
```

### Supported Payment Methods

Add these payment method configurations:

#### Invoice
```json
{
  "value": "invoice",
  "name": "Payment Invoice",
  "description": "Create payment links for customers to pay via multiple methods",
  "supportedCurrencies": ["IDR", "PHP", "USD"],
  "icon": "invoice"
}
```

#### Virtual Account
```json
{
  "value": "virtual_account",
  "name": "Virtual Account",
  "description": "Bank virtual account for bank transfers",
  "supportedCurrencies": ["IDR"],
  "supportedBanks": ["BCA", "BNI", "BRI", "MANDIRI", "PERMATA", "SAHABAT_SAMPOERNA"],
  "icon": "bank"
}
```

#### E-Wallet
```json
{
  "value": "ewallet",
  "name": "E-Wallet",
  "description": "Digital wallet payments",
  "supportedCurrencies": ["IDR"],
  "supportedChannels": ["OVO", "DANA", "LINKAJA", "SHOPEEPAY"],
  "icon": "wallet"
}
```

#### Credit Card
```json
{
  "value": "credit_card",
  "name": "Credit Card",
  "description": "Credit and debit card payments",
  "supportedCurrencies": ["IDR", "PHP", "USD"],
  "icon": "credit-card"
}
```

---

## Step 3: Support Details ✅

Fill in your support information:

```
Support Email: support@yourdomain.com
Support URL: https://yourdomain.com/support
Documentation URL: https://docs.yourdomain.com/xendit
Help Center URL: https://help.yourdomain.com

Support Hours: 24/7
Response Time: Within 24 hours
Support Languages: English, Indonesian, Tagalog

Additional Resources:
- Xendit Documentation: https://docs.xendit.co
- GoHighLevel API Docs: https://highlevel.stoplight.io
- Integration Guide: https://yourdomain.com/docs/xendit-integration
```

### FAQ Section

Add these common questions:

**Q: How do I get my Xendit API key?**
A: Log in to Xendit Dashboard → Settings → Developers → API Keys. Use test keys for sandbox mode and live keys for production.

**Q: What currencies are supported?**
A: IDR (Indonesian Rupiah), PHP (Philippine Peso), and USD (US Dollar) depending on the payment method.

**Q: How long does payment settlement take?**
A: Virtual Accounts: Instant. E-Wallets: 1-2 business days. Credit Cards: 2-3 business days.

**Q: Are there transaction fees?**
A: Xendit charges transaction fees based on your merchant agreement. Check your Xendit contract or contact Xendit sales.

**Q: What happens if a payment fails?**
A: The system automatically updates the opportunity status in GoHighLevel. You'll receive webhook notifications for all payment status changes.

---

## Step 4: Pricing Details ✅

Choose your monetization strategy:

### Option 1: Free (Recommended for Launch)
```
Pricing Model: Free
Description: Free to install, pay only Xendit transaction fees
```

### Option 2: Monthly Subscription
```
Pricing Model: Subscription
Amount: $29
Currency: USD
Billing Interval: Monthly
Free Trial: 14 days
Description: $29/month per location + Xendit transaction fees
```

### Option 3: Usage-Based (Advanced)
```
Pricing Model: Transaction-based
Fee Structure: 1% per successful transaction
Minimum Fee: $0.50
Maximum Fee: $50.00
Description: Pay 1% per successful transaction (min $0.50, max $50)
```

### Recommended Pricing Tiers

**Starter**: $29/month
- Up to 100 transactions
- All payment methods
- Email support

**Professional**: $79/month
- Up to 500 transactions
- All payment methods
- Priority support
- Custom webhook

**Enterprise**: $199/month
- Unlimited transactions
- All payment methods
- Dedicated support
- Custom integration

---

## 🔧 Additional Configuration

### Webhook Setup

1. **In GoHighLevel** (Advanced Settings → Webhooks):
```
Webhook URL: https://362e2fa02303.ngrok-free.app/api/webhooks/xendit
Events to Subscribe:
  - payment.paid
  - payment.failed
  - payment.expired
Method: POST
```

2. **In Xendit Dashboard** (Settings → Webhooks):
```
Webhook URL: https://362e2fa02303.ngrok-free.app/api/webhooks/xendit
Events:
  ☑️ Invoice Paid
  ☑️ Invoice Expired
  ☑️ Virtual Account Payment
  ☑️ E-Wallet Payment
  ☑️ Card Payment
```

### OAuth Scopes

Ensure these scopes are enabled in **Advanced Settings → Auth**:

**Required Scopes:**
- ✅ `payments/orders.write` - Create payments
- ✅ `payments/orders.readonly` - Read payment status
- ✅ `payments/transactions.readonly` - Read transactions
- ✅ `payments/integration.readonly` - Read payment config
- ✅ `payments/integration.write` - Update payment config

**Optional but Recommended:**
- ✅ `contacts.readonly` - Read customer info
- ✅ `opportunities.write` - Update opportunities
- ✅ `invoices.write` - Create invoices
- ✅ `invoices.readonly` - Read invoice status

---

## ✅ Pre-Launch Checklist

Before going live, verify:

### Technical Setup
- [ ] Server is running and accessible
- [ ] Environment variables are configured
- [ ] Database/storage is set up (if not using in-memory)
- [ ] SSL certificate is valid (HTTPS required)
- [ ] Redirect URL matches your callback endpoint

### GoHighLevel Configuration
- [ ] Basic Info completed
- [ ] Profile Details completed
- [ ] Support Details completed
- [ ] Pricing Details completed
- [ ] OAuth scopes configured
- [ ] Redirect URLs added
- [ ] Webhooks configured

### Xendit Configuration
- [ ] Xendit account created
- [ ] API keys obtained (test + live)
- [ ] Webhook URL configured in Xendit
- [ ] Payment methods enabled in Xendit account
- [ ] Business verification completed (for live mode)

### Testing
- [ ] Test OAuth flow (install app)
- [ ] Test configuration save (enter API key)
- [ ] Test payment creation (create invoice)
- [ ] Test payment webhook (complete payment)
- [ ] Test all payment methods
- [ ] Test error handling (invalid API key, etc.)

---

## 🚀 Going Live

Once all 4 steps are complete:

1. **Save Configuration**
   - Click "Save" button in GoHighLevel

2. **Test Installation**
   - Go to Marketplace → Installed Apps
   - Verify "Xendit Payment Gateway" appears
   - Click "Configure" and test the setup

3. **Test Payment Flow**
   ```bash
   # Use the test script
   bash TEST_END_TO_END.sh
   ```

4. **Submit for Review** (if publishing publicly)
   - Go to App Settings → Submit for Review
   - Wait for GoHighLevel approval (1-2 weeks)

5. **Make Public** (optional)
   - Change app from "Private" to "Public"
   - Set pricing model
   - Add screenshots and description

---

## 📞 Need Help?

### Resources
- **Xendit Docs**: https://docs.xendit.co
- **GoHighLevel API**: https://highlevel.stoplight.io
- **Xendit Support**: support@xendit.co
- **Your Support**: [Your Email]

### Common Issues

**Issue: "Credentials not configured"**
- Solution: Users need to enter their Xendit API key in app settings

**Issue: "Payment creation failed"**
- Check: API key is valid and has permissions
- Check: Payment amount is within limits
- Check: Currency is supported for the payment method

**Issue: "Webhook not received"**
- Check: Webhook URL is accessible (not localhost)
- Check: Xendit webhook is configured correctly
- Check: Firewall allows incoming requests

---

## 🎉 You're Done!

All 4 mandatory steps should now show as complete (4/4) in GoHighLevel!

Next: Test your payment provider and start accepting payments! 💰


