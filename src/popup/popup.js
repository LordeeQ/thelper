// T-Helper · popup — управление модулями
const MODULES_KEY = 'twfm_modules';
const WIDGET_KEY  = 'twfm_widget';
const HINTS_KEY   = 'twfm_hints';
const THEME_KEY   = 'twfm_theme';
const VZTIMER_KEY = 'twfm_vztimer';
const QPI_KEY     = 'qpi_settings';
const BLUR_KEY    = 'twfm_blur';
const NOTES_KEY   = 'twfm_notes';
const DEFAULTS    = { phrases: true, schedule: true, hints: true, timer: true, blur: true, notes: true };

// Build a readable label (e.g. "Alt+A") from a stored hotkey object
function hkLabel(hk, fallback = 'Alt+A') {
  if (!hk) return fallback;
  const parts = [];
  if (hk.ctrl)  parts.push('Ctrl');
  if (hk.alt)   parts.push('Alt');
  if (hk.shift) parts.push('Shift');
  const code = hk.code || 'KeyA';
  const key  = code.startsWith('Key')   ? code.slice(3)
             : code.startsWith('Digit') ? code.slice(5) : code;
  parts.push(key.toUpperCase());
  return parts.join('+');
}

const phrasesEl   = document.getElementById('pp-phrases');
const scheduleEl  = document.getElementById('pp-schedule');
const hintsEl     = document.getElementById('pp-hints');
const timerEl     = document.getElementById('pp-timer');
const blurEl      = document.getElementById('pp-blur');

const schedOp    = document.getElementById('pp-schedule-opacity');
const schedOpVal = document.getElementById('pp-schedule-opacity-val');
const schedSound = document.getElementById('pp-schedule-sound');
const timerSound = document.getElementById('pp-timer-sound');
const hintsOp    = document.getElementById('pp-hints-opacity');
const hintsOpVal = document.getElementById('pp-hints-opacity-val');
const hintsCnt   = document.getElementById('pp-hints-count');
const hintsCntVal= document.getElementById('pp-hints-count-val');
const hintsScopeEl = document.getElementById('pp-hints-scope');
const notesEl      = document.getElementById('pp-notes');
const notesStyleEl = document.getElementById('pp-notes-style');
const notesSideEl  = document.getElementById('pp-notes-side');

// Тем осталось две. Значения снятых тем не выбрасываем, а сопоставляем
// ближайшей по светлоте — иначе у тех, кто сидел на графите или кофе,
// интерфейс остался бы в теме, которую нечем переключить.
function normalizeTheme(theme) {
  if (theme === 'coffee') return 'white';
  return theme === 'white' ? 'white' : 'dark';
}

function applyTheme(theme) {
  const t = normalizeTheme(theme);
  document.body.dataset.theme = t;
  document.documentElement.dataset.theme = t;
  return t;
}

function saveHints() {
  chrome.storage.local.get([HINTS_KEY], r => {
    const h = Object.assign({}, r[HINTS_KEY] || {});
    h.opacity = parseInt(hintsOp.value) / 100;
    h.count   = parseInt(hintsCnt.value);
    h.size    = document.querySelector('#pp-hints-size .pp-seg-btn.pp-seg-active')?.dataset.size || 'M';
    h.scope   = hintsScopeEl.querySelector('.pp-seg-btn.pp-seg-active')?.dataset.scope || 'twork';
    chrome.storage.local.set({ [HINTS_KEY]: h });
  });
}

function saveNotes() {
  chrome.storage.local.get([NOTES_KEY], r => {
    const n = Object.assign({}, r[NOTES_KEY] || {});
    n.style = notesStyleEl.querySelector('.pp-seg-active')?.dataset.nstyle || 'glass';
    n.side  = notesSideEl.querySelector('.pp-seg-active')?.dataset.nside  || 'right';
    chrome.storage.local.set({ [NOTES_KEY]: n });
  });
}

