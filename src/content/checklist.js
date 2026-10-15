// T-Helper · Checklist module
(function () {
  if (window.__QPI_CHECKLIST_LOADED) return;
  window.__QPI_CHECKLIST_LOADED = true;

  const STORAGE_KEY = 'qpi_checklist';
  const MODULES_KEY = 'twfm_modules';
  const THEME_KEY   = 'twfm_theme';
  const MAX_TABS    = 7;

  function alive() { try { return !!chrome.runtime?.id; } catch (e) { return false; } }

  // Resolve the icon URL once, while the context is alive. Calling getURL during
  // a render after the extension is reloaded throws and aborts the build mid-way.
  const ICON16 = (() => { try { return chrome.runtime.getURL('icons/icon16.png'); } catch (e) { return ''; } })();

  let panel        = null;
  let clTheme      = 'dark';
  let settingsOpen  = false;
  let previewTimer  = null;
  let dragListeners = null;

  let cData = {
    tabs: [{ name: 'Список 1', items: [] }],
    activeTab: 0,
    pos: null,
    size: { w: 320, h: 420 },
    itemSize: 'M',
    opacity: 1,
    truncate: false,
    collapsed: false
  };

  function applyOpacity() {
    if (panel) panel.style.opacity = cData.opacity ?? 1;
  }

  let collapseTimer = null;
  function applyCollapsed(animate) {
    if (!panel) return;
    const c = !!cData.collapsed;
    const btn = panel.querySelector('.qcl-collapse-btn');
    if (btn) btn.style.transform = c ? '' : 'rotate(180deg)';
    if (animate) {
      panel.classList.add('qcl-anim');
      if (collapseTimer) clearTimeout(collapseTimer);
      collapseTimer = setTimeout(() => { if (panel) panel.classList.remove('qcl-anim'); }, 320);
    }
    if (c) {
      const head = panel.querySelector('.qcl-head');
      const hh = head ? head.offsetHeight : 38;
      panel.classList.add('qcl-collapsed');
      panel.style.height = `${hh}px`;
      panel.style.width  = '210px';
    } else {
      panel.classList.remove('qcl-collapsed');
      panel.style.width  = `${Math.max(240, cData.size?.w || 320)}px`;
      panel.style.height = `${Math.max(280, cData.size?.h || 420)}px`;
    }
  }

  function save() {
    if (!alive()) return;
    try { chrome.storage.local.set({ [STORAGE_KEY]: cData }); } catch (e) {}
  }

  // Apply stored position + size to the live panel (used on cross-tab sync)
  function applyGeometry() {
    if (!panel) return;
    if (cData.pos) {
      panel.style.left  = `${cData.pos.x}px`;
      panel.style.top   = `${cData.pos.y}px`;
      panel.style.right = 'auto';
    }
    applyCollapsed();   // sets width/height honouring the collapsed state
  }

  // Re-apply a checklist snapshot coming from another tab / the popup import
  function applySaved(saved) {
    if (!saved) return;
    if (saved.tabs) cData.tabs = saved.tabs;
    if (saved.activeTab !== undefined) cData.activeTab = Math.min(saved.activeTab, cData.tabs.length - 1);
    if (saved.pos)  cData.pos  = saved.pos;
    if (saved.size) cData.size = saved.size;
    if (saved.itemSize) cData.itemSize = saved.itemSize;
    if (saved.opacity !== undefined) cData.opacity = saved.opacity;
    if (saved.truncate !== undefined) cData.truncate = saved.truncate;
    if (saved.collapsed !== undefined) cData.collapsed = saved.collapsed;
    if (panel) { applyOpacity(); applyGeometry(); render(); }
  }

  // Defer the rebuild while the user is mid-edit in a contenteditable here,
  // otherwise a sync from another tab would clobber the caret.
  let pendingSync = false;
  function syncFromSaved(saved) {
    const ae = document.activeElement;
    if (panel && ae && panel.contains(ae) && ae.isContentEditable) { pendingSync = true; return; }
    applySaved(saved);
  }

  function currentTab() { return cData.tabs[cData.activeTab] || cData.tabs[0]; }

  // ── Theme ─────────────────────────────────────────────────
  function applyTheme() {
    if (!panel) return;
    const t = clTheme === 'dark' ? null : clTheme;
    t ? panel.setAttribute('data-theme', t) : panel.removeAttribute('data-theme');
  }

  // ── Drag (window move) ────────────────────────────────────
  function attachDrag(p) {
    if (dragListeners) {
      document.removeEventListener('mousemove', dragListeners.move);
      document.removeEventListener('mouseup',   dragListeners.up);
    }
    let dragging = false, ox = 0, oy = 0, overlay = null;
    const onMove = e => {
      if (!dragging) return;
      const x = Math.max(0, Math.min(e.clientX - ox, window.innerWidth  - p.offsetWidth));
      const y = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - p.offsetHeight));
      p.style.left = `${x}px`;
      p.style.top  = `${y}px`;
      p.style.right = 'auto';
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      if (overlay) { overlay.remove(); overlay = null; }
      p.querySelector('.qcl-head').style.cursor = 'grab';
      cData.pos = { x: parseInt(p.style.left), y: parseInt(p.style.top) };
      save();
    };
    p.addEventListener('mousedown', e => {
      if (!e.target.closest('.qcl-head')) return;
      if (e.button !== 0 || e.target.closest('button')) return;
      dragging = true;
      const r = p.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      p.querySelector('.qcl-head').style.cursor = 'grabbing';
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

  // ── Resize (all eight sides/corners) ──────────────────────
  const MIN_W = 240, MIN_H = 280, MAX_W = 640, MAX_H = 760;
  function attachResize(p) {
    let dir = null, sx = 0, sy = 0, sl = 0, st = 0, sw = 0, sh = 0;
    let overlay = null;

    const onMove = e => {
      if (!dir) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      let l = sl, t = st, w = sw, h = sh;

      if (dir.includes('e')) w = sw + dx;
      if (dir.includes('s')) h = sh + dy;
      if (dir.includes('w')) { w = sw - dx; l = sl + dx; }
      if (dir.includes('n')) { h = sh - dy; t = st + dy; }

      // clamp width, keeping the opposite edge anchored
      if (w < MIN_W) { if (dir.includes('w')) l -= (MIN_W - w); w = MIN_W; }
      if (w > MAX_W) { if (dir.includes('w')) l += (w - MAX_W); w = MAX_W; }
      if (h < MIN_H) { if (dir.includes('n')) t -= (MIN_H - h); h = MIN_H; }
      if (h > MAX_H) { if (dir.includes('n')) t += (h - MAX_H); h = MAX_H; }

      p.style.left  = `${l}px`;
      p.style.top   = `${t}px`;
      p.style.right = 'auto';
      p.style.width  = `${w}px`;
      p.style.height = `${h}px`;
    };
    const onUp = () => {
      if (!dir) return;
      dir = null;
      if (overlay) { overlay.remove(); overlay = null; }
      cData.size = { w: p.offsetWidth, h: p.offsetHeight };
      cData.pos  = { x: p.offsetLeft, y: p.offsetTop };
      save();
    };

    p.querySelectorAll('.qcl-rz').forEach(handle => {
      handle.addEventListener('mousedown', e => {
        dir = handle.dataset.dir;
        const r = p.getBoundingClientRect();
        sx = e.clientX; sy = e.clientY;
        sl = r.left; st = r.top; sw = r.width; sh = r.height;
        // lock to pixel position so right/bottom anchoring doesn't fight us
        p.style.left  = `${r.left}px`;
        p.style.top   = `${r.top}px`;
        p.style.right = 'auto';
        // transparent overlay keeps mouse events flowing over iframes
        overlay = document.createElement('div');
        overlay.style.cssText = `position:fixed;inset:0;z-index:2147483647;cursor:${handle.style.cursor}`;
        document.body.appendChild(overlay);
        e.preventDefault();
        e.stopPropagation();
      });
    });

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  // ── DnD for items ─────────────────────────────────────────
  function attachItemDnD(listEl) {
    let srcIdx = null;
    listEl.querySelectorAll('.qcl-item').forEach((row, i) => {
      row.setAttribute('draggable', 'true');
      row.addEventListener('dragstart', e => {
        srcIdx = i;
        row.classList.add('qcl-item-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setDragImage(row, row.offsetWidth / 2, row.offsetHeight / 2);
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('qcl-item-dragging');
        listEl.querySelectorAll('.qcl-item').forEach(r => {
          r.classList.remove('qcl-drag-over-top', 'qcl-drag-over-bot');
        });
      });
      row.addEventListener('dragover', e => {
        if (srcIdx === null || srcIdx === i) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = row.getBoundingClientRect();
        const mid  = rect.top + rect.height / 2;
        row.classList.toggle('qcl-drag-over-top', e.clientY < mid);
        row.classList.toggle('qcl-drag-over-bot', e.clientY >= mid);
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('qcl-drag-over-top', 'qcl-drag-over-bot');
      });
      row.addEventListener('drop', e => {
        e.preventDefault();
        if (srcIdx === null || srcIdx === i) return;
        row.classList.remove('qcl-drag-over-top', 'qcl-drag-over-bot');
        const rect = row.getBoundingClientRect();
        const after = e.clientY >= rect.top + rect.height / 2;
        const tab = currentTab();
        const item = tab.items.splice(srcIdx, 1)[0];
        let toIdx = i;
        if (srcIdx < i) toIdx--;
        if (after) toIdx++;
        toIdx = Math.max(0, Math.min(toIdx, tab.items.length));
        tab.items.splice(toIdx, 0, item);
        srcIdx = null;
        save();
        renderBody();
      });
    });
  }

  // ── helpers ───────────────────────────────────────────────
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  const GRIP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="14" height="14" style="display:block"><path d="M5.5 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm5 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM5.5 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm5 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/></svg>`;
  const TRASH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="display:block"><path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 00-6 0v-.113c0-.794.609-1.428 1.364-1.452zm-.355 5.945a.75.75 0 10-1.5.058l.347 9a.75.75 0 101.499-.058l-.346-9zm5.48.058a.75.75 0 10-1.498-.058l-.347 9a.75.75 0 001.5.058l.345-9z" clip-rule="evenodd"/></svg>`;
  const CLOSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="display:block"><path fill-rule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clip-rule="evenodd"/></svg>`;
  const GEAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="display:block"><path fill-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clip-rule="evenodd"/></svg>`;
  const CHEVRON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="display:block"><path fill-rule="evenodd" d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z" clip-rule="evenodd"/></svg>`;
  // file-plus → "Загрузить"; folder → "Сохранить"
  const FILEPLUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="display:block;flex-shrink:0"><path fill-rule="evenodd" d="M5.625 1.5H9a3.75 3.75 0 013.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 013.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 01-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875zM12.75 12a.75.75 0 00-1.5 0v2.25H9a.75.75 0 000 1.5h2.25V18a.75.75 0 001.5 0v-2.25H15a.75.75 0 000-1.5h-2.25V12z" clip-rule="evenodd"/><path d="M14.25 5.25a5.23 5.23 0 00-1.279-3.434 9.768 9.768 0 016.963 6.963A5.23 5.23 0 0016.5 7.5h-1.875a.375.375 0 01-.375-.375V5.25z"/></svg>`;
  const FOLDER_SVG  = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="display:block;flex-shrink:0"><path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z"/></svg>`;

  // ── Render: items ─────────────────────────────────────────
  function renderBody() {
    if (!panel) return;
    const tab = currentTab();
    const listEl = panel.querySelector('.qcl-items');
    if (!listEl) return;
    listEl.className = `qcl-items qcl-size-${(cData.itemSize || 'M').toLowerCase()}${cData.truncate ? ' qcl-truncate' : ''}`;
    listEl.innerHTML = tab.items.map((item, i) => `
      <div class="qcl-item${item.done ? ' qcl-item-done' : ''}" data-idx="${i}">
        <input class="qcl-cb" type="checkbox" data-idx="${i}"${item.done ? ' checked' : ''}>
        <span class="qcl-text" contenteditable="true" data-idx="${i}"${cData.truncate ? ` title="${escHtml(item.text)}"` : ''}>${escHtml(item.text)}</span>
        <button class="qcl-del" data-idx="${i}" title="Удалить">${TRASH_SVG}</button>
        <span class="qcl-grip" title="Перетащить">${GRIP_SVG}</span>
      </div>`).join('') || `<div class="qcl-empty">Пунктов пока нет.<br>Добавьте первый ниже ↓</div>`;

    attachItemDnD(listEl);

    listEl.querySelectorAll('.qcl-cb').forEach(cb => {
      cb.addEventListener('change', e => {
        const idx = +e.target.dataset.idx;
        currentTab().items[idx].done = e.target.checked;
        e.target.closest('.qcl-item').classList.toggle('qcl-item-done', e.target.checked);
        save();
      });
    });

    listEl.querySelectorAll('.qcl-text').forEach(span => {
      span.addEventListener('blur', e => {
        const idx = +e.target.dataset.idx;
        const text = e.target.textContent.trim();
        if (!text) {
          currentTab().items.splice(idx, 1);
          save();
          renderBody();
        } else {
          currentTab().items[idx].text = text;
          save();
        }
      });
      span.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); span.blur(); }
      });
    });

    listEl.querySelectorAll('.qcl-del').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = +e.currentTarget.dataset.idx;
        currentTab().items.splice(idx, 1);
        save();
        renderBody();
      });
    });
  }

  // ── Render: tabs ──────────────────────────────────────────
  function renderTabs() {
    if (!panel) return;
    const tabBar = panel.querySelector('.qcl-tabs');
    if (!tabBar) return;
    tabBar.innerHTML = cData.tabs.map((t, i) => {
      const active = i === cData.activeTab;
      return `<div class="qcl-tab${active ? ' qcl-tab-active' : ''}" data-idx="${i}" title="Двойной клик — переименовать">${escHtml(t.name)}</div>`;
    }).join('') + (cData.tabs.length < MAX_TABS ? `<button class="qcl-tab-add" title="Добавить вкладку">+</button>` : '');

    tabBar.querySelectorAll('.qcl-tab').forEach(tab => {
      tab.addEventListener('click', e => {
        if (e.detail === 2) return; // handled by dblclick
        cData.activeTab = +tab.dataset.idx;
        save();
        renderTabs();
        renderBody();
      });
      tab.addEventListener('dblclick', () => {
        const idx = +tab.dataset.idx;
        const name = prompt('Название вкладки:', cData.tabs[idx].name);
        if (name !== null && name.trim()) {
          cData.tabs[idx].name = name.trim().slice(0, 30);
          save();
          renderTabs();
        }
      });
    });

    const addBtn = tabBar.querySelector('.qcl-tab-add');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (cData.tabs.length >= MAX_TABS) return;
        cData.tabs.push({ name: `Список ${cData.tabs.length + 1}`, items: [] });
        cData.activeTab = cData.tabs.length - 1;
        save();
        renderTabs();
        renderBody();
      });
    }
  }

  // ── Size preview (shown instead of re-opening item list) ──
  function showSizePreview(size) {
    const existing = document.getElementById('qcl-size-preview');
    if (existing) existing.remove();
    if (previewTimer) clearTimeout(previewTimer);

    const prev = document.createElement('div');
    prev.id = 'qcl-size-preview';
    if (clTheme && clTheme !== 'dark') prev.setAttribute('data-theme', clTheme);

    prev.innerHTML = `
      <div class="qcl-preview-label">Размер ${size}</div>
      <div class="qcl-items qcl-size-${size.toLowerCase()}" style="flex:unset;overflow:visible;padding:0">
        <div class="qcl-item qcl-item-done">
          <input class="qcl-cb" type="checkbox" checked disabled style="pointer-events:none">
          <span class="qcl-text">Выполненный пункт</span>
        </div>
        <div class="qcl-item">
          <input class="qcl-cb" type="checkbox" disabled style="pointer-events:none">
          <span class="qcl-text">Активный пункт</span>
        </div>
        <div class="qcl-item">
          <input class="qcl-cb" type="checkbox" disabled style="pointer-events:none">
          <span class="qcl-text">Ещё один пункт</span>
        </div>
      </div>`;
    document.body.appendChild(prev);

    const pr = panel.getBoundingClientRect();
    const pw = prev.offsetWidth;
    const left = pr.left - pw - 10;
    prev.style.top  = pr.top + 'px';
    prev.style.left = (left >= 0 ? left : pr.right + 10) + 'px';

    previewTimer = setTimeout(() => {
      prev.classList.add('qcl-preview-out');
      setTimeout(() => { if (prev.parentNode) prev.remove(); }, 280);
    }, 3000);
  }

  // ── Render: settings ──────────────────────────────────────
  function renderSettings() {
    if (!panel) return;
    const sp = panel.querySelector('.qcl-settings');
    sp.classList.toggle('qcl-hidden', !settingsOpen);
    panel.querySelector('.qcl-tabs').classList.toggle('qcl-hidden', settingsOpen);
    panel.querySelector('.qcl-items').classList.toggle('qcl-hidden', settingsOpen);
    panel.querySelector('.qcl-footer').classList.toggle('qcl-hidden', settingsOpen);
    const gearBtn = panel.querySelector('.qcl-settings-btn');
    if (gearBtn) gearBtn.classList.toggle('active', settingsOpen);
    if (!settingsOpen) return;

    sp.querySelectorAll('.qcl-seg-btn').forEach(btn => {
      btn.classList.toggle('qcl-seg-active', btn.dataset.size === (cData.itemSize || 'M'));
    });

    const opPct = Math.round((cData.opacity ?? 1) * 100);
    sp.querySelector('.qcl-opacity-sl').value = opPct;
    sp.querySelector('.qcl-opacity-val').textContent = `${opPct}%`;
    sp.querySelector('.qcl-truncate-chk').checked = !!cData.truncate;

    // dynamic tab management list
    const mgmt = sp.querySelector('.qcl-tab-mgmt');
    mgmt.innerHTML = cData.tabs.map((t, i) => `
      <div class="qcl-stab-row">
        <span class="qcl-stab-name">${escHtml(t.name)}</span>
        ${cData.tabs.length > 1
          ? `<button class="qcl-stab-del" data-idx="${i}" title="Удалить вкладку">${TRASH_SVG}</button>`
          : '<span class="qcl-stab-only">единственная</span>'}
      </div>`).join('');

    mgmt.querySelectorAll('.qcl-stab-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = +btn.dataset.idx;
        const name = cData.tabs[idx].name;
        const count = cData.tabs[idx].items.length;
        const warn = count > 0 ? `\nВкладка содержит ${count} пункт(а). Данные будут удалены.` : '';
        if (!confirm(`Удалить вкладку «${name}»?${warn}`)) return;
        cData.tabs.splice(idx, 1);
        if (cData.activeTab >= cData.tabs.length) cData.activeTab = cData.tabs.length - 1;
        save();
        renderTabs();
        renderBody();
        renderSettings();
      });
    });
  }

  function bindSettings() {
    const sp = panel.querySelector('.qcl-settings');

    const opSl = sp.querySelector('.qcl-opacity-sl');
    const opVal = sp.querySelector('.qcl-opacity-val');
    opSl.addEventListener('input', () => {
      cData.opacity = parseInt(opSl.value) / 100;
      opVal.textContent = `${opSl.value}%`;
      applyOpacity();
      save();
    });

    sp.querySelector('.qcl-truncate-chk').addEventListener('change', e => {
      cData.truncate = e.target.checked;
      save();
      renderBody();
    });

    sp.querySelectorAll('.qcl-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        cData.itemSize = btn.dataset.size;
        save();
        sp.querySelectorAll('.qcl-seg-btn').forEach(b => b.classList.remove('qcl-seg-active'));
        btn.classList.add('qcl-seg-active');
        showSizePreview(btn.dataset.size);
      });
    });

    sp.querySelector('.qcl-export-btn').addEventListener('click', () => {
      const data = { version: 1, tabs: cData.tabs, itemSize: cData.itemSize, opacity: cData.opacity, truncate: cData.truncate };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 't-helper-checklist.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    sp.querySelector('.qcl-import-btn').addEventListener('click', () => {
      sp.querySelector('.qcl-import-file').click();
    });

    sp.querySelector('.qcl-import-file').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!Array.isArray(data.tabs) || !data.tabs.length) throw new Error('Неверный формат файла');
          cData.tabs = data.tabs.slice(0, MAX_TABS).map(t => ({
            name: String(t.name || 'Список'),
            items: Array.isArray(t.items) ? t.items.map(it => ({ text: String(it.text || ''), done: !!it.done })) : []
          }));
          if (data.itemSize) cData.itemSize = data.itemSize;
          if (data.opacity !== undefined) cData.opacity = data.opacity;
          if (data.truncate !== undefined) cData.truncate = data.truncate;
          applyOpacity();
          cData.activeTab = 0;
          save();
          settingsOpen = false;
          renderTabs();
          renderBody();
          renderSettings();
          alert('Чек-лист успешно загружен!');
        } catch (err) {
          alert('Ошибка загрузки: ' + err.message);
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    });
  }

  function render() {
    renderTabs();
    renderBody();
    renderSettings();
  }

  // ── Open panel ────────────────────────────────────────────
  function openPanel() {
    if (panel) { panel.classList.remove('qcl-closing'); panel.style.display = 'flex'; return; }

    panel = document.createElement('div');
    panel.id = 'qcl-panel';
    panel.innerHTML = `
      <div class="qcl-head">
        <img src="${ICON16}" width="14" height="14" style="display:block;flex-shrink:0;border-radius:3px">
        <span class="qcl-title">Чек-лист</span>
        <div style="flex:1"></div>
        <div class="qcl-head-btns">
          <button class="qcl-head-btn qcl-clear-btn" title="Убрать все галочки">&#x2715;&#x2713;</button>
          <button class="qcl-head-btn qcl-collapse-btn" title="Свернуть / развернуть" style="transform:rotate(180deg)">${CHEVRON_SVG}</button>
          <button class="qcl-head-btn qcl-settings-btn" title="Настройки">${GEAR_SVG}</button>
          <button class="qcl-head-btn qcl-close-btn" title="Закрыть">${CLOSE_SVG}</button>
        </div>
      </div>
      <div class="qcl-tabs"></div>
      <div class="qcl-items"></div>
      <div class="qcl-settings qcl-hidden">
        <div class="qcl-srow">
          <span>Размер пунктов</span>
          <div class="qcl-seg">
            <button class="qcl-seg-btn" data-size="S">S</button>
            <button class="qcl-seg-btn" data-size="M">M</button>
            <button class="qcl-seg-btn" data-size="L">L</button>
          </div>
        </div>
        <div class="qcl-srow">
          <span>Прозрачность</span>
          <div class="qcl-srow-right">
            <input type="range" class="qcl-opacity-sl" min="20" max="100" value="100">
            <span class="qcl-opacity-val">100%</span>
          </div>
        </div>
        <label class="qcl-srow">
          <span>Сократить строчки</span>
          <input type="checkbox" class="qcl-truncate-chk">
        </label>
        <div class="qcl-sbtns">
          <button class="qcl-sbtn qcl-export-btn">${FOLDER_SVG} Сохранить</button>
          <button class="qcl-sbtn qcl-import-btn">${FILEPLUS_SVG} Загрузить</button>
          <input type="file" class="qcl-import-file" accept=".json" style="display:none">
        </div>
        <div class="qcl-snote">Сохраняет все вкладки в JSON-файл.</div>
        <div class="qcl-sdivider"></div>
        <div class="qcl-slabel">Вкладки</div>
        <div class="qcl-tab-mgmt"></div>
      </div>
      <div class="qcl-footer">
        <input class="qcl-add-input" type="text" placeholder="Новый пункт…" maxlength="200">
        <button class="qcl-add-btn" title="Добавить">+</button>
      </div>
      <div class="qcl-rz qcl-rz-n"  data-dir="n"  style="cursor:ns-resize"></div>
      <div class="qcl-rz qcl-rz-s"  data-dir="s"  style="cursor:ns-resize"></div>
      <div class="qcl-rz qcl-rz-e"  data-dir="e"  style="cursor:ew-resize"></div>
      <div class="qcl-rz qcl-rz-w"  data-dir="w"  style="cursor:ew-resize"></div>
      <div class="qcl-rz qcl-rz-ne" data-dir="ne" style="cursor:nesw-resize"></div>
      <div class="qcl-rz qcl-rz-nw" data-dir="nw" style="cursor:nwse-resize"></div>
      <div class="qcl-rz qcl-rz-se" data-dir="se" style="cursor:nwse-resize"></div>
      <div class="qcl-rz qcl-rz-sw" data-dir="sw" style="cursor:nesw-resize"></div>`;

    if (cData.pos) {
      panel.style.left = `${cData.pos.x}px`;
      panel.style.top  = `${cData.pos.y}px`;
      panel.style.right = 'auto';
    }
    if (cData.size) {
      panel.style.width  = `${cData.size.w}px`;
      panel.style.height = `${cData.size.h}px`;
    }

    document.body.appendChild(panel);
    applyTheme();
    applyOpacity();
    applyCollapsed();
    attachDrag(panel);
    attachResize(panel);

    // Flush a sync that was deferred because the user was editing an item
    panel.addEventListener('focusout', () => {
      if (!pendingSync) return;
      pendingSync = false;
      setTimeout(() => {
        try { chrome.storage.local.get([STORAGE_KEY], r => {
          if (r[STORAGE_KEY]) applySaved(r[STORAGE_KEY]);
        }); } catch (e) {}
      }, 60);
    });

    // Keep the panel proportionally placed when the browser window is resized
    let lastWinW = window.innerWidth, lastWinH = window.innerHeight, resizeSaveTimer = null;
    window.addEventListener('resize', () => {
      if (panel && panel.style.display !== 'none' && cData.pos) {
        const pw = panel.offsetWidth, ph = panel.offsetHeight;
        const ax0 = Math.max(0, lastWinW - pw), ay0 = Math.max(0, lastWinH - ph);
        const fx = ax0 > 0 ? cData.pos.x / ax0 : 0;
        const fy = ay0 > 0 ? cData.pos.y / ay0 : 0;
        const ax1 = Math.max(0, window.innerWidth  - pw);
        const ay1 = Math.max(0, window.innerHeight - ph);
        const nx = Math.round(Math.max(0, Math.min(fx * ax1, ax1)));
        const ny = Math.round(Math.max(0, Math.min(fy * ay1, ay1)));
        panel.style.left  = `${nx}px`;
        panel.style.top   = `${ny}px`;
        panel.style.right = 'auto';
        cData.pos = { x: nx, y: ny };
        if (resizeSaveTimer) clearTimeout(resizeSaveTimer);
        resizeSaveTimer = setTimeout(save, 400);
      }
      lastWinW = window.innerWidth;
      lastWinH = window.innerHeight;
    });

    panel.querySelector('.qcl-close-btn').addEventListener('click', () => {
      panel.classList.add('qcl-closing');
      setTimeout(() => {
        if (panel) { panel.style.display = 'none'; panel.classList.remove('qcl-closing'); }
      }, 190);
    });

    panel.querySelector('.qcl-collapse-btn').addEventListener('click', () => {
      if (settingsOpen) { settingsOpen = false; renderSettings(); }
      cData.collapsed = !cData.collapsed;
      applyCollapsed(true);
      save();
    });

    panel.querySelector('.qcl-settings-btn').addEventListener('click', () => {
      if (cData.collapsed) { cData.collapsed = false; applyCollapsed(true); save(); }
      settingsOpen = !settingsOpen;
      const btn = panel.querySelector('.qcl-settings-btn');
      btn.classList.remove('qcl-spin');
      void btn.offsetWidth; // reflow to restart animation
      btn.classList.add('qcl-spin');
      btn.addEventListener('animationend', () => btn.classList.remove('qcl-spin'), { once: true });
      renderSettings();
    });

    panel.querySelector('.qcl-clear-btn').addEventListener('click', () => {
      currentTab().items.forEach(it => { it.done = false; });
      save();
      renderBody();
    });

    // wheel over the tab bar → scroll the tab list horizontally
    panel.querySelector('.qcl-tabs').addEventListener('wheel', e => {
      const tabBar = e.currentTarget;
      if (tabBar.scrollWidth <= tabBar.clientWidth) return; // nothing to scroll
      e.preventDefault();
      tabBar.scrollLeft += (e.deltaY || e.deltaX);
    }, { passive: false });

    const input = panel.querySelector('.qcl-add-input');
    const addItem = () => {
      const text = input.value.trim();
      if (!text) return;
      currentTab().items.push({ text, done: false });
      input.value = '';
      save();
      renderBody();
      const listEl = panel.querySelector('.qcl-items');
      listEl.scrollTop = listEl.scrollHeight;
    };

    panel.querySelector('.qcl-add-btn').addEventListener('click', addItem);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') addItem();
    });

    bindSettings();
    render();
  }

  // ── Storage listener ──────────────────────────────────────
  try { chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[THEME_KEY]) {
      clTheme = changes[THEME_KEY].newValue || 'dark';
      applyTheme();
    }
    if (changes['qpi_checklist_open']) {
      // opening from the popup always shows the full list, never a collapsed strip
      const wasCollapsed = cData.collapsed;
      cData.collapsed = false;
      openPanel();
      applyCollapsed();
      if (wasCollapsed) save();
    }
    // Live cross-tab sync: react to the checklist data itself. The JSON compare
    // skips our own writes (newValue already equals cData) so there's no churn.
    if (changes[STORAGE_KEY]) {
      const v = changes[STORAGE_KEY].newValue;
      try { if (v && JSON.stringify(v) !== JSON.stringify(cData)) syncFromSaved(v); } catch (e) {}
    }
    // Config import: (re)load the data and never leave the panel as a strip —
    // an imported collapsed:true would otherwise render it as a thin line.
    if (changes['qpi_checklist_reload']) {
      try { chrome.storage.local.get([STORAGE_KEY], r => {
        if (r[STORAGE_KEY]) syncFromSaved(r[STORAGE_KEY]);
        if (cData.collapsed) { cData.collapsed = false; applyCollapsed(); save(); }
      }); } catch (e) {}
    }
  }); } catch (e) {}

  // ── Init ──────────────────────────────────────────────────
  function init() {
    if (!alive()) return;
    try { chrome.storage.local.get([STORAGE_KEY, THEME_KEY], r => {
      clTheme = r[THEME_KEY] || 'dark';
      if (r[STORAGE_KEY]) {
        const saved = r[STORAGE_KEY];
        if (saved.tabs) cData.tabs = saved.tabs;
        if (saved.activeTab !== undefined) cData.activeTab = Math.min(saved.activeTab, cData.tabs.length - 1);
        if (saved.pos)  cData.pos  = saved.pos;
        if (saved.size) cData.size = saved.size;
        if (saved.itemSize) cData.itemSize = saved.itemSize;
        if (saved.opacity !== undefined) cData.opacity = saved.opacity;
        if (saved.truncate !== undefined) cData.truncate = saved.truncate;
        if (saved.collapsed !== undefined) cData.collapsed = saved.collapsed;
      }
    }); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
