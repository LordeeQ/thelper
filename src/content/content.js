(function () {
if (window.__QPI_LOADED) return;
window.__QPI_LOADED = true;

// Pure hint logic — inlined here so the content script is self-contained and can
// never die on a missing/late core file. Keep in sync with src/core/hints-core.js
// (that copy is what the unit tests import).
function prefixOverlapLen(before, phrase) {
  const pl = (phrase || '').toLowerCase();
  const bl = (before || '').toLowerCase();
  for (let s = 0; s < bl.length; s++) {
    if (s > 0 && !/\s/.test(bl[s - 1])) continue;
    const tail = bl.slice(s);
    if (tail.length >= 2 && pl.startsWith(tail)) return tail.length;
  }
  return 0;
}
function phraseReplaceStart(before, phrase) {
  const ov = prefixOverlapLen(before, phrase);
  if (ov >= 2) return before.length - ov;
  const m = before.match(/\S+$/);
  return m ? before.length - m[0].length : before.length;
}
function scorePhrase(phrase, before) {
  const pl = phrase.toLowerCase().trimStart();
  const b  = (before || '');
  const ov = prefixOverlapLen(b, phrase);
  if (ov >= 2) {
    if (ov >= pl.length) return 0;
    return 200 + Math.min(80, ov);
  }
  const m = b.toLowerCase().match(/\S+$/);
  const ql = m ? m[0] : '';
  if (ql.length < 2) return 0;
  if (pl.startsWith(ql)) return 150 + Math.min(20, ql.length);
  if (pl.includes(ql))  return 100 + Math.min(20, ql.length);
  return 0;
}

// ============================================================
// ВСТРОЕННЫЕ ФРАЗЫ
// ============================================================
const BUILT_IN_PHRASES = [
  {
    category: "🏠 База", color: "#FFD600",
    items: [
      "Простите за долгое ожидание ответа. Сейчас нам поступает большое количество обращений. Постараюсь быстрее вам помочь.",
      "Дальнейшее решение вопроса возможно только по телефону. Я вам позвоню.",
      "Не получили от вас ответа. В целях безопасности временно заблокировали карту, личный кабинет и приложение.",
      "Чтобы мы могли вам помочь, пожалуйста, напишите:\n— ваши ФИО полностью;\n— дату рождения;\n— телефон, который указывали при оформлении продуктов банка.",
      "К сожалению, не смогли дозвониться до вас.\nПозвоните нам в любое время, когда будет удобно.\n\nЕсли находитесь в России, позвоните по номеру 8 800 555-10-10.\nЗвонок бесплатный.\n\nЕсли находитесь за границей, наберите номер +7 495 648-11-11.\nПлата по тарифу оператора.",
      "Вы можете связаться с нами бесплатно через приложение банка:\n«Еще» → «Дополнительно» → «Связаться с банком» → «Позвонить в банк».",
      "Подскажите, пожалуйста, какой у вас вопрос?",
      "Подскажите, пожалуйста, вы финансово пострадали?",
      "Напишите, пожалуйста, дату, время и сумму операции.",
      "Подскажите, пожалуйста, отмена операции связана с мошенничеством или ошибкой в реквизитах?",
      "На всякий случай, в целях безопасности, отвязали все устройства и сбросили пароль от приложения и личного кабинета банка. Нужно будет заново войти в личный кабинет и придумать новый пароль.",
      "Карту можете перевыпустить и назначить доставку в приложении банка, бесплатно.",
      "До получения новой карты вы также сможете пользоваться переводами и оплатами по qr-коду в мобильном приложении и личном кабинете.",
      "Для решения вашего вопроса я соединю вас со специалистом из профильного отдела. Ожидайте пожалуйста.",
      "Мы передали ваш вопрос коллегам, они свяжутся с вами в течение 3-х часов, иногда сроки могут быть увеличены до 1 дня. Пожалуйста, ожидайте."
    ]
  },
  {
    category: "🔔 Подписки", color: "#ff9f43",
    items: [
      "К сожалению, мы не можем отключить подписку. Данный сервис не является частью Т-банка. Для отключения подписки мы рекомендуем обратиться в поддержку сервиса, где подписка была подключена. Если вы не сможете отключить подписку, чтобы предотвратить новые списания, необходимо заблокировать карту.",
      "Нам очень жаль, что вы столкнулись с такой ситуацией. Отдельно отключить такие покупки не получится. Запрос кода подтверждения зависит не от нас, а от настроек интернет магазина.",
      "Я понимаю ваши эмоции из-за данного списания, давайте вместе сейчас разберемся, почему оно произошло и, что нужно делать, чтобы оно не повторилось."
    ]
  },
  {
    category: "🔍 Расследования ФМ", color: "#ee5a24",
    items: [
      "Жаль, что вы приняли такое решение. Автоматические системы мониторинга были введены банками в целях безопасности клиентов. Нам очень важно убедиться, что в отношении вас не совершается мошеннических действий. К сожалению, проверка может занимать время. Коллеги обязательно вас проинформируют по окончанию проверки. Простите за предоставленные неудобства. Пожалуйста ожидайте и будьте на связи.",
      "Понимаю вас, что вы хотели бы пользоваться картой как можно скорее. Простите, что решение вопроса заняло больше времени. Безопасность наших клиентов для нас на первом месте. Пожалуйста, ожидайте результата проверки. Коллеги вас обязательно проинформируют.",
      "Согласны с вами, что важно соблюдать договоренности, нас бы тоже это расстроило. К сожалению, нам потребовалось дополнительное время. Простите, что не уложились в сроки, попросили коллег рассмотреть ваш вопрос в приоритете.",
      "Коллеги занимаются вашим вопросом и делают всё возможное для разрешения данной ситуации. Ваше обращение находится в максимальном приоритете. Пожалуйста ожидайте.",
      "Банк действует на основании Условий Комплексного Банковского Обслуживания (УКБО). Ограничения установлены согласно п. 7.3.5. УКБО."
    ]
  },
  {
    category: "💬 Софт", color: "#6c5ce7",
    items: [
      "Я вам очень сочувствую и сделаю все возможное, чтобы решить ваш вопрос.",
      "Ситуация неприятная. Не переживайте, я с вами и хочу помочь. Дайте мне немного времени, чтобы разобраться.",
      "Согласны, крайне важно получать ответ на вопросы быстро, простите коллег за сроки, сейчас передам им, чтобы они постарались разобраться, как можно быстрее. Ожидайте, пожалуйста.",
      "Простите за предоставленные неудобства.",
      "Согласны с вами, вопрос важный и его нужно решить как можно скорее, именно поэтому мы...",
      "Поиск решения обычно занимает время. Нам нужно проверить информацию и все детали вашего обращения. Так мы сможем разобраться в ситуации и дать полноценный ответ.",
      "Постараемся помочь без задержек и обязательно свяжемся с вами.",
      "Простите, что не уложились в сроки. Попросили коллег ускориться. Мы решим вопрос в приоритете и сразу с вами свяжемся.",
      "Ни в коем случае не хотели показаться не заинтересованными в вашем вопросе. Мы стараемся подходить к каждому случаю ответственно и разбирать его детально.",
      "Ознакомились с историей переписки и вашим обращением, понимаем, насколько вопрос для вас важен.",
      "Конечно, это не то качество сервиса, к которому мы стремимся, и я полностью понимаю вас. Сейчас обязательно постараюсь помочь.",
      "Понимаю вас, действительно ситуация неприятная. Сейчас я все проверю и постараюсь вам помочь. Ожидайте пожалуйста.",
      "Я вас очень понимаю: меня бы эта проблема тоже сильно разозлила. Я хочу помочь вам решить её. Мне не все равно и мне очень жаль, что такое произошло.",
      "Мне жаль, что у вас сложилось такое впечатление о нашем банке. Понимаю, что ситуация с вашими финансами требует внимания и передали обращение."
    ]
  },
  {
    category: "🤔 Странные вопросы", color: "#a29bfe",
    items: [
      "К сожалению, я не смогу вам помочь в этой ситуации. Уверены, что ответ на свой вопрос вы найдете в интернете.",
      "К сожалению, я не смогу вас проконсультировать. Для решения данного вопроса рекомендуем обратиться в полицию, к юристам или поискать информацию в интернете."
    ]
  },
  {
    category: "⚠️ Инцидент", color: "#fd79a8",
    items: [
      "Извините, сейчас могу ответить только на общие вопросы. Пожалуйста, обратитесь примерно через час — постараемся исправить ситуацию.",
      "К сожалению, техническим специалистам понадобится немного больше времени. Простите за предоставленные неудобства."
    ]
  },
  {
    category: "👤 Сотрудник виновен", color: "#e17055",
    items: [
      "Ознакомились с консультацией ранее и видим, что действительно была допущена ошибка со стороны коллеги. Уверяем вас, что без внимания это не останется.",
      "Простите за некорректную консультацию. Сообщим об этом коллегам, они проверят его работу. Спасибо, что поделились!"
    ]
  },
  {
    category: "📋 Особые скрипты", color: "#00b894",
    items: [
      "Для рассмотрения обращения по возврату отправьте нам письмо по почте России. В письме нужно будет подробно описать причины оспаривания, указать операции и приложить подтверждающие документы.\n\nАдрес: 127287, г. Москва, ул. Хуторская - 2я, д.38А, стр. 26.",
      "Если вы желаете подать официальную досудебную претензию, вам необходимо направить ее в письменном виде в Банк — на электронную почту, бумажным письмом или подать в офисе: ул. Хуторская 2-я, д. 38А, стр. 26, Москва, 127287 Россия и zapros_info@tbank.ru",
      "В чате мы можем зафиксировать с Вами жалобу."
    ]
  },
  {
    category: "🙏 Спасибо", color: "#55efc4",
    items: [
      "Спасибо, приятно слышать такие слова.",
      "Спасибо, такие слова вдохновляют работать еще лучше.",
      "Очень рады, что удалось вам помочь.",
      "Спасибо, мне тоже было приятно с вами общаться.",
      "Спасибо. Мы всегда готовы вам помочь!",
      "Хорошего вам дня/вечера."
    ]
  }
];
// ============================================================

// ── Shared: detect smart-search / procedure-search so we NEVER insert there ──
// Walks up the DOM because TUI wraps the native <input> in many custom elements;
// the identifying attributes (automation-id, statistclickid, custom tags) live on ancestors.
function isSearchElement(el) {
  if (!el) return false;
  // The T-Bank chat textarea is always a valid target — never treat it as search.
  if (el.id === 'tmsg-chat-input-textarea') return false;

  let node = el;
  for (let i = 0; i < 20 && node && node !== document.body && node !== document.documentElement; i++) {
    const id  = (node.id || '').toLowerCase();
    const cls = (typeof node.className === 'string' ? node.className : '').toLowerCase();
    const get = (name) => (node.getAttribute ? (node.getAttribute(name) || '') : '').toLowerCase();
    const aut = get('automation-id');
    const sta = get('statistclickid');
    const dai = get('data-automation-id');
    const ph  = get('placeholder');
    const tag = (node.tagName || '').toLowerCase();

    if (id.includes('search')   || id.includes('smart')  ||
        cls.includes('search')  || cls.includes('smart') ||
        aut.includes('search')  || aut.includes('smart') ||
        sta.includes('search')  || sta.includes('smart') ||
        dai.includes('search')  || dai.includes('smart') ||
        tag.includes('search')  ||
        ph.includes('процедур') || ph.includes('минимум')) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

// Only text-capable fields should trigger hints — radio/checkbox/file/etc.
// also fire "input" events, but must never show phrase suggestions.
function isTextEntry(el) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.isContentEditable) return true;
  if (el.tagName === 'INPUT') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return ['text', 'search', 'url', 'tel', 'email', 'number'].includes(type);
  }
  return false;
}

// ── Shared insert function (used by both iframe relay and main frame) ──
function performInsert(el, phrase, selS, selE) {
  if (!el) return;

  // HARD GUARD: never, ever insert into smart-search / procedure-search.
  // This is the single chokepoint all insertions pass through (top frame + every iframe),
  // so even if focus tracking or the iframe broadcast picks the wrong element, we refuse here.
  if (isSearchElement(el)) { if (window.__qpiDebugLogs) console.log('[QPI] performInsert BLOCKED', el.tagName, el.id); return; }
  if (window.__qpiDebugLogs) console.log('[QPI] performInsert', el.tagName, el.id);

  // Guard: only textarea or text-capable input types support selection
  if (el.tagName === 'INPUT') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (!['text', 'search', 'url', 'tel', 'password', 'email', 'number'].includes(type)) {
      return; // Can't insert into radio, checkbox, file, etc.
    }
  } else if (el.tagName !== 'TEXTAREA') {
    // If not INPUT or TEXTAREA, must be contenteditable
    if (!el.isContentEditable) return;
  }

  el.focus();

  // contenteditable
  if (el.isContentEditable) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0);
      r.deleteContents();
      const node = document.createTextNode(phrase);
      r.insertNode(node); r.setStartAfter(node); r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
    } else {
      el.textContent += phrase;
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    return;
  }

  if (typeof el.value !== 'string') return;

  const s  = selS !== null ? selS : (el.selectionStart ?? el.value.length);
  const e2 = selE !== null ? selE : (el.selectionEnd   ?? el.value.length);

  // Try to set selection, but some input types (range, color, date, etc.) don't support it
  try {
    el.setSelectionRange(s, e2);
  } catch (_) {
    // Element doesn't support selection — continue anyway
  }

  // Method 1: execCommand — zone.js intercepts natively, best for Angular
  const before = el.value;
  try {
    document.execCommand('insertText', false, phrase);
    if (el.value !== before) {
      try {
        el.setSelectionRange(s + phrase.length, s + phrase.length);
      } catch (_) {}
      return;
    }
  } catch (_) {}

  // Method 2: native prototype setter + full event set
  const newVal = before.slice(0, s) + phrase + before.slice(e2);
  const proto  = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) nativeSetter.call(el, newVal);
  else el.value = newVal;

  try {
    el.setSelectionRange(s + phrase.length, s + phrase.length);
  } catch (_) {}

  el.dispatchEvent(new InputEvent('input', {
    bubbles: true, composed: true, inputType: 'insertText', data: phrase
  }));
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

  // Verify insertion worked, otherwise try paste event (last resort for Angular TUI)
  if (el.value === before) {
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', phrase);
      el.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dt, bubbles: true, cancelable: true, composed: true
      }));
    } catch (_) {}
  }
}