function load() {
  chrome.storage.local.get([MODULES_KEY, WIDGET_KEY, HINTS_KEY, THEME_KEY, VZTIMER_KEY, QPI_KEY, BLUR_KEY, NOTES_KEY], r => {
    const m = Object.assign({}, DEFAULTS, r[MODULES_KEY] || {});
    phrasesEl.checked   = m.phrases   !== false;
    scheduleEl.checked  = m.schedule  !== false;
    hintsEl.checked     = m.hints     !== false;
    timerEl.checked     = m.timer     !== false;
    blurEl.checked      = m.blur      !== false;
    notesEl.checked     = m.notes     !== false;

    const sOp = Math.round((r[WIDGET_KEY]?.opacity ?? 0.75) * 100);
    schedOp.value = sOp;
    schedOpVal.textContent = sOp + '%';
    schedSound.checked = r[WIDGET_KEY]?.sound !== false;
    timerSound.checked = r[VZTIMER_KEY]?.sound !== false;

    const h = r[HINTS_KEY] || {};
    const hOp = Math.round((h.opacity ?? 0.85) * 100);
    hintsOp.value = hOp;
    hintsOpVal.textContent = hOp + '%';

    const cnt = h.count ?? 3;
    hintsCnt.value = cnt;
    hintsCntVal.textContent = cnt;

    const sz = h.size || 'M';
    document.querySelectorAll('#pp-hints-size .pp-seg-btn').forEach(btn => {
      btn.classList.toggle('pp-seg-active', btn.dataset.size === sz);
    });
    const scope = h.scope || 'twork';
    hintsScopeEl.querySelectorAll('.pp-seg-btn').forEach(btn => {
      btn.classList.toggle('pp-seg-active', btn.dataset.scope === scope);
    });

    const nset = r[NOTES_KEY] || {};
    const nstyle = nset.style || 'glass', nside = nset.side || 'right';
    notesStyleEl.querySelectorAll('.pp-seg-btn')
      .forEach(b => b.classList.toggle('pp-seg-active', b.dataset.nstyle === nstyle));
    notesSideEl.querySelectorAll('.pp-seg-btn')
      .forEach(b => b.classList.toggle('pp-seg-active', b.dataset.nside === nside));

    const theme = applyTheme(r[THEME_KEY]);
    if (r[THEME_KEY] !== theme) chrome.storage.local.set({ [THEME_KEY]: theme });

    if (!hkCapturingBtn) {
      phrasesHkBtn.textContent = hkLabel(r[QPI_KEY]?.hotkey, 'Alt+A');
      blurHkBtn.textContent    = hkLabel(r[BLUR_KEY]?.hotkey, 'Alt+B');
    }
  });
}

function saveModules() {
  chrome.storage.local.set({
    [MODULES_KEY]: {
      phrases: phrasesEl.checked, schedule: scheduleEl.checked, hints: hintsEl.checked,
      timer: timerEl.checked, blur: blurEl.checked, notes: notesEl.checked
    }
  });
}

phrasesEl.addEventListener('change', saveModules);
scheduleEl.addEventListener('change', saveModules);
hintsEl.addEventListener('change', saveModules);
timerEl.addEventListener('change', saveModules);
blurEl.addEventListener('change', saveModules);
notesEl.addEventListener('change', saveModules);

schedOp.addEventListener('input', () => {
  schedOpVal.textContent = schedOp.value + '%';
  chrome.storage.local.get([WIDGET_KEY], r => {
    const ws = Object.assign({}, r[WIDGET_KEY] || {});
    ws.opacity = parseInt(schedOp.value) / 100;
    chrome.storage.local.set({ [WIDGET_KEY]: ws });
  });
});

schedSound.addEventListener('change', () => {
  chrome.storage.local.get([WIDGET_KEY], r => {
    const ws = Object.assign({}, r[WIDGET_KEY] || {});
    ws.sound = schedSound.checked;
    chrome.storage.local.set({ [WIDGET_KEY]: ws });
  });
});

timerSound.addEventListener('change', () => {
  chrome.storage.local.set({ [VZTIMER_KEY]: { sound: timerSound.checked } });
});

hintsOp.addEventListener('input', () => {
  hintsOpVal.textContent = hintsOp.value + '%';
  saveHints();
});

