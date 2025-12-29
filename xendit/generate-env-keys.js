// Generate Encryption Keys for .env file

const crypto = require('crypto');

console.log('\n================================================');
console.log('  🔐 Generate Encryption Keys for .env');
console.log('================================================\n');

// Generate 32-byte encryption key (for AES-256)
const encryptionKey = crypto.randomBytes(32).toString('hex');

// Generate 64-byte JWT secret
const jwtSecret = crypto.randomBytes(64).toString('hex');

console.log('Copy these values to your .env file:\n');

console.log('ENCRYPTION_KEY=' + encryptionKey);
console.log('JWT_SECRET=' + jwtSecret);

console.log('\n================================================');
console.log('✅ Keys generated successfully!');
console.log('================================================\n');

console.log('Instructions:');
console.log('1. Open .env file in your editor');
console.log('2. Replace ENCRYPTION_KEY value with the key above');
console.log('3. Replace JWT_SECRET value with the secret above');
console.log('4. Save the file');
console.log('5. Start your server: npm run dev\n');

// Also save to a file for easy copying
const fs = require('fs');
const content = `# Generated Encryption Keys
# Copy these to your .env file

ENCRYPTION_KEY=${encryptionKey}
JWT_SECRET=${jwtSecret}

# Generated on: ${new Date().toISOString()}
`;

fs.writeFileSync('.env.keys', content);
console.log('💾 Keys also saved to .env.keys file for reference\n');
