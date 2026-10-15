// ════════════════════════════════════════════════════════════
//  T-Helper · Блюр чувствительных данных
//  По горячей клавише (по умолчанию Alt+B) скрывает ФИО, телефон
//  и номер обращения в карточке клиента. Состояние хранится в
//  storage, поэтому переживает переходы по SPA и синхронно
//  применяется во всех вкладках сразу.
//
//  Вся маскировка сделана на CSS через класс th-blur-on на <html>:
//  Angular постоянно пересоздаёт узлы карточки (ng-star-inserted),
//  и селекторный CSS подхватывает их сам, без наблюдателя.
// ════════════════════════════════════════════════════════════
(function () {
  if (window.__THBLUR_LOADED) return;
  window.__THBLUR_LOADED = true;

  const MODULES_KEY = 'twfm_modules';
  const BLUR_KEY    = 'twfm_blur';        // { on: bool, hotkey: {...} }
  const DEFAULT_HK  = { ctrl: false, alt: true, shift: false, code: 'KeyB' };
  const isTop = window === window.top;

  let enabled = true;
  let hotkey  = DEFAULT_HK;
  let on      = false;
  let noWarn  = false;                    // «Больше не показывать» в окне предупреждения

  function alive() { try { return !!chrome.runtime?.id; } catch (e) { return false; } }

  // ── Элементы без устойчивого селектора ──
  // Класс .t-content носят десятки компонентов Taiga UI, а .text внутри
  // кнопок — тем более общий, поэтому отбираем по шаблону содержимого.
  const ID_RE    = /^\d+-[A-Z0-9]{4,}$/;                 // номер обращения 0-ABCDE123
  const PHONE_RE = /^\+?\d[\d\s()-]{5,}\d$/;             // +70000000000, +7 900 000-00-00
  const MAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;      // mail@mail.ru
  // Номер счёта: «№ 5480205924», «№ 5000000000 • *422», «2100000000 Инвесткопилка».
  // Якорим по началу строки — хвост бывает разный, а «02:38» у таймера
  // не подходит под шаблон и остаётся видимым.
  const ACCT_RE  = /^№?\s*\d{6,}/;
  const isContact = t => PHONE_RE.test(t) || MAIL_RE.test(t);
  // Сам счёт закрыт селектором .account .copy-host, но у этого поля есть
  // всплывающая подсказка с тем же значением — её селектором не достать,
  // она рисуется отдельным узлом в другом месте дерева.
  const isHinted  = t => isContact(t) || ACCT_RE.test(t);

  // ── Shadow DOM ──
  // Часть интерфейса (заголовок чата) — отдельный микрофронтенд,
  // смонтированный в shadow root. CSS контент-скрипта из манифеста
  // теневую границу не пересекает, поэтому таблицу стилей приходится
  // отдавать каждому корню отдельно. Закрытые корни (mode: 'closed')
  // недоступны из скрипта — там маска работать не будет.
  function collectRoots(root, acc, depth) {
    if (depth > 8) return acc;                 // страховка от патологической вложенности
    let els;
    try { els = root.querySelectorAll('*'); } catch (e) { return acc; }
    for (const el of els) {
      const sr = el.shadowRoot;
      if (sr) { acc.push(sr); collectRoots(sr, acc, depth + 1); }
    }
    return acc;
  }

  // Берём тот же самый blur.css, а не копию правил в JS: иначе селекторы
  // разъехались бы при первой же правке. Внутри корня префикс
  // html.th-blur-on ничего не выбирает, поэтому снимаем его, а блок с
  // переменной переносим на :host.
  let sheetPromise = null;
  function getSheet() {
    if (sheetPromise) return sheetPromise;
    sheetPromise = (async () => {
      if (!alive() || typeof CSSStyleSheet !== 'function') return null;
      try {
        const txt = await (await fetch(chrome.runtime.getURL('src/styles/blur.css'))).text();
        const scoped = txt
          .replace(/html\.th-blur-on\s*\{/g, ':host {')
          .replace(/html\.th-blur-on\s+/g, '');
        const s = new CSSStyleSheet();
        s.replaceSync(scoped);
        return s;
      } catch (e) { return null; }
    })();
    return sheetPromise;
  }

  async function syncShadowRoots(roots) {
    const s = await getSheet();
    if (!s) return;
    const want = enabled && on;
    for (const r of roots || collectRoots(document, [], 0)) {
      let list;
      try { list = r.adoptedStyleSheets; } catch (e) { continue; }
      const has = list.includes(s);
      if (want && !has)       r.adoptedStyleSheets = [...list, s];
      else if (!want && has)  r.adoptedStyleSheets = list.filter(x => x !== s);
    }
  }

  function tagIds(roots) {
    for (const scope of [document, ...(roots || [])]) {
      try {
        scope.querySelectorAll('span.t-content').forEach(el => {
          el.classList.toggle('th-blur-id', ID_RE.test((el.textContent || '').trim()));
        });
        // Телефон и почта в кнопках Taiga: .t-content > span.text.
        // Маскируем только текст, иконку копирования не трогаем.
        // tui-hint — всплывающая подсказка такой кнопки: без неё значение
        // читалось бы целиком при наведении мышью.
        scope.querySelectorAll('span.t-content span.text, tui-hint').forEach(el => {
          el.classList.toggle('th-blur-contact', isHinted((el.textContent || '').trim()));
        });
      } catch (e) { continue; }
    }
  }

  function rescan() {
    const roots = collectRoots(document, [], 0);
    tagIds(roots);
    syncShadowRoots(roots);
  }

  let debounce = null;
  function scheduleTag() {
    // Обход всех узлов ради поиска теневых корней недёшев, а пока блюр
    // выключен, он ничего не меняет: класса на <html> нет, таблицы в
    // корнях не лежат. В покое модуль не стоит ничего.
    if (!(enabled && on) || debounce) return;
    debounce = setTimeout(() => { debounce = null; rescan(); }, 200);
  }

  function apply() {
    document.documentElement.classList.toggle('th-blur-on', enabled && on);
    rescan();                                   // и включение, и выключение
  }

  // ── Всплывашка о смене режима (только в верхнем фрейме) ──
  const EYE  = 'M1.6 12C4.8 7.2 8.2 4.9 12 4.9S19.2 7.2 22.4 12c-3.2 4.8-6.6 7.1-10.4 7.1S4.8 16.8 1.6 12Z';
  const BLUE = '#5b9dff';
  // Зачёркнутый глаз: сама черта вырезана из фигуры маской, поэтому под ней
  // просвечивает фон всплывашки — как в исходных иконках.
  const IC_ON = `<svg viewBox="0 0 24 24" width="15" height="15">
    <mask id="th-blur-eye-cut">
      <rect width="24" height="24" fill="#fff"/>
      <path d="M3.1 2.4 21.6 20.9" stroke="#000" stroke-width="4" stroke-linecap="round"/>
    </mask>
    <path d="${EYE}M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z"
          fill="${BLUE}" fill-rule="evenodd" mask="url(#th-blur-eye-cut)"/>
    <path d="M3.8 3.1 20.9 20.2" stroke="${BLUE}" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`;
  const IC_OFF = `<svg viewBox="0 0 24 24" width="15" height="15">
    <path d="${EYE}M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z"
          fill="${BLUE}" fill-rule="evenodd"/>
  </svg>`;

  let toastEl = null, toastTimer = null;
  function toast(state) {
    if (!isTop || !document.body) return;
    if (toastEl) { toastEl.remove(); toastEl = null; }
    clearTimeout(toastTimer);

    toastEl = document.createElement('div');
    toastEl.id = 'th-blur-toast';
    toastEl.innerHTML = `${state ? IC_ON : IC_OFF}<span>${state ? 'Данные скрыты' : 'Данные раскрыты'}</span>`;
    // Таймер ВЗ стоит там же, сверху по центру, — не накрываем его
    if (document.getElementById('vzt-widget')) toastEl.classList.add('th-blur-below-timer');
    document.body.appendChild(toastEl);

    const el = toastEl;
    toastTimer = setTimeout(() => {
      el.classList.add('th-blur-hiding');
      el.addEventListener('animationend', () => {
        el.remove();
        if (toastEl === el) toastEl = null;
      }, { once: true });
    }, 1600);
  }

  // ── Окно с предупреждением об ответственности ──
  const WARN_ICON = `<svg viewBox="0 0 24 24" width="46" height="46" fill="#ff9f43" fill-rule="evenodd">
    <path d="M10.28 3.13a2 2 0 0 1 3.44 0l8.2 14.12a2 2 0 0 1-1.72 3H3.8a2 2 0 0 1-1.72-3l8.2-14.12ZM12 8.05a1.15 1.15 0 0 0-1.15 1.15v4.2a1.15 1.15 0 0 0 2.3 0v-4.2A1.15 1.15 0 0 0 12 8.05Zm0 7.55a1.35 1.35 0 1 0 0 2.7 1.35 1.35 0 0 0 0-2.7Z"/>
  </svg>`;
  const WARN_TEXT = [
    'Важно. Данное расширение не освобождает от ответственности за распространение конфиденциальной/чувствительной информации.',
    'Если собираешься сделать скриншот или включить демонстрацию кому-то - убедись, что на экране отсутствует информация, которая не должна быть показана.',
    'Расширение не гарантирует полный блюр всей конфиденциальной/чувствительной информации. Самостоятельно перепроверь СИ, текст процедур, наличие каких-то особых элементов интерфейса и т. п. на наличие информации, которая не должна попадать в чужие руки.',
    'Помни - всю ответственность за свои действия несёшь именно ты.'
  ];

  let modalEl = null, modalEsc = null;

  function closeWarning() {
    if (!modalEl) return;
    modalEl.remove();
    modalEl = null;
    if (modalEsc) { document.removeEventListener('keydown', modalEsc, true); modalEsc = null; }
  }

  function showWarning() {
    if (modalEl || !document.body) return;

    modalEl = document.createElement('div');
    modalEl.id = 'th-blur-modal';
    modalEl.innerHTML = `
      <div id="th-blur-modal-card" role="alertdialog" aria-labelledby="th-blur-modal-title">
        <div id="th-blur-modal-icon">${WARN_ICON}</div>
        <div id="th-blur-modal-title">Внимание!</div>
        <div id="th-blur-modal-text">${WARN_TEXT.map(t => `<p>${t}</p>`).join('')}</div>
        <button id="th-blur-modal-ok" type="button">Хорошо, я понял</button>
        <label id="th-blur-modal-never">
          <input type="checkbox" id="th-blur-modal-never-cb">
          <span>Больше не показывать</span>
        </label>
      </div>`;
    document.body.appendChild(modalEl);

    // Галочку сохраняем сразу, а не по кнопке: окно можно закрыть и через Esc,
    // и выбор пользователя не должен от этого зависеть.
    modalEl.querySelector('#th-blur-modal-never-cb').addEventListener('change', e => {
      const val = e.target.checked;
      noWarn = val;
      if (!alive()) return;
      chrome.storage.local.get([BLUR_KEY], r => {
        chrome.storage.local.set({ [BLUR_KEY]: Object.assign({}, r[BLUR_KEY] || {}, { noWarn: val }) });
      });
    });

    modalEl.querySelector('#th-blur-modal-ok').addEventListener('click', closeWarning);
    modalEsc = e => { if (e.key === 'Escape') { e.stopPropagation(); closeWarning(); } };
    document.addEventListener('keydown', modalEsc, true);
    modalEl.querySelector('#th-blur-modal-ok').focus();
  }

  // ── Переключение: пишем в storage, применяют все фреймы и вкладки ──
  // Окно предупреждения показываем только во вкладке, где нажали бинд:
  // storage слышат все вкладки, и иначе в фоновых остались бы висеть
  // копии окна, которые пришлось бы закрывать по одной.
  let initiatedHere = false;

  function toggle() {
    if (!enabled || !alive()) return;
    chrome.storage.local.get([BLUR_KEY], r => {
      const c = Object.assign({}, r[BLUR_KEY] || {});
      c.on = !c.on;
      initiatedHere = c.on && isTop && !c.noWarn;
      chrome.storage.local.set({ [BLUR_KEY]: c });
    });
  }

  // Слушаем в фазе перехвата, чтобы страница не перехватила клавишу раньше.
  // Намеренно работает и в полях ввода: скрыть данные нужно уметь мгновенно,
  // не отрываясь от набора сообщения.
  document.addEventListener('keydown', e => {
    if (!enabled) return;
    if (e.code !== hotkey.code) return;
    if (!!hotkey.alt !== e.altKey || !!hotkey.ctrl !== e.ctrlKey || !!hotkey.shift !== e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    toggle();
  }, true);

  if (!alive()) return;

  chrome.storage.local.get([MODULES_KEY, BLUR_KEY], r => {
    enabled = r[MODULES_KEY]?.blur !== false;
    const c = r[BLUR_KEY] || {};
    on     = !!c.on;
    noWarn = !!c.noWarn;
    hotkey = c.hotkey || DEFAULT_HK;
    apply();
    rescan();
  });

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch[MODULES_KEY]) enabled = ch[MODULES_KEY].newValue?.blur !== false;
    if (ch[BLUR_KEY]) {
      const v = ch[BLUR_KEY].newValue || {};
      const was = on;
      on     = !!v.on;
      noWarn = !!v.noWarn;
      hotkey = v.hotkey || DEFAULT_HK;
      if (was !== on && enabled) {
        // Предупреждение само по себе сообщает о смене режима,
        // поэтому всплывашку в этот момент не дублируем.
        if (initiatedHere) showWarning();
        else toast(on);
      }
      initiatedHere = false;
      if (!on) closeWarning();
    }
    apply();
  });

  // Карточка клиента перерисовывается при каждом переключении чата —
  // перевешиваем метку на номере обращения.
  new MutationObserver(scheduleTag).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true
  });
})();
