'use strict';
const { ipcMain, shell, dialog, app } = require('electron');
const path   = require('path');
const fs     = require('fs');
const bcrypt = require('bcrypt');

const { getDb, decryptRow, seedSampleData, closeDb }  = require('./database');
const { encrypt, decrypt }   = require('./crypto');
const { getLogger }          = require('./logger');
const { checkLicense, renewLicense, openWhatsAppAlert, sendNewUserCredentialsEmail, getConfig } = require('./licenseManager');

function formatDbDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/* ─── Encrypted field maps per table ─── */
const ENC = {
  Users:            ['name', 'username', 'contact', 'contact_email', 'contact_number'],
  Area_Managers:    ['am_name', 'cnic', 'address', 'contact_1', 'contact_2', 'relation', 'registration_no'],
  SSM:              ['ssm_name', 'cnic', 'address', 'contact_1', 'contact_2', 'relation', 'registration_no'],
  SM:               ['sm_name',  'cnic', 'address', 'contact_1', 'contact_2', 'relation', 'registration_no'],
  SR:               ['sr_name',  'cnic', 'address', 'contact_1', 'contact_2', 'relation', 'registration_no'],
  Proposer_Register:['holder_name', 'pr_no', 'contact_1', 'contact_2'],
  Policy_Register:  ['holder_name', 'cnic', 'address', 'contact_1', 'contact_2', 'policy_no', 'relation'],
};

function log() { return getLogger(); }

/* ──────────────────────────── VALIDATION HELPERS ──────────────────────────── */
function validateCnic(val) {
  if (!val) return false;
  const digits = val.replace(/-/g, '');
  return /^\d{13}$/.test(digits) && /^\d{5}-\d{7}-\d{1}$/.test(val);
}

function validatePhone(val) {
  if (!val) return true; // Phone contact can be optional
  return /^\d{11,12}$/.test(val);
}

function validateDate(val) {
  if (!val) return true; // Optional date fields
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const t = Date.parse(val);
  return !isNaN(t);
}

function validateDOBAge(dob) {
  if (!dob) return true;
  if (!validateDate(dob)) return false;
  const birth = new Date(dob);
  const today = new Date();
  if (birth > today) return false;
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 && age <= 120;
}

function validateName(val) {
  if (!val) return false;
  return /^[A-Za-z\s.\-]+$/.test(val);
}

function validateCode(val) {
  if (!val) return false;
  return /^[A-Z0-9\-_]+$/.test(val);
}

function validateAmount(val) {
  if (val === undefined || val === null || val === '') return false;
  const numStr = String(val);
  if (!/^\d+(\.\d{1,2})?$/.test(numStr)) return false;
  const num = parseFloat(numStr);
  return num >= 0;
}

function isDuplicateEncrypted(table, column, value, excludeId = null) {
  if (!value) return false;
  const db = getDb();
  const rows = db.prepare(`SELECT id, ${column} FROM ${table}`).all();
  for (const row of rows) {
    if (excludeId !== null && row.id === excludeId) continue;
    const decryptedValue = decrypt(row[column]);
    if (decryptedValue && decryptedValue.trim().toLowerCase() === value.trim().toLowerCase()) {
      return true;
    }
  }
  return false;
}

function isDuplicatePlain(table, column, value, excludeId = null) {
  if (!value) return false;
  const db = getDb();
  let sql = `SELECT id FROM ${table} WHERE LOWER(${column}) = ?`;
  const params = [value.trim().toLowerCase()];
  if (excludeId !== null) {
    sql += ` AND id != ?`;
    params.push(excludeId);
  }
  const row = db.prepare(sql).get(...params);
  return !!row;
}

function validateAreaManager(data, id = null) {
  data.am_code = (data.am_code || '').trim().toUpperCase();
  data.am_name = (data.am_name || '').trim().replace(/\s+/g, ' ');
  data.cnic = (data.cnic || '').trim();
  data.contact_1 = (data.contact_1 || '').trim();
  data.contact_2 = (data.contact_2 || '').trim();
  data.relation = (data.relation || '').trim().replace(/\s+/g, ' ');
  data.registration_no = (data.registration_no || '').trim().toUpperCase();

  if (!data.am_code || !data.am_name || !data.cnic) {
    return { ok: false, error: '⚠ Required Field Missing' };
  }
  if (!validateCode(data.am_code)) {
    return { ok: false, error: '⚠ Invalid AM Code' };
  }
  if (!validateName(data.am_name)) {
    return { ok: false, error: '⚠ Invalid Name' };
  }
  if (!validateCnic(data.cnic)) {
    return { ok: false, error: '⚠ Invalid CNIC' };
  }
  if (!validatePhone(data.contact_1) || !validatePhone(data.contact_2)) {
    return { ok: false, error: '⚠ Invalid Phone Number' };
  }
  if (!validateDOBAge(data.dob)) {
    return { ok: false, error: '⚠ Invalid Date' };
  }
  if (data.registration_date && !validateDate(data.registration_date)) {
    return { ok: false, error: '⚠ Invalid Date' };
  }

  if (isDuplicatePlain('Area_Managers', 'am_code', data.am_code, id)) {
    return { ok: false, error: '⚠ Duplicate Record Found' };
  }
  if (isDuplicateEncrypted('Area_Managers', 'cnic', data.cnic, id)) {
    return { ok: false, error: '⚠ Duplicate Record Found' };
  }
  if (data.registration_no && isDuplicateEncrypted('Area_Managers', 'registration_no', data.registration_no, id)) {
    return { ok: false, error: '⚠ Duplicate Record Found' };
  }

  return { ok: true };
}

function validateSSM(data, id = null) {
  data.ssm_code = (data.ssm_code || '').trim().toUpperCase();
  data.ssm_name = (data.ssm_name || '').trim().replace(/\s+/g, ' ');
  data.cnic = (data.cnic || '').trim();
  data.contact_1 = (data.contact_1 || '').trim();
  data.contact_2 = (data.contact_2 || '').trim();
  data.relation = (data.relation || '').trim().replace(/\s+/g, ' ');
  data.registration_no = (data.registration_no || '').trim().toUpperCase();

  if (!data.ssm_code || !data.ssm_name || !data.cnic) {
    return { ok: false, error: '⚠ Required Field Missing' };
  }
  if (!validateCode(data.ssm_code)) {
    return { ok: false, error: '⚠ Invalid SSM Code' };
  }
  if (!validateName(data.ssm_name)) {
    return { ok: false, error: '⚠ Invalid Name' };
  }
  if (!validateCnic(data.cnic)) {
    return { ok: false, error: '⚠ Invalid CNIC' };
  }
  if (!validatePhone(data.contact_1) || !validatePhone(data.contact_2)) {
    return { ok: false, error: '⚠ Invalid Phone Number' };
  }
  if (!validateDOBAge(data.dob)) {
    return { ok: false, error: '⚠ Invalid Date' };
  }
  if (data.registration_date && !validateDate(data.registration_date)) {
    return { ok: false, error: '⚠ Invalid Date' };
  }

  if (isDuplicatePlain('SSM', 'ssm_code', data.ssm_code, id)) {
    return { ok: false, error: '⚠ Duplicate Record Found' };
  }
  if (isDuplicateEncrypted('SSM', 'cnic', data.cnic, id)) {
    return { ok: false, error: '⚠ Duplicate Record Found' };
  }
  if (data.registration_no && isDuplicateEncrypted('SSM', 'registration_no', data.registration_no, id)) {
    return { ok: false, error: '⚠ Duplicate Record Found' };
  }

  return { ok: true };
}

function validateSM(data, id = null) {
  data.sm_code = (data.sm_code || '').trim().toUpperCase();
  data.sm_name = (data.sm_name || '').trim().replace(/\s+/g, ' ');
  data.cnic = (data.cnic || '').trim();
  data.contact_1 = (data.contact_1 || '').trim();
  data.contact_2 = (data.contact_2 || '').trim();
  data.relation = (data.relation || '').trim().replace(/\s+/g, ' ');
  data.registration_no = (data.registration_no || '').trim().toUpperCase();

  if (!data.sm_code || !data.sm_name || !data.cnic) {
    return { ok: false, error: '⚠ Required Field Missing' };
  }
  if (!validateCode(data.sm_code)) {
    return { ok: false, error: '⚠ Invalid SM Code' };
  }
  if (!validateName(data.sm_name)) {
    return { ok: false, error: '⚠ Invalid Name' };
  }
  if (!validateCnic(data.cnic)) {
    return { ok: false, error: '⚠ Invalid CNIC' };
  }
  if (!validatePhone(data.contact_1) || !validatePhone(data.contact_2)) {
    return { ok: false, error: '⚠ Invalid Phone Number' };
  }
  if (!validateDOBAge(data.dob)) {
    return { ok: false, error: '⚠ Invalid Date' };
  }
  if (data.registration_date && !validateDate(data.registration_date)) {
    return { ok: false, error: '⚠ Invalid Date' };
  }

  if (isDuplicatePlain('SM', 'sm_code', data.sm_code, id)) {
    return { ok: false, error: '⚠ Duplicate Record Found' };
  }
  if (isDuplicateEncrypted('SM', 'cnic', data.cnic, id)) {
    return { ok: false, error: '⚠ Duplicate Record Found' };
  }
  if (data.registration_no && isDuplicateEncrypted('SM', 'registration_no', data.registration_no, id)) {
    return { ok: false, error: '⚠ Duplicate Record Found' };
  }

  return { ok: true };
}

function validateSR(data, id = null) {
  data.sr_code = (data.sr_code || '').trim().toUpperCase();
  data.sr_name = (data.sr_name || '').trim().replace(/\s+/g, ' ');
  data.cnic = (data.cnic || '').trim();
  data.contact_1 = (data.contact_1 || '').trim();
  data.contact_2 = (data.contact_2 || '').trim();
  data.relation = (data.relation || '').trim().replace(/\s+/g, ' ');
  data.registration_no = (data.registration_no || '').trim().toUpperCase();

  if (!data.sr_code || !data.sr_name || !data.cnic) {
    return { ok: false, error: '⚠ Required Field Missing' };
  }
  if (!validateCode(data.sr_code)) {
    return { ok: false, error: '⚠ Invalid SR Code' };
  }
  if (!validateName(data.sr_name)) {
    return { ok: false, error: '⚠ Invalid Name' };
  }
  if (!validateCnic(data.cnic)) {
    return { ok: false, error: '⚠ Invalid CNIC' };
  }
  if (!validatePhone(data.contact_1) || !validatePhone(data.contact_2)) {
    return { ok: false, error: '⚠ Invalid Phone Number' };
  }
  if (!validateDOBAge(data.dob)) {
    return { ok: false, error: '⚠ Invalid Date' };
  }
  if (data.registration_date && !validateDate(data.registration_date)) {
    return { ok: false, error: '⚠ Invalid Date' };
  }

  if (isDuplicatePlain('SR', 'sr_code', data.sr_code, id)) {
    return { ok: false, error: '⚠ Duplicate Record Found' };
  }
  if (isDuplicateEncrypted('SR', 'cnic', data.cnic, id)) {
    return { ok: false, error: '⚠ Duplicate Record Found' };
  }
  if (data.registration_no && isDuplicateEncrypted('SR', 'registration_no', data.registration_no, id)) {
    return { ok: false, error: '⚠ Duplicate Record Found' };
  }

  return { ok: true };
}

function validateProposer(data, id = null) {
  data.proposal_no = (data.proposal_no || '').trim().toUpperCase();
  data.holder_name = (data.holder_name || '').trim().replace(/\s+/g, ' ');
  data.contact_1 = (data.contact_1 || '').trim();
  data.contact_2 = (data.contact_2 || '').trim();
  data.pr_no = (data.pr_no || '').trim().toUpperCase();

  if (!data.proposal_no || !data.holder_name || data.premium === undefined || data.premium === null || data.premium === '') {
    return { ok: false, error: '⚠ Required Field Missing' };
  }
  if (!validateCode(data.proposal_no)) {
    return { ok: false, error: '⚠ Invalid Proposal Number' };
  }
  if (!validateName(data.holder_name)) {
    return { ok: false, error: '⚠ Invalid Name' };
  }
  if (!validatePhone(data.contact_1) || !validatePhone(data.contact_2)) {
    return { ok: false, error: '⚠ Invalid Phone Number' };
  }
  if (data.pr_no && !validateCode(data.pr_no)) {
    return { ok: false, error: '⚠ Invalid PR Number' };
  }
  if (data.pr_date && !validateDate(data.pr_date)) {
    return { ok: false, error: '⚠ Invalid Date' };
  }
  if (!validateAmount(data.premium)) {
    return { ok: false, error: '⚠ Invalid Premium / Amount' };
  }

  if (isDuplicatePlain('Proposer_Register', 'proposal_no', data.proposal_no, id)) {
    return { ok: false, error: '⚠ Duplicate Record Found' };
  }

  return { ok: true };
}

