/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Log Panel & Sidebar Toggle
   ═══════════════════════════════════════════════ */

//  Log-Panel
// ─────────────────────────────────────────────
let logOpen    = false;
let logErrors  = 0;
let logWarns   = 0;

function logMsg(msg, level) {
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
