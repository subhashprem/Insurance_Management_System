const path = require('path');
const fs = require('fs');

const activeDbPath = path.join(
  process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming'),
  'insurance-records-management-system',
  'appdata',
  'sysconfig.dat'
);

const targetPath = path.join(__dirname, 'sysconfig.dat');

console.log(`Checking active database file at: ${activeDbPath}`);

if (fs.existsSync(activeDbPath)) {
  try {
    // Since this script is run via Electron in npm scripts, we can safely load better-sqlite3
    const Database = require('better-sqlite3');
    const db = new Database(activeDbPath, { readonly: true });
    
    console.log('Starting SQLite native backup to project root...');
    db.backup(targetPath)
      .then(() => {
        console.log(`✅ Successfully backed up active database to project root at: ${targetPath}`);
        console.log('This database configuration will now be pre-packaged inside your client setup installers.');
        db.close();
        process.exit(0);
      })
      .catch(err => {
        console.error(`❌ SQLite native backup failed: ${err.message}`);
        db.close();
        process.exit(1);
      });
  } catch (err) {
    console.error(`❌ Failed to copy database file: ${err.message}`);
    process.exit(1);
  }
} else {
  console.log('⚠️ No active local database found in AppData to copy. Packaging will fallback to initial defaults.');
  process.exit(0);
}
