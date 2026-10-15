// ════════════════════════════════════════════════════════════
//  T-Helper · Заметки
//  У края экрана — столбик язычков. Клик по язычку разворачивает
//  заметку: её можно двигать, тянуть за угол и форматировать текст.
//  Свёрнутых и развёрнутых одновременно — сколько угодно, всего
//  не больше MAX_NOTES, чтобы страница не проседала.
//
//  Первая заметка всегда временная (значок часов). Она очищается,
//  когда оператор закрывает обращение, либо сама — через час без
//  правок, чтобы содержимое прошлого клиента не осталось на экране.
// ════════════════════════════════════════════════════════════
(function () {
  if (window.__THNOTES_LOADED) return;
  window.__THNOTES_LOADED = true;

  const CLEAR_MSG = '__THN_CLEAR_TEMP__';

  // Клик по кнопке внутри shadow root приходит с ПОДМЕНЁННЫМ target: браузер
  // отдаёт хозяина теневого корня, а не саму кнопку. composedPath() отдаёт
  // настоящий путь события и проходит сквозь теневую границу.
  function eventPath(e) {
    return typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
  }

  const CROSS_D = 'M8.02176 9.43677';
  // Смотрим ТОЛЬКО на сам значок, не поднимаясь по предкам: прежняя версия
  // искала крест через querySelector у каждого узла пути, доходила до body
  // и находила первый попавшийся крестик на странице — заметка очищалась
  // почти от любого клика.
  function isCloseCross(el) {
    if (el.matches?.('[data-automation-id="close-wug-button"]')) return true;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'path') return (el.getAttribute('d') || '').startsWith(CROSS_D);
    if (tag === 'svg' || tag === 'tui-svg' || el.classList?.contains('t-src')) {
      const p = el.querySelector('path');
      return !!p && (p.getAttribute('d') || '').startsWith(CROSS_D);
    }
    return false;
  }

  // Возвращает причину очистки или null.
  function closeReason(e) {
    const path = eventPath(e).filter(n => n && n.nodeType === 1);
    if (path.some(n => n.matches?.('[automation-id="close-chat-option-closeThread"]')))
      return 'закрыто обращение';
    // Вторая кнопка — общее подтверждение, оно встречается и в других
    // диалогах, поэтому дополнительно смотрим на текст.
    const confirmBtn = path.find(n =>
      n.matches?.('[data-automation-id="event-bus-alert-notification-button"]'));
    if (confirmBtn && /закрыть/i.test(confirmBtn.textContent || ''))
      return 'подтверждено закрытие';
    if (path.some(isCloseCross)) return 'закрыта вкладка обращения';
    return null;
  }

  // Интерфейс обращения живёт в iframe, а сами заметки — только в верхнем
  // фрейме. Поэтому в дочерних фреймах остаётся лишь наблюдатель, который
  // сообщает наверх: иначе клик по кнопке закрытия до модуля не доходит.
  if (window !== window.top) {
    document.addEventListener('click', e => {
      const reason = closeReason(e);
      if (reason) {
        try { window.top.postMessage({ type: CLEAR_MSG, reason }, '*'); } catch (_) {}
      }
    }, true);
    return;
  }

  const MODULES_KEY  = 'twfm_modules';
  const NOTES_KEY    = 'twfm_notes';
  const THEME_KEY    = 'twfm_theme';
  const MAX_NOTES    = 20;
  const TEMP_ID      = '__temp__';
  const TEMP_IDLE_MS = 60 * 60 * 1000;          // час без правок
  const DEFAULT_COLOR = '#FFD000';

  function alive() { try { return !!chrome.runtime?.id; } catch (e) { return false; } }

  let enabled = true;
  let theme   = 'dark';
  let data    = { notes: [], side: 'right', style: 'glass' };
  let rail    = null;
  const windows = new Map();                    // id -> элемент окна

  // ── Иконки ──
  const IC = {
    clock: `<svg viewBox="0 0 24 24" width="14" height="14" style="display:block">
      <mask id="thn-clock-cut"><rect width="24" height="24" fill="#fff"/>
        <path d="M11.4 6.5v5.7h5.3" fill="none" stroke="#000" stroke-width="2.6"
              stroke-linecap="round" stroke-linejoin="round"/></mask>
      <circle cx="12" cy="12" r="9.6" fill="currentColor" mask="url(#thn-clock-cut)"/></svg>`,
    collapse: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
      stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" style="display:block">
      <path d="M20.5 3.5 14.5 9.5M14.5 9.5h5M14.5 9.5v-5M3.5 20.5l6-6M9.5 14.5h-5M9.5 14.5v5"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" style="display:block">
      <path d="M21.7 5.4 18.6 2.3a1 1 0 0 0-1.4 0l-2 2 4.5 4.5 2-2a1 1 0 0 0 0-1.4ZM3 17.2V21h3.8L18.4 9.4 14.6 5.6 3 17.2Z"/></svg>`,
    close: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
      stroke-width="2.2" stroke-linecap="round" style="display:block"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
      stroke-width="2.4" stroke-linecap="round" style="display:block"><path d="M12 5v14M5 12h14"/></svg>`,
    eraser: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block">
      <path d="M8.5 20.5H21M3.9 16.2l4.6 4.3h4l8.2-8.2a1.6 1.6 0 0 0 0-2.3l-5-5a1.6 1.6 0 0 0-2.3 0L3.9 13.8a1.6 1.6 0 0 0 0 2.4Z"/></svg>`,
    speaker: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.9 3.3c1.3-1 3.2-.2 3.4 1.4.3 2.3.4 4.6.4 7.3s-.1 5-.4 7.3c-.2 1.6-2.1 2.4-3.4 1.4l-3.1-2.4a1 1 0 0 0-.6-.2H5.4A3.4 3.4 0 0 1 2 14.7V9.3A3.4 3.4 0 0 1 5.4 5.9h1.8a1 1 0 0 0 .6-.2l3.1-2.4Z"/><path d="M17.6 8.1a1.2 1.2 0 0 1 1.3 1.1c.1 1 .1 1.9.1 2.8s0 1.8-.1 2.8a1.2 1.2 0 0 1-2.4-.2c.1-.9.1-1.7.1-2.6s0-1.7-.1-2.6a1.2 1.2 0 0 1 1.1-1.3Z"/><path d="M21.3 6.2a1.2 1.2 0 0 1 1.3 1.1c.2 1.6.2 3.2.2 4.7s0 3.1-.2 4.7a1.2 1.2 0 0 1-2.4-.2c.1-1.5.2-3 .2-4.5s-.1-3-.2-4.5a1.2 1.2 0 0 1 1.1-1.3Z"/></svg>`,
  };
  // Набор значков для заметок. Png перекрашиваются маской, поэтому
  // значок всегда идёт цветом самой заметки.
  const ICON_SET = ["bookmark", "comment", "folder", "heart", "home", "laptop", "lightning", "money-bag", "open-book", "plugin", "sd-card", "search", "shield", "shopping-cart", "star", "ticket"];
  // Значки подставляются переменной из notes-icons.css, а не по адресу:
  // маска работает только с источником того же происхождения.
  const iconVar = name => `var(--thn-ico-${name})`;

  const COPY_IC = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"
    style="display:block"><path d="M4.5 2.2h11a1.2 1.2 0 0 1 0 2.4H5.7a.5.5 0 0 0-.5.5v10.4a1.2 1.2 0 0 1-2.4 0V3.4a1.2 1.2 0 0 1 1.2-1.2Z"/><path d="M8.3 6.6h11.2c.7 0 1.2.5 1.2 1.2v11.5c0 1.6-1.3 2.9-2.9 2.9H10c-1.6 0-2.9-1.3-2.9-2.9V7.8c0-.7.5-1.2 1.2-1.2Z"/></svg>`;

  // Готовая палитра закрывает почти все случаи; «свой» остаётся для
  // остальных, поэтому системный выбор цвета спрятан под один пункт,
  // а не висит отдельным контролом в шапке.
  const PALETTE = ['#FFD000', '#ff9f43', '#ff6b6b', '#e879f9', '#a78bfa',
                   '#4dabf7', '#22d3ee', '#51cf66', '#a3e635', '#94a3b8'];

  const TEMP_HINT = 'Очищается, когда закрываешь обращение, и сама — через час без правок.';

  // ── Хранилище ──
  function save() {
    if (!alive()) return;
    chrome.storage.local.set({ [NOTES_KEY]: data });
  }

  function newId() { return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // Список заметок общий для всех вкладок. Просто заменить его тем, что
  // пришло из хранилища, нельзя: запись отложена на 400 мс после набора,
  // и вкладка, в которой сейчас печатают, потеряла бы последние секунды
  // правок от чужого сохранения. Поэтому сверяем по каждой заметке
  // отдельно и оставляем ту версию, что свежее.
  //
  // Заметки, которой нет в пришедшем списке, нет и в хранилище: новые
  // сохраняются сразу при создании, а не по таймеру. Значит её удалили
  // в другой вкладке — убираем и у себя.
  // Возвращает id заметок, которые изменились, или null — если список
  // совпал и перерисовывать нечего.
  function mergeNotes(remote) {
    const local = new Map(data.notes.map(n => [n.id, n]));
    const merged = remote.map(rn => {
      const ln = local.get(rn.id);
      return ln && (ln.updatedAt || 0) > (rn.updatedAt || 0) ? ln : rn;
    });
    if (JSON.stringify(merged) === JSON.stringify(data.notes)) return null;

    const was = new Map(data.notes.map(n => [n.id, JSON.stringify(n)]));
    data.notes = merged;
    const changed = merged.filter(n => was.get(n.id) !== JSON.stringify(n)).map(n => n.id);
    for (const id of was.keys()) if (!merged.some(n => n.id === id)) changed.push(id);
    return changed;
  }

  // Перерисовать рейку и окна. ids === null — все (смена темы или
  // оформления), иначе только перечисленные: чужое сохранение не должно
  // пересобирать окно, в котором прямо сейчас стоит курсор.
  function redrawAll(ids) {
    renderRail();
    windows.forEach((el, id) => {
      if (ids && !ids.includes(id)) return;
      const n = data.notes.find(x => x.id === id);
      if (!n) { el.remove(); windows.delete(id); return; }
      if (el.contains(document.activeElement)) return;      // здесь сейчас печатают
      renderNote(n);
    });
    data.notes.filter(n => n.open && !windows.has(n.id)).forEach(renderNote);
  }

  // Временная заметка существует всегда, пока модуль включён.
  function ensureTemp() {
    if (!data.notes.some(n => n.id === TEMP_ID)) {
      data.notes.unshift({
        id: TEMP_ID, temp: true, title: 'Временная', color: DEFAULT_COLOR,
        html: '', x: null, y: null, w: 280, h: 200, open: false, updatedAt: Date.now()
      });
    }
  }

  // Содержимое заметки пишется в DOM обратно, а попасть туда могло
  // вставкой со страницы — вычищаем скрипты и обработчики событий.
  function sanitize(html) {
    const box = document.createElement('div');
    box.innerHTML = html || '';
    box.querySelectorAll('script, style, iframe, object, embed, link').forEach(el => el.remove());
    box.querySelectorAll('*').forEach(el => {
      [...el.attributes].forEach(a => {
        const n = a.name.toLowerCase();
        if (n.startsWith('on') || (n === 'href' && /^\s*javascript:/i.test(a.value))) {
          el.removeAttribute(a.name);
        }
      });
    });
    return box.innerHTML;
  }

  // ── Столбик язычков ──
  function renderRail() {
    if (!rail) {
      rail = document.createElement('div');
      rail.id = 'thn-rail';
      document.body.appendChild(rail);
    }
    rail.className = `thn-side-${data.side} thn-style-${data.style}`;
    if (theme !== 'dark') rail.setAttribute('data-theme', theme);
    else rail.removeAttribute('data-theme');
    rail.innerHTML = '';

    data.notes.forEach(note => {
      if (note.open) return;                     // развёрнутая заметка язычка не показывает
      const tab = document.createElement('button');
      tab.className = 'thn-tab';
      tab.type = 'button';
      tab.title = note.title || 'Заметка';
      tab.style.setProperty('--thn-color', note.color || DEFAULT_COLOR);
      // Значок — вложенным элементом, а не на самом .thn-tab-icon: раньше
      // оба класса висели на одном узле, а ширина язычка была сжата до 14px,
      // и значок вместе с рамками туда не влезал и срезался.
      const mark = note.temp
        ? IC.clock
        : (note.icon ? `<span class="thn-ico" style="--thn-ico:${iconVar(note.icon)}"></span>`
                     : '<span class="thn-tab-dot"></span>');
      tab.innerHTML = `<span class="thn-tab-icon">${mark}</span>` +
                      `<span class="thn-tab-label">${escapeHtml(shortTitle(note.title))}</span>`;
      tab.dataset.noteId = note.id;
      tab.addEventListener('click', () => openNote(note.id));
      rail.appendChild(tab);
    });

    if (data.notes.length < MAX_NOTES) {
      const add = document.createElement('button');
      add.className = 'thn-tab thn-tab-add';
      add.type = 'button';
      add.title = 'Новая заметка';
      add.innerHTML = IC.plus;
      add.addEventListener('click', addNote);
      rail.appendChild(add);
    }
  }

  const shortTitle = t => (t || 'Заметка').slice(0, 14);
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function addNote() {
    if (data.notes.length >= MAX_NOTES) return;
    const note = {
      id: newId(), title: 'Заметка', color: DEFAULT_COLOR, html: '',
      x: null, y: null, w: 280, h: 200, open: true, updatedAt: Date.now()
    };
    data.notes.push(note);
    save(); renderRail(); renderNote(note);
  }

  // ── Разворачивание и сворачивание ──
  // Окно летит от своего язычка и возвращается туда же тем же путём:
  // предмет, исчезнувший в одну сторону, должен появляться оттуда же,
  // иначе связь между язычком и заметкой не читается. Анимация идёт
  // через WAAPI, а не keyframes: точки старта считаются на лету и её
  // можно прервать на любом кадре, если заметку тронули.
  const EASE_IN  = 'cubic-bezier(0.32, 0.72, 0, 1)';
  const EASE_OUT = 'cubic-bezier(0.4, 0, 0.68, 0.28)';

  function tabRectFor(id) {
    const tab = rail?.querySelector(`.thn-tab[data-note-id="${id}"]`);
    if (tab) return tab.getBoundingClientRect();
    // язычка нет — берём край столбика, чтобы движение всё равно шло «оттуда»
    const r = rail?.getBoundingClientRect();
    return r || { left: window.innerWidth, top: window.innerHeight / 2, width: 0, height: 0 };
  }

  function flyFrames(el, id) {
    const r = el.getBoundingClientRect();
    const t = tabRectFor(id);
    const dx = (t.left + t.width / 2)  - (r.left + r.width / 2);
    const dy = (t.top  + t.height / 2) - (r.top  + r.height / 2);
    return [
      { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(0.16)`, filter: 'blur(2px)' },
      { opacity: 1, transform: 'translate(0px, 0px) scale(1)', filter: 'blur(0px)' }
    ];
  }

  function animateOpen(el, id) {
    el.animate(flyFrames(el, id), { duration: 360, easing: EASE_IN, fill: 'both' });
  }

  function animateClose(el, id, done) {
    const [small, full] = flyFrames(el, id);
    el.animate([full, small], { duration: 240, easing: EASE_OUT, fill: 'both' })
      .addEventListener('finish', done, { once: true });
  }

  // ── Окно заметки ──
  function openNote(id) {
    const note = data.notes.find(n => n.id === id);
    if (!note || note.open) return;
    note.open = true;
    save(); renderRail(); renderNote(note);
  }

  function closeNote(id) {
    const note = data.notes.find(n => n.id === id);
    if (!note) return;
    const el = windows.get(id);
    note.open = false;
    windows.delete(id);
    save();
    renderRail();                 // язычок должен существовать до полёта — летим к нему
    if (el) { el.style.pointerEvents = 'none'; animateClose(el, id, () => el.remove()); }
  }

  function removeNote(id) {
    const i = data.notes.findIndex(n => n.id === id);
    if (i < 0 || data.notes[i].temp) return;     // временную удалить нельзя
    windows.get(id)?.remove();
    windows.delete(id);
    data.notes.splice(i, 1);
    save(); renderRail();
  }

  function defaultPos(note) {
    const n = windows.size;
    const x = data.side === 'right'
      ? Math.max(20, window.innerWidth - note.w - 80 - n * 26)
      : 80 + n * 26;
    return { x, y: 90 + n * 26 };
  }

  function renderNote(note) {
    windows.get(note.id)?.remove();

    const el = document.createElement('div');
    el.className = `thn-note thn-style-${data.style}`;
    if (theme !== 'dark') el.setAttribute('data-theme', theme);
    el.style.setProperty('--thn-color', note.color || DEFAULT_COLOR);

    if (note.x === null || note.y === null) Object.assign(note, defaultPos(note));
    el.style.left   = note.x + 'px';
    el.style.top    = note.y + 'px';
    el.style.width  = note.w + 'px';
    el.style.height = note.h + 'px';

    el.innerHTML = `
      <div class="thn-head">
        <span class="thn-dot">${note.temp ? IC.clock
          : (note.icon ? `<span class="thn-ico" style="--thn-ico:${iconVar(note.icon)}"></span>` : '')}</span>
        <input class="thn-title" value="${escapeHtml(note.title || '')}"
               placeholder="Заметка" ${note.temp ? 'readonly' : ''}>
        ${note.temp ? `<span class="thn-hint" data-tip="${escapeHtml(TEMP_HINT)}">?</span>` : ''}
        <div class="thn-head-btns">
          ${note.temp ? `<button class="thn-btn thn-clear" type="button" title="Очистить">${IC.eraser}</button>` : ''}
          <button class="thn-btn thn-pick" type="button" title="${note.temp ? 'Цвет' : 'Цвет и значок'}">
            <span class="thn-pick-dot"></span>
          </button>
          <button class="thn-btn thn-edit" type="button" title="Форматирование">${IC.edit}</button>
          <button class="thn-btn thn-collapse" type="button" title="Свернуть">${IC.collapse}</button>
          ${note.temp ? '' : `<button class="thn-btn thn-del" type="button" title="Удалить">${IC.close}</button>`}
        </div>
      </div>
      <div class="thn-toolbar" hidden>
        <button type="button" data-cmd="bold"          title="Жирный"><b>Ж</b></button>
        <button type="button" data-cmd="italic"        title="Курсив"><i>К</i></button>
        <button type="button" data-cmd="underline"     title="Подчёркнутый"><u>Ч</u></button>
        <button type="button" data-cmd="strikeThrough" title="Зачёркнутый"><s>З</s></button>
        <span class="thn-sep"></span>
        <button type="button" data-size="up"   title="Крупнее">A+</button>
        <button type="button" data-size="down" title="Мельче">A−</button>
        <span class="thn-sep"></span>
        <button type="button" data-cmd="insertUnorderedList" title="Список">•—</button>
        <button type="button" data-callout="1" title="Выделенный блок">${IC.speaker}</button>
        <button type="button" data-cmd="removeFormat"        title="Убрать оформление">⌫</button>
      </div>
      <div class="thn-body" contenteditable="true" spellcheck="false"></div>
      <div class="thn-resize" title="Изменить размер"></div>`;

    el.querySelector('.thn-body').innerHTML = sanitize(note.html);
    document.body.appendChild(el);
    windows.set(note.id, el);

    // ── правки ──
    const body = el.querySelector('.thn-body');
    let saveTimer = null;
    body.addEventListener('input', () => {
      note.html = sanitize(body.innerHTML);
      note.updatedAt = Date.now();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 400);        // не пишем в хранилище на каждый символ
    });

    const titleInput = el.querySelector('.thn-title');
    titleInput.addEventListener('input', () => {
      note.title = titleInput.value;
      note.updatedAt = Date.now();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { save(); renderRail(); }, 400);
    });

    // ── панель форматирования ──
    const toolbar = el.querySelector('.thn-toolbar');
    el.querySelector('.thn-edit')?.addEventListener('click', () => {
      const on = toolbar.hidden;
      toolbar.hidden = !on;
      el.classList.toggle('thn-editing', on);
      if (on) body.focus();
    });
    toolbar.addEventListener('mousedown', e => e.preventDefault());  // не терять выделение
    toolbar.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      body.focus();
      if (btn.dataset.callout) {
        insertCallout(body);
      } else if (btn.dataset.cmd) {
        document.execCommand(btn.dataset.cmd, false, null);
      } else if (btn.dataset.size) {
        stepFontSize(body, btn.dataset.size === 'up' ? 1 : -1);
      }
      note.html = sanitize(body.innerHTML);
      note.updatedAt = Date.now();
      save();
    });

    el.querySelector('.thn-clear')?.addEventListener('click', () => {
      body.innerHTML = '';
      note.html = '';
      note.updatedAt = Date.now();
      save();
      body.focus();
    });
    el.querySelector('.thn-pick')?.addEventListener('click', ev => {
      ev.stopPropagation();
      if (el.querySelector('.thn-picker')) { el.querySelector('.thn-picker').remove(); return; }

      const pick = document.createElement('div');
      pick.className = 'thn-picker';
      pick.innerHTML = `
        <div class="thn-pick-label">Цвет</div>
        <div class="thn-pick-colors">
          ${PALETTE.map(c => `<button class="thn-sw${c.toLowerCase() === (note.color || '').toLowerCase()
              ? ' thn-sw-on' : ''}" type="button" data-color="${c}" style="--sw:${c}"></button>`).join('')}
          <label class="thn-sw thn-sw-custom" title="Свой цвет">
            <input type="color" value="${note.color || DEFAULT_COLOR}">
          </label>
        </div>
        ${note.temp ? '' : `<div class="thn-pick-label">Значок</div>
        <div class="thn-pick-icons">
          <button class="thn-ico-btn thn-ico-none${note.icon ? '' : ' thn-ico-on'}" type="button" title="Без значка">✕</button>
          ${ICON_SET.map(n => `<button class="thn-ico-btn${note.icon === n ? ' thn-ico-on' : ''}"
              type="button" data-icon="${n}" title="${n}">
              <span class="thn-ico" style="--thn-ico:${iconVar(n)}"></span></button>`).join('')}
        </div>`}`;

      const applyColor = (c, preview) => {
        note.color = c;
        el.style.setProperty('--thn-color', c);
        pick.querySelectorAll('.thn-sw[data-color]').forEach(b =>
          b.classList.toggle('thn-sw-on', b.dataset.color.toLowerCase() === c.toLowerCase()));
        if (preview) return;              // ползунок ещё тянут — только показываем
        note.updatedAt = Date.now();
        save(); renderRail();
      };
      // input приходит на каждое движение ползунка, change — один раз,
      // когда системную палитру закрыли. Пишем только по change, чтобы
      // не гонять запись в storage десятки раз в секунду.
      const colorInput = pick.querySelector('.thn-sw-custom input');
      colorInput.addEventListener('input',  () => applyColor(colorInput.value, true));
      colorInput.addEventListener('change', () => {
        applyColor(colorInput.value, false);
        colorInput.blur();                // снимаем защиту в off()
      });
      pick.addEventListener('click', pe => {
        const sw = pe.target.closest('.thn-sw[data-color]');
        if (sw) { applyColor(sw.dataset.color); return; }
        const ib = pe.target.closest('.thn-ico-btn');
        if (!ib) return;
        note.icon = ib.dataset.icon || null;
        note.updatedAt = Date.now();
        save(); renderRail(); renderNote(note);
      });

      el.appendChild(pick);
      const off = e2 => {
        if (pick.contains(e2.target)) return;
        // Пока открыта системная палитра, фокус держится на нашем
        // <input type="color">, а клики по её ползункам могут долетать
        // до страницы как клики «мимо». Закрыв по ним меню, мы вынули бы
        // из DOM сам input, и системная палитра закрылась бы следом.
        if (document.activeElement === colorInput) return;
        pick.remove();
        document.removeEventListener('pointerdown', off, true);
      };
      setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
    });

    el.querySelector('.thn-collapse')?.addEventListener('click', () => closeNote(note.id));
    el.querySelector('.thn-del')?.addEventListener('click', () => {
      if (confirm(`Удалить заметку «${note.title || 'без названия'}»?`)) removeNote(note.id);
    });

    attachCalloutCopy(el, body);
    animateOpen(el, note.id);
    attachDrag(el, note);
    attachResize(el, note);

    // окно поверх остальных при любом касании
    el.addEventListener('pointerdown', () => {
      windows.forEach(w => w.classList.remove('thn-top'));
      el.classList.add('thn-top');
    });
  }

  // Кегль задаём блоку целиком, а не оборачиваем выделение в <font>.
  // Так размер наследуют и вложенные элементы — в частности значок
  // выноски, заданный в em: обёртка меняла только текст внутри блока,
  // а сам блок оставался прежнего кегля, и значок не рос.
  function blockOf(body, node) {
    let el = node && node.nodeType === 3 ? node.parentElement : node;
    while (el && el !== body && getComputedStyle(el).display === 'inline') el = el.parentElement;
    return el && el !== body ? el : null;
  }

  function stepFontSize(body, dir) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const blocks = new Set();
    const start = blockOf(body, r.startContainer);
    const end   = blockOf(body, r.endContainer);
    if (start) blocks.add(start);
    if (end)   blocks.add(end);
    // выделение через несколько блоков — берём все затронутые
    body.querySelectorAll('div, p, li, .thn-callout').forEach(el => {
      if (!r.collapsed && r.intersectsNode(el) && blockOf(body, el) === el) blocks.add(el);
    });
    if (!blocks.size) { body.style.fontSize = clampSize(body, dir) + 'px'; return; }
    blocks.forEach(el => {
      const cur = parseFloat(getComputedStyle(el).fontSize) || 12.5;
      el.style.fontSize = Math.min(26, Math.max(10, cur + dir * 1.5)) + 'px';
    });
  }
  const clampSize = (el, dir) =>
    Math.min(26, Math.max(10, (parseFloat(getComputedStyle(el).fontSize) || 12.5) + dir * 1.5));

  // Выноска: обычный div со своим оформлением. Значок рисуется из CSS,
  // а не вкладывается в разметку — иначе каждая вставка тащила бы в
  // сохранённый текст свой svg с градиентом и собственным id.
  function insertCallout(body) {
    const sel = window.getSelection();
    let inner = '';
    if (sel && sel.rangeCount && !sel.isCollapsed &&
        body.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      // appendChild возвращает сам фрагмент, а не контейнер — прежняя цепочка
      // обрывалась на .parentElement фрагмента, и выделение никогда не попадало
      // внутрь блока.
      const box = document.createElement('div');
      box.appendChild(sel.getRangeAt(0).cloneContents());
      inner = sanitize(box.innerHTML);
    }
    // Пустой абзац следом больше не добавляем: он оставлял после блока
    // пустую строку, которую приходилось удалять вручную.
    const html = `<div class="thn-callout">${inner || '<br>'}</div>`;
    document.execCommand('insertHTML', false, html);
  }

  // ════════════════════════════════════════════════════════
  //  Редактор заметки
  //  Заметка — contenteditable на чужой странице, и у страницы свои
  //  глобальные обработчики клавиш: в чате Enter отправляет сообщение,
  //  поэтому до нашего поля он просто не доходил и перенос строки не
  //  работал вовсе.
  //
  //  Поэтому редактирование мы берём на себя: слушаем на window в фазе
  //  перехвата (раньше почти любого обработчика страницы) и выполняем
  //  правку руками. Если хозяин всё-таки успел первым и вызвал
  //  preventDefault, отменить это нельзя — но вставку мы к тому моменту
  //  уже сделали сами, так что итог одинаков в обоих случаях.
  // ════════════════════════════════════════════════════════

  function editorBody(node) {
    const el = node && node.nodeType === 1 ? node : node?.parentElement;
    return el?.closest?.('.thn-body') || null;
  }

  function calloutAt(body, sel) {
    const n = sel.anchorNode;
    const el = n && n.nodeType === 1 ? n : n?.parentElement;
    const co = el?.closest?.('.thn-callout');
    return co && body.contains(co) ? co : null;
  }

  const isEmptyBlock = el => !el.textContent.trim() && !el.querySelector('img');

  function putCaret(node, atEnd) {
    const r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(!atEnd);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  // Выход из выноски: перенос внутри неё оставляет каретку в том же
  // блоке (иначе Enter плодил вторую выноску со вторым значком), а
  // наружу выводит отдельное действие.
  function exitCallout(body, co) {
    const p = document.createElement('div');
    p.innerHTML = '<br>';
    co.after(p);
    if (isEmptyBlock(co)) co.remove();
    putCaret(p, false);
  }

  function dropBlock(body, el) {
    const prev = el.previousElementSibling;
    el.remove();
    if (prev) putCaret(prev, true);
    else putCaret(body, false);
  }

  // Текст в заметки попадает копированием со страницы обращения и тащит
  // чужие шрифты, цвета и классы. Оставляем структуру — абзацы, списки,
  // переносы, начертание — и выбрасываем оформление, иначе заметка
  // выглядит как вырезанный кусок чужого интерфейса.
  const PASTE_KEEP = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE',
                              'BR', 'DIV', 'P', 'UL', 'OL', 'LI', 'A']);
  function cleanPaste(html) {
    const box = document.createElement('div');
    box.innerHTML = sanitize(html);
    box.querySelectorAll('*').forEach(el => {
      [...el.attributes].forEach(a => {
        const keepHref = el.tagName === 'A' && a.name.toLowerCase() === 'href';
        if (!keepHref) el.removeAttribute(a.name);
      });
    });
    // всё лишнее разворачиваем, сохраняя содержимое
    for (let pass = 0; pass < 20; pass++) {
      const extra = [...box.querySelectorAll('*')].filter(el => !PASTE_KEEP.has(el.tagName));
      if (!extra.length) break;
      extra.forEach(el => { if (el.isConnected) el.replaceWith(...el.childNodes); });
    }
    return box.innerHTML;
  }

  function onEditorKey(e) {
    const body = editorBody(document.activeElement);
    if (!body) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !body.contains(sel.anchorNode)) return;

    const own = () => { e.preventDefault(); e.stopPropagation(); };
    // execCommand сам поднимает input, а правки руками — нет; без этого
    // они не попадали бы в хранилище до следующего нажатия клавиши.
    const edited = () => body.dispatchEvent(new Event('input', { bubbles: true }));
    const co = calloutAt(body, sel);

    if (e.key === 'Enter') {
      own();
      if (co) {
        // Ctrl+Enter — наружу; пустая выноска на Enter тоже отпускает,
        // как это делает список.
        if (e.ctrlKey || e.metaKey || isEmptyBlock(co)) { exitCallout(body, co); edited(); }
        else document.execCommand('insertLineBreak');
      } else if (e.shiftKey) {
        document.execCommand('insertLineBreak');
      } else {
        // insertParagraph сам знает про списки: внутри ul создаёт новый li
        document.execCommand('insertParagraph');
      }
      return;
    }

    if (e.key === 'Backspace' && co && isEmptyBlock(co) && sel.isCollapsed) {
      own();                       // опустевшая выноска уходит целиком, за одно нажатие
      dropBlock(body, co);
      edited();
      return;
    }

    // Tab внутри заметки не должен уводить фокус наружу
    if (e.key === 'Tab') { own(); return; }

    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      const cmd = { b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()];
      if (cmd) { own(); document.execCommand(cmd); }
    }
  }

  function onEditorPaste(e) {
    // Строго по цели события: подстраховка через activeElement увела бы
    // к нам вставку, сделанную в поле страницы, пока заметка в фокусе.
    const body = editorBody(e.target);
    if (!body) return;
    e.preventDefault();
    e.stopPropagation();
    const dt = e.clipboardData;
    const html = dt?.getData('text/html');
    const text = dt?.getData('text/plain') || '';
    document.execCommand('insertHTML', false,
      html ? cleanPaste(html)
           : escapeHtml(text).replace(/\r?\n/g, '<br>'));
  }

  window.addEventListener('keydown', onEditorKey, true);
  window.addEventListener('paste', onEditorPaste, true);

  // Кнопка копирования не лежит в тексте заметки, а подставляется поверх
  // выноски по наведению: иначе она попадала бы в сохранённый html и
  // копировалась бы вместе с содержимым.
  function attachCalloutCopy(el, body) {
    const btn = document.createElement('button');
    btn.className = 'thn-copy';
    btn.type = 'button';
    btn.title = 'Скопировать';
    btn.innerHTML = COPY_IC;
    btn.hidden = true;
    el.appendChild(btn);

    let target = null;
    const place = co => {
      target = co;
      const r = co.getBoundingClientRect(), n = el.getBoundingClientRect();
      btn.style.left = (r.right - n.left - 26) + 'px';
      btn.style.top  = (r.top   - n.top  + 6)  + 'px';
      btn.hidden = false;
    };
    body.addEventListener('mousemove', e => {
      const co = e.target.closest?.('.thn-callout');
      if (co) place(co); else if (!btn.matches(':hover')) { btn.hidden = true; target = null; }
    });
    body.addEventListener('mouseleave', () => { if (!btn.matches(':hover')) btn.hidden = true; });
    btn.addEventListener('click', () => {
      if (!target) return;
      navigator.clipboard.writeText(target.innerText.trim()).then(() => {
        btn.classList.add('thn-copied');
        setTimeout(() => btn.classList.remove('thn-copied'), 900);
      }).catch(() => {});
    });
  }

  // ── Перемещение ──
  // Тянем по указателю один к одному и с учётом точки захвата: если
  // прыгать центром под курсор, ощущение прямого перетаскивания теряется.
  function attachDrag(el, note) {
    const head = el.querySelector('.thn-head');
    const title = el.querySelector('.thn-title');

    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;           // кнопки остаются кнопками

      // Поле названия растянуто на всю строку, и раньше оно целиком
      // съедало захват: тянуть можно было только за узкие поля по краям.
      // Теперь тянем и за него — но с порогом: короткий клик по-прежнему
      // ставит курсор в название, а движение переходит в перетаскивание.
      const onTitle = e.target === title;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      const sx = e.clientX, sy = e.clientY;
      let moving = false;

      head.setPointerCapture(e.pointerId);

      const move = ev => {
        if (!moving) {
          if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 4) return;
          moving = true;
          el.classList.add('thn-dragging');
          if (onTitle) {                                 // ушли в перетаскивание — снимаем ввод
            title.blur();
            window.getSelection()?.removeAllRanges();
          }
        }
        note.x = clamp(ev.clientX - dx, -r.width + 60, window.innerWidth - 60);
        note.y = clamp(ev.clientY - dy, 0, window.innerHeight - 40);
        el.style.left = note.x + 'px';
        el.style.top  = note.y + 'px';
      };
      const up = () => {
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', up);
        if (moving) { el.classList.remove('thn-dragging'); save(); }
      };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });
  }

  function attachResize(el, note) {
    const grip = el.querySelector('.thn-resize');
    grip.addEventListener('pointerdown', e => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY;
      grip.setPointerCapture(e.pointerId);

      const move = ev => {
        note.w = Math.max(200, Math.round(r.width  + ev.clientX - sx));
        note.h = Math.max(120, Math.round(r.height + ev.clientY - sy));
        el.style.width  = note.w + 'px';
        el.style.height = note.h + 'px';
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        save();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
  }

  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

  // ── Очистка временной заметки ──
  function clearTemp(reason) {
    const note = data.notes.find(n => n.id === TEMP_ID);
    if (!note || (!note.html && !note.open)) return;
    note.html = '';
    note.updatedAt = Date.now();
    const el = windows.get(TEMP_ID);
    if (el) el.querySelector('.thn-body').innerHTML = '';
    save();
    log('временная заметка очищена:', reason);
  }

  function log(...a) { try { console.debug('[T-Helper заметки]', ...a); } catch (e) {} }

  // Закрытие обращения. Второй селектор — общая кнопка подтверждения,
  // она встречается и в других диалогах, поэтому дополнительно смотрим
  // на текст: иначе заметка стиралась бы на посторонних подтверждениях.
  document.addEventListener('click', e => {
    if (!enabled) return;
    const reason = closeReason(e);
    if (reason) clearTemp(reason);
  }, true);

  // Сообщение из дочернего фрейма, где нажали кнопку закрытия.
  window.addEventListener('message', e => {
    if (!enabled || !e.data || e.data.type !== CLEAR_MSG) return;
    clearTemp(e.data.reason || 'закрытие из фрейма');
  });

  // Час без правок — содержимое прошлого клиента не должно оставаться.
  setInterval(() => {
    if (!enabled) return;
    const note = data.notes.find(n => n.id === TEMP_ID);
    if (note && note.html && Date.now() - (note.updatedAt || 0) > TEMP_IDLE_MS) {
      clearTemp('час без правок');
    }
  }, 60 * 1000);

  // ── Включение и выключение ──
  function mount() {
    ensureTemp();
    renderRail();
    data.notes.filter(n => n.open).forEach(renderNote);
  }

  function unmount() {
    windows.forEach(el => el.remove());
    windows.clear();
    rail?.remove();
    rail = null;
  }

  function apply() {
    if (enabled) mount();
    else unmount();
  }

  if (!alive()) return;

  chrome.storage.local.get([MODULES_KEY, NOTES_KEY, THEME_KEY], r => {
    enabled = r[MODULES_KEY]?.notes !== false;
    theme   = r[THEME_KEY] === 'white' ? 'white' : 'dark';
    Object.assign(data, r[NOTES_KEY] || {});
    if (!Array.isArray(data.notes)) data.notes = [];
    apply();
  });

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch[MODULES_KEY]) {
      enabled = ch[MODULES_KEY].newValue?.notes !== false;
      apply();
    }
    if (ch[THEME_KEY]) {
      theme = ch[THEME_KEY].newValue === 'white' ? 'white' : 'dark';
      if (enabled) redrawAll(null);
    }
    if (ch[NOTES_KEY]) {
      const v = ch[NOTES_KEY].newValue || {};
      const sideChanged  = v.side  && v.side  !== data.side;
      const styleChanged = v.style && v.style !== data.style;
      if (sideChanged)  data.side  = v.side;
      if (styleChanged) data.style = v.style;
      const changed = Array.isArray(v.notes) ? mergeNotes(v.notes) : null;
      if (!enabled) return;
      if (sideChanged || styleChanged) redrawAll(null);     // оформление — всем окнам
      else if (changed && changed.length) redrawAll(changed);
    }
  });
})();