function validatePolicy(data, id = null) {
  data.policy_no = (data.policy_no || '').trim().toUpperCase();
  data.holder_name = (data.holder_name || '').trim().replace(/\s+/g, ' ');
  data.cnic = (data.cnic || '').trim();
  data.contact_1 = (data.contact_1 || '').trim();
  data.contact_2 = (data.contact_2 || '').trim();
  data.relation = (data.relation || '').trim().replace(/\s+/g, ' ');

  if (!data.policy_no || !data.holder_name || !data.cnic || data.premium === undefined || data.premium === null || data.premium === '' || !data.issue_date) {
    return { ok: false, error: '⚠ Required Field Missing' };
  }
  if (!validateCode(data.policy_no)) {
    return { ok: false, error: '⚠ Invalid Policy Number' };
  }
  if (!validateName(data.holder_name)) {
    return { ok: false, error: '⚠ Invalid Name' };
  }
  if (!validateCnic(data.cnic)) {
    return { ok: false, error: '⚠ Invalid CNIC' };
  }
  if (!validatePhone(data.contact_1) || !validatePhone(data.contact_2)) {
    return { ok: false, error: '⚠ Invalid Phone Number' };
  }
  if (!validateDOBAge(data.dob)) {
    return { ok: false, error: '⚠ Invalid Date' };
  }
  if (!validateDate(data.issue_date)) {
    return { ok: false, error: '⚠ Invalid Date' };
  }
  if (data.due_date && !validateDate(data.due_date)) {
    return { ok: false, error: '⚠ Invalid Date' };
  }
  if (data.last_paid_date && !validateDate(data.last_paid_date)) {
    return { ok: false, error: '⚠ Invalid Date' };
  }
  if (!validateAmount(data.premium)) {
    return { ok: false, error: '⚠ Invalid Premium / Amount' };
  }

  if (isDuplicateEncrypted('Policy_Register', 'policy_no', data.policy_no, id)) {
    return { ok: false, error: '⚠ Duplicate Record Found' };
  }

  return { ok: true };
}


/* ──────────────────────────── AUTH ──────────────────────────── */
function handleAuth() {
  ipcMain.handle('auth:login', async (_e, { username, password }) => {
    const db = getDb();
    try {
      const rows = db.prepare('SELECT * FROM Users WHERE status = ?').all('active');
      for (const row of rows) {
        const decName = decrypt(row.username);
        if (decName === username) {
          const ok = await bcrypt.compare(password, row.password_hash);
          if (ok) {
            log().info(`Login success — user: ${username}, role: ${row.role}`);
            
            const { handleLoginAlerts } = require('./licenseManager');
            handleLoginAlerts(row.role, row).catch(err => {
              log().error(`Error in handleLoginAlerts: ${err.message}`);
            });

            return { ok: true, user: { id: row.user_id, name: decrypt(row.name), username: decName, role: row.role } };
          }
        }
      }
      log().warn(`Login failed — username: ${username}`);
      return { ok: false, error: 'Invalid credentials, please try again.' };
    } catch (err) {
      log().error(`Login error: ${err.message}`);
      return { ok: false, error: 'An error occurred. Please try again.' };
    }
  });
}

