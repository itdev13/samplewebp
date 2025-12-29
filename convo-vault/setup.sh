#!/bin/bash

echo "🚀 Setting up GHL Conversations Manager..."

# Create necessary directories
mkdir -p uploads
mkdir -p logs

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
  echo "📝 Creating .env file..."
  cat > .env << EOF
# Server Configuration
NODE_ENV=development
PORT=3003
BASE_URL=http://localhost:3003

# MongoDB
MONGODB_URI=mongodb://localhost:27017/ghl-conversations-manager

# GHL OAuth (Replace with your credentials)
GHL_CLIENT_ID=your_client_id_here
GHL_CLIENT_SECRET=your_client_secret_here
GHL_REDIRECT_URI=http://localhost:3003/oauth/callback

# GHL API
GHL_API_URL=https://services.leadconnectorhq.com
GHL_OAUTH_URL=https://services.leadconnectorhq.com/oauth
EOF
  echo "✅ .env file created"
else
  echo "⚠️  .env file already exists, skipping..."
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Edit .env and add your GHL_CLIENT_ID and GHL_CLIENT_SECRET"
echo "2. Start MongoDB: mongod"
echo "3. Run the app: npm run dev"
echo "4. Visit: http://localhost:3003"
echo ""

