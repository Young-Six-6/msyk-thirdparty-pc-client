// main/store.js
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function getStorePath() {
  return path.join(app.getPath('userData'), 'store.json');
}

function readStore() {
  try {
    const p = getStorePath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(obj) {
  const p = getStorePath();
  const old = readStore();
  fs.writeFileSync(p, JSON.stringify({ ...old, ...obj }, null, 2), 'utf8');
}

module.exports = { readStore, writeStore };
