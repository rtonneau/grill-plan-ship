// skills/gps/scripts/lib/templates.js
//
// The markdown templates in skills/gps/assets/ and their {{ key }} slots.

const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'assets');

// The template's text with LF line endings, however it was checked out
// (git's autocrlf turns them into CRLF on Windows).
function loadTemplate(fileName) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, fileName), 'utf-8').replace(/\r\n/g, '\n');
}

function renderTemplate(content, vars) {
  return content.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}

module.exports = { loadTemplate, renderTemplate };
