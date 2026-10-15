// ════════════════════════════════════════════════════════════
//  T-Helper · Уведомление «расширение обновлено»
//  Когда расширение перезагружают или обновляют, уже открытые
//  вкладки остаются с «осиротевшим» скриптом: вставка и виджеты
//  в них больше не работают до перезагрузки страницы. Ловим это
//  и показываем всплывашку сверху.
// ════════════════════════════════════════════════════════════
(function () {
  if (window !== window.top) return;          // только верхний фрейм
  if (window.__THUPD_LOADED) return;
  window.__THUPD_LOADED = true;

  // Резолвим звук заранее: после инвалидации контекста getURL уже бросает.
  const SOUND_URL = (() => {
    try { return chrome.runtime.getURL('sounds/update-notice.mp3'); } catch (e) { return ''; }
  })();

  // Облако с восклицательным знаком (знак «вырезан» через evenodd).
  const ICON = `<svg viewBox="0 0 24 24" width="19" height="19" fill="#ff9f43" style="display:block">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M12 3.2c-3.5 0-6.5 2.3-7.5 5.6A5.4 5.4 0 0 0 6.5 19.4h11.3a5 5 0 0 0 1.7-9.7C18.6 5.9 15.6 3.2 12 3.2Zm0 4.1a1.2 1.2 0 0 1 1.2 1.2v3.6a1.2 1.2 0 0 1-2.4 0V8.5A1.2 1.2 0 0 1 12 7.3Zm0 7.3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"/>
  </svg>`;

  function contextAlive() {
    try { return !!chrome.runtime?.id; } catch (e) { return false; }
  }

  let shown = false;
  let played = false;

  function playOnce() {
    if (played || !SOUND_URL) return;
    played = true;
    try { new Audio(SOUND_URL).play().catch(() => {}); } catch (e) {}
  }

  function show() {
    if (shown) return;
    shown = true;

    const el = document.createElement('div');
    el.id = 'th-upd-toast';
    el.innerHTML = `<span id="th-upd-icon">${ICON}</span>
      <span id="th-upd-msg">Расширение обновлено — обновите страницу</span>`;
    document.body.appendChild(el);

    // Звук — только во вкладке, которую пользователь сейчас видит.
    // Скрипт осиротел в КАЖДОЙ открытой вкладке, и каждая пыталась играть;
    // фоновые вкладки к тому же откладывают воспроизведение до показа —
    // отсюда и звук на каждом переключении, и запоздание.
    if (document.visibilityState === 'visible') playOnce();

    const hide = () => {
      el.classList.add('th-upd-hiding');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    };

    el.addEventListener('click', hide);
    setTimeout(hide, 10000);               // сообщение требует действия — держим дольше обычного тоста
  }

  const poll = setInterval(() => {
    if (!contextAlive()) { clearInterval(poll); show(); }
  }, 2000);

  // Вкладка была скрыта в момент обновления: уведомление уже висит молча,
  // а звук уместен ровно один раз — когда его действительно услышат.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!contextAlive()) { clearInterval(poll); show(); }
  });
})();