hintsCnt.addEventListener('input', () => {
  hintsCntVal.textContent = hintsCnt.value;
  saveHints();
});

// Групп сегментов теперь две — размер и область показа. Снимаем выделение
// только внутри своей группы, иначе выбор в одной сбрасывал бы другую.
document.querySelectorAll('.pp-seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.closest('.pp-seg').querySelectorAll('.pp-seg-btn')
       .forEach(b => b.classList.remove('pp-seg-active'));
    btn.classList.add('pp-seg-active');
    if (btn.dataset.nstyle || btn.dataset.nside) saveNotes();
    else saveHints();
  });
});

document.getElementById('pp-open-schedule').addEventListener('click', () => {
  chrome.storage.local.set({ twfm_open_schedule: Date.now() });
  window.close();
});

document.getElementById('pp-open-checklist').addEventListener('click', () => {
  chrome.storage.local.set({ qpi_checklist_open: Date.now() });
  window.close();
});

// Переключатель темы в шапке
document.getElementById('pp-theme-toggle').addEventListener('click', () => {
  const next = document.body.dataset.theme === 'white' ? 'dark' : 'white';
  applyTheme(next);
  chrome.storage.local.set({ [THEME_KEY]: next });
});

// Hotkey capture — shared by the quick-phrases menu and the blur toggle.
// Only one button can be capturing at a time; hkCapturingBtn is that button.
let hkCapturingBtn = null;

function bindHotkeyCapture(btn, key, fallback) {
  btn.dataset.hkKey = key;
  btn.dataset.hkFallback = fallback;
  btn.addEventListener('click', () => {
    if (hkCapturingBtn && hkCapturingBtn !== btn) {
      hkCapturingBtn.classList.remove('pp-hk-capturing');
      load();                                     // restore the other button's label
    }
    hkCapturingBtn = btn;
    btn.classList.add('pp-hk-capturing');
    btn.textContent = '⌨ Нажмите…';
  });
}

const phrasesHkBtn = document.getElementById('pp-phrases-hk');
const blurHkBtn    = document.getElementById('pp-blur-hk');
bindHotkeyCapture(phrasesHkBtn, QPI_KEY,  'Alt+A');
bindHotkeyCapture(blurHkBtn,    BLUR_KEY, 'Alt+B');

document.addEventListener('keydown', e => {
  const btn = hkCapturingBtn;
  if (!btn) return;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;  // ignore lone modifiers
  e.preventDefault();
  e.stopPropagation();
  hkCapturingBtn = null;
  btn.classList.remove('pp-hk-capturing');

  const key = btn.dataset.hkKey, fallback = btn.dataset.hkFallback;
  if (e.key === 'Escape') {                                          // cancel — keep current
    chrome.storage.local.get([key], r => { btn.textContent = hkLabel(r[key]?.hotkey, fallback); });
    return;
  }
  const hk = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, code: e.code };
  chrome.storage.local.get([key], r => {
    chrome.storage.local.set({ [key]: Object.assign({}, r[key] || {}, { hotkey: hk }) });
    btn.textContent = hkLabel(hk, fallback);
  });
}, true);

// Toast notification
const TOAST_SUCCESS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#3cb96e" width="18" height="18"><path fill-rule="evenodd" d="M9 1.5H5.625c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5zm6.61 10.936a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 14.47a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clip-rule="evenodd"/><path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z"/></svg>`;
const TOAST_ERROR_SVG   = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#e05252" width="18" height="18"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd"/></svg>`;
let toastTimer = null;
function showToast(success) {
  const toast  = document.getElementById('pp-toast');
  const iconEl = document.getElementById('pp-toast-icon');
  const msgEl  = document.getElementById('pp-toast-msg');
  iconEl.innerHTML = success ? TOAST_SUCCESS_SVG : TOAST_ERROR_SVG;
  msgEl.textContent = success ? 'Загрузка успешно завершена' : 'Ошибка при загрузке';
  toast.classList.remove('pp-toast-hiding');
  toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('pp-toast-hiding');
    toast.addEventListener('animationend', () => { toast.hidden = true; }, { once: true });
  }, 2500);
}

