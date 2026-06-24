const path = require('path');
const fs = require('fs');
const os = require('os');
const { app, shell } = require('electron');
const { machineIdSync } = require('node-machine-id');
const nodemailer = require('nodemailer');
const { getDb } = require('./database');
const { encryptObject, decryptObject, generateLicenseKey, validateRenewalKey, decrypt } = require('./crypto');
const { getLogger } = require('./logger');


const CONFIG_PATH = path.join(app.getPath('userData'), 'appdata', '.lc');
const HOME_CONFIG_PATH = path.join(os.homedir(), '.pms_sys_data');
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// ==================== DEVELOPER SMTP & ALERTS CONFIG ====================
// To receive automatic installation & expiry notifications, configure your SMTP sender details below.
const SMTP_CONFIG = {
  host: 'smtp.gmail.com',      // Your SMTP provider host (e.g. smtp.gmail.com)
  port: 465,                   // SMTP port (465 for secure SSL, 587 for TLS)
  secure: true,                // true for port 465, false for other ports
  auth: {
    user: 'lalwanisoftwaresolutions@gmail.com',  // The email address that will SEND the notifications
    pass: 'hclf guzi efkn hfna',     // The App Password generated from your Google Account
  }
};

const RECEIVER_EMAIL = 'lalwanisoftwaresolutions@gmail.com, subhashprem4@gmail.com'; // Your email address where you want to receive alerts
const DEVELOPER_WHATSAPP = '923337104578'; // Your WhatsApp number (with country code, e.g. 923XXXXXXXXX)
// ========================================================================

function loadSyncConfig() {
  const log = getLogger();
  let config1 = null;
  let config2 = null;
  let config3 = null;

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      config1 = decryptObject(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (err) {
    log.error(`Failed to read AppData config: ${err.message}`);
  }

  try {
    if (fs.existsSync(HOME_CONFIG_PATH)) {
      config2 = decryptObject(fs.readFileSync(HOME_CONFIG_PATH, 'utf8'));
    }
  } catch (err) {
    log.error(`Failed to read Home config: ${err.message}`);
  }

  try {
    const db = getDb();
    const row = db.prepare("SELECT value FROM Config WHERE key = 'lc_data'").get();
    if (row && row.value) {
      config3 = decryptObject(row.value);
    }
  } catch (err) {
    // Fail silently during early setup or table missing
  }

  const candidates = [config1, config2, config3].filter(c => c && c.machineId);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if ((a.expiryTs || 0) !== (b.expiryTs || 0)) {
      return (b.expiryTs || 0) - (a.expiryTs || 0);
    }
    const aUsed = (a.usedKeys || []).length;
    const bUsed = (b.usedKeys || []).length;
    if (aUsed !== bUsed) {
      return bUsed - aUsed;
    }
    return (b.lastCheckedTs || 0) - (a.lastCheckedTs || 0);
  });

  const bestConfig = candidates[0];
  saveSyncConfig(bestConfig);
  return bestConfig;
}

function saveSyncConfig(obj) {
  if (!obj) return;
  const log = getLogger();
  const encrypted = encryptObject(obj);

  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, encrypted, 'utf8');
  } catch (err) {
    log.error(`Failed to write AppData config: ${err.message}`);
  }

  try {
    const dir = path.dirname(HOME_CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(HOME_CONFIG_PATH, encrypted, 'utf8');
  } catch (err) {
    log.error(`Failed to write Home config: ${err.message}`);
  }

  try {
    const db = getDb();
    db.prepare(`
      CREATE TABLE IF NOT EXISTS Config (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `).run();
    db.prepare("INSERT OR REPLACE INTO Config (key, value) VALUES ('lc_data', ?)").run(encrypted);
  } catch (err) {
    // Fail silently during early setup
  }
}

function getConfig() {
  return loadSyncConfig();
}

function saveConfig(obj) {
  saveSyncConfig(obj);
}


/**
 * Fetch name and contact info of the customer from local database Users table
 */
