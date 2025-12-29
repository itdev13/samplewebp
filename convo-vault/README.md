# GHL Conversations Manager

Simple GoHighLevel Marketplace App with three core features:

## Features

### 1. **Download Conversations** 📥
Download and retrieve conversations from your GHL location with filtering options.

**Endpoint:** `GET /api/conversations/download`

**Parameters:**
- `locationId` (required)
- `limit` (optional, default: 20)
- `startDate` (optional)
- `endDate` (optional)

**Example:**
```bash
curl "http://localhost:3003/api/conversations/download?locationId=YOUR_LOCATION_ID&limit=50"
```

---

### 2. **Get Conversation Messages** 💬
Retrieve all messages from a specific conversation.

**Endpoint:** `GET /api/messages/:conversationId`

**Parameters:**
- `locationId` (required)
- `limit` (optional, default: 100)

**Example:**
```bash
curl "http://localhost:3003/api/messages/CONVERSATION_ID?locationId=YOUR_LOCATION_ID"
```

**Download as JSON:**
```bash
curl "http://localhost:3003/api/messages/CONVERSATION_ID/download?locationId=YOUR_LOCATION_ID"
```

---

### 3. **Import from CSV/Excel** 📤
Import messages from CSV or Excel files.

**Endpoint:** `POST /api/import/upload`

---

### 4. **Advanced Message Export** 🚀 (BONUS)
Export messages with **conversationId** included and advanced filtering options.

**Endpoints:** 
- `GET /api/export/messages` - Paginated export with filters
- `GET /api/export/messages/all` - Bulk export all messages
- `GET /api/export/csv` - Download as CSV file

**CSV Format:**
```csv
contactId,type,message,direction
contact_123,SMS,Hello World,outbound
contact_456,Email,Test message,outbound
```

**Download Template:**
```bash
curl "http://localhost:3003/api/import/template" -o template.csv
```

**Upload File:**
```bash
curl -X POST \
  -F "file=@messages.csv" \
  -F "locationId=YOUR_LOCATION_ID" \
  http://localhost:3003/api/import/upload
```

---

## Quick Start

### 1. Install Dependencies
```bash
cd conversations-manager
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3003
MONGODB_URI=mongodb://localhost:27017/ghl-conversations-manager
GHL_CLIENT_ID=your_client_id
GHL_CLIENT_SECRET=your_client_secret
GHL_REDIRECT_URI=http://localhost:3003/oauth/callback
```

### 3. Start Server
```bash
npm run dev
```

### 4. Connect GHL Sub-Account
Visit: `http://localhost:3003/oauth/authorize`

---

## API Documentation

### OAuth Endpoints

- **`GET /oauth/authorize`** - Start OAuth flow
- **`GET /oauth/callback`** - OAuth callback (automatic)
- **`GET /oauth/status?locationId=xxx`** - Check connection status

### Conversation Endpoints

- **`GET /api/conversations/download`** - Download conversations
- **`GET /api/conversations/search`** - Search conversations
- **`GET /api/conversations/:id`** - Get specific conversation

### Message Endpoints

- **`GET /api/messages/:conversationId`** - Get messages
- **`GET /api/messages/:conversationId/download`** - Download as JSON

### Import Endpoints

- **`POST /api/import/upload`** - Upload CSV/Excel file
- **`GET /api/import/template`** - Download CSV template

### Export Endpoints (Advanced)

- **`GET /api/export/messages`** - Export with conversationId & filters
- **`GET /api/export/messages/all`** - Bulk export with auto-pagination
- **`GET /api/export/csv`** - Download as CSV file

---

## Tech Stack

- **Node.js & Express** - Server framework
- **MongoDB** - Database
- **Multer** - File uploads
- **csv-parser** - CSV parsing
- **xlsx** - Excel parsing
- **Axios** - HTTP client

---

## OAuth Setup

1. Create your marketplace app
2. Configure OAuth scopes:
   - `conversations.readonly`
   - `conversations.write`
   - `conversations/message.readonly`
   - `conversations/message.write`
3. Set redirect URI: `http://localhost:3003/oauth/callback`
4. Copy Client ID & Secret to `.env`

---

## Testing

### Test Download Conversations
```bash
curl "http://localhost:3003/api/conversations/download?locationId=YOUR_LOCATION_ID&limit=10"
```

### Test Get Messages
```bash
curl "http://localhost:3003/api/messages/CONVERSATION_ID?locationId=YOUR_LOCATION_ID&limit=50"
```

### Test Advanced Export (with conversationId)
```bash
# Export with pagination
curl "http://localhost:3003/api/export/messages?locationId=YOUR_LOCATION_ID&limit=100&channel=SMS"

# Bulk export all
curl "http://localhost:3003/api/export/messages/all?locationId=YOUR_LOCATION_ID&startDate=2025-01-01&endDate=2025-01-31"

# Download as CSV
curl "http://localhost:3003/api/export/csv?locationId=YOUR_LOCATION_ID&channel=SMS" -o messages.csv
```

### Test Import
```bash
# Download template
curl "http://localhost:3003/api/import/template" -o import.csv

# Edit import.csv with your data

# Upload
curl -X POST \
  -F "file=@import.csv" \
  -F "locationId=YOUR_LOCATION_ID" \
  http://localhost:3003/api/import/upload
```

---

## Project Structure

```
conversations-manager/
├── src/
│   ├── config/
│   │   └── database.js          # MongoDB config
│   ├── models/
│   │   └── OAuthToken.js        # Token model
│   ├── routes/
│   │   ├── oauth.js             # OAuth flow
│   │   ├── conversations.js     # Feature 1
│   │   ├── messages.js          # Feature 2
│   │   └── import.js            # Feature 3
│   ├── services/
│   │   └── ghlService.js        # GHL API integration
│   ├── utils/
│   │   └── logger.js            # Winston logger
│   └── server.js                # Main server
├── uploads/                     # Temp file uploads
├── package.json
├── .env.example
└── README.md
```

---

## No Pricing, No Complexity

This app is **completely free** with no subscription tiers or payment logic. Just three simple features to help you manage GHL conversations.

---

## Support

For questions or issues, refer to the documentation files included in this project.

