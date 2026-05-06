/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Log Panel & Sidebar Toggle
   ═══════════════════════════════════════════════ */

//  Log-Panel
// ─────────────────────────────────────────────
let logOpen    = false;
let logErrors  = 0;
let logWarns   = 0;

function logMsg(msg, level, i18nKey = null, i18nParams = null) {
  // level: 'error' | 'warn' | 'info'
  const entries = document.getElementById('log-entries');
  const toggle  = document.getElementById('log-toggle');

  const now = new Date();
  const ts  = now.getHours().toString().padStart(2,'0') + ':'
             + now.getMinutes().toString().padStart(2,'0') + ':'
             + now.getSeconds().toString().padStart(2,'0');

  const icons = { error: '✕', warn: '⚠', info: '·' };
  const row = document.createElement('div');
  row.className = 'log-entry log-' + level;

  // i18n-Schlüssel und Parameter für spätere Übersetzung speichern
  if (i18nKey) {
    row.dataset.i18nKey = i18nKey;
    if (i18nParams) row.dataset.i18nParams = JSON.stringify(i18nParams);
  }

  const iconSpan = document.createElement('span');
  iconSpan.className = 'log-icon';
  iconSpan.textContent = icons[level] || '';

  const msgSpan = document.createElement('span');
  msgSpan.className = 'log-msg';
  msgSpan.textContent = String(msg);

  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  timeSpan.textContent = ts;

  row.appendChild(iconSpan);
  row.appendChild(msgSpan);
  row.appendChild(timeSpan);

  entries.appendChild(row);
  entries.scrollTop = entries.scrollHeight;

  if (level === 'error') logErrors++;
  if (level === 'warn')  logWarns++;

  // Badge aktualisieren
  const total = logErrors + logWarns;
  document.getElementById('log-count-badge').textContent = total > 0 ? total : '';
  toggle.className = logErrors > 0 ? 'has-errors' : (logWarns > 0 ? 'has-warns' : '');

  // Bei Fehlern Panel automatisch öffnen
  if (level === 'error' && !logOpen) toggleLogPanel();
}

function logError(msg) { console.error(msg); logMsg(msg, 'error'); }
function logWarn(msg)  { console.warn(msg);  logMsg(msg, 'warn');  }
function logInfo(msg)  { logMsg(msg, 'info'); }

// i18n-fähige Varianten: speichern Schlüssel + Parameter für Retranslation
function logErrorI18n(key, params) { const t = params ? fmt(key, params) : L(key); console.error(t); logMsg(t, 'error', key, params || null); }
function logWarnI18n(key,  params) { const t = params ? fmt(key, params) : L(key); console.warn(t);  logMsg(t, 'warn',  key, params || null); }
function logInfoI18n(key,  params) { const t = params ? fmt(key, params) : L(key);                   logMsg(t, 'info',  key, params || null); }

// Alle vorhandenen Log-Einträge mit gespeichertem i18n-Schlüssel neu übersetzen.
// Wird von switchLanguage() aufgerufen.
function retranslateLog() {
  document.querySelectorAll('#log-entries .log-entry[data-i18n-key]').forEach(row => {
    const key    = row.dataset.i18nKey;
    const params = row.dataset.i18nParams ? JSON.parse(row.dataset.i18nParams) : null;
    const msgSpan = row.querySelector('.log-msg');
    if (msgSpan) msgSpan.textContent = params ? fmt(key, params) : L(key);
  });
}

function toggleLogPanel() {
  const panel  = document.getElementById('log-panel');
  const icon   = document.getElementById('log-icon-sym');
  logOpen = !logOpen;
  panel.classList.toggle('open', logOpen);
  icon.textContent = logOpen ? '▼' : '▲';
}

function clearLog() {
  document.getElementById('log-entries').innerHTML = '';
  document.getElementById('log-count-badge').textContent = '';
  document.getElementById('log-toggle').className = '';
  logErrors = 0; logWarns = 0;
}

// ─────────────────────────────────────────────
//  Sidebar Toggle
// ─────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const btn     = document.getElementById('sidebar-toggle');
  const collapsed = sidebar.classList.toggle('collapsed');
  btn.classList.toggle('collapsed', collapsed);
  // Nach der CSS-Transition (250ms) den Canvas neu berechnen
  setTimeout(resize, 260);
}

function toggleTextureList() {
  const list  = document.getElementById('texture-list');
  const arrow = document.querySelector('#texture-header .tex-arrow');
  const isOpen = !list.classList.contains('collapsed');
  list.classList.toggle('collapsed', isOpen);
  if (arrow) arrow.classList.toggle('open', !isOpen);
}

function toggleAnimPanel() {
  const body  = document.getElementById('anim-body');
  const arrow = document.querySelector('#anim-header .tex-arrow');
  const isOpen = !body.classList.contains('collapsed');
  body.classList.toggle('collapsed', isOpen);
  if (arrow) arrow.classList.toggle('open', !isOpen);
}

// ─────────────────────────────────────────────