function getCustomerDetails() {
  try {
    const db = getDb();
    const admins = db.prepare("SELECT name, username, contact, contact_email, contact_number, created_at FROM Users WHERE role = 'admin'").all();

    // Scan all admin accounts. Choose the one that has non-empty email or contact number.
    let chosen = null;
    for (const admin of admins) {
      const contact = admin.contact ? decrypt(admin.contact) : '';
      const email = admin.contact_email ? decrypt(admin.contact_email) : '';
      const number = admin.contact_number ? decrypt(admin.contact_number) : '';

      const realEmail = email || (contact && contact.includes('@') ? contact : '');
      const realNumber = number || (contact && !contact.includes('@') ? contact : '');

      if (realEmail || realNumber) {
        chosen = {
          name: decrypt(admin.name) || 'Admin User',
          username: decrypt(admin.username) || 'admin',
          contact_email: realEmail || 'Not Provided',
          contact_number: realNumber || 'Not Provided',
          created_at: admin.created_at || 'Not Provided'
        };
        break;
      }
    }

    if (chosen) return chosen;

    if (admins.length > 0) {
      const admin = admins[0];
      const contact = admin.contact ? decrypt(admin.contact) : '';
      return {
        name: decrypt(admin.name) || 'Admin User',
        username: decrypt(admin.username) || 'admin',
        contact_email: (admin.contact_email ? decrypt(admin.contact_email) : null) || contact || 'Not Provided',
        contact_number: (admin.contact_number ? decrypt(admin.contact_number) : null) || (contact && !contact.includes('@') ? contact : 'Not Provided'),
        created_at: admin.created_at || 'Not Provided'
      };
    }
  } catch (err) {
    // silent fallback
  }
  return { name: 'Admin User', username: 'admin', contact_email: 'Not Provided', contact_number: 'Not Provided', created_at: 'Not Provided' };
}

/**
 * Send licensing email to developer
 */
async function sendLicenseEmail(subject, text) {
  const log = getLogger();

  if (SMTP_CONFIG.auth.user.includes('your-sender-email') || SMTP_CONFIG.auth.pass.includes('your-gmail-app-password')) {
    log.warn('License Alert email skipped: SMTP credentials not configured by developer.');
    return false;
  }

  const customer = getCustomerDetails();
  const toEmail = RECEIVER_EMAIL;

  try {
    const transporter = nodemailer.createTransport(SMTP_CONFIG);
    const fromName = customer.name || 'Client Admin';
    const fromEmail = customer.contact_email && customer.contact_email.includes('@') ? customer.contact_email : SMTP_CONFIG.auth.user;
    await transporter.sendMail({
      from: `"${fromName}" <${SMTP_CONFIG.auth.user}>`,
      replyTo: fromEmail,
      to: toEmail,
      subject: subject,
      text: text,
    });
    log.info(`License alert email sent successfully: ${subject} to ${toEmail}`);
    return true;
  } catch (err) {
    log.error(`Failed to send license alert email: ${err.message}`);
    return false;
  }
}

/**
 * Handle background alerting (silent retry)
 */
