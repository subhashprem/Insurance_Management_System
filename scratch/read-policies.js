'use strict';
const path = require('path');
const fs = require('fs');

const mockElectron = {
  app: {
    getPath: (name) => {
      if (name === 'userData') {
        return path.join(process.env.APPDATA, 'insurance-records-management-system');
      }
      return '.';
    }
  }
};

const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'electron') return mockElectron;
  return originalRequire.apply(this, arguments);
};

const { getDb } = require('e:/Electron Practice/Insurance/main/database');
const { decrypt } = require('e:/Electron Practice/Insurance/main/crypto');

try {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM Policy_Register LIMIT 10").all();
  console.log("=== POLICY REGISTER SAMPLES ===");
  rows.forEach(r => {
    console.log({
      id: r.id,
      policy_no: decrypt(r.policy_no),
      holder_name: decrypt(r.holder_name),
      premium: r.premium,
      issue_date: r.issue_date,
      due_date: r.due_date,
      last_paid_date: r.last_paid_date,
      relation: r.relation ? decrypt(r.relation) : null
    });
  });
} catch (err) {
  console.error("Error reading policies:", err);
}
