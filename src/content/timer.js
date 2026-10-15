// ════════════════════════════════════════════════════════════
//  T-Helper · Таймер для ВЗ (видеозвонков)
//  Плавающее матовое окошко на https://homeagents.ru/videocalls/user
//  Идёт, пока на странице висит статус ожидания клиента, и
//  замирает, как только статус пропадает.
// ════════════════════════════════════════════════════════════
(function () {
  if (window.__VZTIMER_LOADED) return;
  window.__VZTIMER_LOADED = true;

  const MODULES_KEY = 'twfm_modules';
  const CFG_KEY     = 'twfm_vztimer';   // { sound: true }
  const ALERT_SEC   = 90;               // 1:30 — порог звукового сигнала

  function alive() { try { return !!chrome.runtime?.id; } catch (e) { return false; } }
  // Резолвим URL заранее, пока контекст жив (после перезагрузки расширения getURL бросает)
  const ALERT_URL = (() => { try { return chrome.runtime.getURL('sounds/vz-alert.mp3'); } catch (e) { return ''; } })();

  function onPage() {
    return /(^|\.)homeagents\.ru$/.test(location.hostname) &&
           /\/videocalls\/user/.test(location.pathname);
  }

  // Статус «Подожди, пока клиент подключится». Хеш в имени класса
  // (status_text__m5Nz8) меняется при пересборке фронта, поэтому ищем по
  // устойчивому префиксу класса и подтверждаем текстом.
  function isWaiting() {
    const nodes = document.querySelectorAll('[class*="status_text"]');
    for (const n of nodes) {
      if (/клиент\S*\s+подключ/i.test(n.textContent || '')) return true;
    }
    return false;
  }

  const IC = {
    play:  `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" style="display:block"><path d="M8 5v14l11-7z"/></svg>`,
    stop:  `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="display:block"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>`,
    reset: `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" style="display:block"><path d="M12 5V2L7 6l5 4V7a5 5 0 11-5 5H5a7 7 0 107-7z"/></svg>`,
  };

  let enabled = true, soundOn = true;
  let widget = null, timeEl = null, toggleBtn = null;
  let running = false, startAt = 0, elapsedMs = 0, tick = null;
  let alerted = false, alertAudio = null;

  const curSec = () => Math.floor(elapsedMs / 1000);
  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  // 0:00–1:00 зелёный, 1:00–1:30 оранжевый, свыше 1:30 красный
  const cls = s => s < 60 ? 'vzt-green' : (s <= ALERT_SEC ? 'vzt-orange' : 'vzt-red');

  function playAlert() {
    if (!soundOn || !ALERT_URL) return;
    try {
      if (!alertAudio) alertAudio = new Audio(ALERT_URL);
      alertAudio.currentTime = 0;
      alertAudio.play().catch(() => {});
    } catch (e) {}
  }

  function paint() {
    if (!timeEl) return;
    const s = curSec();
    timeEl.textContent = fmt(s);
    timeEl.className = 'vzt-time ' + cls(s);
    // один сигнал на пересечении порога
    if (s > ALERT_SEC && !alerted) { alerted = true; playAlert(); }
  }

  // единственная кнопка переключает пуск / паузу
  function syncToggle() {
    if (!toggleBtn) return;
    toggleBtn.innerHTML = running ? IC.stop : IC.play;
    toggleBtn.title = running ? 'Остановить' : 'Запуск';
    toggleBtn.classList.toggle('vzt-on', running);
  }

  function start() {
    if (running) return;
    running = true;
    startAt = Date.now() - elapsedMs;
    if (tick) clearInterval(tick);
    tick = setInterval(() => { elapsedMs = Date.now() - startAt; paint(); }, 250);
    syncToggle();
  }
  function stop() {
    if (!running) return;
    running = false;
    if (tick) { clearInterval(tick); tick = null; }
    elapsedMs = Date.now() - startAt;
    paint();
    syncToggle();
  }
  function reset() {
    running = false;
    if (tick) { clearInterval(tick); tick = null; }
    elapsedMs = 0; startAt = 0;
    alerted = false;
    paint();
    syncToggle();
  }

  function mount() {
    if (widget) return;
    widget = document.createElement('div');
    widget.id = 'vzt-widget';
    widget.innerHTML = `
      <span class="vzt-label">Таймер</span>
      <span class="vzt-time vzt-green">0:00</span>
      <div class="vzt-btns">
        <button class="vzt-btn vzt-toggle" title="Запуск">${IC.play}</button>
        <button class="vzt-btn vzt-reset" title="Сбросить">${IC.reset}</button>
      </div>`;
    document.body.appendChild(widget);
    timeEl = widget.querySelector('.vzt-time');
    toggleBtn = widget.querySelector('.vzt-toggle');
    toggleBtn.addEventListener('click', () => { running ? stop() : start(); });
    widget.querySelector('.vzt-reset').addEventListener('click', reset);
    paint();
    syncToggle();
  }
  function unmount() {
    reset();
    if (widget) { widget.remove(); widget = null; timeEl = null; toggleBtn = null; }
  }

  function apply() {
    if (enabled && onPage()) mount();
    else unmount();
  }

  // ── авто-управление по статусу ожидания ───────────────────
  // Реагируем на переходы: появился статус → пошёл отсчёт,
  // пропал → замер. Между переходами кнопки работают вручную.
  let wasWaiting = false, goneSince = 0;
  const NEW_WAIT_GAP = 2000;   // статус пропал дольше 2 с → это новое ожидание

  function watchStatus() {
    if (!widget) { wasWaiting = false; return; }
    const now = isWaiting();
    if (now && !wasWaiting) {
      // перерисовка страницы могла кратко убрать элемент — тогда просто продолжаем
      if (!goneSince || Date.now() - goneSince > NEW_WAIT_GAP) reset();
      start();
    } else if (!now && wasWaiting) {
      stop();
      goneSince = Date.now();
    }
    wasWaiting = now;
  }
  setInterval(watchStatus, 500);

  // ── module on/off + настройки ─────────────────────────────
  if (alive()) {
    try {
      chrome.storage.local.get([MODULES_KEY, CFG_KEY], r => {
        enabled = r[MODULES_KEY]?.timer !== false;
        soundOn = r[CFG_KEY]?.sound !== false;
        apply();
      });
      chrome.storage.onChanged.addListener((c, area) => {
        if (area !== 'local') return;
        if (c[MODULES_KEY]) {
          enabled = c[MODULES_KEY].newValue?.timer !== false;
          apply();
        }
        if (c[CFG_KEY]) soundOn = c[CFG_KEY].newValue?.sound !== false;
      });
    } catch (e) {}
  }

  // homeagents is an SPA — re-check the path on soft navigation
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) { lastHref = location.href; apply(); }
  }, 1000);
})();
