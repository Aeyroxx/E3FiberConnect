/* ==========================================================================
   E3 Fiber Connect · dsa/strings.js
   Hand-written text helpers.

   Project rule: no toLowerCase, toUpperCase, trim, includes, indexOf, search,
   startsWith, split, replace, padStart, slice, substring or regular
   expressions. A string is read one character at a time; the only built-in
   string features used are text[i], text.length, text.charCodeAt(i) and
   String.fromCharCode(code).
   ========================================================================== */

'use strict';

/**
 * textOf — any value as text; null and undefined become "".
 * Time O(1) for strings · Space O(1)
 */
function textOf(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

/** isSpaceChar — true for a space, tab, line break or non-breaking space. O(1) */
function isSpaceChar(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ' ';
}

/** isDigitChar — true for "0" to "9". O(1) */
function isDigitChar(ch) {
  return ch >= '0' && ch <= '9';
}

/** isLetterChar — true for A–Z, a–z and accented letters such as ñ or é. O(1) */
function isLetterChar(ch) {
  const code = ch.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 192 && code !== 215 && code !== 247);
}

/**
 * toLowerText — "Juan DELA Cruz" → "juan dela cruz".
 * In the character table, capital A–Z are codes 65–90 and each small letter
 * sits 32 places later; accented capitals (À–Þ, e.g. Ñ) follow the same rule.
 * Time O(n) · Space O(n)
 */
function toLowerText(value) {
  const text = textOf(value);
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const isCapital = (code >= 65 && code <= 90) || (code >= 192 && code <= 222 && code !== 215);
    result += isCapital ? String.fromCharCode(code + 32) : text[i];
  }
  return result;
}

/**
 * toUpperText — "e3-2026-004879" → "E3-2026-004879".
 * Time O(n) · Space O(n)
 */
function toUpperText(value) {
  const text = textOf(value);
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const isSmall = (code >= 97 && code <= 122) || (code >= 224 && code <= 254 && code !== 247);
    result += isSmall ? String.fromCharCode(code - 32) : text[i];
  }
  return result;
}

/**
 * textSlice — the characters from `start` up to (not including) `end`
 * (replaces slice / substring).
 * Time O(end − start) · Space O(end − start)
 */
function textSlice(value, start, end) {
  const text = textOf(value);
  let from = start < 0 ? 0 : start;
  let to = end === undefined || end > text.length ? text.length : end;
  let result = '';
  for (let i = from; i < to; i++) {
    result += text[i];
  }
  return result;
}

/**
 * trimText — remove spaces at both ends: "  Juan  " → "Juan".
 * Walks inward from the left and from the right until a non-space is found.
 * Time O(n) · Space O(n)
 */
function trimText(value) {
  const text = textOf(value);
  let start = 0;
  let end = text.length - 1;
  while (start <= end && isSpaceChar(text[start])) {
    start++;
  }
  while (end >= start && isSpaceChar(text[end])) {
    end--;
  }
  return textSlice(text, start, end + 1);
}

/**
 * collapseSpaces — trim, then turn every run of spaces inside into one space:
 * "  Juan   Dela  Cruz " → "Juan Dela Cruz".
 * Time O(n) · Space O(n)
 */
function collapseSpaces(value) {
  const text = trimText(value);
  let result = '';
  let lastWasSpace = false;
  for (let i = 0; i < text.length; i++) {
    if (isSpaceChar(text[i])) {
      if (!lastWasSpace) {
        result += ' ';
      }
      lastWasSpace = true;
    } else {
      result += text[i];
      lastWasSpace = false;
    }
  }
  return result;
}

/**
 * textFind — position of the first `query` inside `text`, or -1 (replaces indexOf / search).
 * Naive (brute-force) string matching: try every starting position and compare
 * the characters one by one until one differs.
 * Time O(n · m) worst, n = text length, m = query length · Space O(1)
 */
function textFind(value, query) {
  const text = textOf(value);
  const pattern = textOf(query);
  const n = text.length;
  const m = pattern.length;
  if (m === 0) {
    return 0;
  }
  for (let start = 0; start <= n - m; start++) {       // 1. try every starting position in the text
    let matched = 0;
    while (matched < m && text[start + matched] === pattern[matched]) {
      matched++;                                         // 2. compare character by character
    }
    if (matched === m) {                                 // 3. every character matched → found
      return start;
    }
  }
  return -1;                                             // 4. no position matched
}

/**
 * textContains — true when `query` appears somewhere in `text` (replaces includes).
 * Time O(n · m) · Space O(1)
 */
function textContains(value, query) {
  return textFind(value, query) !== -1;
}

/**
 * textStartsWith — true when `text` begins with `prefix` (replaces startsWith).
 * Time O(m) · Space O(1)
 */
function textStartsWith(value, prefix) {
  const text = textOf(value);
  const start = textOf(prefix);
  if (start.length > text.length) {
    return false;
  }
  for (let i = 0; i < start.length; i++) {
    if (text[i] !== start[i]) {
      return false;
    }
  }
  return true;
}

/**
 * textEqualsIgnoreCase — "ADMIN@x.ph" and "admin@X.ph" are the same address.
 * Time O(n) · Space O(n)
 */
function textEqualsIgnoreCase(a, b) {
  return toLowerText(a) === toLowerText(b);
}

/**
 * padLeft — "7" → "007" (replaces padStart).
 * Time O(width) · Space O(width)
 */
function padLeft(value, width, padChar) {
  let text = textOf(value);
  const fill = padChar === undefined ? '0' : padChar;
  while (text.length < width) {
    text = fill + text;
  }
  return text;
}

/**
 * digitsOnly — keep only 0–9: "0917 555-0199" → "09175550199".
 * Time O(n) · Space O(n)
 */
function digitsOnly(value) {
  const text = textOf(value);
  let result = '';
  for (let i = 0; i < text.length; i++) {
    if (isDigitChar(text[i])) {
      result += text[i];
    }
  }
  return result;
}

/**
 * parseDigits — the whole number written in `text` from `start` to `end`:
 * parseDigits("2026-09-23", 5, 7) → 9. Returns NaN if a character is not a digit.
 * Each digit shifts the running total one place left (× 10) and adds itself.
 * Time O(end − start) · Space O(1)
 */
function parseDigits(value, start, end) {
  const text = textOf(value);
  if (end <= start || end > text.length) {
    return NaN;
  }
  let total = 0;
  for (let i = start; i < end; i++) {
    if (!isDigitChar(text[i])) {
      return NaN;
    }
    total = total * 10 + (text.charCodeAt(i) - 48);
  }
  return total;
}

/**
 * splitText — cut text at every `separator` character (replaces split).
 * "admin/applications" with "/" → ["admin", "applications"].
 * Time O(n) · Space O(n)
 */
function splitText(value, separator) {
  const text = textOf(value);
  const parts = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === separator) {
      arrayAppend(parts, current);
      current = '';
    } else {
      current += text[i];
    }
  }
  arrayAppend(parts, current);
  return parts;
}

/**
 * joinText — glue the items together with `separator` between them (replaces join).
 * Time O(total length) · Space O(total length)
 */
function joinText(items, separator) {
  let result = '';
  for (let i = 0; i < items.length; i++) {
    if (i > 0) {
      result += separator;
    }
    result += textOf(items[i]);
  }
  return result;
}
