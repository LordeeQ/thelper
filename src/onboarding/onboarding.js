// Знакомство: карусель с живыми макетами модулей.

const THEME_KEY = 'twfm_theme';
const QPI_KEY   = 'qpi_settings';
const BLUR_KEY  = 'twfm_blur';

// ── Тема ─────────────────────────────────────────────────────
// Тем ровно две. Снятые раньше значения приводим к ближайшей по
// светлоте — так же, как это делает попап, иначе знакомство и
// расширение открылись бы в разных темах.
function normalizeTheme(theme) {
  if (theme === 'coffee') return 'white';
  return theme === 'white' ? 'white' : 'dark';
}
function applyTheme(theme) {
  const t = normalizeTheme(theme);
  document.documentElement.dataset.theme = t;
  return t;
}
applyTheme('dark');
try {
  chrome.storage.local.get([THEME_KEY], r => applyTheme(r && r[THEME_KEY]));
} catch (e) { /* остаёмся на тёмной */ }

document.getElementById('ob-theme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'white' ? 'dark' : 'white';
  applyTheme(next);
  try { chrome.storage.local.set({ [THEME_KEY]: next }); } catch (e) {}
});

// ── Настоящие горячие клавиши в карточки ─────────────────────
function hotkeyLabel(hk, fallback) {
  if (!hk) return fallback;
  const parts = [];
  if (hk.ctrl)  parts.push('Ctrl');
  if (hk.alt)   parts.push('Alt');
  if (hk.shift) parts.push('Shift');
  const code = hk.code || '';
  const key = code.startsWith('Key')   ? code.slice(3)
            : code.startsWith('Digit') ? code.slice(5)
            : code;
  parts.push(key.toUpperCase());
  return parts.join(' + ');
}
function fillHotkey(selector, storageKey, fallback) {
  try {
    chrome.storage.local.get([storageKey], r => {
      const label = hotkeyLabel(r && r[storageKey] && r[storageKey].hotkey, fallback);
      document.querySelectorAll(selector).forEach(el => { el.textContent = label; });
    });
  } catch (e) { /* в разметке уже стоит значение по умолчанию */ }
}
fillHotkey('.js-hotkey',      QPI_KEY,  'Alt + A');
fillHotkey('.js-hotkey-blur', BLUR_KEY, 'Alt + B');

// ── Карусель ─────────────────────────────────────────────────
const track    = document.getElementById('ob-track');
const slides   = Array.from(track.children);
const prevBtn  = document.getElementById('ob-prev');
const nextBtn  = document.getElementById('ob-next');
const startBtn = document.getElementById('ob-start');
const dotsWrap = document.getElementById('ob-dots');
const last  = slides.length - 1;
let index = 0;

// Номер шага проставляем из кода: раньше «Шаг N из 6» был вписан в
// разметку руками и разъезжался с числом карточек при каждой правке.
slides.forEach((slide, i) => {
  const step = slide.querySelector('.ob-step');
  if (step) step.textContent = `Шаг ${i + 1} из ${slides.length}`;

  const dot = document.createElement('button');
  dot.type = 'button';
  dot.className = 'ob-dot';
  dot.setAttribute('role', 'tab');
  // Точки — не только индикатор: по ним можно перейти к нужному
  // модулю, не пролистывая всё подряд.
  const name = slide.dataset.name || `Шаг ${i + 1}`;
  dot.title = name;
  dot.setAttribute('aria-label', name);
  dot.addEventListener('click', () => go(i));
  dotsWrap.appendChild(dot);
});
const dots = Array.from(dotsWrap.children);

function go(i) {
  index = Math.max(0, Math.min(last, i));
  track.style.transform = `translateX(-${index * 100}%)`;
  slides.forEach((s, n) => s.classList.toggle('active', n === index));
  dots.forEach((d, n) => {
    d.classList.toggle('on', n === index);
    d.setAttribute('aria-selected', n === index ? 'true' : 'false');
  });
  prevBtn.disabled = index === 0;
  const atEnd = index === last;
  nextBtn.hidden = atEnd;
  startBtn.hidden = !atEnd;
}

prevBtn.addEventListener('click', () => go(index - 1));
nextBtn.addEventListener('click', () => go(index + 1));
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') go(index + 1);
  else if (e.key === 'ArrowLeft') go(index - 1);
  else if (e.key === 'Escape') closeTab();
});

// ── Закрытие ─────────────────────────────────────────────────
function closeTab() {
  try {
    chrome.tabs.getCurrent(tab => {
      if (tab && tab.id != null) chrome.tabs.remove(tab.id);
      else window.close();
    });
  } catch (e) { window.close(); }
}
document.getElementById('ob-skip').addEventListener('click', closeTab);

// «Начать работу» → прощание и отсчёт, затем вкладка закрывается
startBtn.addEventListener('click', () => {
  const nav = document.querySelector('.ob-nav');
  nav.innerHTML =
    '<div class="ob-bye">' +
      '<span class="ob-bye-title">Удачной смены!</span>' +
      '<span class="ob-bye-timer">Вкладка закроется через <b id="ob-cd">3</b> с</span>' +
    '</div>';
  let n = 3;
  const iv = setInterval(() => {
    n -= 1;
    if (n <= 0) { clearInterval(iv); closeTab(); return; }
    const el = document.getElementById('ob-cd');
    if (el) el.textContent = String(n);
  }, 1000);
});

go(0);