async function sendAlertsInBackground(config, daysLeft) {
  const log = getLogger();
  let updated = false;
  const customer = getCustomerDetails();

  // 1. First run / Installation alert
  if (!config.installAlertSent) {
    log.info('Attempting first-run app installation email alert...');
    const subject = `[INSTALLATION] New Installation - Machine ID: ${config.machineId}`;
    const text = `A new device has installed Insurance Management System of Lalwani Software Solutions.\n\n` +
      `MACHINE & LICENSE DETAILS:\n` +
      `----------------------------------------\n` +
      `Machine ID:          ${config.machineId}\n` +
      `Initial Activation Key: ${config.licenseKey}\n` +
      `Installation Date:   ${new Date(config.installTs).toLocaleString()}\n` +
      `Initial Expiry Date: ${new Date(config.expiryTs).toLocaleDateString('en-GB')}\n` +
      `Days Remaining:      ${daysLeft}\n`;

    const sent = await sendLicenseEmail(subject, text);
    if (sent) {
      config.installAlertSent = true;
      updated = true;
    }
  }

  // 2. 15-day Expiration Alert (with the current active activation key) to the developer.
  // Must check daysLeft > 0 to prevent triggering warning emails when the license has already expired.
  if (daysLeft <= 15 && daysLeft > 0 && !config.notified15Days) {
    log.info('Attempting 15-day license expiration warning email with active key...');
    const subject = `[RENEWAL KEY] License Expiring in ${daysLeft} Days - ID: ${config.machineId}`;
    const text = `A client's software license is expiring soon (${daysLeft} days remaining).\n\n` +
      `CLIENT DETAILS:\n` +
      `----------------------------------------\n` +
      `Customer Name:       ${customer.name}\n` +
      `Operator Username:   ${customer.username}\n` +
      `Contact Email:       ${customer.contact_email}\n` +
      `Contact Number:      ${customer.contact_number}\n` +
      `Account Created At:  ${customer.created_at}\n\n` +
      `LICENSE & MACHINE DETAILS:\n` +
      `----------------------------------------\n` +
      `Machine ID: ${config.machineId}\n` +
      `Activation Key (for renewal): ${config.licenseKey}\n` +
      `Date of Renewal / Expiry: ${new Date(config.expiryTs).toLocaleDateString('en-GB')}\n` +
      `Days Remaining:      ${daysLeft}\n`;

    const sent = await sendLicenseEmail(subject, text);
    if (sent) {
      config.notified15Days = true;
      updated = true;
    }
  }

  if (updated) {
    saveConfig(config);
  }
}

/**
 * Run on every app launch.
 * Returns: { status: 'valid'|'expiring'|'expired'|'tampered', daysLeft: number, licenseKey: string, machineId: string, expiryTs: number, licenseType: string }
 */
function checkLicense() {
  const log = getLogger();
  const machineId = machineIdSync({ original: true });
  let config = getConfig();

  const trialDuration = 3 * 24 * 60 * 60 * 1000; // 3 Days

  if (!config) {
    // First launch — initialize trial configuration
    const installTs = Date.now();
    config = {
      machineId,
      installTs,
      expiryTs: installTs + trialDuration,
      licenseKey: generateLicenseKey(machineId, installTs, 'trial', 3),
      licenseType: 'trial',
      trialStarted: false,
      installAlertSent: false,
      firstLoginAlertSent: false,
      notified15Days: false,
      usedKeys: [],
      lastCheckedTs: installTs
    };
    saveConfig(config);
    log.info(`First launch — trial generated. Target expiry on login: 3 days.`);
  }

  // Ensure properties exist on loaded config (backward compatibility)
  if (config.installAlertSent === undefined) config.installAlertSent = false;
  if (config.firstLoginAlertSent === undefined) config.firstLoginAlertSent = false;
  if (config.notified15Days === undefined) config.notified15Days = false;
  if (config.usedKeys === undefined) config.usedKeys = [];
  if (config.licenseType === undefined) config.licenseType = 'full';
  if (config.lastCheckedTs === undefined) config.lastCheckedTs = config.installTs || Date.now();

  const now = Date.now();

  // Clock tampering check
  if (config.lastCheckedTs && now < config.lastCheckedTs - 300000) {
    log.warn(`System date manipulation detected! Current time: ${new Date(now).toISOString()}, Last checked: ${new Date(config.lastCheckedTs).toISOString()}`);
    return { status: 'tampered', daysLeft: 0, licenseKey: config.licenseKey, machineId, expiryTs: config.expiryTs, licenseType: config.licenseType, activationDate: config.installTs };
  }

  // Update lastCheckedTs
  config.lastCheckedTs = now;
  saveConfig(config);

  let daysLeft = 0;
  if (config.licenseType === 'trial' && !config.trialStarted) {
    daysLeft = 3;
  } else {
    const msLeft = config.expiryTs - now;
    daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  }

  if (daysLeft < 0) daysLeft = 0;

  let status;
  if (daysLeft <= 0) {
    status = 'expired';
  } else if (daysLeft <= 30) {
    status = 'expiring';
  } else {
    status = 'valid';
  }

  log.info(`License check — type: ${config.licenseType}, status: ${status}, daysLeft: ${daysLeft}`);

  // Trigger background alerts
  sendAlertsInBackground(config, daysLeft).catch(err => {
    log.error(`Error in sendAlertsInBackground: ${err.message}`);
  });

  return {
    status,
    daysLeft,
    licenseKey: config.licenseKey,
    machineId,
    expiryTs: config.expiryTs,
    licenseType: config.licenseType,
    activationDate: config.installTs,
    trialStarted: config.trialStarted || false
  };
}

