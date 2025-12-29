#!/bin/bash

# GHL Conversations Export App - Setup Script
# This script helps you set up the application quickly

set -e

echo "=================================================="
echo "🚀 GHL Conversations Export App - Setup"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check Node.js
echo "Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version must be 18 or higher${NC}"
    echo "Current version: $(node -v)"
    exit 1
fi

echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# Check MongoDB
echo "Checking MongoDB..."
if ! command -v mongod &> /dev/null; then
    echo -e "${YELLOW}⚠️  MongoDB not found locally${NC}"
    echo "You can:"
    echo "  1. Install MongoDB locally"
    echo "  2. Use MongoDB Atlas (cloud)"
    echo ""
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi

# Generate encryption keys
echo ""
echo "🔐 Generating encryption keys..."
node generate-env-keys.js

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Encryption keys generated${NC}"
else
    echo -e "${RED}❌ Failed to generate keys${NC}"
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo "📝 Creating .env file..."
    
    # Copy from .env.keys
    if [ -f .env.keys ]; then
        cp .env.keys .env
        
        # Append other required variables
        cat >> .env << EOF

# Server Configuration
NODE_ENV=development
PORT=3002
APP_URL=http://localhost:3002

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/ghl-conversations-export

# GoHighLevel OAuth Configuration (UPDATE THESE!)
GHL_CLIENT_ID=your_ghl_client_id_here
GHL_CLIENT_SECRET=your_ghl_client_secret_here
GHL_REDIRECT_URI=http://localhost:3002/oauth/callback

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Export Settings
MAX_EXPORT_MESSAGES=50000
EXPORT_STORAGE_PATH=./exports
EXPORT_RETENTION_DAYS=30

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=./logs/app.log
EOF
        
        echo -e "${GREEN}✓ .env file created${NC}"
    else
        echo -e "${RED}❌ .env.keys file not found${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  .env file already exists${NC}"
fi

# Create necessary directories
echo ""
echo "📁 Creating directories..."
mkdir -p exports logs

echo -e "${GREEN}✓ Directories created${NC}"

# Setup complete
echo ""
echo "=================================================="
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "=================================================="
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Update .env file with your GHL credentials:"
echo "   - GHL_CLIENT_ID"
echo "   - GHL_CLIENT_SECRET"
echo ""
echo "2. Start MongoDB (if running locally):"
echo "   mongod"
echo ""
echo "3. Start the development server:"
echo "   npm run dev"
echo ""
echo "4. Visit: http://localhost:3002"
echo ""
echo "📚 Documentation:"
echo "   - README.md - Full documentation"
echo "   - SETUP.md - Detailed setup guide"
echo ""
echo "🆘 Need help?"
echo "   - Check logs in: logs/"
echo "   - Visit: https://docs.yourcompany.com"
echo ""
echo "=================================================="