// ── In sub-frames: just track focus/caret and relay hotkey to top frame ──
(function frameRelay() {
  if (window === window.top) return; // only for iframes
  if (window.__qpiFrameInit) return;
  window.__qpiFrameInit = true;

  let frameFocused = null;
  let frameSelStart = null, frameSelEnd = null;
  let iframeCursorX = 0, iframeCursorY = 0;
  let frameDebugLogs = false;
  let frameHintsActive = false;
  let frameSkipNextInput = false;
  const frameLog = (...a) => { if (frameDebugLogs) console.log('[QPI]', ...a); };

  // Rich chat editors often live in a Shadow DOM, so events are retargeted to the
  // shadow host and plain e.target never sees the real field. composedPath()[0]
  // pierces that; deepActiveEditable() descends focus through shadow roots.
  function realTarget(e) {
    const path = e.composedPath && e.composedPath();
    return (path && path.length) ? path[0] : e.target;
  }
  function deepActiveEditable() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    if (el && !isSearchElement(el) &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return el;
    return null;
  }

  document.addEventListener('mousemove', e => {
    iframeCursorX = e.clientX; iframeCursorY = e.clientY;
  }, { passive: true });

  // On right-click inside iframe, notify top frame of real cursor position
  // so the panel opens near the click, not at a stale/zero coordinate.
  document.addEventListener('contextmenu', e => {
    iframeCursorX = e.clientX; iframeCursorY = e.clientY;
    window.top.postMessage({ type: '__QPI_CURSOR__', x: e.clientX, y: e.clientY }, '*');
  }, { passive: true });

  function saveFrameCaret(t) {
    if (!t) return;
    // NEVER track smart-search / procedure-search as the insertion target.
    if (isSearchElement(t)) return;
    // Only save INPUT if it's a text-capable type
    if (t.tagName === 'INPUT') {
      const type = (t.getAttribute('type') || 'text').toLowerCase();
      if (!['text', 'search', 'url', 'tel', 'password', 'email', 'number'].includes(type)) {
        return; // Ignore radio, checkbox, file, etc.
      }
      frameFocused = t; frameSelStart = t.selectionStart; frameSelEnd = t.selectionEnd;
      return;
    }
    if (t.tagName === 'TEXTAREA') {
      frameFocused = t; frameSelStart = t.selectionStart; frameSelEnd = t.selectionEnd;
      return;
    }
    if (t.isContentEditable) {
      frameFocused = t;
      return;
    }
    // Fallback: if click landed on a pseudo-wrapper, grab the known T-Bank textarea
    const tbank = document.getElementById('tmsg-chat-input-textarea');
    if (tbank && !frameFocused) {
      frameFocused = tbank;
      frameSelStart = tbank.selectionStart;
      frameSelEnd   = tbank.selectionEnd;
    }
  }

  document.addEventListener('focusin',  e => saveFrameCaret(realTarget(e)), true);
  document.addEventListener('mouseup',  e => saveFrameCaret(realTarget(e)), true);
  document.addEventListener('keyup',    e => saveFrameCaret(realTarget(e)), true);
  // Also update caret on every keydown so position is fresh when hotkey fires
  document.addEventListener('keydown',  e => {
    // Intercept navigation keys when hints popup is active
    if (frameHintsActive) {
      if (e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation();
        window.top.postMessage({ type: '__QPI_HINTS_TAB__' }, '*');
        return;
      }
      if (e.key === 'Escape') {
        window.top.postMessage({ type: '__QPI_HINTS_DISMISS__' }, '*');
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        window.top.postMessage({ type: '__QPI_HINTS_NAV__', dir: e.key === 'ArrowUp' ? -1 : 1 }, '*');
        return;
      }
    }
    if (frameFocused && (frameFocused.tagName === 'INPUT' || frameFocused.tagName === 'TEXTAREA')) {
      frameSelStart = frameFocused.selectionStart;
      frameSelEnd   = frameFocused.selectionEnd;
    }
    // Forward hotkey info to top frame — top frame decides if it matches
    if (!['Control','Alt','Shift','Meta'].includes(e.key)) {
      window.top.postMessage({
        type: '__QPI_HOTKEY__',
        code: e.code,
        alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey,
        cursorX: iframeCursorX, cursorY: iframeCursorY
      }, '*');
    }
  }, true);

  // Relay input events so the top frame can compute hints
  document.addEventListener('input', e => {
    if (frameSkipNextInput) { frameSkipNextInput = false; return; }
    const t = realTarget(e);
    if (!t || isSearchElement(t)) return;
    if (!isTextEntry(t)) return;
    let before = '', fullVal = '';
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
      fullVal = t.value || '';
      const pos = t.selectionEnd ?? fullVal.length;
      before = fullVal.slice(0, pos);
    } else {
      fullVal = t.textContent || '';
      // contenteditable: text from the start of the field up to the caret (best-effort)
      try {
        const root = t.getRootNode();
        const sel = (root && root.getSelection) ? root.getSelection() : window.getSelection();
        if (sel && sel.rangeCount) {
          const caret = sel.getRangeAt(0);
          const r = document.createRange();
          r.selectNodeContents(t);
          r.setEnd(caret.endContainer, caret.endOffset);
          before = r.toString();
        }
      } catch (_) {}
    }
    const rect = t.getBoundingClientRect();
    window.top.postMessage({
      type: '__QPI_INPUT__',
      query: before.slice(-160),   // multi-word tail before the caret
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width }
    }, '*');
    frameFocused = t;
  }, true);

  // Hints state + insert commands from top frame
  window.addEventListener('message', e => {
    if (!e.data) return;
    if (e.data.type === '__QPI_HINTS_STATE__') {
      frameHintsActive = e.data.active;
    } else if (e.data.type === '__QPI_HINTS_INSERT__') {
      const t = frameFocused;
      if (!t || isSearchElement(t)) return;
      frameSkipNextInput = true;   // suppress the insertion's own input event
      const phrase = e.data.phrase;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
        const val = t.value || '';
        const pos = t.selectionEnd ?? val.length;
        const before = val.slice(0, pos);
        performInsert(t, phrase, phraseReplaceStart(before, phrase), pos);
      } else {
        performInsert(t, phrase, null, null);
      }
    }
  });

  // Receive debug toggle from top frame
  window.addEventListener('message', e => {
    if (e.data?.type === '__QPI_SETDEBUG__') { frameDebugLogs = e.data.enabled; }
  });

  // Receive "insert phrase" command from top frame
  window.addEventListener('message', e => {
    if (!e.data || e.data.type !== '__QPI_INSERT__') return;
    const phrase = e.data.phrase;

    // Priority 1: the T-Bank chat textarea, if it lives in THIS frame.
    const tbank = document.getElementById('tmsg-chat-input-textarea');
    let el, selS, selE;
    if (tbank) {
      el = tbank;
      selS = (frameFocused === tbank) ? frameSelStart : tbank.value.length;
      selE = (frameFocused === tbank) ? frameSelEnd   : tbank.value.length;
    } else if (frameFocused && !isSearchElement(frameFocused)) {
      // Priority 2: a normal field we tracked (never a search field).
      el = frameFocused; selS = frameSelStart; selE = frameSelEnd;
    } else {
      // Priority 3: whatever editable currently holds focus (pierces shadow DOM).
      const ae = deepActiveEditable();
      if (ae) {
        el = ae;
        if (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA') { selS = ae.selectionStart; selE = ae.selectionEnd; }
        else { selS = null; selE = null; }
      } else {
        frameLog('iframe no target (tbank:', !!tbank, 'frameFocused:', frameFocused, ')');
        return;
      }
    }

    frameLog('iframe inserting into', el.tagName, el.id, 'sel', selS, selE);
    try {
      performInsert(el, phrase, selS, selE);
    } catch (err) { frameLog('iframe performInsert error', err); }
  });
})();