/**
 * Attempt to renew the license with a key provided by the developer.
 */
async function renewLicense(keyInput) {
  const log = getLogger();
  const machineId = machineIdSync({ original: true });

  // 1. Decrypt and check if key matches machine ID
  const details = validateRenewalKey(keyInput, machineId);
  if (!details) {
    log.warn('License renewal failed — invalid key structure or machine mismatch');
    return false;
  }

  const config = getConfig() || {};
  config.usedKeys = config.usedKeys || [];

  // 2. Check if the key has already been used
  if (config.usedKeys.includes(keyInput)) {
    log.warn('License renewal failed — activation key has already been used');
    return false;
  }

  // 3. Mark this key as used immediately
  config.usedKeys.push(keyInput);

  // 4. Carry forward logic
  const durationDays = details.durationDays || 365;
  const currentExpiry = config.expiryTs || 0;
  // If expired, start from now. If active, add to remaining days.
  const baseTs = Math.max(currentExpiry, Date.now());
  config.expiryTs = baseTs + (durationDays * 24 * 60 * 60 * 1000);

  // 5. Update license parameters
  config.licenseType = details.licenseType || 'full';
  config.licenseKey = keyInput;
  if (config.licenseType === 'trial') {
    config.trialStarted = false; // reset trial start for new trial keys if any
  }

  // 6. Reset all warning flags
  config.firstLoginAlertSent = false;
  config.notified15Days = false;
  config.lastCheckedTs = Date.now();

  // 7. Save config
  saveConfig(config);
  log.info(`License activated/renewed successfully. Expiry extended by ${durationDays} days. New Type: ${config.licenseType}`);

  return true;
}


/**
 * Open external WhatsApp link with prefilled alert message
 */
