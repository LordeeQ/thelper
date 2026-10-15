// ════════════════════════════════════════════════════════════
//  T-Helper · Модуль расписания (TWFM)
// ════════════════════════════════════════════════════════════
(function () {
  if (window.__TWFM_LOADED) return;
  window.__TWFM_LOADED = true;

  const MSG_TYPE = '__TWFM_SCHEDULE__';

  // Pure schedule logic — inlined so the content script is self-contained.
  // Keep in sync with src/core/schedule-core.js (that copy is what the tests import).
  function isSkeletonText(t) {
    return !t || /^(.)\1{2,}$/.test(t.replace(/\s/g, ''));
  }
  function normItemMins(items) {
    let offset = 0, prev = -1, out = [];
    for (const it of items) {
      const [h, m] = it.time.split(':').map(Number);
      let abs = h * 60 + m + offset;
      if (prev >= 0 && abs < prev) { offset += 1440; abs += 1440; }
      out.push(abs);
      prev = abs;
    }
    return out;
  }
  function isValidSchedule(items) {
    if (!items || items.length < 2) return false;
    const norm = normItemMins(items);
    for (let i = 1; i < norm.length; i++) if (norm[i] <= norm[i - 1]) return false;
    return true;
  }
  function fmtDur(mins) {
    if (mins < 0) mins = 0;
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return `${h} ч ${m} мин`;
    if (h)      return `${h} ч`;
    return `${m} мин`;
  }
  function computeStateAt(items, nowMin) {
    const norm     = normItemMins(items);
    const firstMin = norm.length ? norm[0] : 0;
    const lastMin  = norm.length ? norm[norm.length - 1] : 0;
    let nm = nowMin;
    if (nm < firstMin && nm + 1440 <= lastMin) nm += 1440;
    let idx = -1;
    for (let i = 0; i < norm.length; i++) {
      if (nm >= norm[i]) idx = i; else break;
    }
    const current     = idx >= 0 ? items[idx] : null;
    const next        = (idx + 1 < items.length) ? items[idx + 1] : null;
    const beforeStart = idx < 0;
    const isLast      = idx >= 0 && idx === items.length - 1;
    const endMin      = next ? norm[idx + 1] : null;
    const remaining   = endMin !== null ? endMin - nm : null;
    return { idx, current, next, beforeStart, isLast, remaining };
  }

  // ── helpers ───────────────────────────────────────────────
  function parseSchedule() {
    const items = [];
    document.querySelectorAll('twfm-schedule-item').forEach(el => {
      const timeEl = el.querySelector('.schedule-item-time');
      const textEl = el.querySelector('.schedule-item-text');
      if (!timeEl || !textEl) return;
      const time = timeEl.textContent.trim();
      const text = textEl.textContent.trim();
      if (!/^\d{1,2}:\d{2}$/.test(time)) return;
      if (isSkeletonText(text)) return;
      items.push({ time, text });
    });
    return items;
  }

  // ── Child frame: parse and relay to top frame ─────────────
  if (window !== window.top) {
    if (!/tbank|tinkoff/.test(location.hostname)) return;   // only TWFM-related frames
    function tryRelay(tries) {
      const items = parseSchedule();
      if (isValidSchedule(items)) {
        window.top.postMessage({ type: MSG_TYPE, items }, '*');
        return;
      }
      if (tries < 40) setTimeout(() => tryRelay(tries + 1), 500);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => tryRelay(0));
    } else {
      tryRelay(0);
    }
    window.addEventListener('message', e => {
      if (e.data?.type === '__TWFM_REPARSE__') tryRelay(0);
    });
    return;
  }

  // ════════════════════════════════════════════════════════════
  //  Top frame only below
  // ════════════════════════════════════════════════════════════

  const STORAGE_KEY = 'twfm_schedule';
  const DISMISS_KEY = 'twfm_dismissed';
  const MODULES_KEY = 'twfm_modules';
  const WIDGET_KEY  = 'twfm_widget';   // { opacity, sound, pos:{x,y}, scope }
  const SOUND_KEY   = 'twfm_sched_sound';  // { date, idx } — какой режим уже озвучен

  // Компактный вид: вместо логотипа с подписью — один значок.
  // Цвет тот же, что у кнопок, чтобы виджет читался как одно целое.
  const CAL_CLOCK = `<svg viewBox="0 0 24 24" fill="#FFD000" width="15" height="15"
      style="display:block;flex-shrink:0"><path d="M10.1 2.2h3.8c.4 0 .7.3.7.7v2.8c0 .4-.3.7-.7.7h-3.8a.7.7 0 0 1-.7-.7V2.9c0-.4.3-.7.7-.7Z"/><path d="M7.6 2.3c.45-.1.85.25.85.65v2.75c0 .4-.3.7-.7.7H3.3a.7.7 0 0 1-.66-.92A6.35 6.35 0 0 1 7.6 2.3Z"/><path d="M16.4 2.3a6.35 6.35 0 0 1 4.96 3.18.7.7 0 0 1-.66.92h-4.4a.7.7 0 0 1-.7-.7V2.95c0-.4.4-.75.8-.65Z"/><path d="M2.6 8.25c0-.4.3-.7.7-.7h17.4c.4 0 .7.3.7.7v4.2c0 .5-.5.88-.98.7a6.05 6.05 0 0 0-8.06 7.43c.13.47-.22.92-.7.92H7.6a5 5 0 0 1-5-5V8.25Z"/><path fill-rule="evenodd" d="M17.5 13a4.9 4.9 0 1 0 0 9.8 4.9 4.9 0 0 0 0-9.8Zm.9 2.6a.9.9 0 1 0-1.8 0v1.92l-1.18.68a.9.9 0 1 0 .9 1.56l1.63-.94a.9.9 0 0 0 .45-.78V15.6Z" clip-rule="evenodd"/></svg>`;

  const SIC = {
    close:      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="display:block;flex-shrink:0"><path fill-rule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clip-rule="evenodd"/></svg>`,
    settings:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="display:block;flex-shrink:0"><path fill-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clip-rule="evenodd"/></svg>`,
    calendar:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="display:block;flex-shrink:0"><path fill-rule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clip-rule="evenodd"/></svg>`,
    calendarLg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20" style="display:block;flex-shrink:0"><path fill-rule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clip-rule="evenodd"/></svg>`,
    trash:      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="display:block;flex-shrink:0"><path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 00-6 0v-.113c0-.794.609-1.428 1.364-1.452zm-.355 5.945a.75.75 0 10-1.5.058l.347 9a.75.75 0 101.499-.058l-.346-9zm5.48.058a.75.75 0 10-1.498-.058l-.347 9a.75.75 0 001.5.058l.345-9z" clip-rule="evenodd"/></svg>`,
    chevron:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="12" height="12" style="display:block;flex-shrink:0"><path fill-rule="evenodd" d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z" clip-rule="evenodd"/></svg>`,
    // list with up-arrow → collapse the full schedule (lines long→short)
    listCollapse: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="display:block;flex-shrink:0"><path d="M6.5 20V5"/><path d="M3 8.5 6.5 5 10 8.5"/><path d="M13 6h8"/><path d="M13 12h6"/><path d="M13 18h3"/></svg>`,
    // list with down-arrow → expand the full schedule (lines short→long)
    listExpand:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="display:block;flex-shrink:0"><path d="M6.5 4v15"/><path d="M3 15.5 6.5 19 10 15.5"/><path d="M13 6h3"/><path d="M13 12h6"/><path d="M13 18h8"/></svg>`,
  };

  let moduleEnabled = true;
  let pendingItems  = null;
  let schedTheme    = 'dark';
  let wSettings     = { opacity: 0.75, sound: true, pos: null, scope: 'twork', collapsed: false, compact: false };
  const log = (...a) => console.log('[T-Helper · Расписание]', ...a);

  // Resolve the icon URL once, while the context is alive. Calling getURL during
  // a render after the extension is reloaded throws and aborts the build mid-way
  // (leaving the widget as an empty thin strip).
  const ICON16 = (() => { try { return chrome.runtime.getURL('icons/icon16.png'); } catch (e) { return ''; } })();

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function nowMinutes() { const d = new Date(); return d.getHours()*60 + d.getMinutes(); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  // Accent colour per work mode (darker variants on light themes for contrast)
  function modeColor(text) {
    const t = (text || '').toLowerCase();
    const light = (schedTheme === 'white');
    if (t.includes('обуч'))    return light ? '#138a78' : '#6cdacf';   // обучение
    if (t.includes('обед'))    return light ? '#a87a00' : '#FFD600';   // обед
    if (t.includes('перерыв') || t.includes('свободн')) return light ? '#d4501a' : '#ff7a45';   // перерыв / свободное время
    return light ? '#1f6fc4' : '#74b9ff';                              // остальные
  }

  window.addEventListener('message', e => {
    if (!e.data || e.data.type !== MSG_TYPE) return;
    if (!isValidSchedule(e.data.items)) return;
    log('получено расписание из iframe:', e.data.items.length, 'пунктов');
    pendingItems = e.data.items;
  });

  function isTworkPage() {
    return /twork/.test(location.hostname) || location.href.includes('twfm');
  }
  function isSchedulePage() {
    return location.href.includes('twfm-personal') ||
           location.href.includes('/personal') ||
           !!document.querySelector('twfm-schedule-item') ||
           pendingItems !== null;
  }
  // widget is allowed to show here, per scope setting
  function allowedHere() {
    return wSettings.scope === 'everywhere' || isTworkPage();
  }

  // ── sound ─────────────────────────────────────────────────
  let _audio = null;
  function playSound() {
    if (!wSettings.sound) return;
    try {
      if (!_audio) _audio = new Audio(chrome.runtime.getURL('sounds/teamschat.mp3'));
      _audio.currentTime = 0;
      _audio.play().catch(() => {});
    } catch (e) {}
  }

  // ── state computation ─────────────────────────────────────
  // Thin wrapper: the pure logic lives in SchedCore, "now" is injected here.
  function computeState(items) {
    return computeStateAt(items, nowMinutes());
  }

  // ── storage ───────────────────────────────────────────────
  function alive() { try { return !!chrome.runtime?.id; } catch(e) { return false; } }

  function loadStored(cb) {
    if (!alive()) return;
    try {
      chrome.storage.local.get([STORAGE_KEY, DISMISS_KEY], r => {
        if (chrome.runtime.lastError) return;
        cb(r[STORAGE_KEY] || null, r[DISMISS_KEY] || null);
      });
    } catch(e) {}
  }
  function saveSchedule(items) {
    if (!alive()) return;
    try { chrome.storage.local.set({ [STORAGE_KEY]: { date: todayStr(), items } }); } catch(e) {}
  }
  function setDismissed() {
    if (!alive()) return;
    try { chrome.storage.local.set({ [DISMISS_KEY]: todayStr() }); } catch(e) {}
  }
  function clearSchedule() {
    storedItems = [];
    if (!alive()) return;
    try { chrome.storage.local.remove([STORAGE_KEY, DISMISS_KEY]); } catch(e) {}
  }
  function saveWidgetSettings() {
    if (!alive()) return;
    try {
      chrome.storage.local.set({ [WIDGET_KEY]: {
        opacity: wSettings.opacity, sound: wSettings.sound,
        pos: wSettings.pos, scope: wSettings.scope, collapsed: wSettings.collapsed,
        compact: wSettings.compact } });
    } catch(e) {}
  }

  // ── widget vars ───────────────────────────────────────────
  let widget       = null;
  let reopenBtn    = null;
  let mode         = 'hidden';
  let expanded     = false;
  let settingsOpen = false;
  let pendingAnim  = null;      // 'settings' — one-shot reveal on user toggle
  let spinSettings = false;     // one-shot gear spin on settings click
  let swapTitle    = false;     // one-shot cross-fade when the header title changes
  let storedItems  = [];
  let watchTimer   = null;
  let watchStarted = false;
  let dragListeners = null;
  let animResizeTimer = null;

  // ── opacity / flash ───────────────────────────────────────
  function applyOpacity() {
    if (!widget) return;
    widget.style.opacity = wSettings.opacity;
  }
  function flashWidget() {
    if (!widget) return;
    widget.classList.add('twfm-flash');
    setTimeout(() => { if (widget) widget.classList.remove('twfm-flash'); }, 1200);
  }

  // Smooth width/height collapse-expand, same feel as the checklist panel.
  // The widget re-renders its innerHTML, so we FLIP: measure → mutate → measure → animate.
  function animateResize(mutate) {
    if (!widget) { mutate(); return; }
    const fromH = widget.offsetHeight;
    const fromW = widget.offsetWidth;
    mutate();                                  // state change + renderTracker (same element, no inline size)
    if (!widget) return;
    const toH = widget.offsetHeight;
    const toW = widget.offsetWidth;
    if (fromH === toH && fromW === toW) return;
    widget.style.height = `${fromH}px`;
    widget.style.width  = `${fromW}px`;
    widget.classList.add('twfm-anim');
    void widget.offsetHeight;                  // reflow so the start values stick
    widget.style.height = `${toH}px`;
    widget.style.width  = `${toW}px`;
    if (animResizeTimer) clearTimeout(animResizeTimer);
    animResizeTimer = setTimeout(() => {
      if (!widget) return;
      widget.classList.remove('twfm-anim');
      widget.style.height = '';
      widget.style.width  = '';
    }, 300);
  }

  // ── dragging ──────────────────────────────────────────────
  function attachDrag(w) {
    if (dragListeners) {
      document.removeEventListener('mousemove', dragListeners.move);
      document.removeEventListener('mouseup',   dragListeners.up);
    }
    let dragging = false, ox = 0, oy = 0, overlay = null;
    const onMove = e => {
      if (!dragging) return;
      const x = Math.max(0, Math.min(e.clientX - ox, window.innerWidth  - w.offsetWidth));
      const y = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - w.offsetHeight));
      w.style.left  = `${x}px`;
      w.style.top   = `${y}px`;
      w.style.right = 'auto';
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      if (overlay) { overlay.remove(); overlay = null; }
      const head = w.querySelector('.twfm-head');
      if (head) head.style.cursor = 'grab';
      wSettings.pos = { x: parseInt(w.style.left), y: parseInt(w.style.top) };
      saveWidgetSettings();
    };
    w.addEventListener('mousedown', e => {
      if (!e.target.closest('.twfm-head')) return;
      if (e.button !== 0 || e.target.closest('button')) return;
      dragging = true;
      const rect = w.getBoundingClientRect();
      ox = e.clientX - rect.left;
      oy = e.clientY - rect.top;
      const head = w.querySelector('.twfm-head');
      if (head) head.style.cursor = 'grabbing';
      // transparent overlay keeps mouse events flowing over iframes while dragging
      overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:grabbing';
      document.body.appendChild(overlay);
      e.preventDefault();
    });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    dragListeners = { move: onMove, up: onUp };
  }

  function positionWidget(w) {
    if (wSettings.pos) {
      w.style.left  = `${wSettings.pos.x}px`;
      w.style.top   = `${wSettings.pos.y}px`;
      w.style.right = 'auto';
    }
  }

  // Keep the widget proportionally placed when the browser window is resized
  let schedLastW = window.innerWidth, schedLastH = window.innerHeight, schedResizeTimer = null;
  function handleWindowResize() {
    if (widget && wSettings.pos) {
      const pw = widget.offsetWidth, ph = widget.offsetHeight;
      const ax0 = Math.max(0, schedLastW - pw), ay0 = Math.max(0, schedLastH - ph);
      const fx = ax0 > 0 ? wSettings.pos.x / ax0 : 0;
      const fy = ay0 > 0 ? wSettings.pos.y / ay0 : 0;
      const ax1 = Math.max(0, window.innerWidth  - pw);
      const ay1 = Math.max(0, window.innerHeight - ph);
      const nx = Math.round(Math.max(0, Math.min(fx * ax1, ax1)));
      const ny = Math.round(Math.max(0, Math.min(fy * ay1, ay1)));
      widget.style.left  = `${nx}px`;
      widget.style.top   = `${ny}px`;
      widget.style.right = 'auto';
      wSettings.pos = { x: nx, y: ny };
      if (schedResizeTimer) clearTimeout(schedResizeTimer);
      schedResizeTimer = setTimeout(saveWidgetSettings, 400);
    }
    schedLastW = window.innerWidth;
    schedLastH = window.innerHeight;
  }

  // ── reopen button (circle) ────────────────────────────────
  function showReopen() {
    if (!reopenBtn) {
      reopenBtn = document.createElement('button');
      reopenBtn.id = 'twfm-reopen';
      reopenBtn.title = 'Расписание';
      reopenBtn.innerHTML = SIC.calendarLg;
      document.body.appendChild(reopenBtn);
      applyWidgetTheme();
      reopenBtn.addEventListener('click', () => {
        hideReopen();
        wSettings.collapsed = false;
        saveWidgetSettings();
        if (storedItems.length) {
          renderTracker();
        } else {
          loadStored((stored) => {
            if (stored && stored.date === todayStr() && stored.items?.length) {
              storedItems = stored.items;
              renderTracker();
            } else {
              renderPrompt();
            }
          });
        }
      });
    }
    reopenBtn.style.display = 'flex';
  }
  function hideReopen() {
    if (reopenBtn) reopenBtn.remove();
    reopenBtn = null;
  }

  function applyWidgetTheme() {
    const t = schedTheme === 'dark' ? null : schedTheme;
    if (widget)    { t ? widget.setAttribute('data-theme', t)    : widget.removeAttribute('data-theme'); }
    if (reopenBtn) { t ? reopenBtn.setAttribute('data-theme', t) : reopenBtn.removeAttribute('data-theme'); }
  }

  // ── widget create ─────────────────────────────────────────
  function ensureWidget() {
    if (widget) return widget;
    widget = document.createElement('div');
    widget.id = 'twfm-widget';
    document.body.appendChild(widget);
    positionWidget(widget);
    applyOpacity();
    applyWidgetTheme();
    attachDrag(widget);
    hideReopen();
    return widget;
  }

  // ── settings bindings ─────────────────────────────────────
  function bindSettings(w) {
    const panel = w.querySelector('#twfm-settings-panel');
    if (!panel) return;
    panel.querySelector('#twfm-sound-chk').addEventListener('change', e => {
      wSettings.sound = e.target.checked;
      saveWidgetSettings();
    });
    const slider = panel.querySelector('#twfm-opacity-sl');
    const valEl  = panel.querySelector('#twfm-opacity-val');
    slider.addEventListener('input', () => {
      wSettings.opacity = parseInt(slider.value) / 100;
      valEl.textContent = `${slider.value}%`;
      applyOpacity();
      saveWidgetSettings();
    });
    panel.querySelectorAll('.twfm-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        wSettings.scope = btn.dataset.scope;
        saveWidgetSettings();
        if (wSettings.scope === 'twork' && !isTworkPage()) {
          scopeHide();           // no circle — hidden by scope, not by user
        } else {
          renderTracker();
        }
      });
    });
    const reloadBtn = panel.querySelector('#twfm-reload-btn');
    if (reloadBtn) reloadBtn.addEventListener('click', () => {
      // forget the old data and pull a fresh copy from the page/iframes
      clearSchedule();
      pendingItems = null;
      settingsOpen = false;
      renderPrompt();
      requestLoad();
    });
    const deleteBtn = panel.querySelector('#twfm-delete-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', () => {
      if (!confirm('Удалить сохранённое расписание?')) return;
      clearSchedule();
      pendingItems = null;
      settingsOpen = false;
      renderPrompt();   // just show the prompt — do NOT auto-load
    });
  }

  // Ask child iframes to re-parse, then poll for fresh data
  function requestLoad() {
    document.querySelectorAll('iframe').forEach(f => {
      try { f.contentWindow.postMessage({ type: '__TWFM_REPARSE__' }, '*'); } catch(_) {}
    });
    copyWithRetry();
  }

  // ── prompt ────────────────────────────────────────────────
  function renderPrompt() {
    mode = 'prompt';
    const w = ensureWidget();
    w.className = 'twfm-prompt-mode';
    w.innerHTML = `
      <div class="twfm-head">
        <span class="twfm-title"><img src="${ICON16}" width="14" height="14" style="display:block;flex-shrink:0;border-radius:3px"> Расписание</span>
        <div class="twfm-head-btns">
          <button class="twfm-icon-btn" id="twfm-close" title="Скрыть">${SIC.close}</button>
        </div>
      </div>
      <div class="twfm-prompt-body">
        <div class="twfm-prompt-q">Загрузить ваше расписание на сегодня?</div>
        <button class="twfm-btn twfm-btn-yes twfm-btn-full" id="twfm-load">Загрузить</button>
      </div>`;
    applyOpacity();
    w.querySelector('#twfm-load').addEventListener('click', () => requestLoad());
    w.querySelector('#twfm-close').addEventListener('click', () => { setDismissed(); hideWidget(); });
  }

  // SVG guide showing which calendar parameters to select on the page
  function scheduleHintSvg() {
    return `
      <svg viewBox="0 0 240 116" width="100%" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="240" height="116" rx="11" fill="#ffffff"/>
        <text x="16" y="27" font-family="Onest, sans-serif" font-size="12" font-weight="600" fill="#1a1a2e">Мой график работы</text>
        <rect x="9" y="13" width="136" height="23" rx="7" fill="none" stroke="#ff3b30" stroke-width="2"/>
        <text x="156" y="27" font-family="Onest, sans-serif" font-size="12" fill="#aab0ba">Групповой</text>
        <text x="28" y="84" font-family="Onest, sans-serif" font-size="12" font-weight="600" fill="#1a1a2e">День</text>
        <rect x="14" y="69" width="48" height="24" rx="12" fill="none" stroke="#ff3b30" stroke-width="2"/>
        <text x="74" y="84" font-family="Onest, sans-serif" font-size="12" fill="#aab0ba">Неделя</text>
        <text x="128" y="84" font-family="Onest, sans-serif" font-size="12" fill="#aab0ba">Месяц</text>
        <rect x="183" y="68" width="26" height="26" rx="7" fill="#f0f1f4"/>
        <rect x="188" y="73" width="7" height="7" rx="1.5" fill="#5b6270"/>
        <rect x="197" y="73" width="7" height="7" rx="1.5" fill="#5b6270"/>
        <rect x="188" y="82" width="7" height="7" rx="1.5" fill="#5b6270"/>
        <rect x="197" y="82" width="7" height="7" rx="1.5" fill="#5b6270"/>
        <rect x="179" y="64" width="34" height="34" rx="9" fill="none" stroke="#ff3b30" stroke-width="2"/>
        <rect x="215" y="68" width="20" height="26" rx="7" fill="#f0f1f4"/>
        <rect x="220" y="76" width="11" height="2.4" rx="1.2" fill="#5b6270"/>
        <rect x="220" y="81" width="11" height="2.4" rx="1.2" fill="#5b6270"/>
        <rect x="220" y="86" width="11" height="2.4" rx="1.2" fill="#5b6270"/>
      </svg>`;
  }

  // ── not-found prompt (with on-page setup guide) ───────────
  function renderNotFound() {
    mode = 'prompt';
    const w = ensureWidget();
    w.className = 'twfm-prompt-mode';
    w.innerHTML = `
      <div class="twfm-head">
        <span class="twfm-title"><img src="${ICON16}" width="14" height="14" style="display:block;flex-shrink:0;border-radius:3px"> Расписание</span>
        <div class="twfm-head-btns">
          <button class="twfm-icon-btn" id="twfm-close" title="Скрыть">${SIC.close}</button>
        </div>
      </div>
      <div class="twfm-prompt-body">
        <div class="twfm-prompt-q">Расписание не найдено. Убедитесь, что на странице выбраны нужные параметры календаря:</div>
        <div class="twfm-hint-img">${scheduleHintSvg()}</div>
        <button class="twfm-btn twfm-btn-yes twfm-btn-full" id="twfm-load">Загрузить</button>
      </div>`;
    applyOpacity();
    w.querySelector('#twfm-load').addEventListener('click', () => requestLoad());
    w.querySelector('#twfm-close').addEventListener('click', () => { setDismissed(); hideWidget(); });
  }

  // ── copy with retry ───────────────────────────────────────
  function copyWithRetry(tries = 0) {
    const local = parseSchedule();
    const items = isValidSchedule(local) ? local
                : (isValidSchedule(pendingItems) ? pendingItems : null);
    if (items) {
      pendingItems = null;
      storedItems  = items;
      saveSchedule(items);
      expanded = false;
      renderTracker();
      return;
    }
    if (tries > 40) {
      renderNotFound();
      return;
    }
    const q = widget && widget.querySelector('.twfm-prompt-q');
    if (q) q.textContent = 'Загружаю расписание…';
    // Кнопка на время загрузки убирается: повторное нажатие ничего не даёт,
    // а её присутствие читается как «ничего не происходит».
    const loadBtn = widget && widget.querySelector('#twfm-load');
    if (loadBtn) loadBtn.classList.add('twfm-loading');
    setTimeout(() => copyWithRetry(tries + 1), 500);
  }

  // ── tracker ───────────────────────────────────────────────
  function renderTracker() {
    mode = 'tracker';
    const w = ensureWidget();
    w.className = 'twfm-tracker-mode';
    const st = computeState(storedItems);

    let nowName, nowMeta, compactMeta, nextLine;
    if (!storedItems.length) {
      nowName = 'Нет данных'; nowMeta = ''; compactMeta = ''; nextLine = '';
    } else if (st.beforeStart) {
      const first = storedItems[0];
      nowName     = 'Смена ещё не началась';
      nowMeta     = `Начало в ${first.time}`;
      compactMeta = nowMeta;
      nextLine    = `Первый режим: ${first.text}`;
    } else if (st.isLast || !st.next) {
      nowName     = st.current ? st.current.text : 'Завершение';
      nowMeta     = 'Рабочий день завершён 🎉';
      compactMeta = nowMeta;
      nextLine    = '';
    } else {
      nowName     = st.current.text;
      nowMeta     = `до ${st.next.time} · осталось ${fmtDur(st.remaining)}`;
      compactMeta = `до ${st.next.time}`;
      nextLine    = `Далее: ${st.next.text} · ${st.next.time}`;
    }

    const accent = st.current ? modeColor(st.current.text) : modeColor('');

    const fullRows = storedItems.map((it, i) => {
      const active = i === st.idx;
      const cls = active ? 'twfm-row twfm-row-active' :
                  (st.idx >= 0 && i < st.idx ? 'twfm-row twfm-row-past' : 'twfm-row');
      const style = active ? ` style="--twfm-accent:${modeColor(it.text)}"` : '';
      return `<div class="${cls}"${style}><span class="twfm-row-time">${it.time}</span><span class="twfm-row-text">${escapeHtml(it.text)}</span></div>`;
    }).join('');

    const opPct = Math.round(wSettings.opacity * 100);
    w.className = wSettings.compact ? 'twfm-tracker-mode twfm-compact' : 'twfm-tracker-mode';
    w.innerHTML = `
      <div class="twfm-head">
        <span class="twfm-title${swapTitle ? ' twfm-title-swap' : ''}">${wSettings.compact
          ? CAL_CLOCK
          : `<img src="${ICON16}" width="14" height="14" style="display:block;flex-shrink:0;border-radius:3px"> Расписание`}</span>
        ${wSettings.compact ? `<span class="twfm-compact-bar"><span class="twfm-compact-name" style="color:${accent}">${escapeHtml(nowName)}</span>${compactMeta ? `<span class="twfm-compact-meta" style="color:${accent}">${escapeHtml(compactMeta)}</span>` : ''}</span>` : ''}
        <div class="twfm-head-btns">
          ${!wSettings.compact ? `<button class="twfm-icon-btn" id="twfm-toggle-full" title="${expanded ? 'Свернуть полное расписание' : 'Развернуть полное расписание'}">${expanded ? SIC.listCollapse : SIC.listExpand}</button>` : ''}
          <button class="twfm-icon-btn" id="twfm-toggle-compact" title="${wSettings.compact ? 'Развернуть' : 'Компактный вид'}" style="${wSettings.compact ? '' : 'transform:rotate(180deg)'}">${SIC.chevron}</button>
          <button class="twfm-icon-btn${settingsOpen ? ' active' : ''}${spinSettings ? ' twfm-spin' : ''}" id="twfm-settings-btn" title="Настройки">${SIC.settings}</button>
          <button class="twfm-icon-btn" id="twfm-close" title="Скрыть">${SIC.close}</button>
        </div>
      </div>
      ${!wSettings.compact ? `<div class="twfm-now">
        <div class="twfm-now-name" style="color:${accent}">${escapeHtml(nowName)}</div>
        ${nowMeta  ? `<div class="twfm-now-meta" style="color:${accent}">${escapeHtml(nowMeta)}</div>` : ''}
        ${nextLine ? `<div class="twfm-next">${escapeHtml(nextLine)}</div>`   : ''}
      </div>
      <div class="twfm-full ${expanded ? '' : 'twfm-hidden'}">${fullRows}</div>` : ''}
      <div id="twfm-settings-panel" class="twfm-settings ${settingsOpen ? '' : 'twfm-hidden'}${pendingAnim === 'settings' && settingsOpen ? ' twfm-slidein' : ''}">
        <label class="twfm-srow">
          <span>Звук при смене режима</span>
          <input type="checkbox" id="twfm-sound-chk" ${wSettings.sound ? 'checked' : ''}>
        </label>
        <label class="twfm-srow">
          <span>Прозрачность</span>
          <div class="twfm-srow-right">
            <input type="range" id="twfm-opacity-sl" min="20" max="100" value="${opPct}">
            <span id="twfm-opacity-val">${opPct}%</span>
          </div>
        </label>
        <div class="twfm-srow">
          <span>Показывать</span>
          <div class="twfm-seg">
            <button class="twfm-seg-btn ${wSettings.scope === 'twork' ? 'active' : ''}" data-scope="twork">В Творке</button>
            <button class="twfm-seg-btn ${wSettings.scope === 'everywhere' ? 'active' : ''}" data-scope="everywhere">Везде</button>
          </div>
        </div>
        <div class="twfm-sbtns">
          <button class="twfm-sbtn" id="twfm-reload-btn">↻ Загрузить заново</button>
          <button class="twfm-sbtn twfm-sbtn-del" id="twfm-delete-btn">${SIC.trash} Удалить</button>
        </div>
      </div>`;

    applyOpacity();

    // one-shot reveal/spin flags consumed by this render
    pendingAnim  = null;
    spinSettings = false;
    swapTitle = false;

    // list button → expand / collapse the full schedule (smooth height animation)
    const toggleFull = w.querySelector('#twfm-toggle-full');
    if (toggleFull) toggleFull.addEventListener('click', () => {
      animateResize(() => { expanded = !expanded; renderTracker(); });
    });
    // chevron → toggle compact mode (smooth collapse/expand like the checklist)
    const toggleCompact = w.querySelector('#twfm-toggle-compact');
    if (toggleCompact) toggleCompact.addEventListener('click', () => {
      animateResize(() => {
        wSettings.compact = !wSettings.compact;
        swapTitle = true;
        if (wSettings.compact) expanded = false;   // full list is hidden in compact view
        saveWidgetSettings();
        renderTracker();
      });
    });
    w.querySelector('#twfm-close').addEventListener('click', hideWidget);
    w.querySelector('#twfm-settings-btn').addEventListener('click', () => {
      if (!settingsOpen) {
        settingsOpen = true;
        spinSettings = true;
        pendingAnim = 'settings';
        renderTracker();
      } else {
        const btn = w.querySelector('#twfm-settings-btn');
        btn.classList.remove('active');
        btn.classList.remove('twfm-spin');
        void btn.offsetWidth;
        btn.classList.add('twfm-spin');
        const sp = w.querySelector('#twfm-settings-panel');
        if (sp) sp.classList.add('twfm-slideout');
        setTimeout(() => { settingsOpen = false; renderTracker(); }, 210);
      }
    });
    bindSettings(w);
  }

  // ── close / hide variants ─────────────────────────────────
  function removeWidgetEl() {
    if (widget) { widget.remove(); widget = null; }
  }
  // user pressed ✕ → keep reopen circle, remember the collapsed state
  function hideWidget() {
    mode = 'hidden';
    wSettings.collapsed = true;
    saveWidgetSettings();
    const w = widget;
    widget = null;
    if (w) {
      w.classList.add('twfm-closing');
      setTimeout(() => w.remove(), 190);
    }
    showReopen();
  }
  // hidden because scope doesn't allow this page → no circle
  function scopeHide() {
    mode = 'hidden';
    removeWidgetEl();
    hideReopen();
  }
  // module turned off → remove everything and stop watching
  function disableModule() {
    mode = 'hidden';
    removeWidgetEl();
    hideReopen();
    clearTimeout(watchTimer); watchTimer = null; watchStarted = false;
    if (dragListeners) {
      document.removeEventListener('mousemove', dragListeners.move);
      document.removeEventListener('mouseup',   dragListeners.up);
      dragListeners = null;
    }
  }

  // ── mode watch (runs everywhere, drives sound) ────────────
  // О смене режима объявляем один раз на все вкладки: отметку о том,
  // какой режим уже озвучен, держим в хранилище. Без неё фоновая вкладка
  // «съедала» смену — она замечала её первой, звук пропускала (не видна),
  // а свой счётчик сдвигала, и больше смену никто не замечал. Это и был
  // случай «звука вовсе нет».
  function announce(st) {
    if (document.visibilityState !== 'visible' || !alive()) return;
    chrome.storage.local.get([SOUND_KEY], r => {
      const m = r[SOUND_KEY] || {};
      const today = todayStr();
      if (m.date === today && m.idx === st.idx) return;        // уже объявлено
      try { chrome.storage.local.set({ [SOUND_KEY]: { date: today, idx: st.idx } }); } catch (e) {}
      // Первая отметка за день ставится молча: иначе расширение подавало бы
      // сигнал при каждом первом открытии страницы посреди смены.
      if (m.date !== today) return;
      playSound();
      if (mode === 'tracker' && widget) flashWidget();
    });
  }

  function checkMode() {
    if (!moduleEnabled || !alive()) return;
    loadStored((stored) => {
      if (!stored || stored.date !== todayStr() || !stored.items?.length) return;
      storedItems = stored.items;
      announce(computeState(storedItems));
      // Перерисовываем каждую проверку, а не только на смене режима:
      // этим же обновляется отсчёт «осталось N мин».
      if (mode === 'tracker' && widget) renderTracker();
    });
  }

  // Режимы меняются по границе минуты, поэтому и проверяем ровно на ней,
  // а не раз в 15 секунд: прежний интервал давал до четверти минуты
  // задержки, а в фоновой вкладке Chrome растягивал его до минуты и
  // больше. Таймер переставляем каждый раз заново — дрейф не копится.
  function armWatch() {
    clearTimeout(watchTimer);
    const ms = 60000 - (Date.now() % 60000) + 250;   // чуть после смены минуты
    watchTimer = setTimeout(() => {
      if (!alive()) { watchTimer = null; return; }
      checkMode();
      armWatch();
    }, ms);
  }

  function startWatch() {
    if (watchStarted) return;
    watchStarted = true;
    armWatch();
    // Вкладка была скрыта — её таймеры притормаживал браузер; при
    // возврате сверяемся сразу, не дожидаясь следующей минуты.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { checkMode(); armWatch(); }
    });
    checkMode();
  }

  // ── boot ──────────────────────────────────────────────────
  function decideUI() {
    if (!moduleEnabled) { disableModule(); return; }
    if (mode !== 'hidden') return;
    loadStored((stored, dismissed) => {
      const today = todayStr();
      const haveSchedule = stored && stored.date === today && stored.items?.length;
      if (haveSchedule && allowedHere()) {
        storedItems = stored.items;
        if (wSettings.collapsed) { showReopen(); return; }  // user kept it minimised
        renderTracker();
        return;
      }
      if (isSchedulePage() && dismissed !== today && !haveSchedule) {
        log('страница графика — показываю запрос на копирование');
        renderPrompt();
      }
    });
  }

  let lastHref = location.href;
  function watchNavigation() {
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        log('навигация →', location.href);
        if (mode === 'hidden') decideUI();
      }
    }, 1000);
  }

  try { chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[MODULES_KEY]) {
      moduleEnabled = changes[MODULES_KEY].newValue?.schedule !== false;
      if (!moduleEnabled) { disableModule(); }
      else { startWatch(); decideUI(); }
    }
    if (changes[STORAGE_KEY] && moduleEnabled) {
      const v = changes[STORAGE_KEY].newValue;
      if (v && v.date === todayStr() && v.items?.length) {
        storedItems = v.items;
        if (mode === 'hidden') decideUI();
        else if (mode === 'tracker') renderTracker();
      }
    }
    // Live-sync widget settings changed from the popup or another tab
    if (changes[WIDGET_KEY]) {
      const v = changes[WIDGET_KEY].newValue || {};
      if (v.opacity !== undefined) wSettings.opacity = v.opacity;
      if (v.sound   !== undefined) wSettings.sound   = v.sound;
      if (v.scope   !== undefined) wSettings.scope   = v.scope;
      const compactChanged = v.compact !== undefined && v.compact !== wSettings.compact;
      if (compactChanged) wSettings.compact = v.compact;
      const posChanged = v.pos && (!wSettings.pos || wSettings.pos.x !== v.pos.x || wSettings.pos.y !== v.pos.y);
      if (posChanged) wSettings.pos = v.pos;
      applyOpacity();
      if (widget) {
        if (posChanged) positionWidget(widget);
        if (compactChanged && mode === 'tracker') renderTracker();
      }
    }
    if (changes['twfm_theme']) {
      schedTheme = changes['twfm_theme'].newValue || 'dark';
      applyWidgetTheme();
      // Цвет режима вычисляется по теме и попадает в разметку inline-стилем,
      // поэтому сменой data-theme он не обновится — нужна перерисовка.
      if (widget && mode === 'tracker') renderTracker();
    }
    if (changes['twfm_open_schedule'] && moduleEnabled) {
      wSettings.collapsed = false;
      saveWidgetSettings();
      hideReopen();
      removeWidgetEl();
      mode = 'hidden';
      loadStored((stored) => {
        const today = todayStr();
        if (stored && stored.date === today && stored.items?.length) {
          storedItems = stored.items;
          renderTracker();
        } else {
          renderPrompt();
        }
      });
    }
  }); } catch(e) {}

  function init() {
    if (!alive()) return;
    try { chrome.storage.local.get([MODULES_KEY, WIDGET_KEY, 'twfm_theme'], r => {
      moduleEnabled = r[MODULES_KEY]?.schedule !== false;
      if (r[WIDGET_KEY]) Object.assign(wSettings, r[WIDGET_KEY]);
      schedTheme = r['twfm_theme'] || 'dark';
      if (moduleEnabled) startWatch();
      decideUI();
      watchNavigation();
      window.addEventListener('resize', handleWindowResize);
    }); } catch(e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