// ── Main frame: full UI ───────────────────────────────────────
(function () {
  if (window !== window.top) return; // only in top frame
  if (document.getElementById('qpi-panel')) return;

  const DEFAULT_SETTINGS = {
    hotkey: { alt: true, ctrl: false, shift: false, code: 'KeyA', label: 'Alt+A' },
    layout: 'tabs',
    customCategories: [],
    builtinCategories: null, // null = use BUILT_IN_PHRASES defaults
    debugLogs: false,
    panelPos: null
  };

  // Heroicons v2 solid — sized for each use-case, currentColor for theme adaptation
  const IC = {
    close:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="display:block;flex-shrink:0"><path fill-rule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clip-rule="evenodd"/></svg>`,
    settings: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="15" height="15" style="display:block;flex-shrink:0"><path fill-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clip-rule="evenodd"/></svg>`,
    trash:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="display:block;flex-shrink:0"><path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 00-6 0v-.113c0-.794.609-1.428 1.364-1.452zm-.355 5.945a.75.75 0 10-1.5.058l.347 9a.75.75 0 101.499-.058l-.346-9zm5.48.058a.75.75 0 10-1.498-.058l-.347 9a.75.75 0 001.5.058l.345-9z" clip-rule="evenodd"/></svg>`,
    edit:      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style="display:block;flex-shrink:0"><path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-8.4 8.4a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32l8.4-8.4z"/></svg>`,
    chevron:   `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="10" height="10" style="display:block;flex-shrink:0"><path fill-rule="evenodd" d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z" clip-rule="evenodd"/></svg>`,
    chevronUp: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="8" height="8" style="display:block;flex-shrink:0;transform:rotate(180deg)"><path fill-rule="evenodd" d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z" clip-rule="evenodd"/></svg>`,
    chevronDn: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="8" height="8" style="display:block;flex-shrink:0"><path fill-rule="evenodd" d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z" clip-rule="evenodd"/></svg>`,
    grip:      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="12" height="12" style="display:block;flex-shrink:0"><circle cx="8.5" cy="6" r="1.5"/><circle cx="8.5" cy="12" r="1.5"/><circle cx="8.5" cy="18" r="1.5"/><circle cx="15.5" cy="6" r="1.5"/><circle cx="15.5" cy="12" r="1.5"/><circle cx="15.5" cy="18" r="1.5"/></svg>`,
    filePlus:  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="display:block;flex-shrink:0"><path fill-rule="evenodd" d="M5.625 1.5H9a3.75 3.75 0 013.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 013.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 01-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875zM12.75 12a.75.75 0 00-1.5 0v2.25H9a.75.75 0 000 1.5h2.25V18a.75.75 0 001.5 0v-2.25H15a.75.75 0 000-1.5h-2.25V12z" clip-rule="evenodd"/><path d="M14.25 5.25a5.23 5.23 0 00-1.279-3.434 9.768 9.768 0 016.963 6.963A5.23 5.23 0 0016.5 7.5h-1.875a.375.375 0 01-.375-.375V5.25z"/></svg>`,
    folder:    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="display:block;flex-shrink:0"><path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z"/></svg>`,
  };

  let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  const qpiLog = (...a) => { if (settings.debugLogs) console.log('[QPI]', ...a); };

  // Active builtin phrases: user-editable override or hardcoded defaults
  function getBuiltinCategories() {
    return settings.builtinCategories || BUILT_IN_PHRASES;
  }

  let lastFocused = null;
  let activeFrame = null;
  let isOpen = false;
  let phrasesEnabled = true;   // module toggle from popup
  let cursorX = 0, cursorY = 0;
  let activeTab = 'builtin';
  const collapsedBuiltIn = new Set(BUILT_IN_PHRASES.map((_, i) => i));
  const collapsedCustom  = new Set();
  // Rebuild collapsed set when builtin list changes length
  function resetCollapsedBuiltIn() {
    collapsedBuiltIn.clear();
    getBuiltinCategories().forEach((_, i) => collapsedBuiltIn.add(i));
  }

  // ── Storage ────────────────────────────────────────────────
  function loadSettings(cb) {
    chrome.storage.local.get(['qpi_settings'], r => {
      if (r.qpi_settings) settings = Object.assign({}, DEFAULT_SETTINGS, r.qpi_settings);
      if (!settings.hotkey)            settings.hotkey = DEFAULT_SETTINGS.hotkey;
      if (!settings.hotkey.code)       settings.hotkey.code = 'KeyA';
      if (!settings.customCategories)  settings.customCategories = [];
      if (!settings.layout)            settings.layout = 'tabs';
      if (settings.debugLogs === undefined) settings.debugLogs = false;
      if (settings.builtinCategories === undefined) settings.builtinCategories = null;
      cb && cb();
    });
  }
  function saveSettings() { chrome.storage.local.set({ qpi_settings: settings }); }

  // ── Panel HTML ─────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'qpi-panel';
  panel.innerHTML = `
    <div id="qpi-header">
      <div id="qpi-logo-wrap">
        <img id="qpi-logo" src="${chrome.runtime.getURL('icons/icon48.png')}" alt="T" />
        <span id="qpi-title">Быстрые фразы</span>
      </div>
      <div id="qpi-header-btns">
        <button id="qpi-settings-btn" title="Настройки">${IC.settings}</button>
        <button id="qpi-close" title="Закрыть (Esc)">${IC.close}</button>
      </div>
    </div>
    <div id="qpi-tabs" class="qpi-hidden">
      <button class="qpi-tab qpi-tab-active" data-tab="builtin">Основные</button>
      <button class="qpi-tab" data-tab="custom">Дополнительно</button>
    </div>
    <div id="qpi-search-wrap">
      <input id="qpi-search" type="text" placeholder="Поиск фраз…" autocomplete="off" />
    </div>
    <div id="qpi-body">
      <div id="qpi-builtin" class="qpi-col"></div>
      <div id="qpi-custom-col" class="qpi-col qpi-custom-col"></div>
    </div>
  `;
  document.body.appendChild(panel);

  const searchInput   = panel.querySelector('#qpi-search');
  const builtinCol    = panel.querySelector('#qpi-builtin');
  const customCol     = panel.querySelector('#qpi-custom-col');
  const tabsBar       = panel.querySelector('#qpi-tabs');
  const bodyEl        = panel.querySelector('#qpi-body');

  // ── Settings panel ─────────────────────────────────────────
  const settingsPanel = document.createElement('div');
  settingsPanel.id = 'qpi-settings-panel';
  settingsPanel.innerHTML = `
    <div id="qpi-settings-header">
      <span id="qpi-settings-drag-handle" style="display:inline-flex;align-items:center;gap:7px">${IC.settings} Настройки</span>
      <button id="qpi-settings-close">${IC.close}</button>
    </div>
    <div id="qpi-settings-body">
      <div class="qpi-setting-group">
        <label class="qpi-setting-label">Горячая клавиша</label>
        <div id="qpi-hotkey-row">
          <label class="qpi-chk-wrap"><input type="checkbox" id="qpi-hk-ctrl"> Ctrl</label>
          <label class="qpi-chk-wrap"><input type="checkbox" id="qpi-hk-alt"> Alt</label>
          <label class="qpi-chk-wrap"><input type="checkbox" id="qpi-hk-shift"> Shift</label>
          <span class="qpi-plus">+</span>
          <div id="qpi-hk-capture" title="Нажмите и нажмите клавишу">Нажмите здесь…</div>
        </div>
        <div id="qpi-hk-preview"></div>
      </div>
      <div class="qpi-setting-group">
        <label class="qpi-setting-label">Режим отображения</label>
        <div id="qpi-layout-row">
          <button class="qpi-layout-btn" data-layout="tabs">Вкладки</button>
          <button class="qpi-layout-btn" data-layout="split-right">Справа</button>
          <button class="qpi-layout-btn" data-layout="split-left">Слева</button>
        </div>
      </div>
      <div class="qpi-setting-group">
        <div id="qpi-cats-head">
          <div id="qpi-cats-switch">
            <button class="qpi-cats-tab qpi-cats-tab-active" data-cats="builtin">Основные</button>
            <button class="qpi-cats-tab" data-cats="custom">Дополнительные</button>
          </div>
        </div>
        <div id="qpi-cats-pane-builtin">
          <div id="qpi-builtin-cats-list" class="qpi-cats-list"></div>
          <button id="qpi-add-builtin-cat-btn">+ Добавить категорию</button>
          <button id="qpi-reset-builtin-btn">↺ Сбросить к исходным</button>
          <button id="qpi-clear-builtin-btn">${IC.trash} Удалить всё</button>
        </div>
        <div id="qpi-cats-pane-custom" class="qpi-hidden">
          <div id="qpi-custom-cats-list" class="qpi-cats-list"></div>
          <button id="qpi-add-cat-btn">+ Добавить категорию</button>
          <button id="qpi-clear-custom-btn">${IC.trash} Удалить всё</button>
        </div>
      </div>
      <div class="qpi-setting-group">
        <label class="qpi-setting-label">Сохранить / Загрузить</label>
        <div id="qpi-io-row">
          <button id="qpi-export-btn">${IC.folder} Сохранить</button>
          <button id="qpi-import-btn">${IC.filePlus} Загрузить</button>
          <input type="file" id="qpi-import-file" accept=".json" style="display:none">
        </div>
      <div class="qpi-setting-group">
        <label class="qpi-setting-label">Прочее</label>
        <button id="qpi-reset-pos-btn">↺ Сбросить позицию</button>
        <label class="qpi-chk-wrap"><input type="checkbox" id="qpi-debug-logs"> Вести логи в консоли</label>
      </div>
      </div>
    </div>
  `;
  document.body.appendChild(settingsPanel);

  // ── Dragging for settings panel ────────────────────────────
  (function initDrag() {
    const handle = settingsPanel.querySelector('#qpi-settings-drag-handle');
    let dragging = false, ox = 0, oy = 0;
    handle.addEventListener('mousedown', e => {
      dragging = true;
      const r = settingsPanel.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      settingsPanel.style.transition = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      settingsPanel.style.left = (e.clientX - ox) + 'px';
      settingsPanel.style.top  = (e.clientY - oy) + 'px';
      settingsPanel.style.right = 'auto';
      settingsPanel.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      settingsPanel.style.transition = '';
    });
  })();

  // ── Dragging for main panel ────────────────────────────────
  (function initPanelDrag() {
    const handle = panel.querySelector('#qpi-header');
    let dragging = false, ox = 0, oy = 0;
    handle.style.cursor = 'grab';
    handle.addEventListener('mousedown', e => {
      // Don't start drag on button clicks
      if (e.target.closest('button')) return;
      dragging = true;
      const r = panel.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      panel.style.transition = 'none';
      handle.style.cursor = 'grabbing';
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      const pw = panel.offsetWidth, ph = panel.offsetHeight;
      const x = Math.max(0, Math.min(e.clientX - ox, vw - pw));
      const y = Math.max(0, Math.min(e.clientY - oy, vh - ph));
      panel.style.left = x + 'px';
      panel.style.top  = y + 'px';
      settings.panelPos = { x, y };
    });
    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      handle.style.cursor = 'grab';
      panel.style.transition = '';
      saveSettings();
    });
  })();

  // ── Layout ─────────────────────────────────────────────────
  function applyLayout() {
    const ly = settings.layout;
    panel.dataset.layout = ly;

    tabsBar.classList.toggle('qpi-hidden', ly !== 'tabs');
    customCol.classList.toggle('qpi-hidden', false);

    if (ly === 'tabs') {
      panel.style.width = '310px';
      bodyEl.style.flexDirection = 'row';
      builtinCol.classList.toggle('qpi-hidden', activeTab !== 'builtin');
      customCol.classList.toggle('qpi-hidden', activeTab !== 'custom');
    } else {
      panel.style.width = '580px';
      builtinCol.classList.remove('qpi-hidden');
      customCol.classList.remove('qpi-hidden');
      bodyEl.style.flexDirection = ly === 'split-left' ? 'row-reverse' : 'row';
    }

    // Update layout buttons
    settingsPanel.querySelectorAll('.qpi-layout-btn').forEach(b =>
      b.classList.toggle('qpi-layout-active', b.dataset.layout === ly));
  }

  // ── Render ─────────────────────────────────────────────────
  function makeClearAllFooter(which) {
    const foot = document.createElement('div');
    foot.className = 'qpi-col-footer';
    const btn = document.createElement('button');
    btn.className = 'qpi-clear-all-btn';
    btn.innerHTML = `${IC.trash} Удалить всё`;
    btn.title = 'Очистить все фразы этой вкладки';
    btn.addEventListener('click', () => clearTab(which));
    foot.appendChild(btn);
    return foot;
  }

  function clearTab(which) {
    if (which === 'builtin') {
      if (!confirm('Удалить ВСЕ фразы во вкладке «Основные»? Действие необратимо.')) return;
      ensureBuiltinEditable();
      settings.builtinCategories = [];
      saveSettings();
      resetCollapsedBuiltIn();
      renderBuiltinCatsList();
      renderBuiltIn();
    } else {
      if (!confirm('Удалить ВСЕ фразы во вкладке «Дополнительно»? Действие необратимо.')) return;
      settings.customCategories = [];
      saveSettings();
      renderCustomCatsList();
      renderCustom();
    }
  }

  function renderBuiltIn(q = '') {
    builtinCol.innerHTML = '';
    let rendered = 0;
    getBuiltinCategories().forEach(({ category, color, items }, idx) => {
      const f = q ? items.filter(p => p.toLowerCase().includes(q)) : items;
      if (!f.length) return;
      const isCol = collapsedBuiltIn.has(idx) && !q;
      builtinCol.appendChild(makeCatBlock(category, color, f, isCol, () => {
        collapsedBuiltIn.has(idx) ? collapsedBuiltIn.delete(idx) : collapsedBuiltIn.add(idx);
        renderBuiltIn(searchInput.value.toLowerCase());
      }));
      rendered++;
    });
    if (!rendered) builtinCol.appendChild(emptyMsg(q ? 'Ничего не найдено' : 'Фраз пока нет'));
  }

  function renderCustom(q = '') {
    customCol.innerHTML = '';
    const cats = settings.customCategories || [];
    if (!cats.length) {
      customCol.appendChild(emptyMsg('Дополнительных фраз нет.\nДобавьте в настройках ⚙', true));
      return;
    }
    let rendered = 0;
    cats.forEach((cat, idx) => {
      const f = q ? cat.items.filter(p => p.toLowerCase().includes(q)) : cat.items;
      if (q && !f.length) return;
      const isCol = collapsedCustom.has(idx) && !q;
      customCol.appendChild(makeCatBlock(cat.name, cat.color || '#888', f, isCol, () => {
        collapsedCustom.has(idx) ? collapsedCustom.delete(idx) : collapsedCustom.add(idx);
        renderCustom(searchInput.value.toLowerCase());
      }));
      rendered++;
    });
    if (!rendered) customCol.appendChild(emptyMsg('Ничего не найдено'));
  }

  function emptyMsg(text, hint) {
    const d = document.createElement('div');
    d.className = 'qpi-empty' + (hint ? ' qpi-empty-hint' : '');
    d.textContent = text;
    return d;
  }

  function renderAll() {
    const q = searchInput.value.toLowerCase();
    renderBuiltIn(q);
    renderCustom(q);
    applyLayout();
  }

  function makeCatBlock(name, color, items, isCol, onToggle) {
    const wrap = document.createElement('div');
    const toggle = document.createElement('button');
    toggle.className = 'qpi-cat-toggle' + (isCol ? ' qpi-collapsed' : '');
    toggle.style.setProperty('--cat-color', color);
    toggle.innerHTML = `<span class="qpi-cat-name">${name}</span><span class="qpi-cat-arrow">${IC.chevron}</span>`;
    toggle.addEventListener('click', onToggle);

    const itemsEl = document.createElement('div');
    itemsEl.className = 'qpi-cat-items' + (isCol ? ' qpi-collapsed' : '');
    itemsEl.style.setProperty('--cat-color', color);

    items.forEach((phrase, i) => {
      const btn = document.createElement('button');
      btn.className = 'qpi-phrase' + (i === items.length - 1 ? ' qpi-phrase-last' : '');
      const isMulti = phrase.includes('\n');
      btn.textContent = isMulti ? phrase.split('\n')[0] + '…' : phrase;
      btn.title = phrase;
      btn.addEventListener('click', () => insertPhrase(phrase));
      itemsEl.appendChild(btn);
    });

    wrap.appendChild(toggle);
    wrap.appendChild(itemsEl);
    return wrap;
  }

  // ── Tabs ───────────────────────────────────────────────────
  tabsBar.querySelectorAll('.qpi-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      tabsBar.querySelectorAll('.qpi-tab').forEach(b => b.classList.toggle('qpi-tab-active', b.dataset.tab === activeTab));
      applyLayout();
    });
  });

  // ── Settings rendering ─────────────────────────────────────
  function broadcastDebugMode() {
    window.__qpiDebugLogs = settings.debugLogs;
    document.querySelectorAll('iframe').forEach(f => {
      try { f.contentWindow.postMessage({ type: '__QPI_SETDEBUG__', enabled: settings.debugLogs }, '*'); } catch(_) {}
    });
  }

  function renderSettingsPanel() {
    const hk = settings.hotkey;
    settingsPanel.querySelector('#qpi-hk-ctrl').checked  = !!hk.ctrl;
    settingsPanel.querySelector('#qpi-hk-alt').checked   = !!hk.alt;
    settingsPanel.querySelector('#qpi-hk-shift').checked = !!hk.shift;
    settingsPanel.querySelector('#qpi-debug-logs').checked = !!settings.debugLogs;
    if (!capturing) {
      const code = hk.code || 'KeyA';
      captureEl.textContent = (code.startsWith('Key') ? code.slice(3) :
                               code.startsWith('Digit') ? code.slice(5) : code).toUpperCase();
    }
    updateHkPreview();
    settingsPanel.querySelectorAll('.qpi-layout-btn').forEach(b =>
      b.classList.toggle('qpi-layout-active', b.dataset.layout === settings.layout));
    renderBuiltinCatsList();
    renderCustomCatsList();
  }

  function updateHkPreview() {
    const parts = [];
    if (settingsPanel.querySelector('#qpi-hk-ctrl').checked)  parts.push('Ctrl');
    if (settingsPanel.querySelector('#qpi-hk-alt').checked)   parts.push('Alt');
    if (settingsPanel.querySelector('#qpi-hk-shift').checked) parts.push('Shift');
    const code = settings.hotkey.code || 'KeyA';
    const keyLabel = code.startsWith('Key') ? code.slice(3) :
                     code.startsWith('Digit') ? code.slice(5) : code;
    parts.push(keyLabel.toUpperCase());
    settingsPanel.querySelector('#qpi-hk-preview').textContent = parts.join('+') || '—';
  }

  // ── Hotkey capture ─────────────────────────────────────────
  const captureEl = settingsPanel.querySelector('#qpi-hk-capture');
  let capturing = false;
  let justCaptured = false;
  captureEl.addEventListener('click', () => {
    capturing = true;
    captureEl.classList.add('qpi-capturing');
    captureEl.textContent = '⌨ Нажмите клавишу…';
  });
  document.addEventListener('keydown', e => {
    if (!capturing) return;
    // Ignore pure modifier presses
    if (['Control','Alt','Shift','Meta'].includes(e.key)) return;
    // Cancel capture on Escape without closing menu
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      capturing = false;
      captureEl.classList.remove('qpi-capturing');
      const hk = settings.hotkey;
      const keyLabel = (hk.code || 'KeyA').startsWith('Key')   ? (hk.code).slice(3) :
                       (hk.code || '').startsWith('Digit') ? (hk.code).slice(5) : (hk.code || 'A');
      captureEl.textContent = keyLabel;
      return;
    }
    e.preventDefault(); e.stopPropagation();
    capturing = false;
    justCaptured = true;

    settings.hotkey.ctrl  = e.ctrlKey;
    settings.hotkey.alt   = e.altKey;
    settings.hotkey.shift = e.shiftKey;
    settings.hotkey.code  = e.code;

    settingsPanel.querySelector('#qpi-hk-ctrl').checked  = e.ctrlKey;
    settingsPanel.querySelector('#qpi-hk-alt').checked   = e.altKey;
    settingsPanel.querySelector('#qpi-hk-shift').checked = e.shiftKey;

    const keyLabel = e.code.startsWith('Key') ? e.code.slice(3) :
                     e.code.startsWith('Digit') ? e.code.slice(5) : e.key.toUpperCase();
    captureEl.textContent = keyLabel;
    updateHkPreview();
    saveSettings();
  }, true);

  // Modifier checkboxes just update display
  ['#qpi-hk-ctrl','#qpi-hk-alt','#qpi-hk-shift'].forEach(sel => {
    settingsPanel.querySelector(sel).addEventListener('change', () => {
      settings.hotkey.ctrl  = settingsPanel.querySelector('#qpi-hk-ctrl').checked;
      settings.hotkey.alt   = settingsPanel.querySelector('#qpi-hk-alt').checked;
      settings.hotkey.shift = settingsPanel.querySelector('#qpi-hk-shift').checked;
      updateHkPreview();
      saveSettings();
    });
  });

  settingsPanel.querySelectorAll('.qpi-layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      settings.layout = btn.dataset.layout;
      saveSettings();
      renderAll();
    });
  });

