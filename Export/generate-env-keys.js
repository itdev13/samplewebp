const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Generate secure encryption keys for the application
 */
function generateKeys() {
  console.log('🔐 Generating secure encryption keys...\n');

  // Generate encryption key (32 bytes for AES-256)
  const encryptionKey = crypto.randomBytes(32).toString('hex');
  
  // Generate IV (16 bytes for AES)
  const encryptionIV = crypto.randomBytes(16).toString('hex');
  
  // Generate JWT secret (64 bytes)
  const jwtSecret = crypto.randomBytes(64).toString('hex');

  const keysContent = `# Generated Encryption Keys - DO NOT COMMIT TO GIT
# Generated on: ${new Date().toISOString()}
# Add these to your .env file

ENCRYPTION_KEY=${encryptionKey}
ENCRYPTION_IV=${encryptionIV}
JWT_SECRET=${jwtSecret}
`;

  // Save to .env.keys file
  fs.writeFileSync(path.join(__dirname, '.env.keys'), keysContent);

  console.log('✅ Keys generated successfully!\n');
  console.log('📄 Keys saved to: .env.keys\n');
  console.log('⚠️  IMPORTANT: Copy these keys to your .env file\n');
  console.log('🔒 NEVER commit .env.keys or .env to version control\n');
  console.log(keysContent);
}

// Run the key generation
generateKeys();
