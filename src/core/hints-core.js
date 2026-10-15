// ════════════════════════════════════════════════════════════
//  T-Helper · Ядро подсказок (чистые функции, без DOM и chrome)
//  Грузится как content-script (кладёт API в self.HintsCore) и
//  импортируется в юнит-тестах через require('.../hints-core.js').
// ════════════════════════════════════════════════════════════
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // Node / тесты
  else root.HintsCore = api;                                                    // браузер
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  // Longest word-boundary-aligned suffix of `before` that is a prefix of `phrase`
  // (case-insensitive). Lets the user type the beginning of a phrase across several
  // words and have the rest completed. Returns the overlap length in characters.
  function prefixOverlapLen(before, phrase) {
    const pl = (phrase || '').toLowerCase();
    const bl = (before || '').toLowerCase();
    for (let s = 0; s < bl.length; s++) {
      if (s > 0 && !/\s/.test(bl[s - 1])) continue;   // overlap must begin at a word boundary
      const tail = bl.slice(s);
      if (tail.length >= 2 && pl.startsWith(tail)) return tail.length;
    }
    return 0;
  }

  // Where insertion should start: replace the typed phrase-prefix if there is one,
  // otherwise just the partial last word (original behaviour).
  function phraseReplaceStart(before, phrase) {
    const ov = prefixOverlapLen(before, phrase);
    if (ov >= 2) return before.length - ov;
    const m = before.match(/\S+$/);
    return m ? before.length - m[0].length : before.length;
  }

  // Relevance of a phrase for the text typed before the caret (`before`, may span
  // several words). Higher = better; 0 = don't suggest.
  function scorePhrase(phrase, before) {
    const pl = phrase.toLowerCase().trimStart();
    const b  = (before || '');
    // 1) Multi-word prefix continuation: the user has started typing the phrase.
    const ov = prefixOverlapLen(b, phrase);
    if (ov >= 2) {
      if (ov >= pl.length) return 0;          // already fully typed — nothing to complete
      return 200 + Math.min(80, ov);          // longer typed prefix → higher confidence
    }
    // 2) Last-word matching (find a phrase by a word the user is typing).
    const m = b.toLowerCase().match(/\S+$/);
    const ql = m ? m[0] : '';
    if (ql.length < 2) return 0;
    if (pl.startsWith(ql)) return 150 + Math.min(20, ql.length);
    if (pl.includes(ql))  return 100 + Math.min(20, ql.length);
    return 0;
  }

  return { prefixOverlapLen, phraseReplaceStart, scorePhrase };
});
