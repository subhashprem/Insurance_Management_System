const { app } = require('electron');
app.setName('insurance-records-management-system');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');

const { machineIdSync } = require('node-machine-id');
const { encryptObject, decryptObject, generateLicenseKey } = require('./main/crypto');

// Command line args
const action = process.argv[2] || 'info';

app.whenReady().then(() => {
  const CONFIG_PATH = path.join(app.getPath('userData'), 'appdata', '.lc');
  const HOME_CONFIG_PATH = path.join(os.homedir(), '.pms_sys_data');
  const DB_PATH = path.join(app.getPath('userData'), 'appdata', 'sysconfig.dat');

  console.log('\n=========================================');
  console.log('=== LICENSE STATE MANUAL TESTING TOOL ===');
  console.log('=========================================');
  console.log('AppData Path:     ', app.getPath('userData'));
  console.log('Home Config Path: ', HOME_CONFIG_PATH);
  console.log('Database Path:    ', DB_PATH);

  const machineId = machineIdSync({ original: true });

  // 1. Helper to save config to all 3 paths
  function saveAll(config) {
    const encrypted = encryptObject(config);
    // Write AppData
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, encrypted, 'utf8');

    // Write Home
    fs.writeFileSync(HOME_CONFIG_PATH, encrypted, 'utf8');

    // Write DB
    try {
      const db = new Database(DB_PATH);
      db.prepare(`
        CREATE TABLE IF NOT EXISTS Config (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `).run();
      db.prepare("INSERT OR REPLACE INTO Config (key, value) VALUES ('lc_data', ?)").run(encrypted);
      db.close();
    } catch (err) {
      console.warn('DB Write skipped/failed:', err.message);
    }

    console.log('Config successfully synced to all 3 backup locations.');
  }

  // 2. Helper to load current config
  function loadCurrent() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        return decryptObject(fs.readFileSync(CONFIG_PATH, 'utf8'));
      }
    } catch {
      // silent
    }
    return null;
  }

  const current = loadCurrent() || {
    machineId,
    installTs: Date.now(),
    expiryTs: Date.now() + 365 * 24 * 60 * 60 * 1000,
    licenseKey: generateLicenseKey(machineId, Date.now()),
    licenseType: 'full',
    trialStarted: false,
    installAlertSent: false,
    firstLoginAlertSent: false,
    notified15Days: false,
    usedKeys: [],
    lastCheckedTs: Date.now()
  };

  if (action === 'info') {
    current.lastCheckedTs = Date.now();
    saveAll(current);
    console.log('\n--- Current License Configuration ---');
    console.log('Machine ID:            ', current.machineId);
    console.log('License Type:          ', current.licenseType || 'full');
    console.log('License Key:           ', current.licenseKey);
    console.log('Activation/Install Date:', new Date(current.installTs).toLocaleString());
    console.log('Expiry Date:           ', new Date(current.expiryTs).toLocaleString());
    const daysLeft = Math.ceil((current.expiryTs - Date.now()) / (24 * 60 * 60 * 1000));
    console.log('Days Remaining:        ', daysLeft);
    console.log('Trial Started:         ', !!current.trialStarted);
    console.log('15-Day Alert Sent:     ', !!current.notified15Days);
    console.log('First Login Alert Sent:', !!current.firstLoginAlertSent);
    console.log('Last Checked Timestamp:', new Date(current.lastCheckedTs).toLocaleString());
    console.log('=====================================\n');
  } 
  else if (action === 'trial') {
    // Reset to a fresh trial, starts countdown strictly on next login
    current.licenseType = 'trial';
    current.trialStarted = false;
    current.installTs = Date.now();
    current.expiryTs = 0;
    current.licenseKey = '';
    current.firstLoginAlertSent = false;
    current.notified15Days = false;
    current.lastCheckedTs = Date.now();
    saveAll(current);
    console.log('\n[SUCCESS]: Reset to fresh 3-day Trial mode.');
    console.log('Open the app and log in; you will see it starts the 3-day countdown on the dashboard settings.');
  } 
  else if (action === '15days') {
    // 15 days remaining warning state
    current.licenseType = 'full';
    current.expiryTs = Date.now() + 15 * 24 * 60 * 60 * 1000 - 60000; // slightly less than 15 days
    current.notified15Days = false; // reset alert to trigger email
    current.firstLoginAlertSent = true; // logged in
    current.lastCheckedTs = Date.now();
    saveAll(current);
    console.log('\n[SUCCESS]: Expiry set to ~14.9 days remaining.');
    console.log('Open the app to verify that:');
    console.log('  1. The top warning banner is visible.');
    console.log('  2. An email notification is sent to the developer.');
  } 
  else if (action === 'expired') {
    // Expired state
    current.expiryTs = Date.now() - 10000; // expired 10 seconds ago
    current.lastCheckedTs = Date.now();
    saveAll(current);
    console.log('\n[SUCCESS]: License set to EXPIRED.');
    console.log('Open the app to verify that a fullscreen lock blocks access and requests renewal.');
  } 
  else if (action === 'tampered') {
    // Simulated system date tampering state
    current.lastCheckedTs = Date.now() + 24 * 60 * 60 * 1000; // tomorrow
    saveAll(current);
    console.log('\n[SUCCESS]: Set last check timestamp to tomorrow to simulate clock tampering.');
    console.log('Open the app to verify the clock-rollback lockout screen blocks operations.');
  } 
  else if (action === 'clear') {
    // Test healing by unlinking files
    try { if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH); } catch {}
    try { if (fs.existsSync(HOME_CONFIG_PATH)) fs.unlinkSync(HOME_CONFIG_PATH); } catch {}
    
    // Also delete license from Database Config table to prevent pre-packaging it
    try {
      const db = new Database(DB_PATH);
      db.prepare("DELETE FROM Config WHERE key = 'lc_data'").run();
      db.close();
      console.log('Database Config key "lc_data" cleared.');
    } catch (err) {
      console.warn('DB license clear skipped/failed:', err.message);
    }
    
    console.log('\n[SUCCESS]: Cleared AppData, Home, and Database licensing configuration.');
    console.log('The application will now behave as a fresh installation on its next launch.');
  } 
  else {
    console.log('\n[ERROR]: Unknown action: ', action);
    console.log('Usage: npx electron test-license.js [info|trial|15days|expired|tampered|clear]');
  }

  app.quit();
});