/* ──────────────────────────── LICENSE ──────────────────────────── */
function handleLicense() {
  ipcMain.handle('license:check', () => checkLicense());
  ipcMain.handle('license:renew', (_e, key) => renewLicense(key));
  ipcMain.handle('license:openWhatsAppAlert', (_e, msg) => openWhatsAppAlert(msg));
  ipcMain.handle('license:validateKey', (_e, keyInput) => {
    try {
      const { machineIdSync } = require('node-machine-id');
      const machineId = machineIdSync({ original: true });
      const { validateRenewalKey } = require('./crypto');
      const config = getConfig() || {};
      config.usedKeys = config.usedKeys || [];

      if (config.usedKeys.includes(keyInput)) {
        return { valid: false, error: 'License key has already been used.' };
      }

      const details = validateRenewalKey(keyInput, machineId);
      if (!details) {
        return { valid: false, error: 'Invalid license key for this machine.' };
      }

      // Carry forward logic simulation
      const currentExpiry = config.expiryTs || 0;
      const baseTs = Math.max(currentExpiry, Date.now());
      const newExpiryTs = baseTs + (details.durationDays * 24 * 60 * 60 * 1000);

      return {
        valid: true,
        licenseType: details.licenseType,
        durationDays: details.durationDays,
        newExpiryTs
      };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  });
}

/* ──────────────────────────── USERS ──────────────────────────── */
function handleUsers() {
  ipcMain.handle('users:list', () => {
    const rows = getDb().prepare('SELECT user_id, name, username, role, status, contact, contact_email, contact_number, created_at FROM Users ORDER BY user_id').all();
    return rows.map(r => decryptRow(r, ['name', 'username', 'contact', 'contact_email', 'contact_number']));
  });

  ipcMain.handle('users:create', async (_e, { name, username, password, role, status, contact_email, contact_number }) => {
    const db   = getDb();
    const hash = await bcrypt.hash(password, 10);
    try {
      db.prepare('INSERT INTO Users (name, username, password_hash, role, status, contact_email, contact_number) VALUES (?,?,?,?,?,?,?)')
        .run(encrypt(name), encrypt(username), hash, role, status, encrypt(contact_email || ''), encrypt(contact_number || ''));
      log().info(`User created: ${username}`);
      
      if (contact_email) {
        sendNewUserCredentialsEmail(contact_email, name, username, password).catch(err => {
          log().error(`Failed to send credentials email for new user ${username}: ${err.message}`);
        });
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('users:update', async (_e, data) => {
    const db = getDb();
    const { user_id, id, name, username, role, status, password, contact_email, contact_number } = data;
    const targetId = id || user_id;
    try {
      if (password) {
        const hash = await bcrypt.hash(password, 10);
        db.prepare('UPDATE Users SET name=?, username=?, role=?, status=?, contact_email=?, contact_number=?, password_hash=? WHERE user_id=?')
          .run(encrypt(name), encrypt(username), role, status, encrypt(contact_email || ''), encrypt(contact_number || ''), hash, targetId);
      } else {
        db.prepare('UPDATE Users SET name=?, username=?, role=?, status=?, contact_email=?, contact_number=? WHERE user_id=?')
          .run(encrypt(name), encrypt(username), role, status, encrypt(contact_email || ''), encrypt(contact_number || ''), targetId);
      }
      log().info(`User updated: id=${targetId}`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('users:delete', (_e, id) => {
    const db = getDb();
    const row = db.prepare('SELECT role FROM Users WHERE user_id=?').get(id);
    if (!row || row.role === 'developer') return { ok: false, error: 'Cannot delete this account.' };
    db.prepare('DELETE FROM Users WHERE user_id=?').run(id);
    log().info(`User deleted: id=${id}`);
    return { ok: true };
  });

  ipcMain.handle('users:changePassword', async (_e, { id, currentPassword, newPassword }) => {
    const db  = getDb();
    const row = db.prepare('SELECT password_hash FROM Users WHERE user_id=?').get(id);
    if (!row) return { ok: false, error: 'User not found.' };
    const ok = await bcrypt.compare(currentPassword, row.password_hash);
    if (!ok) return { ok: false, error: 'Current password is incorrect.' };
    const hash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE Users SET password_hash=? WHERE user_id=?').run(hash, id);
    log().info(`Password changed: id=${id}`);
    return { ok: true };
  });

  ipcMain.handle('users:updateProfile', (_e, { id, name, username }) => {
    const db = getDb();
    try {
      // Check username uniqueness
      const existing = getDb().prepare('SELECT * FROM Users').all();
      for (const r of existing) {
        if (r.user_id !== id && decrypt(r.username) === username) {
          return { ok: false, error: 'Username already taken.' };
        }
      }
      db.prepare('UPDATE Users SET name=?, username=? WHERE user_id=?')
        .run(encrypt(name), encrypt(username), id);
      log().info(`Profile updated: id=${id}`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

/* ──────────────────────────── AREA MANAGERS ──────────────────────────── */
function handleAreaManagers() {
  const fields = ENC.Area_Managers;

  ipcMain.handle('am:list', () => {
    const db  = getDb();
    const rows = db.prepare('SELECT * FROM Area_Managers ORDER BY id').all();
    return rows.map(r => ({
      ...decryptRow(r, fields),
      no_of_ssms: db.prepare('SELECT COUNT(*) as c FROM SSM WHERE am_id=?').get(r.id)?.c ?? 0,
      no_of_sms:  db.prepare('SELECT COUNT(*) as c FROM SM  WHERE am_id=?').get(r.id)?.c ?? 0,
      no_of_srs:  db.prepare('SELECT COUNT(*) as c FROM SR  WHERE am_id=?').get(r.id)?.c ?? 0,
      total_business: db.prepare(`SELECT COALESCE(SUM(pr.premium),0) as t FROM Policy_Register pr
        JOIN SR sr ON pr.sr_id=sr.id WHERE sr.am_id=?`).get(r.id)?.t ?? 0,
      second_year_premium: db.prepare(`SELECT COALESCE(SUM(pr.premium),0) as t FROM Policy_Register pr
        JOIN SR sr ON pr.sr_id=sr.id WHERE sr.am_id=?
        AND pr.last_paid_date IS NOT NULL
        AND pr.last_paid_date >= date(pr.due_date, '+1 year')
        AND pr.last_paid_date < date(pr.due_date, '+2 year')`).get(r.id)?.t ?? 0,
    }));
  });

  ipcMain.handle('am:create', (_e, data) => {
    const db = getDb();
    const val = validateAreaManager(data);
    if (!val.ok) return val;
    try {
      db.prepare('INSERT INTO Area_Managers (am_code,am_name,address,cnic,contact_1,contact_2,status,relation,registration_no,registration_date,dob) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(data.am_code, encrypt(data.am_name), encrypt(data.address), encrypt(data.cnic), encrypt(data.contact_1), encrypt(data.contact_2), data.status || 'active', encrypt(data.relation || ''), encrypt(data.registration_no || ''), data.registration_date || null, data.dob || null);
      log().info(`AM created: ${data.am_code}`);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('am:update', (_e, data) => {
    const db = getDb();
    const val = validateAreaManager(data, data.id);
    if (!val.ok) return val;
    try {
      db.prepare('UPDATE Area_Managers SET am_code=?,am_name=?,address=?,cnic=?,contact_1=?,contact_2=?,status=?,relation=?,registration_no=?,registration_date=?,dob=? WHERE id=?')
        .run(data.am_code, encrypt(data.am_name), encrypt(data.address), encrypt(data.cnic), encrypt(data.contact_1), encrypt(data.contact_2), data.status, encrypt(data.relation || ''), encrypt(data.registration_no || ''), data.registration_date || null, data.dob || null, data.id);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('am:delete', (_e, id) => {
    const db = getDb();
    try {
      db.transaction(() => {
        db.prepare('UPDATE SSM SET am_id = NULL WHERE am_id = ?').run(id);
        db.prepare('UPDATE SM SET am_id = NULL WHERE am_id = ?').run(id);
        db.prepare('UPDATE SR SET am_id = NULL WHERE am_id = ?').run(id);
        db.prepare('DELETE FROM Area_Managers WHERE id = ?').run(id);
      })();
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });
}

/* ──────────────────────────── SSM ──────────────────────────── */
function handleSSM() {
  const fields = ENC.SSM;

  ipcMain.handle('ssm:list', () => {
    const db   = getDb();
    const rows = db.prepare('SELECT ssm.*, am.am_code FROM SSM ssm LEFT JOIN Area_Managers am ON ssm.am_id=am.id ORDER BY ssm.id').all();
    return rows.map(r => ({
      ...decryptRow(r, fields),
      no_of_sms: db.prepare('SELECT COUNT(*) as c FROM SM WHERE ssm_id=?').get(r.id)?.c ?? 0,
      no_of_srs: db.prepare('SELECT COUNT(*) as c FROM SR WHERE ssm_id=?').get(r.id)?.c ?? 0,
      total_business: db.prepare(`SELECT COALESCE(SUM(premium),0) as t FROM Policy_Register WHERE ssm_id=?`).get(r.id)?.t ?? 0,
      second_year_premium: db.prepare(`SELECT COALESCE(SUM(premium),0) as t FROM Policy_Register WHERE ssm_id=?
        AND last_paid_date IS NOT NULL
        AND last_paid_date >= date(due_date, '+1 year')
        AND last_paid_date < date(due_date, '+2 year')`).get(r.id)?.t ?? 0,
    }));
  });

  ipcMain.handle('ssm:create', (_e, data) => {
    const db = getDb();
    const val = validateSSM(data);
    if (!val.ok) return val;
    try {
      db.prepare(`INSERT INTO SSM (ssm_code,ssm_name,address,cnic,contact_1,contact_2,am_id,status,cnic_pic,nominee_cnic_pic,matric_cert,intermediate_cert,degree_cert,relation,registration_no,registration_date,passport_pic,dob)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(data.ssm_code, encrypt(data.ssm_name), encrypt(data.address), encrypt(data.cnic), encrypt(data.contact_1), encrypt(data.contact_2), data.am_id || null, data.status || 'active',
          data.cnic_pic || null, data.nominee_cnic_pic || null, data.matric_cert || null, data.intermediate_cert || null, data.degree_cert || null, encrypt(data.relation || ''), encrypt(data.registration_no || ''), data.registration_date || null, data.passport_pic || null, data.dob || null);
      log().info(`SSM created: ${data.ssm_code}`);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('ssm:update', (_e, data) => {
    const db = getDb();
    const val = validateSSM(data, data.id);
    if (!val.ok) return val;
    try {
      db.prepare(`UPDATE SSM SET ssm_code=?,ssm_name=?,address=?,cnic=?,contact_1=?,contact_2=?,am_id=?,status=?,
        cnic_pic=?,nominee_cnic_pic=?,matric_cert=?,intermediate_cert=?,degree_cert=?,relation=?,registration_no=?,registration_date=?,passport_pic=?,dob=? WHERE id=?`)
        .run(data.ssm_code, encrypt(data.ssm_name), encrypt(data.address), encrypt(data.cnic), encrypt(data.contact_1), encrypt(data.contact_2), data.am_id || null, data.status,
          data.cnic_pic || null, data.nominee_cnic_pic || null, data.matric_cert || null, data.intermediate_cert || null, data.degree_cert || null, encrypt(data.relation || ''), encrypt(data.registration_no || ''), data.registration_date || null, data.passport_pic || null, data.dob || null, data.id);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('ssm:delete', (_e, id) => {
    const db = getDb();
    try {
      db.transaction(() => {
        db.prepare('UPDATE SM SET ssm_id = NULL WHERE ssm_id = ?').run(id);
        db.prepare('UPDATE SR SET ssm_id = NULL WHERE ssm_id = ?').run(id);
        db.prepare('UPDATE Proposer_Register SET ssm_id = NULL WHERE ssm_id = ?').run(id);
        db.prepare('UPDATE Policy_Register SET ssm_id = NULL WHERE ssm_id = ?').run(id);
        db.prepare('UPDATE Second_Year_Log SET ssm_id = NULL WHERE ssm_id = ?').run(id);
        db.prepare('DELETE FROM SSM WHERE id = ?').run(id);
      })();
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });
}

/* ──────────────────────────── SM ──────────────────────────── */
function handleSM() {
  const fields = ENC.SM;

  ipcMain.handle('sm:list', () => {
    const db   = getDb();
    const rows = db.prepare('SELECT sm.*, ssm.ssm_code, am.am_code FROM SM sm LEFT JOIN SSM ssm ON sm.ssm_id=ssm.id LEFT JOIN Area_Managers am ON sm.am_id=am.id ORDER BY sm.id').all();
    return rows.map(r => ({
      ...decryptRow(r, fields),
      no_of_srs: db.prepare('SELECT COUNT(*) as c FROM SR WHERE sm_id=?').get(r.id)?.c ?? 0,
      total_business: db.prepare(`SELECT COALESCE(SUM(premium),0) as t FROM Policy_Register WHERE sm_id=?`).get(r.id)?.t ?? 0,
      second_year_premium: db.prepare(`SELECT COALESCE(SUM(premium),0) as t FROM Policy_Register WHERE sm_id=?
        AND last_paid_date IS NOT NULL
        AND last_paid_date >= date(due_date, '+1 year')
        AND last_paid_date < date(due_date, '+2 year')`).get(r.id)?.t ?? 0,
    }));
  });

  ipcMain.handle('sm:create', (_e, data) => {
    const db = getDb();
    const val = validateSM(data);
    if (!val.ok) return val;
    try {
      db.prepare(`INSERT INTO SM (sm_code,sm_name,address,cnic,contact_1,contact_2,ssm_id,am_id,status,cnic_pic,nominee_cnic_pic,matric_cert,intermediate_cert,degree_cert,relation,registration_no,registration_date,passport_pic,dob)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(data.sm_code, encrypt(data.sm_name), encrypt(data.address), encrypt(data.cnic), encrypt(data.contact_1), encrypt(data.contact_2), data.ssm_id || null, data.am_id || null, data.status || 'active',
          data.cnic_pic || null, data.nominee_cnic_pic || null, data.matric_cert || null, data.intermediate_cert || null, data.degree_cert || null, encrypt(data.relation || ''), encrypt(data.registration_no || ''), data.registration_date || null, data.passport_pic || null, data.dob || null);
      log().info(`SM created: ${data.sm_code}`);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('sm:update', (_e, data) => {
    const db = getDb();
    const val = validateSM(data, data.id);
    if (!val.ok) return val;
    try {
      db.prepare(`UPDATE SM SET sm_code=?,sm_name=?,address=?,cnic=?,contact_1=?,contact_2=?,ssm_id=?,am_id=?,status=?,
        cnic_pic=?,nominee_cnic_pic=?,matric_cert=?,intermediate_cert=?,degree_cert=?,relation=?,registration_no=?,registration_date=?,passport_pic=?,dob=? WHERE id=?`)
        .run(data.sm_code, encrypt(data.sm_name), encrypt(data.address), encrypt(data.cnic), encrypt(data.contact_1), encrypt(data.contact_2), data.ssm_id || null, data.am_id || null, data.status,
          data.cnic_pic || null, data.nominee_cnic_pic || null, data.matric_cert || null, data.intermediate_cert || null, data.degree_cert || null, encrypt(data.relation || ''), encrypt(data.registration_no || ''), data.registration_date || null, data.passport_pic || null, data.dob || null, data.id);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('sm:delete', (_e, id) => {
    const db = getDb();
    try {
      db.transaction(() => {
        db.prepare('UPDATE SR SET sm_id = NULL WHERE sm_id = ?').run(id);
        db.prepare('UPDATE Proposer_Register SET sm_id = NULL WHERE sm_id = ?').run(id);
        db.prepare('UPDATE Policy_Register SET sm_id = NULL WHERE sm_id = ?').run(id);
        db.prepare('UPDATE Second_Year_Log SET sm_id = NULL WHERE sm_id = ?').run(id);
        db.prepare('DELETE FROM SM WHERE id = ?').run(id);
      })();
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });
}

/* ──────────────────────────── SR ──────────────────────────── */
function handleSR() {
  const fields = ENC.SR;

  ipcMain.handle('sr:list', () => {
    const db   = getDb();
    const rows = db.prepare('SELECT sr.*, sm.sm_code, ssm.ssm_code, am.am_code FROM SR sr LEFT JOIN SM sm ON sr.sm_id=sm.id LEFT JOIN SSM ssm ON sr.ssm_id=ssm.id LEFT JOIN Area_Managers am ON sr.am_id=am.id ORDER BY sr.id').all();
    return rows.map(r => ({
      ...decryptRow(r, fields),
      no_of_policies: db.prepare('SELECT COUNT(*) as c FROM Policy_Register WHERE sr_id=?').get(r.id)?.c ?? 0,
      second_year_premium: db.prepare(`SELECT COALESCE(SUM(premium),0) as t FROM Policy_Register WHERE sr_id=?
        AND last_paid_date IS NOT NULL
        AND last_paid_date >= date(due_date, '+1 year')
        AND last_paid_date < date(due_date, '+2 year')`).get(r.id)?.t ?? 0,
    }));
  });

  ipcMain.handle('sr:create', (_e, data) => {
    const db = getDb();
    const val = validateSR(data);
    if (!val.ok) return val;
    try {
      db.prepare(`INSERT INTO SR (sr_code,sr_name,address,cnic,contact_1,contact_2,sm_id,ssm_id,am_id,status,cnic_pic,nominee_cnic_pic,matric_cert,intermediate_cert,degree_cert,relation,registration_no,registration_date,passport_pic,total_business,dob)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(data.sr_code, encrypt(data.sr_name), encrypt(data.address), encrypt(data.cnic), encrypt(data.contact_1), encrypt(data.contact_2), data.sm_id || null, data.ssm_id || null, data.am_id || null, data.status || 'active',
          data.cnic_pic || null, data.nominee_cnic_pic || null, data.matric_cert || null, data.intermediate_cert || null, data.degree_cert || null, encrypt(data.relation || ''), encrypt(data.registration_no || ''), data.registration_date || null, data.passport_pic || null, data.total_business || 0.0, data.dob || null);
      log().info(`SR created: ${data.sr_code}`);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('sr:update', (_e, data) => {
    const db = getDb();
    const val = validateSR(data, data.id);
    if (!val.ok) return val;
    try {
      db.prepare(`UPDATE SR SET sr_code=?,sr_name=?,address=?,cnic=?,contact_1=?,contact_2=?,sm_id=?,ssm_id=?,am_id=?,status=?,
        cnic_pic=?,nominee_cnic_pic=?,matric_cert=?,intermediate_cert=?,degree_cert=?,relation=?,registration_no=?,registration_date=?,passport_pic=?,total_business=?,dob=? WHERE id=?`)
        .run(data.sr_code, encrypt(data.sr_name), encrypt(data.address), encrypt(data.cnic), encrypt(data.contact_1), encrypt(data.contact_2), data.sm_id || null, data.ssm_id || null, data.am_id || null, data.status,
          data.cnic_pic || null, data.nominee_cnic_pic || null, data.matric_cert || null, data.intermediate_cert || null, data.degree_cert || null, encrypt(data.relation || ''), encrypt(data.registration_no || ''), data.registration_date || null, data.passport_pic || null, data.total_business || 0.0, data.dob || null, data.id);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('sr:delete', (_e, id) => {
    const db = getDb();
    try {
      db.transaction(() => {
        db.prepare('UPDATE Proposer_Register SET sr_id = NULL WHERE sr_id = ?').run(id);
        db.prepare('UPDATE Policy_Register SET sr_id = NULL WHERE sr_id = ?').run(id);
        db.prepare('UPDATE Second_Year_Log SET sr_id = NULL WHERE sr_id = ?').run(id);
        db.prepare('DELETE FROM SR WHERE id = ?').run(id);
      })();
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  // Image upload
  ipcMain.handle('sr:uploadImage', async (_e, { sr_code, fieldName }) => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg','jpeg','png','webp'] }] });
    if (result.canceled) return null;
    const src  = result.filePaths[0];
    const dir  = path.join(app.getPath('userData'), 'images', 'sr', sr_code);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${fieldName}${path.extname(src)}`);
    fs.copyFileSync(src, dest);
    return dest;
  });

  // Unified recruitment files upload (documents and images)
  ipcMain.handle('recruitment:uploadFile', async (_e, { code, fieldName }) => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'All Supported Files', extensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx'] },
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
          { name: 'Documents', extensions: ['pdf', 'doc', 'docx'] }
        ]
      });
      if (result.canceled) return null;
      const src  = result.filePaths[0];
      const dir  = path.join(app.getPath('userData'), 'recruitment_files', code || 'temp');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      // Clean up any existing file with same fieldName but potentially different extension
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.startsWith(fieldName + '.')) {
            fs.unlinkSync(path.join(dir, file));
          }
        }
      }

      const dest = path.join(dir, `${fieldName}${path.extname(src)}`);
      fs.copyFileSync(src, dest);
      return dest;
    } catch (err) {
      log().error(`Failed to upload recruitment file: ${err.message}`);
      throw err;
    }
  });
}

/* ──────────────────────────── PROPOSER REGISTER ──────────────────────────── */
function handleProposer() {
  const fields = ENC.Proposer_Register;

  ipcMain.handle('proposer:list', () => {
    const db   = getDb();
    const rows = db.prepare(`SELECT p.*, sr.sr_code, sm.sm_code, ssm.ssm_code FROM Proposer_Register p
      LEFT JOIN SR sr ON p.sr_id=sr.id LEFT JOIN SM sm ON p.sm_id=sm.id LEFT JOIN SSM ssm ON p.ssm_id=ssm.id
      ORDER BY p.id DESC`).all();
    return rows.map(r => decryptRow(r, fields));
  });

  ipcMain.handle('proposer:create', (_e, data) => {
    const db = getDb();
    const val = validateProposer(data);
    if (!val.ok) return val;
    try {
      db.prepare(`INSERT INTO Proposer_Register (proposal_no,holder_name,premium,pr_no,pr_date,amount_type,requirements,sr_id,sm_id,ssm_id,status,contact_1,contact_2)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(data.proposal_no, encrypt(data.holder_name), data.premium, encrypt(data.pr_no), data.pr_date, data.amount_type, data.requirements, data.sr_id || null, data.sm_id || null, data.ssm_id || null, data.status || 'not_ok', encrypt(data.contact_1 || ''), encrypt(data.contact_2 || ''));
      log().info(`Proposer created: ${data.proposal_no}`);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('proposer:update', (_e, data) => {
    const db = getDb();
    const val = validateProposer(data, data.id);
    if (!val.ok) return val;
    try {
      db.prepare(`UPDATE Proposer_Register SET proposal_no=?,holder_name=?,premium=?,pr_no=?,pr_date=?,amount_type=?,requirements=?,sr_id=?,sm_id=?,ssm_id=?,status=?,contact_1=?,contact_2=? WHERE id=?`)
        .run(data.proposal_no, encrypt(data.holder_name), data.premium, encrypt(data.pr_no), data.pr_date, data.amount_type, data.requirements, data.sr_id || null, data.sm_id || null, data.ssm_id || null, data.status, encrypt(data.contact_1 || ''), encrypt(data.contact_2 || ''), data.id);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('proposer:delete', (_e, id) => {
    const db = getDb();
    try {
      db.transaction(() => {
        db.prepare('UPDATE Policy_Register SET proposal_id = NULL WHERE proposal_id = ?').run(id);
        db.prepare('DELETE FROM Proposer_Register WHERE id = ?').run(id);
      })();
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('proposer:convertToPolicy', (_e, id) => {
    const db = getDb();
    const prop = decryptRow(db.prepare('SELECT * FROM Proposer_Register WHERE id=?').get(id), ENC.Proposer_Register);
    if (!prop) return { ok: false, error: 'Proposal not found.' };
    if (prop.converted_to_policy) return { ok: false, error: 'Already converted.' };
    
    try {
      let policyId;
      db.transaction(() => {
        const finalPolicyNo = `TEMP-POL-${id}-${Date.now()}`;

        const info = db.prepare(`INSERT INTO Policy_Register (policy_no,holder_name,cnic,address,contact_1,contact_2,premium,issue_date,sr_id,sm_id,ssm_id,proposal_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(
            encrypt(finalPolicyNo),
            encrypt(prop.holder_name),
            encrypt('00000-0000000-0'),
            encrypt(''),
            encrypt(prop.contact_1 || ''),
            encrypt(prop.contact_2 || ''),
            prop.premium,
            new Date().toISOString().split('T')[0],
            prop.sr_id || null,
            prop.sm_id || null,
            prop.ssm_id || null,
            id
          );
        policyId = info.lastInsertRowid;

        db.prepare('UPDATE Proposer_Register SET converted_to_policy=1, status=? WHERE id=?').run('ok', id);
      })();
      
      log().info(`Proposal ${prop.proposal_no} converted to policy ${policyId}`);
      return { ok: true, policyId };
    } catch (err) {
      log().error(`Error converting proposal to policy: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });
}

function updateSrTotalBusiness(db, srId) {
  if (!srId) return;
  try {
    db.prepare(`
      UPDATE SR
      SET total_business = (
        SELECT COALESCE(SUM(premium), 0)
        FROM Policy_Register
        WHERE sr_id = ?
      )
      WHERE id = ?
    `).run(srId, srId);
  } catch (err) {
    getLogger().error(`Error updating SR total business for sr_id=${srId}: ${err.message}`);
  }
}

/* ──────────────────────────── POLICY REGISTER ──────────────────────────── */
function handlePolicy() {
  const fields = ENC.Policy_Register;

  ipcMain.handle('policy:list', (_e, filters = {}) => {
    const db   = getDb();
    let   sql  = `SELECT p.*, sr.sr_code, sm.sm_code, ssm.ssm_code FROM Policy_Register p
      LEFT JOIN SR sr ON p.sr_id=sr.id LEFT JOIN SM sm ON p.sm_id=sm.id LEFT JOIN SSM ssm ON p.ssm_id=ssm.id
      ORDER BY p.id DESC`;
    const rows = db.prepare(sql).all();
    return rows.map(r => decryptRow(r, fields));
  });

  ipcMain.handle('policy:create', (_e, data) => {
    const db = getDb();
    const val = validatePolicy(data);
    if (!val.ok) return val;
    try {
      db.prepare(`INSERT INTO Policy_Register (policy_no,holder_name,cnic,address,contact_1,contact_2,premium,issue_date,due_date,table_term,last_paid_date,sr_id,sm_id,ssm_id,proposal_id,relation,dob)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(encrypt(data.policy_no), encrypt(data.holder_name), encrypt(data.cnic), encrypt(data.address), encrypt(data.contact_1), encrypt(data.contact_2),
          data.premium, data.issue_date, data.due_date, data.table_term, data.last_paid_date,
          data.sr_id || null, data.sm_id || null, data.ssm_id || null, data.proposal_id || null, encrypt(data.relation || ''), data.dob || null);
      if (data.sr_id) updateSrTotalBusiness(db, data.sr_id);
      log().info(`Policy created: ${data.policy_no}`);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('policy:update', (_e, data) => {
    const db  = getDb();
    const val = validatePolicy(data, data.id);
    if (!val.ok) return val;
    const old = db.prepare('SELECT last_paid_date, sr_id, sm_id, ssm_id, premium FROM Policy_Register WHERE id=?').get(data.id);
    try {
      db.prepare(`UPDATE Policy_Register SET policy_no=?,holder_name=?,cnic=?,address=?,contact_1=?,contact_2=?,premium=?,issue_date=?,due_date=?,table_term=?,last_paid_date=?,previous_paid_date=?,sr_id=?,sm_id=?,ssm_id=?,relation=?,dob=? WHERE id=?`)
        .run(encrypt(data.policy_no), encrypt(data.holder_name), encrypt(data.cnic), encrypt(data.address), encrypt(data.contact_1), encrypt(data.contact_2),
          data.premium, data.issue_date, data.due_date, data.table_term, data.last_paid_date, old?.last_paid_date || null,
          data.sr_id || null, data.sm_id || null, data.ssm_id || null, encrypt(data.relation || ''), data.dob || null, data.id);

      if (data.sr_id) updateSrTotalBusiness(db, data.sr_id);
      if (old && old.sr_id && old.sr_id !== data.sr_id) updateSrTotalBusiness(db, old.sr_id);

      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('policy:delete', (_e, id) => {
    const db = getDb();
    const old = db.prepare('SELECT sr_id FROM Policy_Register WHERE id=?').get(id);
    try {
      db.transaction(() => {
        db.prepare('DELETE FROM Notifications WHERE policy_id=?').run(id);
        db.prepare('DELETE FROM Second_Year_Log WHERE policy_id=?').run(id);
        db.prepare('DELETE FROM Policy_Register WHERE id=?').run(id);
      })();
      if (old && old.sr_id) updateSrTotalBusiness(db, old.sr_id);
      log().info(`Policy deleted: id=${id}`);
      return { ok: true };
    } catch (err) {
      log().error(`Failed to delete policy id=${id}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });
}

/* ──────────────────────────── NOTIFICATIONS ──────────────────────────── */
function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDaysUntilBirthday(dobStr, todayStr) {
  if (!dobStr) return null;
  const dobParts = dobStr.split('-');
  if (dobParts.length !== 3) return null;
  const birthMonth = parseInt(dobParts[1], 10) - 1;
  const birthDay = parseInt(dobParts[2], 10);

  const todayParts = todayStr.split('-');
  if (todayParts.length !== 3) return null;
  const todayYear = parseInt(todayParts[0], 10);
  const todayMonth = parseInt(todayParts[1], 10) - 1;
  const todayDay = parseInt(todayParts[2], 10);
  const todayMidnight = new Date(todayYear, todayMonth, todayDay);

  let nextBday = new Date(todayYear, birthMonth, birthDay);

  if (nextBday < todayMidnight) {
    nextBday = new Date(todayYear + 1, birthMonth, birthDay);
  }

  const diffTime = nextBday.getTime() - todayMidnight.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return {
    days_left: diffDays,
    next_birthday: formatLocalDate(nextBday)
  };
}

function getCombinedNotifications() {
  const db = getDb();
  const today = formatLocalDate(new Date());
  const todayObj = new Date(today);
  const currentYear = todayObj.getFullYear();

  // 1. Query policies due for payment
  const paymentRows = db.prepare(`SELECT p.id, p.policy_no, p.holder_name, p.contact_1, p.due_date, p.premium,
      sr.sr_code, sr.sr_name, COALESCE(n.whatsapp_sent, 0) as whatsapp_sent, n.whatsapp_sent_at,
      julianday(p.due_date) - julianday(?) as days_left
    FROM Policy_Register p
    LEFT JOIN Notifications n ON n.policy_id=p.id
    LEFT JOIN SR sr ON p.sr_id=sr.id
    WHERE p.due_date <= date(?,'+30 days')
      AND (p.last_paid_date IS NULL OR p.last_paid_date < p.due_date)
    ORDER BY days_left ASC`).all(today, today);

  const paymentNotifs = paymentRows.map(r => {
    const dec = decryptRow(r, ['holder_name', 'contact_1', 'policy_no', 'sr_name']);
    return {
      id: dec.id,
      type: 'payment',
      policy_no: dec.policy_no,
      holder_name: dec.holder_name,
      contact_1: dec.contact_1,
      due_date: dec.due_date,
      premium: dec.premium,
      sr_code: dec.sr_code,
      sr_name: dec.sr_name,
      whatsapp_sent: dec.whatsapp_sent,
      whatsapp_sent_at: dec.whatsapp_sent_at,
      days_left: dec.days_left,
    };
  });

  const birthdayNotifs = [];

  // Helper to retrieve and parse birthdays
  const processTableBirthdays = (tableName, codeField, nameField, roleName, idPrefix) => {
    const rows = db.prepare(`SELECT id, ${codeField} as code, ${nameField} as name, contact_1, dob FROM ${tableName} WHERE dob IS NOT NULL AND dob != ''`).all();
    for (const r of rows) {
      const dec = decryptRow(r, ['name', 'contact_1']);
      const bdayInfo = getDaysUntilBirthday(dec.dob, today);
      if (bdayInfo && bdayInfo.days_left >= 0 && bdayInfo.days_left <= 30) {
        const bdayId = `${idPrefix}_${dec.id}_${currentYear}`;
        const sentRow = db.prepare('SELECT value FROM Config WHERE key = ?').get(`bday_sent_${bdayId}`);
        birthdayNotifs.push({
          id: bdayId,
          type: 'birthday',
          role: roleName,
          name: dec.name,
          contact_1: dec.contact_1,
          dob: dec.dob,
          next_birthday: bdayInfo.next_birthday,
          code: dec.code,
          days_left: bdayInfo.days_left,
          whatsapp_sent: sentRow ? 1 : 0,
          whatsapp_sent_at: sentRow ? sentRow.value : null,
        });
      }
    }
  };

  // Process Policy Register for Policy Holders
  const policyRows = db.prepare("SELECT id, policy_no as code, holder_name as name, contact_1, dob FROM Policy_Register WHERE dob IS NOT NULL AND dob != ''").all();
  for (const r of policyRows) {
    const dec = decryptRow(r, ['name', 'contact_1', 'code']);
    const bdayInfo = getDaysUntilBirthday(dec.dob, today);
    if (bdayInfo && bdayInfo.days_left >= 0 && bdayInfo.days_left <= 30) {
      const bdayId = `b_policyholder_${dec.id}_${currentYear}`;
      const sentRow = db.prepare('SELECT value FROM Config WHERE key = ?').get(`bday_sent_${bdayId}`);
      birthdayNotifs.push({
        id: bdayId,
        type: 'birthday',
        role: 'Policy Holder',
        name: dec.name,
        contact_1: dec.contact_1,
        dob: dec.dob,
        next_birthday: bdayInfo.next_birthday,
        policy_no: dec.code,
        days_left: bdayInfo.days_left,
        whatsapp_sent: sentRow ? 1 : 0,
        whatsapp_sent_at: sentRow ? sentRow.value : null,
      });
    }
  }

  // Process SR, SM, SSM, Area_Managers
  processTableBirthdays('SR', 'sr_code', 'sr_name', 'Sales Representative', 'b_sr');
  processTableBirthdays('SM', 'sm_code', 'sm_name', 'Sales Manager', 'b_sm');
  processTableBirthdays('SSM', 'ssm_code', 'ssm_name', 'Senior Sales Manager', 'b_ssm');
  processTableBirthdays('Area_Managers', 'am_code', 'am_name', 'Area Manager', 'b_am');

  const combined = [...paymentNotifs, ...birthdayNotifs];
  combined.sort((a, b) => a.days_left - b.days_left);
  return combined;
}

function handleNotifications() {
  ipcMain.handle('notifications:list', () => {
    try {
      return getCombinedNotifications();
    } catch (err) {
      getLogger().error(`Failed in notifications:list: ${err.message}`);
      return [];
    }
  });

  ipcMain.handle('notifications:count', () => {
    try {
      const list = getCombinedNotifications();
      return list.length;
    } catch (err) {
      getLogger().error(`Failed in notifications:count: ${err.message}`);
      return 0;
    }
  });

  ipcMain.handle('notifications:markWhatsapp', (_e, id) => {
    const now = new Date().toISOString();
    const db = getDb();
    try {
      if (typeof id === 'string' && id.startsWith('b_')) {
        db.prepare('INSERT OR REPLACE INTO Config (key, value) VALUES (?, ?)')
          .run(`bday_sent_${id}`, now);
      } else {
        const policyId = id;
        const row = db.prepare('SELECT id FROM Notifications WHERE policy_id=?').get(policyId);
        if (row) {
          db.prepare('UPDATE Notifications SET whatsapp_sent=1, whatsapp_sent_at=? WHERE policy_id=?').run(now, policyId);
        } else {
          db.prepare('INSERT INTO Notifications (policy_id, whatsapp_sent, whatsapp_sent_at, triggered_date) VALUES (?, 1, ?, ?)')
            .run(policyId, now, new Date().toISOString().split('T')[0]);
        }
      }
      return { ok: true };
    } catch (err) {
      getLogger().error(`Failed in notifications:markWhatsapp: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('notifications:openWhatsapp', (_e, { phone, name, policyNo, dueDate, premium, type, adminName }) => {
    try {
      let msgStr = '';
      if (type === 'birthday') {
        msgStr = `Assalam o Alaikum ${name}, wishing you a very Happy Birthday! May you have a blessed and wonderful year ahead. Best regards ${adminName || 'Administrator'}.`;
      } else {
        const formatted = Number(premium || 0).toLocaleString();
        msgStr = `Assalam o Alaikum ${name}, your premium of Rs. ${formatted} for policy number ${policyNo} is due on ${dueDate}. Please make payment at your earliest. Thank you.`;
      }
      const msg = encodeURIComponent(msgStr);
      const clean = (phone || '').replace(/\D/g, '');
      const url   = `https://wa.me/${clean.startsWith('0') ? '92' + clean.slice(1) : clean}?text=${msg}`;
      shell.openExternal(url);
      return { ok: true };
    } catch (err) {
      getLogger().error(`Failed in notifications:openWhatsapp: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });
}

/* ──────────────────────────── DASHBOARD ──────────────────────────── */
function handleDashboard() {
  ipcMain.handle('dashboard:kpis', () => {
    const db    = getDb();
    const today = new Date();
    const m     = today.getMonth() + 1;
    const y     = today.getFullYear();
    const monthStart = `${y}-${String(m).padStart(2,'0')}-01`;
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const prevMonthStart = `${prevY}-${String(prevM).padStart(2,'0')}-01`;
    const prevMonthEnd   = `${y}-${String(m).padStart(2,'0')}-01`;

    const totalPolicies   = db.prepare('SELECT COUNT(*) as c FROM Policy_Register').get().c;
    const totalProposals  = db.prepare('SELECT COUNT(*) as c FROM Proposer_Register').get().c;
    const totalSRs        = db.prepare('SELECT COUNT(*) as c FROM SR').get().c;
    const totalSMs        = db.prepare('SELECT COUNT(*) as c FROM SM').get().c;
    const totalSSMs       = db.prepare('SELECT COUNT(*) as c FROM SSM').get().c;

    const currentMonthPrem = db.prepare(`SELECT COALESCE(SUM(premium),0) as t FROM Policy_Register WHERE strftime('%Y-%m', issue_date)=strftime('%Y-%m',?)`).get(monthStart).t;
    const prevMonthPrem    = db.prepare(`SELECT COALESCE(SUM(premium),0) as t FROM Policy_Register WHERE issue_date >= ? AND issue_date < ?`).get(prevMonthStart, prevMonthEnd).t;
    const ytdPrem          = db.prepare(`SELECT COALESCE(SUM(premium),0) as t FROM Policy_Register WHERE strftime('%Y',issue_date)=?`).get(String(y)).t;

    const currPolicies = db.prepare(`SELECT COUNT(*) as c FROM Policy_Register WHERE strftime('%Y-%m', issue_date)=strftime('%Y-%m',?)`).get(monthStart).c;
    const prevPolicies = db.prepare(`SELECT COUNT(*) as c FROM Policy_Register WHERE issue_date >= ? AND issue_date < ?`).get(prevMonthStart, prevMonthEnd).c;

    const currProposals = db.prepare(`SELECT COUNT(*) as c FROM Proposer_Register WHERE strftime('%Y-%m', pr_date)=strftime('%Y-%m',?)`).get(monthStart).c;
    const prevProposals = db.prepare(`SELECT COUNT(*) as c FROM Proposer_Register WHERE pr_date >= ? AND pr_date < ?`).get(prevMonthStart, prevMonthEnd).c;

    const todayStr  = today.toISOString().split('T')[0];
    const due7  = db.prepare(`SELECT COUNT(*) as c FROM Policy_Register WHERE due_date <= date(?,'+7 days') AND (last_paid_date IS NULL OR last_paid_date < due_date)`).get(todayStr).c;
    const due15 = db.prepare(`SELECT COUNT(*) as c FROM Policy_Register WHERE due_date <= date(?,'+15 days') AND (last_paid_date IS NULL OR last_paid_date < due_date)`).get(todayStr).c;
    const due30 = db.prepare(`SELECT COUNT(*) as c FROM Policy_Register WHERE due_date <= date(?,'+30 days') AND (last_paid_date IS NULL OR last_paid_date < due_date)`).get(todayStr).c;

    const renewals = due30;

    // Trailing 12 months chart
    const monthlyChart = [];
    const tempDate = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(tempDate.getFullYear(), tempDate.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const t = db.prepare(`SELECT COALESCE(SUM(premium),0) as t FROM Policy_Register WHERE strftime('%Y-%m',issue_date)=?`).get(monthStr).t;
      monthlyChart.push({ month, year, premium: t });
    }

    // Top SR & SM this month
    const srRows = db.prepare(`SELECT sr.id, sr.sr_name, sr.sr_code, COALESCE(SUM(p.premium),0) as biz
      FROM SR sr LEFT JOIN Policy_Register p ON p.sr_id=sr.id AND strftime('%Y-%m',p.issue_date)=strftime('%Y-%m',?)
      GROUP BY sr.id ORDER BY biz DESC LIMIT 1`).get(monthStart);
    const smRows = db.prepare(`SELECT sm.id, sm.sm_name, sm.sm_code, COALESCE(SUM(p.premium),0) as biz
      FROM SM sm LEFT JOIN SR sr ON sr.sm_id=sm.id LEFT JOIN Policy_Register p ON p.sr_id=sr.id AND strftime('%Y-%m',p.issue_date)=strftime('%Y-%m',?)
      GROUP BY sm.id ORDER BY biz DESC LIMIT 1`).get(monthStart);

    const config = {};
    const cfgRows = db.prepare('SELECT key, value FROM Config').all();
    cfgRows.forEach(r => { config[r.key] = r.value; });

    return {
      totalPolicies, totalProposals, totalSRs, totalSMs, totalSSMs,
      currentMonthPrem, prevMonthPrem, ytdPrem,
      currPolicies, prevPolicies, currProposals, prevProposals,
      due7, due15, due30,
      renewals, monthlyChart,
      topSR: srRows ? { ...srRows, sr_name: decrypt(srRows.sr_name) } : null,
      topSM: smRows ? { ...smRows, sm_name: decrypt(smRows.sm_name) } : null,
      config,
    };
  });

  ipcMain.handle('dashboard:saveTarget', (_e, { key, value }) => {
    getDb().prepare('INSERT OR REPLACE INTO Config (key, value) VALUES (?,?)').run(key, String(value));
    log().info(`Target saved: ${key}=${value}`);
    return { ok: true };
  });
}

/* ──────────────────────────── BUSINESS FIGURE ──────────────────────────── */
function handleBusinessFigure() {
  ipcMain.handle('business:srFigure', (_e, { from, to }) => {
    const db = getDb();
    const rows = db.prepare(`SELECT sr.id, sr.sr_code, sr.sr_name, sm.sm_code,
        COALESCE(SUM(p.premium),0) as total_business,
        COUNT(p.id) as no_of_policies,
        COALESCE((
          SELECT SUM(p2.premium) FROM Policy_Register p2
          WHERE p2.sr_id = sr.id AND p2.last_paid_date BETWEEN ? AND ?
            AND p2.last_paid_date >= date(p2.due_date, '+1 year')
            AND p2.last_paid_date < date(p2.due_date, '+2 year')
        ),0) as second_year_premium
      FROM SR sr
      LEFT JOIN SM sm ON sr.sm_id=sm.id
      LEFT JOIN Policy_Register p ON p.sr_id=sr.id AND p.issue_date BETWEEN ? AND ?
      GROUP BY sr.id ORDER BY total_business DESC`).all(from, to, from, to);
    return rows.map(r => ({ ...r, sr_name: decrypt(r.sr_name) }));
  });

  ipcMain.handle('business:smFigure', (_e, { from, to }) => {
    const db = getDb();
    const rows = db.prepare(`SELECT sm.id, sm.sm_code, sm.sm_name, ssm.ssm_code,
        COALESCE(SUM(p.premium),0) as total_business,
        COUNT(p.id) as no_of_policies,
        (SELECT COUNT(*) FROM SR sr2 WHERE sr2.sm_id=sm.id AND sr2.created_at BETWEEN ? AND ?) as no_of_srs_added,
        COALESCE((
          SELECT SUM(p2.premium) FROM Policy_Register p2
          WHERE p2.sm_id = sm.id AND p2.last_paid_date BETWEEN ? AND ?
            AND p2.last_paid_date >= date(p2.due_date, '+1 year')
            AND p2.last_paid_date < date(p2.due_date, '+2 year')
        ),0) as second_year_premium
      FROM SM sm
      LEFT JOIN SSM ssm ON sm.ssm_id=ssm.id
      LEFT JOIN Policy_Register p ON p.sm_id=sm.id AND p.issue_date BETWEEN ? AND ?
      GROUP BY sm.id ORDER BY total_business DESC`).all(from, to, from, to, from, to);
    return rows.map(r => ({ ...r, sm_name: decrypt(r.sm_name) }));
  });

  ipcMain.handle('business:ssmFigure', (_e, { from, to }) => {
    const db = getDb();
    const rows = db.prepare(`SELECT ssm.id, ssm.ssm_code, ssm.ssm_name, am.am_name,
        COALESCE(SUM(p.premium),0) as total_business,
        COUNT(p.id) as no_of_policies,
        (SELECT COUNT(*) FROM SR sr2 LEFT JOIN SM sm2 ON sr2.sm_id=sm2.id WHERE sm2.ssm_id=ssm.id AND sr2.created_at BETWEEN ? AND ?) as no_of_srs_added,
        (SELECT COUNT(*) FROM SM sm3 WHERE sm3.ssm_id=ssm.id AND sm3.created_at BETWEEN ? AND ?) as no_of_sms_added,
        COALESCE((
          SELECT SUM(p2.premium) FROM Policy_Register p2
          WHERE p2.ssm_id = ssm.id AND p2.last_paid_date BETWEEN ? AND ?
            AND p2.last_paid_date >= date(p2.due_date, '+1 year')
            AND p2.last_paid_date < date(p2.due_date, '+2 year')
        ),0) as second_year_premium
      FROM SSM ssm
      LEFT JOIN Area_Managers am ON ssm.am_id=am.id
      LEFT JOIN Policy_Register p ON p.ssm_id=ssm.id AND p.issue_date BETWEEN ? AND ?
      GROUP BY ssm.id ORDER BY total_business DESC`).all(from, to, from, to, from, to, from, to);
    return rows.map(r => ({ ...r, ssm_name: decrypt(r.ssm_name), am_name: r.am_name ? decrypt(r.am_name) : '' }));
  });

  ipcMain.handle('business:amFigure', (_e, { from, to }) => {
    const db = getDb();
    const rows = db.prepare(`SELECT am.id, am.am_code, am.am_name,
        COALESCE(SUM(p.premium),0) as total_business,
        COUNT(p.id) as no_of_policies,
        (SELECT COUNT(*) FROM SSM ssm2 WHERE ssm2.am_id=am.id AND ssm2.created_at BETWEEN ? AND ?) as no_of_ssms_added,
        (SELECT COUNT(*) FROM SM sm2 WHERE sm2.am_id=am.id AND sm2.created_at BETWEEN ? AND ?) as no_of_sms_added,
        (SELECT COUNT(*) FROM SR sr2 WHERE sr2.am_id=am.id AND sr2.created_at BETWEEN ? AND ?) as no_of_srs_added,
        COALESCE((
          SELECT SUM(p2.premium) FROM Policy_Register p2
          JOIN SR sr3 ON p2.sr_id=sr3.id
          WHERE sr3.am_id=am.id AND p2.last_paid_date BETWEEN ? AND ?
            AND p2.last_paid_date >= date(p2.due_date, '+1 year')
            AND p2.last_paid_date < date(p2.due_date, '+2 year')
        ),0) as second_year_premium
      FROM Area_Managers am
      LEFT JOIN SR sr ON sr.am_id=am.id
      LEFT JOIN Policy_Register p ON p.sr_id=sr.id AND p.issue_date BETWEEN ? AND ?
      GROUP BY am.id ORDER BY total_business DESC`).all(from, to, from, to, from, to, from, to, from, to);
    return rows.map(r => ({ ...r, am_name: decrypt(r.am_name) }));
  });
}

/* ──────────────────────────── CONFIG ──────────────────────────── */
function handleConfig() {
  ipcMain.handle('config:get', (_e, key) => {
    const row = getDb().prepare('SELECT value FROM Config WHERE key=?').get(key);
    return row ? row.value : null;
  });
  ipcMain.handle('config:set', (_e, { key, value }) => {
    getDb().prepare('INSERT OR REPLACE INTO Config (key, value) VALUES (?,?)').run(key, String(value));
    return { ok: true };
  });
}

/* ──────────────────────────── BACKUP ──────────────────────────── */
function handleBackup() {
  ipcMain.handle('backup:download', async () => {
    const archiver = require('archiver');
    const result = await dialog.showSaveDialog({ defaultPath: `InsuranceBackup_${Date.now()}.zip`, filters: [{ name: 'ZIP', extensions: ['zip'] }] });
    if (result.canceled) return { ok: false };
    const output  = fs.createWriteStream(result.filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(output);
    const dbPath  = path.join(app.getPath('userData'), 'appdata', 'sysconfig.dat');
    const imgPath = path.join(app.getPath('userData'), 'images');
    if (fs.existsSync(dbPath)) archive.file(dbPath, { name: 'sysconfig.dat' });
    if (fs.existsSync(imgPath)) archive.directory(imgPath, 'images');
    await archive.finalize();
    log().info(`Backup downloaded to: ${result.filePath}`);
    return { ok: true, path: result.filePath };
  });

  ipcMain.handle('backup:restore', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'ZIP', extensions: ['zip'] }]
      });
      if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };
      const filePath = result.filePaths[0];

      // Close the database connection first
      closeDb();

      const AdmZip = require('adm-zip');
      const zip = new AdmZip(filePath);
      
      const zipEntries = zip.getEntries();
      const hasDbAtRoot = zipEntries.some(entry => entry.entryName === 'sysconfig.dat');
      const hasDbInAppdata = zipEntries.some(entry => entry.entryName === 'appdata/sysconfig.dat');
      
      if (!hasDbAtRoot && !hasDbInAppdata) {
        // Re-initialize database to not leave app broken
        const { initializeDatabase } = require('./database');
        initializeDatabase();
        return { ok: false, error: 'Invalid backup file: sysconfig.dat not found inside zip.' };
      }

      const userDataPath = app.getPath('userData');
      zip.extractAllTo(userDataPath, true);

      // Handle the case where sysconfig.dat was extracted to the root instead of appdata/
      const rootDbPath = path.join(userDataPath, 'sysconfig.dat');
      const appdataDbPath = path.join(userDataPath, 'appdata', 'sysconfig.dat');
      if (fs.existsSync(rootDbPath)) {
        const appdataDir = path.dirname(appdataDbPath);
        if (!fs.existsSync(appdataDir)) {
          fs.mkdirSync(appdataDir, { recursive: true });
        }
        // Overwrite existing database in appdata/
        fs.copyFileSync(rootDbPath, appdataDbPath);
        fs.unlinkSync(rootDbPath);
      }

      // Re-initialize database connection
      const { initializeDatabase } = require('./database');
      initializeDatabase();

      log().info(`Backup restored successfully from: ${filePath}`);
      return { ok: true };
    } catch (err) {
      log().error(`Failed to restore backup: ${err.message}`);
      try {
        const { initializeDatabase } = require('./database');
        initializeDatabase();
      } catch {}
      return { ok: false, error: err.message };
    }
  });
}

/* ──────────────────────────── PDF GENERATION ──────────────────────────── */
function handlePdfGenerators() {
  ipcMain.handle('dashboard:exportPDF', async () => {
    const db = getDb();
    const today = new Date();
    const m     = today.getMonth() + 1;
    const y     = today.getFullYear();
    const monthStart = `${y}-${String(m).padStart(2,'0')}-01`;
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const prevMonthStart = `${prevY}-${String(prevM).padStart(2,'0')}-01`;
    const prevMonthEnd   = `${y}-${String(m).padStart(2,'0')}-01`;

    const totalPolicies   = db.prepare('SELECT COUNT(*) as c FROM Policy_Register').get().c;
    const totalProposals  = db.prepare('SELECT COUNT(*) as c FROM Proposer_Register').get().c;
    const totalSRs        = db.prepare('SELECT COUNT(*) as c FROM SR').get().c;
    const totalSMs        = db.prepare('SELECT COUNT(*) as c FROM SM').get().c;
    const totalSSMs       = db.prepare('SELECT COUNT(*) as c FROM SSM').get().c;

    const currentMonthPrem = db.prepare(`SELECT COALESCE(SUM(premium),0) as t FROM Policy_Register WHERE strftime('%Y-%m', issue_date)=strftime('%Y-%m',?)`).get(monthStart).t;
    const prevMonthPrem    = db.prepare(`SELECT COALESCE(SUM(premium),0) as t FROM Policy_Register WHERE issue_date >= ? AND issue_date < ?`).get(prevMonthStart, prevMonthEnd).t;
    const ytdPrem          = db.prepare(`SELECT COALESCE(SUM(premium),0) as t FROM Policy_Register WHERE strftime('%Y',issue_date)=?`).get(String(y)).t;

    // Trailing 12 months chart
    const monthlyChart = [];
    const tempDate = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(tempDate.getFullYear(), tempDate.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;
      const t = db.prepare(`SELECT COALESCE(SUM(premium),0) as t FROM Policy_Register WHERE strftime('%Y-%m',issue_date)=?`).get(monthStr).t;
      monthlyChart.push({ month, year, premium: t });
    }

    const PDFDocument = require('pdfkit');
    const result = await dialog.showSaveDialog({
      defaultPath: `Dashboard_Monthly_Report_${y}_${String(m).padStart(2,'0')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled) return { ok: false, canceled: true };
    const filePath = result.filePath;

    const doc = new PDFDocument({ margin: 50, bufferPages: true });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    doc.fontSize(22).font('Helvetica-Bold').text('Dashboard Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Report Date: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.moveDown(1.5);

    // Summary & Financial Sections side-by-side
    const tablesStartY = doc.y;
    const leftX = 50;
    const rightX = 310;
    const col1Width = 160;
    const col2Width = 80;
    const headerHeight = 20;
    const rowHeight = 18;
    const cellPadding = 4;

    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('System Statistics', leftX, tablesStartY, { width: 240 });
    doc.text('Financial Metrics', rightX, tablesStartY, { width: 240 });

    const tableTopY = tablesStartY + 20;

    // Left Table: System Statistics
    doc.strokeColor('#000000').lineWidth(1).fontSize(9).font('Helvetica-Bold');
    doc.rect(leftX, tableTopY, col1Width, headerHeight).stroke();
    doc.text('Metric Name', leftX + cellPadding, tableTopY + cellPadding, { width: col1Width - cellPadding*2, height: headerHeight - cellPadding*2 });
    doc.rect(leftX + col1Width, tableTopY, col2Width, headerHeight).stroke();
    doc.text('Count', leftX + col1Width + cellPadding, tableTopY + cellPadding, { width: col2Width - cellPadding*2, height: headerHeight - cellPadding*2 });

    let currentLeftY = tableTopY + headerHeight;
    doc.font('Helvetica');
    const statsData = [
      { label: 'Total Active Policies', val: totalPolicies },
      { label: 'Total Customer Proposals', val: totalProposals },
      { label: 'Total SSM Recruitments', val: totalSSMs },
      { label: 'Total SM Recruitments', val: totalSMs },
      { label: 'Total SR Recruitments', val: totalSRs }
    ];
    for (const item of statsData) {
      doc.rect(leftX, currentLeftY, col1Width, rowHeight).stroke();
      doc.text(item.label, leftX + cellPadding, currentLeftY + cellPadding, { width: col1Width - cellPadding*2, height: rowHeight - cellPadding*2 });
      doc.rect(leftX + col1Width, currentLeftY, col2Width, rowHeight).stroke();
      doc.text(String(item.val ?? 0), leftX + col1Width + cellPadding, currentLeftY + cellPadding, { width: col2Width - cellPadding*2, height: rowHeight - cellPadding*2 });
      currentLeftY += rowHeight;
    }

    // Right Table: Financial Metrics
    doc.font('Helvetica-Bold');
    doc.rect(rightX, tableTopY, col1Width, headerHeight).stroke();
    doc.text('Financial Period', rightX + cellPadding, tableTopY + cellPadding, { width: col1Width - cellPadding*2, height: headerHeight - cellPadding*2 });
    doc.rect(rightX + col1Width, tableTopY, col2Width, headerHeight).stroke();
    doc.text('Premium Volume', rightX + col1Width + cellPadding, tableTopY + cellPadding, { width: col2Width - cellPadding*2, height: headerHeight - cellPadding*2 });

    let currentRightY = tableTopY + headerHeight;
    doc.font('Helvetica');
    const financialData = [
      { label: 'Current Month Premium', val: `Rs. ${Number(currentMonthPrem).toLocaleString()}` },
      { label: 'Previous Month Premium', val: `Rs. ${Number(prevMonthPrem).toLocaleString()}` },
      { label: 'Year-to-Date Premium', val: `Rs. ${Number(ytdPrem).toLocaleString()}` }
    ];
    for (const item of financialData) {
      doc.rect(rightX, currentRightY, col1Width, rowHeight).stroke();
      doc.text(item.label, rightX + cellPadding, currentRightY + cellPadding, { width: col1Width - cellPadding*2, height: rowHeight - cellPadding*2 });
      doc.rect(rightX + col1Width, currentRightY, col2Width, rowHeight).stroke();
      doc.text(String(item.val), rightX + col1Width + cellPadding, currentRightY + cellPadding, { width: col2Width - cellPadding*2, height: rowHeight - cellPadding*2 });
      currentRightY += rowHeight;
    }

    // Set doc.y for the next section
    doc.y = Math.max(currentLeftY, currentRightY) + 20;
    doc.x = 50;

    // Monthly Chart Table representation
    doc.fontSize(14).font('Helvetica-Bold').text('Premium Collection Trend (Trailing 12 Months)');
    doc.moveDown(0.5);
    
    const startY = doc.y;
    doc.strokeColor('#000000').lineWidth(1).fontSize(10).font('Helvetica-Bold');
    
    // Draw Month/Year header cell
    doc.rect(leftX, startY, 250, headerHeight).stroke();
    doc.text('Month/Year', leftX + cellPadding, startY + cellPadding, { width: 250 - (cellPadding * 2), height: headerHeight - (cellPadding * 2) });
    
    // Draw Total Premium Collection header cell
    doc.rect(leftX + 250, startY, 250, headerHeight).stroke();
    doc.text('Total Premium Collection', leftX + 250 + cellPadding, startY + cellPadding, { width: 250 - (cellPadding * 2), height: headerHeight - (cellPadding * 2) });
    
    doc.y = startY + headerHeight;
    doc.font('Helvetica');
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (const mData of monthlyChart) {
      const monthLabel = `${MONTHS[mData.month - 1]} ${mData.year}`;
      const rowY = doc.y;
      
      // Month/Year cell
      doc.rect(leftX, rowY, 250, rowHeight).stroke();
      doc.text(monthLabel, leftX + cellPadding, rowY + cellPadding, { width: 250 - (cellPadding * 2), height: rowHeight - (cellPadding * 2) });
      
      // Premium cell
      doc.rect(leftX + 250, rowY, 250, rowHeight).stroke();
      doc.text(`Rs. ${Number(mData.premium).toLocaleString()}`, leftX + 250 + cellPadding, rowY + cellPadding, { width: 250 - (cellPadding * 2), height: rowHeight - (cellPadding * 2) });
      
      doc.y = rowY + rowHeight;
    }

    // Draw centered footer ONLY on the last page
    const range = doc.bufferedPageRange();
    if (range.count > 0) {
      const lastPageIdx = range.start + range.count - 1;
      doc.switchToPage(lastPageIdx);
      
      // Save original bottom margin and disable it to prevent auto page-break
      const oldBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      
      const footerY = doc.page.height - 70;
      
      const companyName = '© Lalwani Software Solutions.';
      doc.fillColor('#333333').fontSize(10).font('Helvetica-Bold');
      const textWidth = doc.widthOfString(companyName);
      doc.text(companyName, (doc.page.width - textWidth) / 2, footerY);
      
      // Draw Contact Info below
      doc.fillColor('#666666').fontSize(9).font('Helvetica');
      const contactText = 'Contact : 03337104578 / 03152967527';
      const contactWidth = doc.widthOfString(contactText);
      doc.text(contactText, (doc.page.width - contactWidth) / 2, footerY + 14);
      
      // Restore original bottom margin
      doc.page.margins.bottom = oldBottomMargin;
    }

    doc.end();
    return new Promise((resolve) => {
      writeStream.on('finish', () => {
        resolve({ ok: true, path: filePath });
      });
      writeStream.on('error', (err) => {
        resolve({ ok: false, error: err.message });
      });
    });
  });

  ipcMain.handle('business:exportPDF', async (_e, { from, to, role, data }) => {
    const PDFDocument = require('pdfkit');
    const result = await dialog.showSaveDialog({
      defaultPath: `${role}_Performance_Report_${from}_to_${to}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled) return { ok: false, canceled: true };
    const filePath = result.filePath;
    
    const doc = new PDFDocument({ margin: 50, bufferPages: true });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);
    
    doc.fontSize(22).font('Helvetica-Bold').text('Business Figure Report', { align: 'center' });
    doc.moveDown();
    
    let roleText = '';
    if (role === 'SR') roleText = 'Sales Representative (SR)';
    else if (role === 'SM') roleText = 'Sales Manager (SM)';
    else if (role === 'SSM') roleText = 'Senior Sales Manager (SSM)';
    else if (role === 'AM') roleText = 'Area Manager (AM)';
    else roleText = role;

    doc.fontSize(12).font('Helvetica');
    doc.text('Role: ', { continued: true }).font('Helvetica-Bold').text(roleText);
    doc.font('Helvetica');
    doc.text(`Period: ${formatDbDate(from)} to ${formatDbDate(to)}`, { align: 'left' });
    doc.text(`Generated At: ${new Date().toLocaleString()}`, { align: 'left' });
    doc.moveDown(2);
    
    const startY = doc.y;
    doc.fontSize(10).font('Helvetica-Bold');
    
    let colWidths = [];
    let headers = [];
    let keys = [];
    if (role === 'SR') {
      headers = ['SR Code', 'SR Name', 'SM Code', 'Business', 'Policies', '2nd Yr Prem'];
      colWidths = [70, 150, 70, 90, 50, 90];
      keys = ['sr_code', 'sr_name', 'sm_code', 'total_business', 'no_of_policies', 'second_year_premium'];
    } else if (role === 'SM') {
      headers = ['SM Code', 'SM Name', 'SSM Code', 'Business', 'Policies', 'SRs Add', '2nd Yr Prem'];
      colWidths = [60, 130, 60, 80, 50, 50, 85];
      keys = ['sm_code', 'sm_name', 'ssm_code', 'total_business', 'no_of_policies', 'no_of_srs_added', 'second_year_premium'];
    } else if (role === 'SSM') {
      headers = ['SSM Code', 'SSM Name', 'AM Name', 'Business', 'Policies', 'SRs Add', 'SMs Add', '2nd Yr Prem'];
      colWidths = [60, 110, 80, 70, 40, 40, 40, 75];
      keys = ['ssm_code', 'ssm_name', 'am_name', 'total_business', 'no_of_policies', 'no_of_srs_added', 'no_of_sms_added', 'second_year_premium'];
    } else {
      headers = ['AM Code', 'AM Name', 'SSMs Add', 'SMs Add', 'SRs Add', 'Business', 'Policies', '2nd Yr Prem'];
      colWidths = [60, 120, 50, 50, 50, 70, 40, 75];
      keys = ['am_code', 'am_name', 'no_of_ssms_added', 'no_of_sms_added', 'no_of_srs_added', 'total_business', 'no_of_policies', 'second_year_premium'];
    }
    
    doc.strokeColor('#000000').lineWidth(1);
    const headerHeight = 22;
    const rowHeight = 20;
    const cellPadding = 4;
    
    let currentX = 50;
    for (let i = 0; i < headers.length; i++) {
      doc.rect(currentX, startY, colWidths[i], headerHeight).stroke();
      doc.text(headers[i], currentX + cellPadding, startY + cellPadding, { width: colWidths[i] - (cellPadding * 2), height: headerHeight - (cellPadding * 2), align: 'left' });
      currentX += colWidths[i];
    }
    
    doc.y = startY + headerHeight;
    doc.font('Helvetica');
    let grandTotalRow = null;
    
    for (const row of data) {
      if (row.id === '__grand__' || row.sr_name === 'GRAND TOTAL' || row.sm_name === 'GRAND TOTAL' || row.ssm_name === 'GRAND TOTAL' || row.am_name === 'GRAND TOTAL') {
        grandTotalRow = row;
        continue;
      }
      
      if (doc.y + rowHeight > 700) {
        doc.addPage();
        let tempX = 50;
        doc.font('Helvetica-Bold');
        const hY = 50;
        for (let i = 0; i < headers.length; i++) {
          doc.rect(tempX, hY, colWidths[i], headerHeight).stroke();
          doc.text(headers[i], tempX + cellPadding, hY + cellPadding, { width: colWidths[i] - (cellPadding * 2), height: headerHeight - (cellPadding * 2), align: 'left' });
          tempX += colWidths[i];
        }
        doc.y = hY + headerHeight;
        doc.font('Helvetica');
      }
      
      const rowY = doc.y;
      let xPos = 50;
      for (let i = 0; i < keys.length; i++) {
        let val = row[keys[i]];
        if (keys[i] === 'total_business' || keys[i] === 'second_year_premium') {
          val = `Rs. ${Number(val || 0).toLocaleString()}`;
        }
        doc.rect(xPos, rowY, colWidths[i], rowHeight).stroke();
        doc.text(String(val ?? '—'), xPos + cellPadding, rowY + cellPadding, { width: colWidths[i] - (cellPadding * 2), height: rowHeight - (cellPadding * 2), align: 'left' });
        xPos += colWidths[i];
      }
      doc.y = rowY + rowHeight;
    }
    
    if (grandTotalRow) {
      if (doc.y + rowHeight > 700) {
        doc.addPage();
      }
      doc.font('Helvetica-Bold');
      const rowY = doc.y;
      let xPos = 50;
      for (let i = 0; i < keys.length; i++) {
        let val = grandTotalRow[keys[i]];
        if (keys[i] === 'total_business' || keys[i] === 'second_year_premium') {
          val = `Rs. ${Number(val || 0).toLocaleString()}`;
        }
        doc.rect(xPos, rowY, colWidths[i], rowHeight).stroke();
        doc.text(String(val ?? '—'), xPos + cellPadding, rowY + cellPadding, { width: colWidths[i] - (cellPadding * 2), height: rowHeight - (cellPadding * 2), align: 'left' });
        xPos += colWidths[i];
      }
    }
    
    // Draw centered footer ONLY on the last page
    const range = doc.bufferedPageRange();
    if (range.count > 0) {
      const lastPageIdx = range.start + range.count - 1;
      doc.switchToPage(lastPageIdx);
      
      // Save original bottom margin and disable it to prevent auto page-break
      const oldBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      
      const footerY = doc.page.height - 70;
      
      const companyName = '© Lalwani Software Solutions.';
      doc.fillColor('#333333').fontSize(10).font('Helvetica-Bold');
      const textWidth = doc.widthOfString(companyName);
      doc.text(companyName, (doc.page.width - textWidth) / 2, footerY);
      
      // Draw Contact Info below
      doc.fillColor('#666666').fontSize(9).font('Helvetica');
      const contactText = 'Contact : 03337104578 / 03152967527';
      const contactWidth = doc.widthOfString(contactText);
      doc.text(contactText, (doc.page.width - contactWidth) / 2, footerY + 14);
      
      // Restore original bottom margin
      doc.page.margins.bottom = oldBottomMargin;
    }

    doc.end();
    return new Promise((resolve) => {
      writeStream.on('finish', () => {
        resolve({ ok: true, path: filePath });
      });
      writeStream.on('error', (err) => {
        resolve({ ok: false, error: err.message });
      });
    });
  });
}

/* ──────────────────────────── EXCEL GENERATION ──────────────────────────── */
function handleExcelGenerators() {
  ipcMain.handle('business:exportExcel', async (_e, { from, to, role, data }) => {
    try {
      const ExcelJS = require('exceljs');
      const result = await dialog.showSaveDialog({
        defaultPath: `${role}_Performance_Report_${from}_to_${to}.xlsx`,
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
      });
      if (result.canceled) return { ok: false, canceled: true };
      const filePath = result.filePath;

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Performance Report');

      let columns = [];
      if (role === 'SR') {
        columns = [
          { header: 'SR Code', key: 'sr_code', width: 15 },
          { header: 'SR Name', key: 'sr_name', width: 25 },
          { header: 'SM Code', key: 'sm_code', width: 15 },
          { header: 'Total Business (PKR)', key: 'total_business', width: 20 },
          { header: 'No of Policies', key: 'no_of_policies', width: 15 },
          { header: '2nd Year Premium (PKR)', key: 'second_year_premium', width: 20 }
        ];
      } else if (role === 'SM') {
        columns = [
          { header: 'SM Code', key: 'sm_code', width: 15 },
          { header: 'SM Name', key: 'sm_name', width: 25 },
          { header: 'SSM Code', key: 'ssm_code', width: 15 },
          { header: 'Total Business (PKR)', key: 'total_business', width: 20 },
          { header: 'No of Policies', key: 'no_of_policies', width: 15 },
          { header: 'SRs Added', key: 'no_of_srs_added', width: 15 },
          { header: '2nd Year Premium (PKR)', key: 'second_year_premium', width: 20 }
        ];
      } else if (role === 'SSM') {
        columns = [
          { header: 'SSM Code', key: 'ssm_code', width: 15 },
          { header: 'SSM Name', key: 'ssm_name', width: 25 },
          { header: 'Area Manager', key: 'am_name', width: 25 },
          { header: 'Total Business (PKR)', key: 'total_business', width: 20 },
          { header: 'No of Policies', key: 'no_of_policies', width: 15 },
          { header: 'SRs Added', key: 'no_of_srs_added', width: 15 },
          { header: 'SMs Added', key: 'no_of_sms_added', width: 15 },
          { header: '2nd Year Premium (PKR)', key: 'second_year_premium', width: 20 }
        ];
      } else {
        columns = [
          { header: 'AM Code', key: 'am_code', width: 15 },
          { header: 'AM Name', key: 'am_name', width: 25 },
          { header: 'SSMs Added', key: 'no_of_ssms_added', width: 15 },
          { header: 'SMs Added', key: 'no_of_sms_added', width: 15 },
          { header: 'SRs Added', key: 'no_of_srs_added', width: 15 },
          { header: 'Total Business (PKR)', key: 'total_business', width: 20 },
          { header: 'No of Policies', key: 'no_of_policies', width: 15 },
          { header: '2nd Year Premium (PKR)', key: 'second_year_premium', width: 20 }
        ];
      }
      worksheet.columns = columns;

      for (const r of data) {
        const row = worksheet.addRow(r);
        if (r.id === '__grand__' || r.sr_name === 'GRAND TOTAL' || r.sm_name === 'GRAND TOTAL' || r.ssm_name === 'GRAND TOTAL' || r.am_name === 'GRAND TOTAL') {
          row.font = { bold: true };
        }
      }

      // Formatting header row
      worksheet.getRow(1).font = { bold: true };
      
      // Auto-formatting total values as currencies if needed, or keeping simple numeric styles
      await workbook.xlsx.writeFile(filePath);
      log().info(`Excel report saved successfully to: ${filePath}`);
      return { ok: true, path: filePath };
    } catch (err) {
      log().error(`Failed to generate Excel report: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('policy:exportExcel', async (_e, data) => {
    try {
      const ExcelJS = require('exceljs');
      const result = await dialog.showSaveDialog({
        defaultPath: `Policies_Export_${Date.now()}.xlsx`,
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
      });
      if (result.canceled) return { ok: false, canceled: true };
      const filePath = result.filePath;

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Policies');

      worksheet.columns = [
        { header: 'Serial No', key: 'serial_no', width: 10 },
        { header: 'Policy No', key: 'policy_no', width: 18 },
        { header: 'Name', key: 'holder_name', width: 25 },
        { header: 'Son/Daughter/Wife of', key: 'relation', width: 25 },
        { header: 'CNIC', key: 'cnic', width: 20 },
        { header: 'Date of Birth', key: 'dob', width: 15 },
        { header: 'Address', key: 'address', width: 30 },
        { header: 'Contact 1', key: 'contact_1', width: 15 },
        { header: 'Contact 2', key: 'contact_2', width: 15 },
        { header: 'Premium (PKR)', key: 'premium', width: 18 },
        { header: 'Issue Date', key: 'issue_date', width: 15 },
        { header: 'Due Date', key: 'due_date', width: 15 },
        { header: 'Last Paid', key: 'last_paid_date', width: 15 },
        { header: 'SR Code', key: 'sr_code', width: 15 },
        { header: 'SM Code', key: 'sm_code', width: 15 },
        { header: 'SSM Code', key: 'ssm_code', width: 15 },
        { header: 'Table Term', key: 'table_term', width: 15 }
      ];

      let idx = 1;
      for (const r of data) {
        worksheet.addRow({
          serial_no: idx++,
          policy_no: r.policy_no && r.policy_no.startsWith('TEMP-POL-') ? '' : r.policy_no,
          holder_name: r.holder_name,
          relation: r.relation || '',
          cnic: r.cnic,
          dob: formatDbDate(r.dob),
          address: r.address || '',
          contact_1: r.contact_1 || '',
          contact_2: r.contact_2 || '',
          premium: r.premium,
          issue_date: formatDbDate(r.issue_date),
          due_date: formatDbDate(r.due_date),
          last_paid_date: formatDbDate(r.last_paid_date),
          sr_code: r.sr_code || '',
          sm_code: r.sm_code || '',
          ssm_code: r.ssm_code || '',
          table_term: r.table_term || ''
        });
      }

      worksheet.getRow(1).font = { bold: true };

      await workbook.xlsx.writeFile(filePath);
      log().info(`Policies list exported to Excel successfully: ${filePath}`);
      return { ok: true, path: filePath };
    } catch (err) {
      log().error(`Failed to export policies to Excel: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('proposer:exportExcel', async (_e, data) => {
    try {
      const ExcelJS = require('exceljs');
      const result = await dialog.showSaveDialog({
        defaultPath: `Proposers_Export_${Date.now()}.xlsx`,
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
      });
      if (result.canceled) return { ok: false, canceled: true };
      const filePath = result.filePath;

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Proposals');

      worksheet.columns = [
        { header: 'Serial No', key: 'serial_no', width: 10 },
        { header: 'Proposal No', key: 'proposal_no', width: 18 },
        { header: 'Name', key: 'holder_name', width: 25 },
        { header: 'Contact 1', key: 'contact_1', width: 15 },
        { header: 'Contact 2', key: 'contact_2', width: 15 },
        { header: 'Premium (PKR)', key: 'premium', width: 18 },
        { header: 'Premium Type', key: 'amount_type', width: 15 },
        { header: 'PR No', key: 'pr_no', width: 15 },
        { header: 'PR Date', key: 'pr_date', width: 15 },
        { header: 'SR Code', key: 'sr_code', width: 15 },
        { header: 'SM Code', key: 'sm_code', width: 15 },
        { header: 'SSM Code', key: 'ssm_code', width: 15 },
        { header: 'Requirements', key: 'requirements', width: 30 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Converted', key: 'converted_to_policy', width: 12 }
      ];

      let idx = 1;
      for (const r of data) {
        worksheet.addRow({
          serial_no: idx++,
          proposal_no: r.proposal_no || '',
          holder_name: r.holder_name || '',
          contact_1: r.contact_1 || '',
          contact_2: r.contact_2 || '',
          premium: r.premium,
          amount_type: (r.amount_type || '').toUpperCase(),
          pr_no: r.pr_no || '',
          pr_date: formatDbDate(r.pr_date),
          sr_code: r.sr_code || '',
          sm_code: r.sm_code || '',
          ssm_code: r.ssm_code || '',
          requirements: r.requirements || '',
          status: r.status === 'ok' ? 'OK' : 'Not OK',
          converted_to_policy: r.converted_to_policy ? 'Yes' : 'No'
        });
      }

      worksheet.getRow(1).font = { bold: true };

      await workbook.xlsx.writeFile(filePath);
      log().info(`Proposers list exported to Excel successfully: ${filePath}`);
      return { ok: true, path: filePath };
    } catch (err) {
      log().error(`Failed to export proposers to Excel: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('sr:exportExcel', async (_e, data) => {
    try {
      const ExcelJS = require('exceljs');
      const result = await dialog.showSaveDialog({
        defaultPath: `SR_Export_${Date.now()}.xlsx`,
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
      });
      if (result.canceled) return { ok: false, canceled: true };
      const filePath = result.filePath;

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sales Representatives');

      worksheet.columns = [
        { header: 'Serial No', key: 'serial_no', width: 10 },
        { header: 'SR Code', key: 'sr_code', width: 15 },
        { header: 'Name', key: 'sr_name', width: 25 },
        { header: 'Son/Daughter/Wife of', key: 'relation', width: 25 },
        { header: 'CNIC', key: 'cnic', width: 20 },
        { header: 'Date of Birth', key: 'dob', width: 15 },
        { header: 'Contact 1', key: 'contact_1', width: 15 },
        { header: 'Contact 2', key: 'contact_2', width: 15 },
        { header: 'Address', key: 'address', width: 30 },
        { header: 'SM Code', key: 'sm_code', width: 15 },
        { header: 'SSM Code', key: 'ssm_code', width: 15 },
        { header: 'AM Code', key: 'am_code', width: 15 },
        { header: 'Registration No', key: 'registration_no', width: 20 },
        { header: 'Registration Date', key: 'registration_date', width: 18 },
        { header: 'No of Policies', key: 'no_of_policies', width: 15 },
        { header: 'Total Business (PKR)', key: 'total_business', width: 20 },
        { header: '2nd Year Premium (PKR)', key: 'second_year_premium', width: 20 },
        { header: 'Status', key: 'status', width: 12 }
      ];

      let idx = 1;
      for (const r of data) {
        worksheet.addRow({
          serial_no: idx++,
          sr_code: r.sr_code || '',
          sr_name: r.sr_name || '',
          relation: r.relation || '',
          cnic: r.cnic || '',
          dob: formatDbDate(r.dob),
          contact_1: r.contact_1 || '',
          contact_2: r.contact_2 || '',
          address: r.address || '',
          sm_code: r.sm_code || '',
          ssm_code: r.ssm_code || '',
          am_code: r.am_code || '',
          registration_no: r.registration_no || '',
          registration_date: formatDbDate(r.registration_date),
          no_of_policies: r.no_of_policies || 0,
          total_business: r.total_business || 0,
          second_year_premium: r.second_year_premium || 0,
          status: (r.status || '').toUpperCase()
        });
      }

      worksheet.getRow(1).font = { bold: true };

      await workbook.xlsx.writeFile(filePath);
      log().info(`SR list exported to Excel successfully: ${filePath}`);
      return { ok: true, path: filePath };
    } catch (err) {
      log().error(`Failed to export SRs to Excel: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('sm:exportExcel', async (_e, data) => {
    try {
      const ExcelJS = require('exceljs');
      const result = await dialog.showSaveDialog({
        defaultPath: `SM_Export_${Date.now()}.xlsx`,
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
      });
      if (result.canceled) return { ok: false, canceled: true };
      const filePath = result.filePath;

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sales Managers');

      worksheet.columns = [
        { header: 'Serial No', key: 'serial_no', width: 10 },
        { header: 'SM Code', key: 'sm_code', width: 15 },
        { header: 'Name', key: 'sm_name', width: 25 },
        { header: 'Son/Daughter/Wife of', key: 'relation', width: 25 },
        { header: 'CNIC', key: 'cnic', width: 20 },
        { header: 'Date of Birth', key: 'dob', width: 15 },
        { header: 'Contact 1', key: 'contact_1', width: 15 },
        { header: 'Contact 2', key: 'contact_2', width: 15 },
        { header: 'Address', key: 'address', width: 30 },
        { header: 'SSM Code', key: 'ssm_code', width: 15 },
        { header: 'AM Code', key: 'am_code', width: 15 },
        { header: 'Registration No', key: 'registration_no', width: 20 },
        { header: 'Registration Date', key: 'registration_date', width: 18 },
        { header: 'No of SR', key: 'no_of_srs', width: 15 },
        { header: 'Total Business (PKR)', key: 'total_business', width: 20 },
        { header: '2nd Year Premium (PKR)', key: 'second_year_premium', width: 20 },
        { header: 'Status', key: 'status', width: 12 }
      ];

      let idx = 1;
      for (const r of data) {
        worksheet.addRow({
          serial_no: idx++,
          sm_code: r.sm_code || '',
          sm_name: r.sm_name || '',
          relation: r.relation || '',
          cnic: r.cnic || '',
          dob: formatDbDate(r.dob),
          contact_1: r.contact_1 || '',
          contact_2: r.contact_2 || '',
          address: r.address || '',
          ssm_code: r.ssm_code || '',
          am_code: r.am_code || '',
          registration_no: r.registration_no || '',
          registration_date: formatDbDate(r.registration_date),
          no_of_srs: r.no_of_srs || 0,
          total_business: r.total_business || 0,
          second_year_premium: r.second_year_premium || 0,
          status: (r.status || '').toUpperCase()
        });
      }

      worksheet.getRow(1).font = { bold: true };

      await workbook.xlsx.writeFile(filePath);
      log().info(`SM list exported to Excel successfully: ${filePath}`);
      return { ok: true, path: filePath };
    } catch (err) {
      log().error(`Failed to export SMs to Excel: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('ssm:exportExcel', async (_e, data) => {
    try {
      const ExcelJS = require('exceljs');
      const result = await dialog.showSaveDialog({
        defaultPath: `SSM_Export_${Date.now()}.xlsx`,
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
      });
      if (result.canceled) return { ok: false, canceled: true };
      const filePath = result.filePath;

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Senior Sales Managers');

      worksheet.columns = [
        { header: 'Serial No', key: 'serial_no', width: 10 },
        { header: 'SSM Code', key: 'ssm_code', width: 15 },
        { header: 'Name', key: 'ssm_name', width: 25 },
        { header: 'Son/Daughter/Wife of', key: 'relation', width: 25 },
        { header: 'CNIC', key: 'cnic', width: 20 },
        { header: 'Date of Birth', key: 'dob', width: 15 },
        { header: 'Contact 1', key: 'contact_1', width: 15 },
        { header: 'Contact 2', key: 'contact_2', width: 15 },
        { header: 'Address', key: 'address', width: 30 },
        { header: 'AM Code', key: 'am_code', width: 15 },
        { header: 'Registration No', key: 'registration_no', width: 20 },
        { header: 'Registration Date', key: 'registration_date', width: 18 },
        { header: 'No of SRs', key: 'no_of_srs', width: 15 },
        { header: 'No of SMs', key: 'no_of_sms', width: 15 },
        { header: 'Total Business (PKR)', key: 'total_business', width: 20 },
        { header: '2nd Year Premium (PKR)', key: 'second_year_premium', width: 20 },
        { header: 'Status', key: 'status', width: 12 }
      ];

      let idx = 1;
      for (const r of data) {
        worksheet.addRow({
          serial_no: idx++,
          ssm_code: r.ssm_code || '',
          ssm_name: r.ssm_name || '',
          relation: r.relation || '',
          cnic: r.cnic || '',
          dob: formatDbDate(r.dob),
          contact_1: r.contact_1 || '',
          contact_2: r.contact_2 || '',
          address: r.address || '',
          am_code: r.am_code || '',
          registration_no: r.registration_no || '',
          registration_date: formatDbDate(r.registration_date),
          no_of_srs: r.no_of_srs || 0,
          no_of_sms: r.no_of_sms || 0,
          total_business: r.total_business || 0,
          second_year_premium: r.second_year_premium || 0,
          status: (r.status || '').toUpperCase()
        });
      }

      worksheet.getRow(1).font = { bold: true };

      await workbook.xlsx.writeFile(filePath);
      log().info(`SSM list exported to Excel successfully: ${filePath}`);
      return { ok: true, path: filePath };
    } catch (err) {
      log().error(`Failed to export SSMs to Excel: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('am:exportExcel', async (_e, data) => {
    try {
      const ExcelJS = require('exceljs');
      const result = await dialog.showSaveDialog({
        defaultPath: `AM_Export_${Date.now()}.xlsx`,
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
      });
      if (result.canceled) return { ok: false, canceled: true };
      const filePath = result.filePath;

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Area Managers');

      worksheet.columns = [
        { header: 'Serial No', key: 'serial_no', width: 10 },
        { header: 'AM Code', key: 'am_code', width: 15 },
        { header: 'Name', key: 'am_name', width: 25 },
        { header: 'Son/Daughter/Wife of', key: 'relation', width: 25 },
        { header: 'CNIC', key: 'cnic', width: 20 },
        { header: 'Date of Birth', key: 'dob', width: 15 },
        { header: 'Contact 1', key: 'contact_1', width: 15 },
        { header: 'Contact 2', key: 'contact_2', width: 15 },
        { header: 'Address', key: 'address', width: 30 },
        { header: 'Registration No', key: 'registration_no', width: 20 },
        { header: 'Registration Date', key: 'registration_date', width: 18 },
        { header: 'No of SRs', key: 'no_of_srs', width: 15 },
        { header: 'No of SMs', key: 'no_of_sms', width: 15 },
        { header: 'No of SSMs', key: 'no_of_ssms', width: 15 },
        { header: 'Total Business (PKR)', key: 'total_business', width: 20 },
        { header: '2nd Year Premium (PKR)', key: 'second_year_premium', width: 20 },
        { header: 'Status', key: 'status', width: 12 }
      ];

      let idx = 1;
      for (const r of data) {
        worksheet.addRow({
          serial_no: idx++,
          am_code: r.am_code || '',
          am_name: r.am_name || '',
          relation: r.relation || '',
          cnic: r.cnic || '',
          dob: formatDbDate(r.dob),
          contact_1: r.contact_1 || '',
          contact_2: r.contact_2 || '',
          address: r.address || '',
          registration_no: r.registration_no || '',
          registration_date: formatDbDate(r.registration_date),
          no_of_srs: r.no_of_srs || 0,
          no_of_sms: r.no_of_sms || 0,
          no_of_ssms: r.no_of_ssms || 0,
          total_business: r.total_business || 0,
          second_year_premium: r.second_year_premium || 0,
          status: (r.status || '').toUpperCase()
        });
      }

      worksheet.getRow(1).font = { bold: true };

      await workbook.xlsx.writeFile(filePath);
      log().info(`AM list exported to Excel successfully: ${filePath}`);
      return { ok: true, path: filePath };
    } catch (err) {
      log().error(`Failed to export AMs to Excel: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });
}

/* ──────────────────────────── REGISTER ALL ──────────────────────────── */
function registerAllHandlers() {
  handleAuth();
  handleLicense();
  handleUsers();
  handleAreaManagers();
  handleSSM();
  handleSM();
  handleSR();
  handleProposer();
  handlePolicy();
  handleNotifications();
  handleDashboard();
  handleBusinessFigure();
  handleConfig();
  handleBackup();
  handlePdfGenerators();
  handleExcelGenerators();
  handleDatabaseReset();
  handleFileOpening();
}

function handleFileOpening() {
  ipcMain.handle('app:openFile', async (_e, filePath) => {
    try {
      if (!filePath) {
        return { ok: false, error: 'No file path provided' };
      }
      if (!fs.existsSync(filePath)) {
        return { ok: false, error: 'File does not exist on disk' };
      }
      const err = await shell.openPath(filePath);
      if (err) {
        return { ok: false, error: err };
      }
      return { ok: true };
    } catch (err) {
      log().error(`Failed to open file ${filePath}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('app:reload', async (e) => {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) {
      win.webContents.reload();
    }
    return { ok: true };
  });
}

function handleDatabaseReset() {
  ipcMain.handle('database:reset', async () => {
    const db = getDb();
    try {
      db.transaction(() => {
        db.prepare('DELETE FROM Notifications').run();
        db.prepare('DELETE FROM Second_Year_Log').run();
        db.prepare('DELETE FROM Policy_Register').run();
        db.prepare('DELETE FROM Proposer_Register').run();
        db.prepare('DELETE FROM SR').run();
        db.prepare('DELETE FROM SM').run();
        db.prepare('DELETE FROM SSM').run();
        db.prepare('DELETE FROM Area_Managers').run();
        
        // Reset target config
        db.prepare('DELETE FROM Config').run();
        db.prepare("INSERT INTO Config (key, value) VALUES ('monthly_target', '0')").run();
        db.prepare("INSERT INTO Config (key, value) VALUES ('yearly_target', '0')").run();
        db.prepare("INSERT INTO Config (key, value) VALUES ('license_sent', '0')").run();
      })();
      log().info('System database cleared successfully.');
      return { ok: true };
    } catch (err) {
      log().error(`Database reset failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('database:seed', async () => {
    const db = getDb();
    try {
      db.transaction(seedSampleData)(db);
      log().info('Database seeded with sample data manually.');
      return { ok: true };
    } catch (err) {
      log().error(`Database seeding failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('developer:package-app', async () => {
    const log = getLogger();
    log.info('Starting UI-triggered package & build process...');
    try {
      // 1. Close database connection to checkpoint SQLite WAL file, then copy database to root
      closeDb();
      const sourceDb = path.join(app.getPath('userData'), 'appdata', 'sysconfig.dat');
      const targetDb = path.join(app.getAppPath(), 'sysconfig.dat');
      if (fs.existsSync(sourceDb)) {
        fs.copyFileSync(sourceDb, targetDb);
        log.info('Database checkpointed and copied to project root successfully.');
      } else {
        log.warn('No source database found to copy.');
      }

      const projectRoot = app.getAppPath();
      const { spawn } = require('child_process');

      // Helper: run a command with spawn (no maxBuffer limit, streams stdout/stderr to logger)
      function runCommand(command, args) {
        return new Promise((resolve, reject) => {
          log.info(`Running: ${command} ${args.join(' ')}`);
          const child = spawn(command, args, {
            cwd: projectRoot,
            shell: true,
            env: { ...process.env, FORCE_COLOR: '0' },
          });
          let stderrData = '';
          child.stdout.on('data', (data) => {
            const line = data.toString().trim();
            if (line) log.info(`[build] ${line}`);
          });
          child.stderr.on('data', (data) => {
            const line = data.toString().trim();
            stderrData += line + '\n';
            if (line) log.warn(`[build:stderr] ${line}`);
          });
          child.on('error', (err) => {
            log.error(`Failed to start process: ${err.message}`);
            reject(new Error(`Failed to start ${command}: ${err.message}`));
          });
          child.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              const errorMsg = stderrData.trim() || `Process exited with code ${code}`;
              reject(new Error(errorMsg));
            }
          });
        });
      }

      // 2. Build the React frontend
      await runCommand('npx', ['vite', 'build']);
      log.info('Vite build completed successfully.');

      // 3. Package with electron-builder
      await runCommand('npx', ['electron-builder', '--win']);
      log.info('Electron Builder packaging completed successfully.');

      // 4. Zip the output
      const exePath = path.join(projectRoot, 'release', 'Insurance Policy Records Management System Setup 1.0.1.exe');
      const zipPath = path.join(projectRoot, 'Insurance_Setup_Exe.zip');
      if (fs.existsSync(exePath)) {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip();
        zip.addLocalFile(exePath);
        zip.writeZip(zipPath);
        log.info('Setup EXE zipped successfully.');
        return { ok: true };
      } else {
        // Check if the exe exists with a different name pattern
        const releaseDir = path.join(projectRoot, 'release');
        if (fs.existsSync(releaseDir)) {
          const files = fs.readdirSync(releaseDir).filter(f => f.endsWith('.exe'));
          if (files.length > 0) {
            const foundExe = path.join(releaseDir, files[0]);
            const AdmZip = require('adm-zip');
            const zip = new AdmZip();
            zip.addLocalFile(foundExe);
            zip.writeZip(zipPath);
            log.info(`Setup EXE (${files[0]}) zipped successfully.`);
            return { ok: true };
          }
        }
        return { ok: false, error: 'Setup executable not found after build. Check logs for details.' };
      }
    } catch (err) {
      log.error(`Developer package app failed: ${err.message}`);
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { registerAllHandlers };
