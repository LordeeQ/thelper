// ════════════════════════════════════════════════════════════
//  T-Helper · Ядро расписания (чистые функции, без DOM и chrome)
//  Всё, что касается времени/валидации — здесь, чтобы можно было
//  тестировать без браузера. Функции, зависящие от «сейчас»
//  (nowMinutes/todayStr), остаются в schedule.js и передают время
//  сюда параметром (computeStateAt).
// ════════════════════════════════════════════════════════════
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // Node / тесты
  else root.SchedCore = api;                                                    // браузер
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // Skeleton loaders render repeated placeholder chars ("░░░░", "----") — ignore them.
  function isSkeletonText(t) {
    return !t || /^(.)\1{2,}$/.test(t.replace(/\s/g, ''));
  }

  function toMinutes(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

  // Absolute minutes allowing one or more midnight wraps (overnight shifts).
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

  // Current-mode computation for a given "now" (in minutes since midnight).
  // Pure: the caller supplies `nowMin` so this is fully testable.
  function computeStateAt(items, nowMin) {
    const norm     = normItemMins(items);
    const firstMin = norm.length ? norm[0] : 0;
    const lastMin  = norm.length ? norm[norm.length - 1] : 0;
    let nm = nowMin;
    // overnight shift: if «now» is past midnight but the shift started yesterday,
    // shift «now» onto the same continuous timeline as the items
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

  return { isSkeletonText, toMinutes, normItemMins, isValidSchedule, fmtDur, computeStateAt };
});
