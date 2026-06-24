'use strict';
const { generateLicenseKey } = require('./main/crypto');

// Command-line arguments check
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('\x1b[31m%s\x1b[0m', 'Error: No Machine ID provided.');
  console.log('Usage: node keygen.js <Machine-ID> [licenseType] [durationDays]');
  console.log('Examples:');
  console.log('  node keygen.js ABCD-1234');
  console.log('  node keygen.js ABCD-1234 trial 30');
  process.exit(1);
}

const machineId = args[0].trim();
const licenseType = args[1] ? args[1].trim() : 'full';
const durationDays = args[2] ? parseInt(args[2].trim(), 10) : 365;
const timestamp = Date.now();

try {
  const key = generateLicenseKey(machineId, timestamp, licenseType, durationDays);
  console.log('\n\x1b[32m%s\x1b[0m', '=== LICENSE KEY GENERATOR ===');
  console.log(`Machine ID:   \x1b[36m${machineId}\x1b[0m`);
  console.log(`License Type: \x1b[36m${licenseType}\x1b[0m`);
  console.log(`Duration:     \x1b[36m${durationDays} days\x1b[0m`);
  console.log(`Generated:    ${new Date(timestamp).toLocaleString()}`);
  console.log('-----------------------------');
  console.log('\x1b[33m%s\x1b[0m', key);
  console.log('-----------------------------');
  console.log('Copy the yellow key above and send it to the client to activate or renew their software.\n');
} catch (err) {
  console.error('\x1b[31m%s\x1b[0m', `Failed to generate license key: ${err.message}`);
}