// Переключатель наборов категорий: два прежних блока занимали много места
// и заставляли прокручивать панель, хотя одновременно нужен всегда один.
settingsPanel.querySelectorAll('.qpi-cats-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const which = tab.dataset.cats;
    closePhraseEditor();
    settingsPanel.querySelectorAll('.qpi-cats-tab')
      .forEach(t => t.classList.toggle('qpi-cats-tab-active', t === tab));
    settingsPanel.querySelector('#qpi-cats-pane-builtin')
      .classList.toggle('qpi-hidden', which !== 'builtin');
    settingsPanel.querySelector('#qpi-cats-pane-custom')
      .classList.toggle('qpi-hidden', which !== 'custom');
  });
});

  settingsPanel.querySelector('#qpi-debug-logs').addEventListener('change', e => {
    settings.debugLogs = e.target.checked;
    saveSettings();
    broadcastDebugMode();
  });

  settingsPanel.querySelector('#qpi-reset-pos-btn').addEventListener('click', () => {
    settings.panelPos = null;
    saveSettings();
  });

  // ── Drag-and-drop reordering for category lists ───────────
  function attachCatDnD(listEl, getArr, saveAndRender) {
    let srcIdx = null;
    listEl.querySelectorAll('.qpi-s-cat-row').forEach((row, idx) => {
      const handle = row.querySelector('.qpi-s-drag-handle');
      if (!handle) return;
      handle.draggable = true;

      handle.addEventListener('dragstart', e => {
        srcIdx = idx;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
        const r = row.getBoundingClientRect();
        e.dataTransfer.setDragImage(row, e.clientX - r.left, e.clientY - r.top);
        setTimeout(() => row.classList.add('qpi-s-cat-dragging'), 0);
      });

      handle.addEventListener('dragend', () => {
        srcIdx = null;
        listEl.querySelectorAll('.qpi-s-cat-dragging, .qpi-s-drag-over-top, .qpi-s-drag-over-bot')
          .forEach(el => el.classList.remove('qpi-s-cat-dragging', 'qpi-s-drag-over-top', 'qpi-s-drag-over-bot'));
      });

      row.addEventListener('dragover', e => {
        if (srcIdx === null || srcIdx === idx) return;
        e.preventDefault();
        const rect = row.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        listEl.querySelectorAll('.qpi-s-drag-over-top, .qpi-s-drag-over-bot')
          .forEach(el => el.classList.remove('qpi-s-drag-over-top', 'qpi-s-drag-over-bot'));
        row.classList.add(before ? 'qpi-s-drag-over-top' : 'qpi-s-drag-over-bot');
      });

      row.addEventListener('dragleave', e => {
        if (!row.contains(e.relatedTarget)) {
          row.classList.remove('qpi-s-drag-over-top', 'qpi-s-drag-over-bot');
        }
      });

      row.addEventListener('drop', e => {
        e.preventDefault();
        if (srcIdx === null || srcIdx === idx) { srcIdx = null; return; }
        const before = row.classList.contains('qpi-s-drag-over-top');
        row.classList.remove('qpi-s-drag-over-top', 'qpi-s-drag-over-bot');
        const arr = getArr();
        const [item] = arr.splice(srcIdx, 1);
        let target = idx;
        if (srcIdx < idx) target--;
        if (!before) target++;
        arr.splice(Math.max(0, Math.min(arr.length, target)), 0, item);
        srcIdx = null;
        saveAndRender();
      });
    });
  }

  // ── Выбор цвета категории ──────────────────────────────────
  // То же меню, что у заметок: готовая палитра плюс «свой цвет» под
  // радужным кружком. Раньше здесь была голая сетка точек без подписи
  // и без произвольного цвета — два модуля выглядели как из разных
  // расширений, и цвет вне десяти заготовок задать было нечем.
  const CAT_PALETTE = ['#FFD000', '#ff9f43', '#ff6b6b', '#e879f9', '#a78bfa',
                       '#4dabf7', '#22d3ee', '#51cf66', '#a3e635', '#94a3b8'];

  function openCatColorPicker(anchor, current, onPick) {
    document.querySelectorAll('.qpi-color-picker-pop').forEach(p => p.remove());
    const cur = (current || '').toLowerCase();
    // Цвет, выбранный до появления палитры, в ней может и не оказаться —
    // тогда «выбранным» показываем кружок «свой», иначе метка пропадает.
    const known = CAT_PALETTE.some(c => c.toLowerCase() === cur);

    const pop = document.createElement('div');
    pop.className = 'qpi-color-picker-pop';
    // Палитра вынесена в body, а токены тем заданы на корнях расширения —
    // без своей отметки темы она осталась бы вообще без фона и рамки.
    const theme = settingsPanel.getAttribute('data-theme');
    if (theme) pop.setAttribute('data-theme', theme);
    pop.innerHTML = `
      <div class="qpi-pick-label">Цвет</div>
      <div class="qpi-pick-colors">
        ${CAT_PALETTE.map(c => `<button class="qpi-sw${c.toLowerCase() === cur ? ' qpi-sw-on' : ''}"
            type="button" data-color="${c}" style="--sw:${c}"></button>`).join('')}
        <label class="qpi-sw qpi-sw-custom${known ? '' : ' qpi-sw-on'}" title="Свой цвет"
               style="--sw:${current || '#888888'}">
          <input type="color" value="${current || '#888888'}">
        </label>
      </div>`;

    const custom = pop.querySelector('.qpi-sw-custom');
    const colorInput = custom.querySelector('input');
    const mark = el => {
      pop.querySelectorAll('.qpi-sw').forEach(b => b.classList.toggle('qpi-sw-on', b === el));
    };

    // Пока тянут ползунок, input приходит на каждое движение мыши, а
    // change — один раз, когда системную палитру закрыли. Поэтому по
    // input только показываем цвет, а записываем по change: иначе весь
    // набор шаблонов сериализовался бы в storage десятки раз в секунду,
    // и список фраз столько же раз перерисовывался.
    colorInput.addEventListener('input', () => {
      custom.style.setProperty('--sw', colorInput.value);
      mark(custom);
      onPick(colorInput.value, true);
    });
    colorInput.addEventListener('change', () => {
      onPick(colorInput.value, false);
      colorInput.blur();                  // снимаем защиту в off()
    });

    pop.addEventListener('click', e => {
      const sw = e.target.closest('.qpi-sw[data-color]');
      if (!sw) return;
      e.stopPropagation();
      mark(sw);
      onPick(sw.dataset.color, false);
    });

    // Палитра висит в body и позиционируется по образцу, а не лежит
    // внутри строки категории. Внутри списка её перекрывали кнопки
    // «добавить категорию» и «очистить» — у нижних строк выбрать цвет
    // было нельзя, — а при длинном списке её обрезала бы ещё и прокрутка
    // настроек.
    document.body.appendChild(pop);
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = pop.offsetHeight, w = pop.offsetWidth;
      const below = r.bottom + 6;
      pop.style.top  = (below + h > window.innerHeight - 8 ? r.top - h - 6 : below) + 'px';
      pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    };
    place();

    // Меню остаётся открытым: цвета примеряют подряд, и закрытие после
    // первого же клика заставляло открывать его заново на каждую пробу.
    const scrollBox = settingsPanel.querySelector('#qpi-settings-body');
    const onScroll = () => place();
    scrollBox?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    const drop = () => {
      pop.remove();
      document.removeEventListener('pointerdown', off, true);
      scrollBox?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
    const off = e => {
      if (pop.contains(e.target)) return;
      // Системная палитра — отдельный попап браузера, и всё время, пока
      // она открыта, фокус держится на нашем <input type="color">
      // (проверено). Клик по её ползунку на некоторых платформах
      // долетает до страницы как клик «мимо меню»; закрыв по нему меню,
      // мы вынули бы из DOM сам input — и системная палитра схлопнулась
      // бы вместе с ним, не дав довести ползунок до конца.
      if (document.activeElement === colorInput) return;
      drop();
    };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
  }

  // ── Custom categories ──────────────────────────────────────
  function renderCustomCatsList() {
    const list = settingsPanel.querySelector('#qpi-custom-cats-list');
    list.innerHTML = '';
    const cats = settings.customCategories || [];
    cats.forEach((cat, idx) => {
      const row = document.createElement('div');
      row.className = 'qpi-s-cat-row';

      const swatch = document.createElement('div');
      swatch.className = 'qpi-color-swatch';
      swatch.style.background = cat.color || '#888';
      swatch.addEventListener('click', () => {
        openCatColorPicker(swatch, cat.color, (c, preview) => {
          swatch.style.background = c;
          if (preview) return;            // ползунок ещё тянут — только показываем
          cat.color = c; saveSettings();
          renderCustom(searchInput.value.toLowerCase());
        });
      });

      const nameInput = document.createElement('input');
      nameInput.className = 'qpi-s-cat-name';
      nameInput.value = cat.name;
      nameInput.placeholder = 'Название категории';
      nameInput.addEventListener('change', () => { cat.name = nameInput.value; saveSettings(); renderCustom(); });

      const editBtn = document.createElement('button');
      editBtn.className = 'qpi-s-btn';
      editBtn.innerHTML = `${IC.edit} ${cat.items.length}`;
      editBtn.addEventListener('click', () => openPhraseEditor(idx));

      const delBtn = document.createElement('button');
      delBtn.className = 'qpi-s-btn qpi-s-btn-del';
      delBtn.innerHTML = IC.trash;
      delBtn.addEventListener('click', () => {
        if (confirm(`Удалить "${cat.name}"?`)) {
          settings.customCategories.splice(idx, 1);
          saveSettings(); renderCustomCatsList(); renderCustom();
        }
      });


      const handle = document.createElement('span');
      handle.className = 'qpi-s-drag-handle';
      handle.innerHTML = IC.grip;
      handle.title = 'Перетащить';
      row.appendChild(handle); row.appendChild(swatch); row.appendChild(nameInput);
      row.appendChild(editBtn); row.appendChild(delBtn);
      list.appendChild(row);
    });
    attachCatDnD(list, () => settings.customCategories, () => { saveSettings(); renderCustomCatsList(); renderCustom(); });
    markEditingRow(settingsPanel.querySelector('#qpi-custom-cats-list'), 'custom');
  }

  // Big, resizable modal for composing / editing a single phrase.
  function openPhraseTextModal(initial, onSave) {
    document.getElementById('qpi-pe-modal-overlay')?.remove();
    const ov = document.createElement('div');
    ov.id = 'qpi-pe-modal-overlay';
    const theme = panel.getAttribute('data-theme');
    if (theme) ov.setAttribute('data-theme', theme);
    const editing = !!initial;
    ov.innerHTML = `
      <div id="qpi-pe-modal">
        <div id="qpi-pe-modal-head">
          <span style="display:inline-flex;align-items:center;gap:6px">${editing ? IC.edit + ' Редактировать фразу' : '＋ Новая фраза'}</span>
          <button id="qpi-pe-modal-x" title="Закрыть">${IC.close}</button>
        </div>
        <textarea id="qpi-pe-modal-input" placeholder="Текст фразы…" spellcheck="false"></textarea>
        <div id="qpi-pe-modal-btns">
          <button id="qpi-pe-modal-cancel">Отмена</button>
          <button id="qpi-pe-modal-save">Сохранить</button>
        </div>
        <div id="qpi-pe-modal-hint">Ctrl+Enter — сохранить · Esc — отмена · уголок — потянуть, чтобы расширить</div>
      </div>`;
    document.body.appendChild(ov);

    const ta = ov.querySelector('#qpi-pe-modal-input');
    ta.value = initial || '';
    setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);

    const close = () => ov.remove();
    const commit = () => {
      const val = ta.value.trim();
      if (!val) { ta.focus(); return; }
      onSave(val);
      close();
    };
    ov.querySelector('#qpi-pe-modal-save').addEventListener('click', commit);
    ov.querySelector('#qpi-pe-modal-cancel').addEventListener('click', close);
    ov.querySelector('#qpi-pe-modal-x').addEventListener('click', close);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ta.addEventListener('keydown', e => {
      e.stopImmediatePropagation();
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); return; }
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        const s = ta.selectionStart, end = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '\n' + ta.value.slice(end);
        ta.selectionStart = ta.selectionEnd = s + 1;
      }
    }, true);
  }

  // ── "Add to quick phrases" picker (from the right-click context menu) ──
  function addPhraseToCategory(group, idx, text) {
    if (group === 'builtin') {
      ensureBuiltinEditable();
      if (!settings.builtinCategories[idx]) return;
      settings.builtinCategories[idx].items.push(text);
    } else {
      if (!settings.customCategories[idx]) return;
      settings.customCategories[idx].items.push(text);
    }
    saveSettings();
    resetCollapsedBuiltIn();
    renderBuiltIn(); renderCustom();
    renderBuiltinCatsList(); renderCustomCatsList();
  }

  function createCategoryWithPhrase(name, text) {
    settings.customCategories.push({
      name: name.slice(0, 40),
      color: CAT_PALETTE[settings.customCategories.length % CAT_PALETTE.length],
      items: [text]
    });
    saveSettings();
    renderCustom(); renderCustomCatsList();
  }

  function openCategoryPicker(rawText) {
    const text = (rawText || '').trim();
    if (!text) return;
    document.getElementById('qpi-pe-modal-overlay')?.remove();

    const ov = document.createElement('div');
    ov.id = 'qpi-pe-modal-overlay';
    const theme = panel.getAttribute('data-theme');
    if (theme) ov.setAttribute('data-theme', theme);

    const modal = document.createElement('div');
    modal.id = 'qpi-pe-modal';
    modal.className = 'qpi-acp-modal';
    ov.appendChild(modal);

    const head = document.createElement('div');
    head.id = 'qpi-pe-modal-head';
    const headTitle = document.createElement('span');
    headTitle.style.cssText = 'display:inline-flex;align-items:center;gap:6px';
    headTitle.textContent = '＋ Добавить в «Быстрые фразы»';
    const xBtn = document.createElement('button');
    xBtn.id = 'qpi-pe-modal-x';
    xBtn.title = 'Закрыть';
    xBtn.innerHTML = IC.close;
    head.appendChild(headTitle); head.appendChild(xBtn);
    modal.appendChild(head);

    const editLabel = document.createElement('div');
    editLabel.className = 'qpi-acp-label';
    editLabel.textContent = 'Текст фразы:';
    modal.appendChild(editLabel);

    const editor = document.createElement('textarea');
    editor.className = 'qpi-acp-edit';
    editor.spellcheck = false;
    editor.value = text;
    modal.appendChild(editor);
    setTimeout(() => editor.focus(), 0);
    // keep the page's / our own global key handlers from hijacking typing
    editor.addEventListener('keydown', e => { e.stopImmediatePropagation(); }, true);
    const currentText = () => editor.value.trim();

    const label = document.createElement('div');
    label.className = 'qpi-acp-label';
    label.textContent = 'Выберите категорию:';
    modal.appendChild(label);

    const list = document.createElement('div');
    list.className = 'qpi-acp-list';
    modal.appendChild(list);

    const close = () => ov.remove();

    function addCatButton(group, idx, name, color, count) {
      const b = document.createElement('button');
      b.className = 'qpi-acp-cat';
      const dot = document.createElement('span');
      dot.className = 'qpi-acp-dot';
      dot.style.background = color || '#888';
      const nm = document.createElement('span');
      nm.className = 'qpi-acp-name';
      nm.textContent = name;
      const cnt = document.createElement('span');
      cnt.className = 'qpi-acp-count';
      cnt.textContent = count;
      b.appendChild(dot); b.appendChild(nm); b.appendChild(cnt);
      b.addEventListener('click', () => {
        const t = currentText();
        if (!t) { editor.focus(); return; }
        addPhraseToCategory(group, idx, t);
        close();
      });
      list.appendChild(b);
    }

    getBuiltinCategories().forEach((c, i) => addCatButton('builtin', i, c.category, c.color, c.items.length));
    (settings.customCategories || []).forEach((c, i) => addCatButton('custom', i, c.name, c.color || '#888', c.items.length));

    const newRow = document.createElement('div');
    newRow.className = 'qpi-acp-newrow';
    const newBtn = document.createElement('button');
    newBtn.className = 'qpi-acp-newbtn';
    newBtn.textContent = '＋ Новая категория';
    newRow.appendChild(newBtn);
    modal.appendChild(newRow);

    newBtn.addEventListener('click', () => {
      newRow.innerHTML = '';
      const inp = document.createElement('input');
      inp.className = 'qpi-acp-newinput';
      inp.type = 'text';
      inp.maxLength = 40;
      inp.placeholder = 'Название категории…';
      const ok = document.createElement('button');
      ok.className = 'qpi-acp-newok';
      ok.textContent = 'Создать';
      newRow.appendChild(inp); newRow.appendChild(ok);
      setTimeout(() => inp.focus(), 0);
      const create = () => {
        const name = inp.value.trim();
        if (!name) { inp.focus(); return; }
        const t = currentText();
        if (!t) { editor.focus(); return; }
        createCategoryWithPhrase(name, t);
        close();
      };
      ok.addEventListener('click', create);
      inp.addEventListener('keydown', e => {
        e.stopImmediatePropagation();
        if (e.key === 'Enter')  { e.preventDefault(); create(); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
      }, true);
    });

    xBtn.addEventListener('click', close);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    document.body.appendChild(ov);
  }

  // Shared phrase editor — lists phrases with edit / delete and opens the
  // resizable modal for adding or editing. getItems() returns the live array;
  // onMutate() persists + re-renders panels.
  // Какая категория сейчас раскрыта на редактирование. Хранится отдельно
  // от DOM: список категорий перерисовывается после каждой правки фразы,
  // и отметка прямо на строке терялась бы вместе со старыми узлами.
  let editingCat = null;   // { which: 'builtin' | 'custom', idx: number }

  function markEditingRow(list, which) {
    list.querySelectorAll('.qpi-s-cat-row').forEach((row, i) => {
      const on = !!editingCat && editingCat.which === which && editingCat.idx === i;
      row.classList.toggle('qpi-s-cat-editing', on);
      row.querySelector('.qpi-s-cat-close')?.remove();
      if (!on) return;
      // Крестик живёт прямо в строке категории: название и так написано
      // здесь, и отдельная шапка у списка фраз только дублировала бы его.
      const close = document.createElement('button');
      close.className = 'qpi-s-btn qpi-s-cat-close';
      close.innerHTML = IC.close;
      close.title = 'Закрыть';
      close.addEventListener('click', closePhraseEditor);
      row.appendChild(close);
    });
  }

  function closePhraseEditor() {
    editingCat = null;
    document.getElementById('qpi-phrase-editor')?.remove();
    settingsPanel.querySelectorAll('.qpi-cats-editing')
      .forEach(el => el.classList.remove('qpi-cats-editing'));
    settingsPanel.querySelectorAll('.qpi-s-cat-editing')
      .forEach(el => el.classList.remove('qpi-s-cat-editing'));
    // Крестик дорисовывается в строку категории на время правки. Снять
    // только класс мало: без класса его перестаёт раскладывать CSS, и от
    // него оставался торчать кусок кнопки рядом с корзиной.
    settingsPanel.querySelectorAll('.qpi-s-cat-close').forEach(el => el.remove());
  }

  function buildPhraseEditor(label, getItems, onMutate, pane) {
    document.getElementById('qpi-phrase-editor')?.remove();
    const ed = document.createElement('div');
    ed.id = 'qpi-phrase-editor';
    ed.innerHTML = `
      <div id="qpi-pe-header"><span id="qpi-pe-title" style="display:inline-flex;align-items:center;gap:5px">${IC.edit} ${label}</span><button id="qpi-pe-close">${IC.close}</button></div>
      <div id="qpi-pe-list"></div>
      <button id="qpi-pe-add-btn">＋ Добавить фразу</button>
    `;
    (pane || settingsPanel.querySelector('#qpi-settings-body')).appendChild(ed);

    function rList() {
      const list = ed.querySelector('#qpi-pe-list');
      list.innerHTML = '';
      const items = getItems();
      if (!items.length) {
        const e = document.createElement('div');
        e.className = 'qpi-pe-empty'; e.textContent = 'Пока нет фраз';
        list.appendChild(e);
      }
      items.forEach((phrase, i) => {
        const row = document.createElement('div');
        row.className = 'qpi-pe-item';
        const preview = phrase.split('\n')[0];
        const txt = document.createElement('span');
        txt.className = 'qpi-pe-text';
        txt.title = phrase;
        txt.textContent = preview.length > 50 ? preview.slice(0,50)+'…' : preview;
        const openEdit = () => openPhraseTextModal(phrase, val => {
          getItems()[i] = val; onMutate(); rList();
        });
        txt.addEventListener('click', openEdit);
        const editB = document.createElement('button');
        editB.className = 'qpi-pe-edit'; editB.innerHTML = IC.edit; editB.title = 'Изменить';
        editB.addEventListener('click', openEdit);
        const del = document.createElement('button');
        del.className = 'qpi-pe-del'; del.innerHTML = IC.trash; del.title = 'Удалить';
        del.addEventListener('click', () => { getItems().splice(i, 1); onMutate(); rList(); });
        row.appendChild(txt); row.appendChild(editB); row.appendChild(del);
        list.appendChild(row);
      });
    }

    ed.querySelector('#qpi-pe-add-btn').addEventListener('click', () => {
      openPhraseTextModal('', val => { getItems().push(val); onMutate(); rList(); });
    });
    ed.querySelector('#qpi-pe-close').addEventListener('click', closePhraseEditor);

    rList();
    return ed;
  }

  function openPhraseEditor(catIdx) {
    const cat = settings.customCategories[catIdx];
    const pane = settingsPanel.querySelector('#qpi-cats-pane-custom');
    closePhraseEditor();
    editingCat = { which: 'custom', idx: catIdx };
    pane.classList.add('qpi-cats-editing');
    markEditingRow(pane.querySelector('#qpi-custom-cats-list'), 'custom');
    // Категорию ищем по индексу на каждое обращение, а не держим ссылку:
    // settings целиком пересоздаётся, когда конфиг приходит из другой
    // вкладки или из попапа, и захваченный объект тогда осиротел бы —
    // фразы уходили бы в него, а сохранялся бы уже новый settings.
    buildPhraseEditor(cat.name, () => settings.customCategories[catIdx]?.items || [], () => {
      saveSettings(); renderCustomCatsList(); renderCustom();
    }, pane);
  }

  function addCategoryTo(target) {
    if (target === 'builtin') {
      ensureBuiltinEditable();
      settings.builtinCategories.push({
        category: 'Новая категория',
        color: CAT_PALETTE[settings.builtinCategories.length % CAT_PALETTE.length],
        items: []
      });
      saveSettings(); renderBuiltinCatsList(); resetCollapsedBuiltIn(); renderBuiltIn();
    } else {
      settings.customCategories.push({
        name: 'Новая категория',
        color: CAT_PALETTE[settings.customCategories.length % CAT_PALETTE.length],
        items: []
      });
      saveSettings(); renderCustomCatsList(); renderCustom();
    }
  }

  settingsPanel.querySelector('#qpi-add-cat-btn').addEventListener('click', () => addCategoryTo('custom'));
  settingsPanel.querySelector('#qpi-add-builtin-cat-btn').addEventListener('click', () => addCategoryTo('builtin'));
  settingsPanel.querySelector('#qpi-clear-builtin-btn').addEventListener('click', () => clearTab('builtin'));
  settingsPanel.querySelector('#qpi-clear-custom-btn').addEventListener('click', () => clearTab('custom'));

  // ── Builtin categories editor ──────────────────────────────
  function renderBuiltinCatsList() {
    const list = settingsPanel.querySelector('#qpi-builtin-cats-list');
    list.innerHTML = '';
    const builtins = getBuiltinCategories();
    builtins.forEach((cat, idx) => {
      const row = document.createElement('div');
      row.className = 'qpi-s-cat-row';

      const swatch = document.createElement('div');
      swatch.className = 'qpi-color-swatch';
      swatch.style.background = cat.color || '#888';
      swatch.addEventListener('click', () => {
        openCatColorPicker(swatch, cat.color, (c, preview) => {
          swatch.style.background = c;
          if (preview) return;            // ползунок ещё тянут — только показываем
          ensureBuiltinEditable();
          settings.builtinCategories[idx].color = c;
          saveSettings();
          renderBuiltIn(searchInput.value.toLowerCase());
        });
      });

      const nameInput = document.createElement('input');
      nameInput.className = 'qpi-s-cat-name';
      nameInput.value = cat.category;
      nameInput.placeholder = 'Название категории';
      nameInput.addEventListener('change', () => {
        ensureBuiltinEditable();
        settings.builtinCategories[idx].category = nameInput.value;
        saveSettings(); renderBuiltIn();
      });

      const editBtn = document.createElement('button');
      editBtn.className = 'qpi-s-btn';
      editBtn.innerHTML = `${IC.edit} ${cat.items.length}`;
      editBtn.addEventListener('click', () => openBuiltinPhraseEditor(idx));

      const delBtn = document.createElement('button');
      delBtn.className = 'qpi-s-btn qpi-s-btn-del';
      delBtn.innerHTML = IC.trash;
      delBtn.addEventListener('click', () => {
        if (!confirm(`Удалить категорию "${cat.category}"?`)) return;
        ensureBuiltinEditable();
        settings.builtinCategories.splice(idx, 1);
        saveSettings(); renderBuiltinCatsList(); resetCollapsedBuiltIn(); renderBuiltIn();
      });


      const handle = document.createElement('span');
      handle.className = 'qpi-s-drag-handle';
      handle.innerHTML = IC.grip;
      handle.title = 'Перетащить';
      row.appendChild(handle); row.appendChild(swatch); row.appendChild(nameInput); row.appendChild(editBtn); row.appendChild(delBtn);
      list.appendChild(row);
    });
    attachCatDnD(list, () => { ensureBuiltinEditable(); return settings.builtinCategories; }, () => {
      saveSettings(); renderBuiltinCatsList(); resetCollapsedBuiltIn(); renderBuiltIn();
    });
    markEditingRow(settingsPanel.querySelector('#qpi-builtin-cats-list'), 'builtin');
  }

  // Deep-copy BUILT_IN_PHRASES into settings so the user can edit
  function ensureBuiltinEditable() {
    if (!settings.builtinCategories) {
      settings.builtinCategories = JSON.parse(JSON.stringify(BUILT_IN_PHRASES));
    }
  }

  function openBuiltinPhraseEditor(catIdx) {
    ensureBuiltinEditable();
    const cat = settings.builtinCategories[catIdx];
    const pane = settingsPanel.querySelector('#qpi-cats-pane-builtin');
    closePhraseEditor();
    editingCat = { which: 'builtin', idx: catIdx };
    pane.classList.add('qpi-cats-editing');
    markEditingRow(pane.querySelector('#qpi-builtin-cats-list'), 'builtin');
    buildPhraseEditor(cat.category, () => {
      ensureBuiltinEditable();                      // см. комментарий в openPhraseEditor
      return settings.builtinCategories[catIdx]?.items || [];
    }, () => {
      saveSettings(); renderBuiltinCatsList(); renderBuiltIn();
    }, pane);
  }

  settingsPanel.querySelector('#qpi-reset-builtin-btn').addEventListener('click', () => {
    if (!confirm('Сбросить все основные фразы к исходным? Изменения будут потеряны.')) return;
    settings.builtinCategories = null;
    saveSettings(); renderBuiltinCatsList(); resetCollapsedBuiltIn(); renderBuiltIn();
  });

  // ── Export / Import ────────────────────────────────────────
  settingsPanel.querySelector('#qpi-export-btn').addEventListener('click', () => {
    const data = {
      version: 1,
      builtinCategories: getBuiltinCategories(),
      customCategories: settings.customCategories || []
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 't-helper-phrases.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  settingsPanel.querySelector('#qpi-import-btn').addEventListener('click', () => {
    settingsPanel.querySelector('#qpi-import-file').click();
  });

  settingsPanel.querySelector('#qpi-import-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.builtinCategories && !data.customCategories) throw new Error('Неверный формат файла');
        if (data.builtinCategories) settings.builtinCategories = data.builtinCategories;
        if (data.customCategories)  settings.customCategories  = data.customCategories;
        saveSettings();
        resetCollapsedBuiltIn();
        renderBuiltinCatsList(); renderCustomCatsList();
        renderBuiltIn(); renderCustom();
        alert('Фразы успешно импортированы!');
      } catch (err) {
        alert('Ошибка импорта: ' + err.message);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  // ── Saved caret state (captured before our UI steals focus) ─
  let savedRange    = null;   // for contenteditable
  let savedSelStart = null;   // for input/textarea
  let savedSelEnd   = null;

  // Save caret on any interaction in real fields
  ['keyup','mouseup','keydown','click','focusin'].forEach(evt =>
    document.addEventListener(evt, e => {
      const t = e.target;
      if (!t || panel.contains(t) || settingsPanel.contains(t)) return;
      saveCaretOf(t);
    }, true)
  );

  // Also save when focus leaves toward our panel
  document.addEventListener('focusout', e => {
    const t = e.target;
    if (!t || panel.contains(t) || settingsPanel.contains(t)) return;
    saveCaretOf(t);
  }, true);

  function saveCaretOf(t) {
    if (!t) return;

    // Skip search/smart-search inputs — they steal focus and break chat insertion
    if (isSearchElement(t)) return;

    if (t.isContentEditable) {
      lastFocused = t; activeFrame = null;
      const sel = window.getSelection();
      if (sel && sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
      savedSelStart = null; savedSelEnd = null;
      return;
    }
    // Only save INPUT if it's a text-capable type
    if (t.tagName === 'INPUT') {
      const type = (t.getAttribute('type') || 'text').toLowerCase();
      if (!['text', 'search', 'url', 'tel', 'password', 'email', 'number'].includes(type)) {
        return; // Ignore radio, checkbox, file, etc.
      }
      lastFocused   = t; activeFrame = null;
      savedSelStart = t.selectionStart;
      savedSelEnd   = t.selectionEnd;
      savedRange    = null;
      return;
    }
    if (t.tagName === 'TEXTAREA') {
      lastFocused   = t; activeFrame = null;
      savedSelStart = t.selectionStart;
      savedSelEnd   = t.selectionEnd;
      savedRange    = null;
      return;
    }
    // Clicked on a pseudo-wrapper (Angular TUI) — grab the known T-Bank textarea
    const tbank = document.getElementById('tmsg-chat-input-textarea');
    if (tbank) {
      lastFocused   = tbank; activeFrame = null;
      savedSelStart = tbank.selectionStart;
      savedSelEnd   = tbank.selectionEnd;
      savedRange    = null;
    }
  }

  // Fallback: on hotkey, if lastFocused is null, try document.activeElement or known T-Bank textarea
  function resolveTarget() {
    // Always prioritize T-Bank chat textarea if available
    // (prevents smart-search or other inputs from stealing focus)
    const tbank = document.getElementById('tmsg-chat-input-textarea');
    if (tbank) {
      lastFocused = tbank;
      savedSelStart = tbank.selectionStart;
      savedSelEnd = tbank.selectionEnd;
      return;
    }

    if (lastFocused) return;
    // Try activeElement
    const a = document.activeElement;
    if (a && a !== document.body && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) {
      saveCaretOf(a);
    }
  }

  // ── Insert phrase ──────────────────────────────────────────
  function insertPhrase(phrase) {
    // Capture ALL state before closing menu
    const frame  = activeFrame;
    let target = lastFocused || document.getElementById('tmsg-chat-input-textarea');

    // If lastFocused is a search/smart-search input, ignore it and use T-Bank textarea
    if (lastFocused && isSearchElement(lastFocused)) {
      target = document.getElementById('tmsg-chat-input-textarea') || null;
    }

    let selS   = savedSelStart;
    let selE   = savedSelEnd;
    const rng    = savedRange ? savedRange.cloneRange() : null;

    // If we used fallback T-Bank textarea but don't have proper selection,
    // append at the end (user likely clicked pseudo-content, not the textarea itself)
    if (target && target.id === 'tmsg-chat-input-textarea' && selS === null && selE === null) {
      selS = target.value.length;
      selE = target.value.length;
    }

    // Reset shared state
    activeFrame = null;
    lastFocused = null;
    savedSelStart = savedSelEnd = null;
    savedRange = null;

    closeMenu();

    qpiLog('insertPhrase. activeFrame:', !!frame, 'target:', target && target.tagName, target && target.id);

    // iframe relay — send phrase to a known source iframe
    if (frame) {
      qpiLog('posting to activeFrame');
      try { frame.postMessage({ type: '__QPI_INSERT__', phrase }, '*'); } catch(_) {}
      return;
    }

    // No known target in top frame — broadcast to ALL iframes
    // (T-Bank chat is likely in an iframe we don't have a direct reference to)
    if (!target) {
      const frames = document.querySelectorAll('iframe');
      qpiLog('broadcasting to', frames.length, 'iframes');
      frames.forEach(iframe => {
        try { iframe.contentWindow.postMessage({ type: '__QPI_INSERT__', phrase }, '*'); } catch(_) {}
      });
      return;
    }

    // For contenteditable we need the saved range — handle separately
    if (target.isContentEditable) {
      requestAnimationFrame(() => {
        target.focus();
        const sel = window.getSelection();
        if (rng) { sel.removeAllRanges(); sel.addRange(rng); }
        const r = sel.rangeCount ? sel.getRangeAt(0) : null;
        if (r) {
          r.deleteContents();
          const node = document.createTextNode(phrase);
          r.insertNode(node); r.setStartAfter(node); r.collapse(true);
          sel.removeAllRanges(); sel.addRange(r);
        } else {
          target.textContent += phrase;
        }
        target.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
      });
      return;
    }

    // textarea / input — defer so Angular settles after panel close
    requestAnimationFrame(() => {
      performInsert(target, phrase, selS, selE);
    });
  }

  // ── Position panel near cursor ─────────────────────────────
  function positionPanel() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const pw = panel.offsetWidth || 310, ph = panel.offsetHeight || 460;
    const m = 12;
    let x, y;

    // If user manually dragged the panel, restore that position
    if (settings.panelPos) {
      x = settings.panelPos.x;
      y = settings.panelPos.y;
    } else {
      // Try to anchor to the focused element in top frame
      const anchor = lastFocused || document.getElementById('tmsg-chat-input-textarea');
      if (anchor && anchor.getBoundingClientRect().top >= 0) {
        const r = anchor.getBoundingClientRect();
        x = r.left;
        y = r.top - ph - m;
        if (y < m) y = r.bottom + m;
      } else {
        // Anchor to last known cursor position (default fallback)
        x = cursorX + m;
        y = cursorY - ph / 2;
        if (y + ph > vh - m) y = cursorY - ph - m;
        if (y < m) y = m;
      }
    }

    // Keep within viewport bounds
    if (x + pw > vw - m) x = vw - pw - m;
    if (x < m) x = m;
    if (y + ph > vh - m) y = vh - ph - m;
    if (y < m) y = m;

    panel.style.left = x + 'px';
    panel.style.top  = y + 'px';
  }

  function positionSettingsPanel() {
    const pr = panel.getBoundingClientRect();
    const sw = 340, sh = 520;
    const vw = window.innerWidth, vh = window.innerHeight;
    // Prefer right of panel, else left
    let sx = pr.right + 8;
    if (sx + sw > vw - 8) sx = pr.left - sw - 8;
    let sy = pr.top;
    if (sy + sh > vh - 8) sy = vh - sh - 8;
    settingsPanel.style.left   = Math.max(8, sx) + 'px';
    settingsPanel.style.top    = Math.max(8, sy) + 'px';
    settingsPanel.style.right  = 'auto';
    settingsPanel.style.bottom = 'auto';
  }

  // ── Open / Close ───────────────────────────────────────────
  function openMenu() {
    if (!phrasesEnabled) return;   // module disabled via popup
    if (isOpen) { closeMenu(); return; }
    hideHints();
    resolveTarget();
    isOpen = true;
    renderAll();
    panel.style.visibility = 'hidden';
    panel.classList.add('qpi-open');
    requestAnimationFrame(() => {
      positionPanel();
      panel.style.visibility = '';
      setTimeout(() => searchInput.focus(), 30);
    });
  }

  function closeMenu() {
    isOpen = false;
    // палитра живёт в body — без этого она осталась бы висеть над страницей
    document.querySelectorAll('.qpi-color-picker-pop').forEach(p => p.remove());
    panel.classList.remove('qpi-open');
    settingsPanel.classList.remove('qpi-settings-open');
    panel.querySelector('#qpi-settings-btn').classList.remove('active');
    searchInput.value = '';
  }

  // ── Hotkey match — uses e.code, layout-independent ─────────
  function matchesHotkey(e) {
    const hk = settings.hotkey;
    return e.code === hk.code
        && !!e.altKey   === !!hk.alt
        && !!e.ctrlKey  === !!hk.ctrl
        && !!e.shiftKey === !!hk.shift;
  }

  // ── Events ────────────────────────────────────────────────
  document.addEventListener('mousemove',   e => { cursorX = e.clientX; cursorY = e.clientY; }, { passive: true });
  document.addEventListener('contextmenu', e => { cursorX = e.clientX; cursorY = e.clientY; }, { passive: true });

  // Triggered by executeScript from background.js (more reliable than sendMessage for SPAs)
  document.addEventListener('__QPI_OPEN__', () => { resolveTarget(); openMenu(); });
  document.addEventListener('__QPI_ADD_PHRASE__', e => openCategoryPicker(e.detail || ''));

  document.addEventListener('focusin', e => {
    const t = e.target;
    if (panel.contains(t) || settingsPanel.contains(t)) return;
    if (isSearchElement(t)) return; // never let smart-search become the target
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      lastFocused = t;
      activeFrame = null; // focus is in top frame
    }
  }, true);

  // Track caret in contenteditable on every selection change
  document.addEventListener('selectionchange', () => {
    const a = document.activeElement;
    if (!a || panel.contains(a) || settingsPanel.contains(a)) return;
    if (isSearchElement(a)) return;
    if (a.isContentEditable) { lastFocused = a; activeFrame = null; }
  }, true);

  // Translate iframe-relative cursor coords to viewport coords using the iframe's offset.
  function iframeToViewport(source, ix, iy) {
    const iframeEl = Array.from(document.querySelectorAll('iframe'))
      .find(f => f.contentWindow === source);
    if (!iframeEl) return;
    const r = iframeEl.getBoundingClientRect();
    cursorX = r.left + ix;
    cursorY = r.top  + iy;
  }

  // Listen for cursor position relayed from iframes (contextmenu / hotkey paths).
  window.addEventListener('message', e => {
    if (!e.data) return;
    if (e.data.type === '__QPI_CURSOR__') {
      iframeToViewport(e.source, e.data.x, e.data.y);
      return;
    }
    // Hints messages from iframes
    if (e.data.type === '__QPI_INPUT__') {
      if (!hintsEnabled || !phrasesEnabled || !hintsAllowedHere()) return;
      const items = getHintSuggestions(e.data.query);
      const iframeEl = Array.from(document.querySelectorAll('iframe'))
        .find(f => f.contentWindow === e.source);
      if (!iframeEl) return;
      const fr = iframeEl.getBoundingClientRect();
      const r  = e.data.rect;
      const rect = { left: fr.left + r.left, top: fr.top + r.top,
                     bottom: fr.top + r.bottom, width: r.width };
      if (items.length) {
        hintsIframeSource = e.source;
        hintsTopTarget    = null;
        showHintsAt(rect, items);
      } else {
        hideHints();
      }
      return;
    }
    if (e.data.type === '__QPI_HINTS_TAB__')     { confirmHint();  return; }
    if (e.data.type === '__QPI_HINTS_DISMISS__') { hideHints();    return; }
    if (e.data.type === '__QPI_HINTS_NAV__') {
      hintIdx = ((hintIdx + e.data.dir) % hintItems.length + hintItems.length) % hintItems.length;
      renderHints();
      return;
    }
    if (e.data.type !== '__QPI_HOTKEY__') return;
    const d = e.data;
    const hk = settings.hotkey;
    if (d.code === hk.code && !!d.alt === !!hk.alt && !!d.ctrl === !!hk.ctrl && !!d.shift === !!hk.shift) {
      // Translate hotkey cursor (iframe-relative) → viewport coords
      if (d.cursorX || d.cursorY) iframeToViewport(e.source, d.cursorX, d.cursorY);
      activeFrame = e.source; // remember which iframe to send phrase back to
      lastFocused = null;     // focus is in iframe, not top frame
      openMenu();
    }
  });

  document.addEventListener('keydown', e => {
    if (capturing) return;
    // Ignore the very next keydown after capture finishes (justCaptured flag)
    if (justCaptured) { justCaptured = false; return; }
    if (matchesHotkey(e)) { e.preventDefault(); openMenu(); return; }
    if (e.key === 'Escape' && isOpen) closeMenu();
  }, true);

  searchInput.addEventListener('input', () => renderAll());
  searchInput.addEventListener('keydown', e => e.stopPropagation());

  panel.querySelector('#qpi-close').addEventListener('click', closeMenu);

  panel.querySelector('#qpi-settings-btn').addEventListener('click', () => {
    const btn = panel.querySelector('#qpi-settings-btn');
    const opening = !settingsPanel.classList.contains('qpi-settings-open');
    btn.classList.toggle('active', opening);
    btn.classList.remove('qpi-spin');
    void btn.offsetWidth;
    btn.classList.add('qpi-spin');
    btn.addEventListener('animationend', () => btn.classList.remove('qpi-spin'), { once: true });
    if (opening) {
      renderSettingsPanel();
      settingsPanel.classList.add('qpi-settings-open');
      positionSettingsPanel();
    } else {
      settingsPanel.classList.remove('qpi-settings-open');
    }
  });

  settingsPanel.querySelector('#qpi-settings-close').addEventListener('click', () => {
    settingsPanel.classList.remove('qpi-settings-open');
    panel.querySelector('#qpi-settings-btn').classList.remove('active');
  });

  // Окно ввода фразы и палитра живут в body, а не внутри панели: иначе их
  // обрезал бы её overflow. Для проверки «клик мимо меню» они всё равно
  // свои — без этого нажатие «Сохранить» закрывало и меню, и настройки.
  function insideOwnUI(node) {
    return panel.contains(node) || settingsPanel.contains(node) ||
           !!(node?.closest?.('#qpi-pe-modal-overlay, .qpi-color-picker-pop'));
  }
  document.addEventListener('mousedown', e => {
    if (isOpen && !insideOwnUI(e.target)) closeMenu();
  }, true);

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'QPI_OPEN_FROM_CONTEXT') {
      resolveTarget();
      openMenu();
    } else if (msg.type === 'QPI_ADD_PHRASE') {
      openCategoryPicker(msg.text || '');
    }
  });

  // ── Module on/off (controlled by popup) ────────────────────
  chrome.storage.local.get(['twfm_modules', 'twfm_hints', 'twfm_theme'], r => {
    phrasesEnabled = r.twfm_modules?.phrases !== false;
    hintsEnabled   = r.twfm_modules?.hints   !== false;
    const h        = r.twfm_hints || {};
    hintsOpacity   = h.opacity ?? 0.85;
    hintsCount     = h.count   ?? 3;
    hintsSize      = h.size    || 'M';
    hintsScope     = h.scope   || 'twork';
    applyHintsSize();
    applyTheme(r.twfm_theme || 'dark');
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.twfm_modules) {
      phrasesEnabled = changes.twfm_modules.newValue?.phrases !== false;
      hintsEnabled   = changes.twfm_modules.newValue?.hints   !== false;
      if (!phrasesEnabled && isOpen) closeMenu();
      if (!hintsEnabled) hideHints();
    }
    if (changes.twfm_hints) {
      const h    = changes.twfm_hints.newValue || {};
      hintsOpacity = h.opacity ?? 0.85;
      hintsCount   = h.count   ?? 3;
      hintsSize    = h.size    || 'M';
      hintsScope   = h.scope   || 'twork';
      if (!hintsAllowedHere()) hideHints();
      if (hintsVisible) hintsPopup.style.opacity = hintsOpacity;
      applyHintsSize();
    }
    if (changes.twfm_theme) {
      applyTheme(changes.twfm_theme.newValue || 'dark');
    }
    // Phrase settings changed elsewhere — popup config import or another tab.
    // The JSON compare skips our own writes so editing here isn't disrupted.
    if (changes.qpi_settings && !capturing) {
      const nv = changes.qpi_settings.newValue;
      let differs = false;
      try { differs = nv && JSON.stringify(nv) !== JSON.stringify(settings); } catch (e) {}
      if (differs) {
        settings = Object.assign({}, DEFAULT_SETTINGS, nv);
        if (!settings.hotkey)            settings.hotkey = DEFAULT_SETTINGS.hotkey;
        if (!settings.hotkey.code)       settings.hotkey.code = 'KeyA';
        if (!settings.customCategories)  settings.customCategories = [];
        if (!settings.layout)            settings.layout = 'tabs';
        if (settings.debugLogs === undefined)        settings.debugLogs = false;
        if (settings.builtinCategories === undefined) settings.builtinCategories = null;
        resetCollapsedBuiltIn();
        renderAll();              // live-refresh phrase lists (no page reload needed)
        renderSettingsPanel();    // keep the settings UI (hotkey, categories) in sync
        applyLayout();
        refreshVisibleHints();    // re-evaluate an open hints popup against the new list
      }
    }
  });

  // ── Подсказки (hints) sub-module ─────────────────────────────
  let hintsEnabled = true;
  let hintsOpacity = 0.85;
  let hintsCount   = 3;
  let hintsSize    = 'M';
  // По умолчанию подсказки работают только в Творке: расширение стоит на
  // всех сайтах, и всплывающий список над полем ввода на постороннем
  // ресурсе мешает, а не помогает.
  let hintsScope   = 'twork';
  const isTworkPage = () => /twork/.test(location.hostname);
  const hintsAllowedHere = () => hintsScope === 'everywhere' || isTworkPage();
  let hintItems = [], hintIdx = 0, hintsVisible = false;
  let hintsTopTarget = null, hintsIframeSource = null;
  let skipNextHintInput = false;   // suppress the input event fired by our own insertion

  const CHEV = d => `<svg viewBox="0 0 20 20" width="11" height="11" fill="none"
    stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"
    style="display:block"><path d="${d}"/></svg>`;
  const CHEV_UP   = CHEV('M4.6 12.7 10 7.3l5.4 5.4');
  const CHEV_DOWN = CHEV('M4.6 7.3 10 12.7l5.4-5.4');

  const hintsPopup = document.createElement('div');
  hintsPopup.id = 'qpi-hints';
  document.body.appendChild(hintsPopup);

  function applyHintsSize() {
    hintsPopup.classList.remove('sz-s', 'sz-m', 'sz-l');
    hintsPopup.classList.add('sz-' + hintsSize.toLowerCase());
  }

  function applyTheme(theme) {
    const t = (!theme || theme === 'dark') ? null : theme;
    for (const el of [panel, settingsPanel, hintsPopup]) {
      if (t) el.setAttribute('data-theme', t);
      else el.removeAttribute('data-theme');
    }
  }

  function getAllPhrases() {
    const all = [];
    getBuiltinCategories().forEach(cat => cat.items.forEach(p => all.push(p)));
    (settings.customCategories || []).forEach(cat => cat.items.forEach(p => all.push(p)));
    return all;
  }

  function getHintSuggestions(before) {
    if (!before || before.trim().length < 2) return [];
    return getAllPhrases()
      .map(p => ({ p, s: scorePhrase(p, before) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, hintsCount)
      .map(x => x.p);
  }

  // Re-evaluate an already-open hints popup against the current phrase list
  // (e.g. right after a config import) so it never shows stale suggestions.
  function refreshVisibleHints() {
    if (!hintsVisible) return;
    const t = hintsTopTarget;
    if (!t) { hideHints(); return; }   // iframe-sourced popup: just drop the stale one
    let before = '';
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
      const val = t.value || '';
      const pos = t.selectionEnd ?? val.length;
      before = val.slice(0, pos);
    }
    const items = getHintSuggestions(before);
    if (items.length) showHintsAt(t.getBoundingClientRect(), items);
    else hideHints();
  }

  function renderHints() {
    hintsPopup.innerHTML = '';
    const multi = hintItems.length > 1;
    hintItems.forEach((phrase, i) => {
      const row = document.createElement('div');
      row.className = 'qpi-hint-row' + (i === hintIdx ? ' qpi-hint-sel' : '');
      const preview = phrase.split('\n')[0];
      const textSpan = document.createElement('span');
      textSpan.className = 'qpi-hint-text';
      textSpan.textContent = preview.length > 58 ? preview.slice(0, 58) + '…' : preview;
      row.appendChild(textSpan);
      const badge = document.createElement('span');
      if (i === hintIdx) {
        badge.className = 'qpi-hint-badge';
        badge.textContent = 'Tab';
      } else {
        // subtle hint that arrows switch the selection
        badge.className = 'qpi-hint-badge qpi-hint-badge-dim';
        badge.innerHTML = i < hintIdx ? CHEV_UP : CHEV_DOWN;
      }
      if (i === hintIdx || multi) row.appendChild(badge);
      row.addEventListener('mousedown', e => { e.preventDefault(); confirmHint(i); });
      hintsPopup.appendChild(row);
    });
  }

  let hintsAutoHideTimer = null;
  let hintsCloseTimer    = null;
  const HINTS_AUTO_HIDE_MS = 10000;   // hide the popup 10s after the last suggestion

  function showHintsAt(rect, items) {
    hintItems = items;
    if (hintIdx >= hintItems.length) hintIdx = 0;
    renderHints();
    // cancel a pending close so a fresh suggestion cleanly interrupts the exit.
    // Swapping the classes naturally (re)plays the entrance animation on a real
    // open or a mid-close interrupt, while steady typing keeps the same class
    // (no name change) so it never flickers.
    if (hintsCloseTimer) { clearTimeout(hintsCloseTimer); hintsCloseTimer = null; }
    hintsPopup.classList.remove('qpi-hints-closing');
    hintsPopup.classList.add('qpi-hints-open');
    hintsPopup.style.opacity = hintsOpacity;
    hintsVisible = true;
    broadcastHintsState(true);
    // restart the auto-hide countdown on every fresh set of suggestions
    if (hintsAutoHideTimer) clearTimeout(hintsAutoHideTimer);
    hintsAutoHideTimer = setTimeout(hideHints, HINTS_AUTO_HIDE_MS);
    requestAnimationFrame(() => {
      const gap = 6, margin = 8;
      const vw = window.innerWidth, vh = window.innerHeight;

      // Width: at least the field width, clamped to [260, 460]
      const minW = Math.min(Math.max(rect.width, 260), 460);
      hintsPopup.style.minWidth = minW + 'px';

      // Strictly above the typed text: cap height to the space above the field
      const availAbove = Math.max(0, rect.top - gap - margin);
      hintsPopup.style.maxHeight = availAbove + 'px';

      // Measure after constraints are applied
      const hh = hintsPopup.offsetHeight;
      const pw = hintsPopup.offsetWidth;

      // Horizontal: align to field, clamp within viewport
      let x = rect.left;
      if (x + pw > vw - margin) x = vw - pw - margin;
      if (x < margin) x = margin;

      // Vertical: bottom edge just above the field, never off the top
      let y = rect.top - gap - hh;
      if (y < margin) y = margin;

      hintsPopup.style.left = x + 'px';
      hintsPopup.style.top  = y + 'px';
    });
  }

  function hideHints() {
    if (hintsAutoHideTimer) { clearTimeout(hintsAutoHideTimer); hintsAutoHideTimer = null; }
    if (!hintsVisible) return;
    hintsVisible = false;
    hintItems = []; hintIdx = 0;
    hintsTopTarget = null; hintsIframeSource = null;
    broadcastHintsState(false);
    // play the exit animation, then actually detach from layout
    hintsPopup.classList.add('qpi-hints-closing');
    if (hintsCloseTimer) clearTimeout(hintsCloseTimer);
    hintsCloseTimer = setTimeout(() => {
      hintsPopup.classList.remove('qpi-hints-open', 'qpi-hints-closing');
      hintsCloseTimer = null;
    }, 170);
  }

  function broadcastHintsState(active) {
    document.querySelectorAll('iframe').forEach(f => {
      try { f.contentWindow.postMessage({ type: '__QPI_HINTS_STATE__', active }, '*'); } catch(_) {}
    });
  }

  function confirmHint(idx) {
    if (idx !== undefined) hintIdx = idx;
    const phrase = hintItems[hintIdx];
    if (!phrase) { hideHints(); return; }
    const target = hintsTopTarget;
    const iframeSource = hintsIframeSource;
    hideHints();
    skipNextHintInput = true;   // don't re-open the menu for the insertion's own input event
    if (iframeSource) {
      try { iframeSource.postMessage({ type: '__QPI_HINTS_INSERT__', phrase }, '*'); } catch(_) {}
      return;
    }
    if (target) {
      target.focus();
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        const val = target.value || '';
        const pos = target.selectionEnd ?? val.length;
        const before = val.slice(0, pos);
        performInsert(target, phrase, phraseReplaceStart(before, phrase), pos);
      } else {
        performInsert(target, phrase, null, null);
      }
    }
  }

  // Top-frame input events → show hints
  document.addEventListener('input', e => {
    if (!hintsEnabled || !phrasesEnabled || !hintsAllowedHere()) return;
    if (skipNextHintInput) { skipNextHintInput = false; return; }
    const t = e.target;
    if (!t || panel.contains(t) || settingsPanel.contains(t) || hintsPopup.contains(t)) return;
    if (isSearchElement(t)) return;
    if (!isTextEntry(t)) return;
    let before = '';
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
      const val = t.value || '';
      const pos = t.selectionEnd ?? val.length;
      before = val.slice(0, pos);
    }
    const hints = getHintSuggestions(before);
    if (hints.length) {
      hintsTopTarget = t; hintsIframeSource = null;
      showHintsAt(t.getBoundingClientRect(), hints);
    } else {
      hideHints();
    }
  }, true);

  // Tab / Arrow / Escape in top frame when hints visible
  document.addEventListener('keydown', e => {
    if (!hintsVisible) return;
    if (e.key === 'Tab') {
      const ae = document.activeElement;
      if (ae && !panel.contains(ae) && !settingsPanel.contains(ae)) {
        e.preventDefault(); e.stopPropagation();
        confirmHint();
      }
      return;
    }
    if (e.key === 'Escape')   { hideHints(); return; }
    if (e.key === 'ArrowUp')  { e.preventDefault(); hintIdx = (hintIdx - 1 + hintItems.length) % hintItems.length; renderHints(); return; }
    if (e.key === 'ArrowDown'){ e.preventDefault(); hintIdx = (hintIdx + 1) % hintItems.length; renderHints(); return; }
  }, true);

  // Hide hints when clicking outside
  document.addEventListener('mousedown', e => {
    if (hintsVisible && !hintsPopup.contains(e.target)) hideHints();
  }, true);

  // ── Init ──────────────────────────────────────────────────
  loadSettings(() => applyLayout());

})(); // end main-frame IIFE
})(); // end guard IIFE
