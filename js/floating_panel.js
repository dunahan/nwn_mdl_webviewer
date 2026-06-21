/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Floating Panel Manager
   ═══════════════════════════════════════════════

   Turns any sidebar container into a freely
   positionable, dockable floating window.

   Registration:
     Attach data-floatable to the outer container div.
     The container must have an ID
     (for localStorage persistence) and follow the
     standard header convention:

       <div id="my-panel" data-floatable>
         <div id="my-header" onclick="toggleFn()">
           <span class="section-heading">Title</span>
           <span class="tex-arrow open">▶</span>
         </div>
         <div id="my-body">…</div>
       </div>

   What gets injected into the header:
     fp-drag-strip  — Drag handle (invisible in sidebar,
                       visible when floating)
     fp-float-btn   — ⇱ / ⇲ toggle button

   The existing collapse onclick and tex-arrow
   remain completely untouched.

   Persistence (localStorage):
     Key:   "nwn-fp-<panelId>"
     Value: { floating: bool, pos: { x, y } }
     → Floating state and position are saved and
       restored across sessions.

   Public API (window.FloatPanel):
     FloatPanel.init()          – scan DOM and register
                                   (via DOMContentLoaded)
     FloatPanel.toggleFloat(id) – float ↔ dock
     FloatPanel.dockAll()       – dock all panels
   ═══════════════════════════════════════════════ */

