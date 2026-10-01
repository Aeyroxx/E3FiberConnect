/* ==========================================================================
   E3 Fiber Connect - dsa/strings.js
   Mga helper para sa text, gawa namin lahat.

   Rule ng project: bawal ang toLowerCase, toUpperCase, trim, includes, indexOf,
   search, startsWith, split, replace, padStart, slice, substring at regular
   expressions. Binabasa namin yung string isa-isang character; ang ginamit lang
   na built-in string features ay text[i], text.length, text.charCodeAt(i) at
   String.fromCharCode(code).
   ========================================================================== */

'use strict';

/**
 * textOf - gawing text kahit anong value; pag null o undefined, "" ang balik.
 * Time: O(1) para sa strings, Space: O(1)
 */
function textOf(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

/** isSpaceChar - true kung space, tab, line break o non-breaking space. O(1) */
function isSpaceChar(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ' ';
}

/** isDigitChar - true kung "0" hanggang "9". O(1) */
function isDigitChar(ch) {
  return ch >= '0' && ch <= '9';
}

/** isLetterChar - true sa A-Z, a-z at mga letrang may accent tulad ng ñ o é. O(1) */
function isLetterChar(ch) {
  const code = ch.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 192 && code !== 215 && code !== 247);
}

/**
 * toLowerText - "Juan DELA Cruz" -> "juan dela cruz".
 * Sa character table, yung capital A-Z ay codes 65-90 at yung small letter nila
 * ay 32 places later. Ganun din yung mga capital na may accent (À-Þ, e.g. Ñ).
 * Time: O(n), Space: O(n)
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
 * toUpperText - "e3-2026-004879" -> "E3-2026-004879".
 * Time: O(n), Space: O(n)
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
 * textSlice - yung mga character mula `start` hanggang bago mag-`end`
 * (kapalit ng slice / substring).
 * Time: O(n), Space: O(n)
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
 * trimText - tanggalin yung spaces sa magkabilang dulo: "  Juan  " -> "Juan".
 * Lalakad papasok galing kaliwa at galing kanan hanggang may makitang hindi space.
 * Time: O(n), Space: O(n)
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
 * collapseSpaces - i-trim muna, tapos gawing isang space lang yung sunod-sunod na spaces sa loob:
 * "  Juan   Dela  Cruz " -> "Juan Dela Cruz".
 * Time: O(n), Space: O(n)
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
 * textFind - position ng unang `query` sa loob ng `text`, o -1 (kapalit ng indexOf / search).
 * Naive (brute-force) string matching: susubukan bawat starting position tapos
 * ikukumpara isa-isa yung characters hanggang may hindi magtugma.
 * Time: O(n²) worst - bawat start position sa text × bawat character ng query, Space: O(1)
 */
function textFind(value, query) {
  const text = textOf(value);
  const pattern = textOf(query);
  const n = text.length;
  const m = pattern.length;
  if (m === 0) {
    return 0;
  }
  for (let start = 0; start <= n - m; start++) {       // 1. subukan lahat ng starting position sa text
    let matched = 0;
    while (matched < m && text[start + matched] === pattern[matched]) {
      matched++;                                         // 2. ikumpara per character
    }
    if (matched === m) {                                 // 3. tugma lahat ng character -> found
      return start;
    }
  }
  return -1;                                             // 4. walang tumugmang position
}

/**
 * textContains - true kung meron `query` kahit saan sa `text` (kapalit ng includes).
 * Time: O(n²), Space: O(1)
 */
function textContains(value, query) {
  return textFind(value, query) !== -1;
}

/**
 * textStartsWith - true kung nagsisimula yung `text` sa `prefix` (kapalit ng startsWith).
 * Time: O(n), Space: O(1)
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
 * textEqualsIgnoreCase - para pareho lang ang "ADMIN@x.ph" at "admin@X.ph".
 * Time: O(n), Space: O(n)
 */
function textEqualsIgnoreCase(a, b) {
  return toLowerText(a) === toLowerText(b);
}

/**
 * padLeft - "7" -> "007" (kapalit ng padStart).
 * Time: O(n), Space: O(n)
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
 * digitsOnly - 0-9 lang ang itinitira: "0917 555-0199" -> "09175550199".
 * Time: O(n), Space: O(n)
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
 * parseDigits - yung buong number na nakasulat sa `text` mula `start` hanggang `end`:
 * parseDigits("2026-09-23", 5, 7) -> 9. NaN ang balik kapag may character na hindi digit.
 * Bawat digit, iuusog yung total ng isang place pakaliwa (× 10) tapos idadagdag yung digit.
 * Time: O(n), Space: O(1)
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
 * splitText - hatiin yung text sa bawat `separator` na character (kapalit ng split).
 * "admin/applications" gamit "/" -> ["admin", "applications"].
 * Time: O(n), Space: O(n)
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
 * joinText - pagdugtungin yung items na may `separator` sa pagitan (kapalit ng join).
 * Time: O(n), Space: O(n)
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
