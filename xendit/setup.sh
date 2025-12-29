#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo "=================================================="
echo "  🚀 GHL Xendit Payment Gateway Setup"
echo "=================================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed!${NC}"
    echo "Please install Node.js 16+ from https://nodejs.org"
    exit 1
fi

echo -e "${GREEN}✅ Node.js installed: $(node --version)${NC}"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ npm installed: $(npm --version)${NC}"
echo ""

# Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm install

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Dependencies installed successfully${NC}"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi

echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found${NC}"
    echo -e "${BLUE}Creating .env from .env.example...${NC}"
    
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✅ .env file created${NC}"
        echo ""
        echo -e "${YELLOW}📝 IMPORTANT: Update these values in .env:${NC}"
        echo "   1. Generate ENCRYPTION_KEY (run: node generate-env-keys.js)"
        echo "   2. Generate JWT_SECRET (run: node generate-env-keys.js)"
        echo "   3. Update BASE_URL with your domain"
        echo ""
        echo -e "${BLUE}Run this to generate keys:${NC}"
        echo "   node generate-env-keys.js"
        echo ""
    else
        echo -e "${RED}❌ .env.example not found${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ .env file exists${NC}"
fi

# Check MongoDB connection
echo ""
echo -e "${BLUE}🔍 Checking MongoDB Atlas connection...${NC}"

# Test MongoDB connection
node -e "
const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://rapiddev21_db_user:MbYeOB8GO76mZzpD@rapiddev.arcpgup.mongodb.net/ghl-xendit', {
  serverSelectionTimeoutMS: 5000
})
.then(() => {
  console.log('✅ MongoDB Atlas connected successfully');
  process.exit(0);
})
.catch(err => {
  console.error('❌ MongoDB connection failed:', err.message);
  process.exit(1);
});
" 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ MongoDB Atlas connection verified${NC}"
else
    echo -e "${RED}❌ MongoDB connection failed${NC}"
    echo "Please check your internet connection"
fi

echo ""
echo "=================================================="
echo -e "${GREEN}✨ Setup Complete!${NC}"
echo "=================================================="
echo ""
echo -e "${BLUE}🎯 Next Steps:${NC}"
echo ""
echo "1. Generate encryption keys (if not done):"
echo -e "   ${YELLOW}node generate-env-keys.js${NC}"
echo ""
echo "2. Start the development server:"
echo -e "   ${YELLOW}npm run dev${NC}"
echo ""
echo "3. Or start in production mode:"
echo -e "   ${YELLOW}npm start${NC}"
echo ""
echo "4. Test the server:"
echo -e "   ${YELLOW}curl http://localhost:3000/health${NC}"
echo ""
echo "=================================================="
echo -e "${GREEN}📚 Documentation:${NC}"
echo "   - START_HERE.md - Quick start guide"
echo "   - QUICKSTART.md - Detailed setup"
echo "   - README.md - Complete documentation"
echo "   - DEPLOYMENT.md - Production deployment"
echo "=================================================="
echo ""
echo -e "${GREEN}🎉 Ready to accept payments!${NC}"
echo ""