// Config export / import
const ALL_KEYS = [MODULES_KEY, WIDGET_KEY, HINTS_KEY, THEME_KEY, VZTIMER_KEY, BLUR_KEY, NOTES_KEY,
                  'qpi_settings', 'qpi_checklist'];

const NOTES_FILE = 'notes';          // метка формата в файле заметок

function download(name, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

// Содержимое заметок и настройки разъехались по двум файлам намеренно:
// в заметках лежит рабочий текст по обращениям, и он не должен уезжать
// вместе с конфигом, которым делятся с коллегой.
function splitConfig(data) {
  const main  = Object.assign({}, data);
  const notes = Object.assign({}, data[NOTES_KEY] || {});
  const list  = Array.isArray(notes.notes) ? notes.notes : [];
  delete notes.notes;
  main[NOTES_KEY] = notes;                      // в основном файле — только оформление
  return { main, notes: { type: 't-helper-notes', version: 1, notes: list } };
}

document.getElementById('pp-export-config').addEventListener('click', () => {
  chrome.storage.local.get(ALL_KEYS, data => {
    const { main, notes } = splitConfig(data);
    download(`t-helper-${stamp()}.json`, main);
    if (notes.notes.length) download('t-helper-notes.json', notes);
  });
});

document.getElementById('pp-export-notes')?.addEventListener('click', () => {
  chrome.storage.local.get([NOTES_KEY], r => {
    const list = Array.isArray(r[NOTES_KEY]?.notes) ? r[NOTES_KEY].notes : [];
    download('t-helper-notes.json', { type: 't-helper-notes', version: 1, notes: list });
  });
});

document.getElementById('pp-import-config').addEventListener('click', () => {
  document.getElementById('pp-import-file').click();
});

document.getElementById('pp-import-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);

      // Файл заметок кладём внутрь twfm_notes, не трогая оформление:
      // иначе загрузка заметок сбрасывала бы сторону и стиль язычков.
      if (data && data.type === 't-helper-notes' && Array.isArray(data.notes)) {
        chrome.storage.local.get([NOTES_KEY], r => {
          const n = Object.assign({}, r[NOTES_KEY] || {}, { notes: data.notes });
          chrome.storage.local.set({ [NOTES_KEY]: n }, () => { load(); showToast(true); });
        });
        return;
      }

      delete data['twfm_schedule'];
      // Основной файл больше не содержит текста заметок, но в нём есть
      // их оформление. Сохранённый список подставляем обратно, иначе
      // загрузка конфига стирала бы заметки этого устройства.
      chrome.storage.local.get([NOTES_KEY], r => {
        if (data[NOTES_KEY] && !Array.isArray(data[NOTES_KEY].notes)) {
          data[NOTES_KEY].notes = r[NOTES_KEY]?.notes || [];
        }
        chrome.storage.local.set(data, () => {
          chrome.storage.local.set({ qpi_checklist_reload: Date.now() });
          load();
          showToast(true);
        });
      });
    } catch { showToast(false); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// Шестерёнка: поворот иконки + раскрытие панели по высоте.
// Высоту анимирует CSS (grid 0fr→1fr), поэтому здесь только класс —
// панель остаётся в потоке и её можно свернуть на любом кадре.
document.querySelectorAll('.pp-gear').forEach(btn => {
  btn.addEventListener('click', () => {
    const wrap = document.getElementById(btn.dataset.target + '-wrap');
    if (!wrap) return;
    const opening = !wrap.classList.contains('pp-open');
    wrap.classList.toggle('pp-open', opening);
    btn.classList.toggle('active', opening);
    btn.classList.remove('pp-spin');
    void btn.offsetWidth;                       // перезапуск анимации
    btn.classList.add('pp-spin');
    btn.addEventListener('animationend', () => btn.classList.remove('pp-spin'), { once: true });
  });
});

// Начальное чтение настроек. Без этого вызова попап открывается на
// значениях по умолчанию из разметки: тема всегда тёмная, переключатели
// и сегменты — не там, где их оставили.
load();