function openWhatsAppAlert(message) {
  const log = getLogger();
  try {
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${DEVELOPER_WHATSAPP}?text=${encoded}`;
    shell.openExternal(url);
    log.info('Opened WhatsApp license alert in external browser');
    return true;
  } catch (err) {
    log.error(`Failed to open WhatsApp alert: ${err.message}`);
    return false;
  }
}

/**
 * Run on successful login.
 * Sends installation details to developer if not already sent.
 */
async function handleLoginAlerts(userRole, loggedInUser) {
  const log = getLogger();
  if (userRole === 'developer') {
    log.info('Developer login detected, skipping license email alerts.');
    return;
  }
  const config = getConfig();
  if (!config) return;

  if (config.licenseType === 'trial' && !config.trialStarted) {
    config.trialStarted = true;
    config.trialStartTs = Date.now();
    config.expiryTs = config.trialStartTs + 3 * 24 * 60 * 60 * 1000;
    config.lastCheckedTs = Date.now();
    saveConfig(config);
    log.info(`Trial started at login! Expiry set to: ${new Date(config.expiryTs).toISOString()}`);
  }

  const isRenewal = config.usedKeys && config.usedKeys.length > 0;

  let customer;
  if (loggedInUser) {
    customer = {
      name: decrypt(loggedInUser.name) || 'Admin User',
      username: decrypt(loggedInUser.username) || 'admin',
      contact_email: (loggedInUser.contact_email ? decrypt(loggedInUser.contact_email) : null) || (loggedInUser.contact ? decrypt(loggedInUser.contact) : '') || 'Not Provided',
      contact_number: (loggedInUser.contact_number ? decrypt(loggedInUser.contact_number) : null) || (loggedInUser.contact && !decrypt(loggedInUser.contact).includes('@') ? decrypt(loggedInUser.contact) : '') || 'Not Provided',
      created_at: loggedInUser.created_at || 'Not Provided'
    };
  } else {
    customer = getCustomerDetails();
  }

  const now = Date.now();
  const msLeft = config.expiryTs - now;
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));

  if (!config.firstLoginAlertSent) {
    log.info(`Successful login for role: ${userRole}. Attempting first login email notification...`);

    const subject = isRenewal
      ? `[RENEWAL LOGIN] First Login After Renewal - User: ${customer.username}`
      : `[FIRST LOGIN] First Login After Installation - User: ${customer.username}`;

    const text = (isRenewal
      ? `A client has logged in for the first time after renewing Insurance Management System.\n\n`
      : `A client has logged in for the first time after installing Insurance Management System.\n\n`) +
      `CLIENT DETAILS:\n` +
      `----------------------------------------\n` +
      `Customer Name:       ${customer.name}\n` +
      `Operator Username:   ${customer.username}\n` +
      `Contact Email:       ${customer.contact_email}\n` +
      `Contact Number:      ${customer.contact_number}\n` +
      `Account Created At:  ${customer.created_at}\n\n` +
      `MACHINE & LICENSE DETAILS:\n` +
      `----------------------------------------\n` +
      `Machine ID:          ${config.machineId}\n` +
      `Activation Key:      ${config.licenseKey}\n` +
      `Software Created At: ${new Date(config.installTs).toLocaleString()}\n` +
      `Date of Renewal / Expiry: ${new Date(config.expiryTs).toLocaleDateString('en-GB')}\n` +
      `Days Remaining:      ${daysLeft}\n` +
      `Login Date/Time:     ${new Date().toLocaleString()}\n`;

    const sent = await sendLicenseEmail(subject, text);
    if (sent) {
      config.firstLoginAlertSent = true;
      saveConfig(config);
    }
  }
}

async function sendNewUserCredentialsEmail(toEmail, name, userName, plainPassword) {
  const log = getLogger();
  if (SMTP_CONFIG.auth.user.includes('your-sender-email') || SMTP_CONFIG.auth.pass.includes('your-gmail-app-password')) {
    log.warn('Account Credentials email skipped: SMTP credentials not configured.');
    return false;
  }
  try {
    const transporter = nodemailer.createTransport(SMTP_CONFIG);
    const subject = 'Welcome to Lalwani Software Solutions - Your Account Details';
    const text = `Dear ${name},\n\n` +
      `Thank You For Choosing Lalwani Software Solutions! \n` +
      `Your account has been created successfully in Insurance Management System.\n\n` +
      `Here are your login credentials:\n` +
      `Username: ${userName}\n` +
      `Password: ${plainPassword}\n\n` +
      `Please install the application in your PC and login using the credentials mentioned above.\n\n` +
      `Best regards,\n` +
      `Lalwani Software Solutions\n` +
      `Phone: 03337104578 / 03152967527\n` +
      `Email: lalwanisoftwaresolutions@gmail.com`;

    await transporter.sendMail({
      from: `"Lalwani Software Solutions" <${SMTP_CONFIG.auth.user}>`,
      to: toEmail,
      subject: subject,
      text: text,
    });
    log.info(`Account credentials email sent to ${toEmail}`);
    return true;
  } catch (err) {
    log.error(`Failed to send account credentials email to ${toEmail}: ${err.message}`);
    return false;
  }
}

module.exports = { checkLicense, renewLicense, openWhatsAppAlert, handleLoginAlerts, sendNewUserCredentialsEmail, getConfig };