const FloatPanel = (() => {

  const LS_PREFIX = 'nwn-fp-';  // localStorage key prefix
  const PANEL_W   = 280;         // Default width when floating (px) — matches sidebar
  const CASCADE   = 28;          // Cascade offset for multiple open panels

  // Registry: panelId → state object
  const _reg = {};

  // ════════════════════════════════════════════════
  //  INIT — scan DOM, register all data-floatable elements
  // ════════════════════════════════════════════════

  function init() {
    document.querySelectorAll('[data-floatable]').forEach(el => {
      if (el.id) _register(el);
    });
  }

  function _register(el) {
    const id     = el.id;
    const header = el.firstElementChild;
    if (!header) return;

    // ── Insert drag strip before the tex-arrow ──────────────────────────
    // Takes up flex:1 and pushes arrow + float-btn to the right when floating.
    const dragStrip = document.createElement('span');
    dragStrip.className   = 'fp-drag-strip';
    dragStrip.textContent = '⠿ ⠿ ⠿';
    dragStrip.title       = L('nd_drag_title');
    // Prevents drag clicks from triggering the panel collapse
    dragStrip.addEventListener('click', e => e.stopPropagation());

    const texArrow = header.querySelector('.tex-arrow');
    if (texArrow) {
      header.insertBefore(dragStrip, texArrow);
    } else {
      header.appendChild(dragStrip);
    }

    // ── Insert float toggle button at the far right ─────────────────────────
    const floatBtn = document.createElement('button');
    floatBtn.className   = 'fp-float-btn';
    floatBtn.textContent = '⇱';
    floatBtn.title       = L('fp_float_title');
    floatBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleFloat(id);
    });
    header.appendChild(floatBtn);

    _reg[id] = {
      el,
      origParent:      el.parentNode,
      origNextSibling: el.nextSibling,  // null = was the last child
      floating:        false,
      pos:             null,
      floatBtn,
      dragStrip,
      _dragReady:      false,           // drag listener already attached?
    };

    // Restore saved state from localStorage
    const saved = _load(id);
    if (saved?.floating) {
      // Wait one microtask so the layout is fully initialised
      Promise.resolve().then(() => _float(id, saved.pos));
    }
  }

  // ════════════════════════════════════════════════
  //  PUBLIC
  // ════════════════════════════════════════════════

  function toggleFloat(id) {
    const p = _reg[id];
    if (!p) return;
    p.floating ? _dock(id) : _float(id, null);
  }

  function dockAll() {
    for (const id of Object.keys(_reg)) {
      if (_reg[id].floating) _dock(id);
    }
  }

  // ════════════════════════════════════════════════
  //  FLOAT  (Sidebar → Viewport)
  // ════════════════════════════════════════════════

  function _float(id, savedPos) {
    const p = _reg[id];
    if (!p || p.floating) return;

    const viewport = document.getElementById('viewport');
    if (!viewport) return;

    // Default position: panels cascaded with offset
    let pos = savedPos;
    if (!pos) {
      const n = Object.values(_reg).filter(x => x.floating).length;
      pos = { x: 20 + n * CASCADE, y: 60 + n * CASCADE };
    }

    // Set class + position, then append to viewport
    p.el.classList.add('panel-floating');
    p.el.style.left = pos.x + 'px';
    p.el.style.top  = pos.y + 'px';

    // Append to end of viewport → automatically renders above other panels
    viewport.appendChild(p.el);

    // After layout, clamp to viewport bounds (offsetWidth now available)
    pos = _clamp(pos, p.el, viewport);
    p.el.style.left = pos.x + 'px';
    p.el.style.top  = pos.y + 'px';

    p.floating = true;
    p.pos      = pos;

    _setBtn(p, true);
    if (!p._dragReady) _bindDrag(id);
    _save(id);
  }

  // ════════════════════════════════════════════════
  //  DOCK  (Viewport → Sidebar)
  // ════════════════════════════════════════════════

  function _dock(id) {
    const p = _reg[id];
    if (!p || !p.floating) return;

    p.el.classList.remove('panel-floating');
    p.el.style.left = '';
    p.el.style.top  = '';

    // Re-insert at the exact original DOM position
    const ok = p.origNextSibling && p.origNextSibling.parentNode === p.origParent;
    if (ok) {
      p.origParent.insertBefore(p.el, p.origNextSibling);
    } else {
      p.origParent.appendChild(p.el);
    }

    p.floating = false;
    _setBtn(p, false);
    _save(id);
  }

  // ════════════════════════════════════════════════
  //  DRAG
  // ════════════════════════════════════════════════

  function _bindDrag(id) {
    const p = _reg[id];
    if (!p) return;
    p._dragReady = true;

    let active = false, sx, sy, sl, st;

    function xy(e) {
      const src = e.touches ? e.touches[0] : e;
      return { x: src.clientX, y: src.clientY };
    }

    const onStart = e => {
      if (!p.floating) return;
      if (e.type === 'mousedown' && e.button !== 0) return;
      active = true;
      const { x, y } = xy(e);
      sx = x; sy = y;
      sl = p.pos?.x ?? p.el.offsetLeft;
      st = p.pos?.y ?? p.el.offsetTop;
      p.dragStrip.style.cursor = 'grabbing';
      // Bring to front: append to end of viewport
      const vp = document.getElementById('viewport');
      if (vp) vp.appendChild(p.el);
      e.preventDefault();
    };

    const onMove = e => {
      if (!active) return;
      if (e.cancelable) e.preventDefault();
      const { x, y } = xy(e);
      const vp = document.getElementById('viewport');
      if (!vp) return;
      const clamped = _clamp({ x: sl + (x - sx), y: st + (y - sy) }, p.el, vp);
      p.el.style.left = clamped.x + 'px';
      p.el.style.top  = clamped.y + 'px';
      p.pos = clamped;
    };

    const onEnd = () => {
      if (!active) return;
      active = false;
      p.dragStrip.style.cursor = '';
      _save(id);   // Persist position after every drag end
    };

    p.dragStrip.addEventListener('mousedown',  onStart);
    p.dragStrip.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('mousemove',   onMove);
    window.addEventListener('mouseup',     onEnd);
    window.addEventListener('touchmove',   onMove,  { passive: false });
    window.addEventListener('touchend',    onEnd);
    window.addEventListener('touchcancel', onEnd);
  }

  // ════════════════════════════════════════════════
  //  HELPERS
  // ════════════════════════════════════════════════

  // Clamp position to viewport bounds
  function _clamp(pos, el, vp) {
    const w = el.offsetWidth  || PANEL_W;
    const h = el.offsetHeight || 200;
    const r = vp.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(pos.x, r.width  - w)),
      y: Math.max(0, Math.min(pos.y, r.height - h)),
    };
  }

  // Update float button icon and tooltip
  function _setBtn(p, floating) {
    p.floatBtn.textContent = floating ? '↙' : '↗';
    p.floatBtn.title       = floating ? L('fp_dock_title') : L('fp_float_title');
  }

  // ════════════════════════════════════════════════
  //  PERSISTENCE  (localStorage)
  // ════════════════════════════════════════════════

  function _save(id) {
    const p = _reg[id];
    if (!p) return;
    try {
      localStorage.setItem(LS_PREFIX + id, JSON.stringify({
        floating: p.floating,
        pos:      p.pos,
      }));
    } catch (_) { /* private browsing / storage full */ }
  }

  function _load(id) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + id);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }

  // ════════════════════════════════════════════════
  //  PUBLIC EXPORT
  // ════════════════════════════════════════════════

  return { init, toggleFloat, dockAll };

})();

document.addEventListener('DOMContentLoaded', () => FloatPanel.init());
