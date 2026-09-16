// scripts/lib/templates.js
const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates');

function loadTemplate(fileName) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, fileName), 'utf-8');
}

function renderTemplate(content, vars) {
  return content.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

module.exports = { loadTemplate, renderTemplate };
