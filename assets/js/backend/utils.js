/* ==========================================================================
   E3 Fiber Connect · backend/utils.js
   Dates, money, text formatting, validation, ids and safe HTML.

   Everything is hand-written with the helpers from dsa/strings.js — no
   toLocaleString, no regular expressions, no Date arithmetic. `new Date()` is
   used in exactly one place (readClock) to read the computer's clock; every
   calculation after that works on plain numbers and "YYYY-MM-DD" text.
   ========================================================================== */

'use strict';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* --------------------------------------------------------------------------
   Clock
   -------------------------------------------------------------------------- */

/** readClock — the computer's local date and time as a plain record. O(1) */
function readClock() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    second: now.getSeconds(),
  };
}

/** pad2 — 7 → "07". O(1) */
function pad2(number) {
  return padLeft(number, 2, '0');
}

/** isoDate — (2026, 9, 3) → "2026-09-03". O(1) */
function isoDate(year, month, day) {
  return padLeft(year, 4, '0') + '-' + pad2(month) + '-' + pad2(day);
}

/** todayISO — today's date, e.g. "2026-09-23". O(1) */
function todayISO() {
  const clock = readClock();
  return isoDate(clock.year, clock.month, clock.day);
}

/** nowISO — the current date and time, e.g. "2026-09-23T08:42:05". O(1) */
function nowISO() {
  const clock = readClock();
  return isoDate(clock.year, clock.month, clock.day) + 'T' + pad2(clock.hour) + ':' + pad2(clock.minute) + ':' + pad2(clock.second);
}

/* --------------------------------------------------------------------------
   Calendar maths (days-from-civil, Howard Hinnant's algorithm)
   A date becomes one whole number — days since 1970-01-01 — so adding days or
   counting the days between two dates is simple integer arithmetic.
   -------------------------------------------------------------------------- */

/** isLeapYear — 2028 → true, 2100 → false. O(1) */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** daysInMonth — (2026, 2) → 28. O(1) */
function daysInMonth(year, month) {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1];
}

/**
 * daysFromCivil — days from 1970-01-01 to year-month-day (negative before 1970).
 * Counts from March so that the leap day is the last day of the "year".
 * Time O(1) · Space O(1)
 */
function daysFromCivil(year, month, day) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const monthFromMarch = month > 2 ? month - 3 : month + 9;
  const dayOfYear = Math.floor((153 * monthFromMarch + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/**
 * civilFromDays — the reverse of daysFromCivil: a day number back to {year, month, day}.
 * Time O(1) · Space O(1)
 */
function civilFromDays(dayNumber) {
  const days = dayNumber + 719468;
  const era = Math.floor(days / 146097);
  const dayOfEra = days - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthFromMarch = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthFromMarch + 2) / 5) + 1;
  const month = monthFromMarch < 10 ? monthFromMarch + 3 : monthFromMarch - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  return { year: year, month: month, day: day };
}

/**
 * parseISODate — "2026-09-23" or "2026-09-23T08:42:00" → {year, month, day, hour, minute}.
 * Time O(1) · Space O(1)
 */
function parseISODate(iso) {
  const text = textOf(iso);
  const hasTime = text.length >= 16;
  return {
    year: parseDigits(text, 0, 4),
    month: parseDigits(text, 5, 7),
    day: parseDigits(text, 8, 10),
    hour: hasTime ? parseDigits(text, 11, 13) : 0,
    minute: hasTime ? parseDigits(text, 14, 16) : 0,
  };
}

/**
 * isValidISODate — true for a real calendar date written as "YYYY-MM-DD".
 * Time O(1) · Space O(1)
 */
function isValidISODate(value) {
  const text = textOf(value);
  if (text.length !== 10 || text[4] !== '-' || text[7] !== '-') {
    return false;
  }
  const parts = parseISODate(text);
  if (!(parts.year >= 1900 && parts.year <= 2200) || !(parts.month >= 1 && parts.month <= 12)) {
    return false;
  }
  return parts.day >= 1 && parts.day <= daysInMonth(parts.year, parts.month);
}

/** datePart — "2026-09-23T08:42:00" → "2026-09-23". O(1) */
function datePart(iso) {
  return textSlice(iso, 0, 10);
}

/** isoToDayNumber — "1970-01-02" → 1. O(1) */
function isoToDayNumber(iso) {
  const parts = parseISODate(iso);
  return daysFromCivil(parts.year, parts.month, parts.day);
}

/** dayNumberToISO — 1 → "1970-01-02". O(1) */
function dayNumberToISO(dayNumber) {
  const date = civilFromDays(dayNumber);
  return isoDate(date.year, date.month, date.day);
}

/** addDaysISO — ("2026-09-23", 10) → "2026-10-03". O(1) */
function addDaysISO(iso, days) {
  return dayNumberToISO(isoToDayNumber(iso) + days);
}

/** daysBetweenISO — whole days from `from` to `to` (negative when `to` is earlier). O(1) */
function daysBetweenISO(from, to) {
  return isoToDayNumber(to) - isoToDayNumber(from);
}

/** addMonths — (2026, 12, 1) → {year: 2027, month: 1}. O(1) */
function addMonths(year, month, delta) {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12 + 12) % 12 + 1 };
}

/** weekdayIndex — 0 = Sunday … 6 = Saturday (1970-01-01 was a Thursday). O(1) */
function weekdayIndex(iso) {
  const n = isoToDayNumber(iso);
  return ((n % 7) + 7 + 4) % 7;
}

/** minuteStamp — minutes since 1970-01-01 00:00 for a date-time text. O(1) */
function minuteStamp(isoDateTime) {
  const parts = parseISODate(isoDateTime);
  return daysFromCivil(parts.year, parts.month, parts.day) * 1440 + parts.hour * 60 + parts.minute;
}

/** nowMinuteStamp — minuteStamp for this moment. O(1) */
function nowMinuteStamp() {
  const clock = readClock();
  return daysFromCivil(clock.year, clock.month, clock.day) * 1440 + clock.hour * 60 + clock.minute;
}

/** minutesAgoISO — the date-time `minutes` before now, e.g. for sample data. O(1) */
function minutesAgoISO(minutes) {
  const stamp = nowMinuteStamp() - minutes;
  const dayNumber = Math.floor(stamp / 1440);
  const rest = stamp - dayNumber * 1440;
  return dayNumberToISO(dayNumber) + 'T' + pad2(Math.floor(rest / 60)) + ':' + pad2(rest % 60) + ':00';
}

/** atTime — ("2026-09-23", 14, 5) → "2026-09-23T14:05:00". O(1) */
function atTime(iso, hour, minute) {
  return datePart(iso) + 'T' + pad2(hour) + ':' + pad2(minute) + ':00';
}

/**
 * ageOn — completed years between a birth date and another date.
 * Time O(1) · Space O(1)
 */
function ageOn(birthISO, onISO) {
  const birth = parseISODate(birthISO);
  const on = parseISODate(onISO);
  let age = on.year - birth.year;
  if (on.month < birth.month || (on.month === birth.month && on.day < birth.day)) {
    age = age - 1;
  }
  return age;
}

/* --------------------------------------------------------------------------
   Formatting for display
   -------------------------------------------------------------------------- */

/** formatDate — "2026-09-23" → "Sep 23, 2026". O(1) */
function formatDate(iso) {
  if (!iso) {
    return '—';
  }
  const parts = parseISODate(iso);
  return MONTH_SHORT[parts.month - 1] + ' ' + parts.day + ', ' + parts.year;
}

/** formatShortDate — "2026-09-23" → "Sep 23". O(1) */
function formatShortDate(iso) {
  const parts = parseISODate(iso);
  return MONTH_SHORT[parts.month - 1] + ' ' + parts.day;
}

/** formatLongDate — "2026-09-23" → "Wednesday, September 23". O(1) */
function formatLongDate(iso) {
  const parts = parseISODate(iso);
  return WEEKDAY_NAMES[weekdayIndex(iso)] + ', ' + MONTH_NAMES[parts.month - 1] + ' ' + parts.day;
}

/** formatTime — "2026-09-23T14:05:00" → "2:05 PM". O(1) */
function formatTime(isoDateTime) {
  const parts = parseISODate(isoDateTime);
  const suffix = parts.hour < 12 ? 'AM' : 'PM';
  let hour = parts.hour % 12;
  if (hour === 0) {
    hour = 12;
  }
  return hour + ':' + pad2(parts.minute) + ' ' + suffix;
}

/** formatDateTime — "2026-09-23T14:05:00" → "Sep 23, 2026 at 2:05 PM". O(1) */
function formatDateTime(isoDateTime) {
  if (!isoDateTime) {
    return '—';
  }
  return formatDate(isoDateTime) + ' at ' + formatTime(isoDateTime);
}

/** formatMonthYear — (2026, 9) → "September 2026". O(1) */
function formatMonthYear(year, month) {
  return MONTH_NAMES[month - 1] + ' ' + year;
}

/** formatPeriod — ("2026-09-15", "2026-10-14") → "Sep 15 – Oct 14". O(1) */
function formatPeriod(startISO, endISO) {
  return formatShortDate(startISO) + ' – ' + formatShortDate(endISO);
}

/** formatTimeAgo — "Just now", "12 min ago", "3 hr ago", "Yesterday", "4 days ago", "Sep 2, 2026". O(1) */
function formatTimeAgo(isoDateTime) {
  const minutes = nowMinuteStamp() - minuteStamp(isoDateTime);
  if (minutes < 1) {
    return 'Just now';
  }
  if (minutes < 60) {
    return minutes + ' min ago';
  }
  if (minutes < 1440 && datePart(isoDateTime) === todayISO()) {
    return Math.floor(minutes / 60) + ' hr ago';
  }
  const days = daysBetweenISO(datePart(isoDateTime), todayISO());
  if (days <= 1) {
    return 'Yesterday';
  }
  if (days < 7) {
    return days + ' days ago';
  }
  return formatDate(isoDateTime);
}

/** formatTimeAgoInline — formatTimeAgo for the middle of a sentence ("sent just now"). O(1) */
function formatTimeAgoInline(isoDateTime) {
  const text = formatTimeAgo(isoDateTime);
  if (text === 'Just now') {
    return 'just now';
  }
  if (text === 'Yesterday') {
    return 'yesterday';
  }
  return text;
}

/** formatDayDistance — +3 → "in 3 days", 0 → "today", −1 → "yesterday". O(1) */
function formatDayDistance(days) {
  if (days === 0) {
    return 'today';
  }
  if (days === 1) {
    return 'tomorrow';
  }
  if (days === -1) {
    return 'yesterday';
  }
  return days > 0 ? 'in ' + days + ' days' : (-days) + ' days ago';
}

/**
 * formatNumber — 1200 → "1,200". Walks the digits from the right and puts a
 * comma before every group of three.
 * Time O(d) for d digits · Space O(d)
 */
function formatNumber(value) {
  const rounded = Math.round(Number(value) || 0);
  const negative = rounded < 0;
  const digits = String(negative ? -rounded : rounded);
  let result = '';
  let count = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    result = digits[i] + result;
    count++;
    if (count % 3 === 0 && i > 0) {
      result = ',' + result;
    }
  }
  return negative ? '-' + result : result;
}

/** formatPeso — 1200 → "₱1,200". O(d) */
function formatPeso(value) {
  return '₱' + formatNumber(value);
}

/** pluralize — (1, "bill") → "1 bill", (3, "bill") → "3 bills". O(1) */
function pluralize(count, singular, plural) {
  return formatNumber(count) + ' ' + (count === 1 ? singular : (plural || singular + 's'));
}

/** formatOrdinal — 1 → "1st", 2 → "2nd", 13 → "13th", 23 → "23rd". O(1) */
function formatOrdinal(number) {
  const lastTwo = number % 100;
  const last = number % 10;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return number + 'th';
  }
  if (last === 1) {
    return number + 'st';
  }
  if (last === 2) {
    return number + 'nd';
  }
  if (last === 3) {
    return number + 'rd';
  }
  return number + 'th';
}

/** percentOf — (2200, 6400) → 34. O(1) */
function percentOf(part, whole) {
  if (!whole) {
    return 0;
  }
  return Math.round((part / whole) * 100);
}

/* --------------------------------------------------------------------------
   Text helpers for people
   -------------------------------------------------------------------------- */

/**
 * escapeHTML — make any text safe to place inside innerHTML: & < > " ' become
 * entities, so typed text can never become markup (prevents XSS).
 * Time O(n) · Space O(n)
 */
function escapeHTML(value) {
  const text = textOf(value);
  let safe = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '&') {
      safe += '&amp;';
    } else if (ch === '<') {
      safe += '&lt;';
    } else if (ch === '>') {
      safe += '&gt;';
    } else if (ch === '"') {
      safe += '&quot;';
    } else if (ch === "'") {
      safe += '&#39;';
    } else {
      safe += ch;
    }
  }
  return safe;
}

/** firstNameOf — "Juan Dela Cruz" → "Juan". O(n) */
function firstNameOf(name) {
  return splitText(collapseSpaces(name), ' ')[0];
}

/** initialsOf — "Juan Dela Cruz" → "JC" (first and last word). O(n) */
function initialsOf(name) {
  const words = splitText(collapseSpaces(name), ' ');
  if (words[0] === '') {
    return '?';
  }
  const first = toUpperText(words[0][0]);
  if (words.length === 1) {
    return first;
  }
  return first + toUpperText(words[words.length - 1][0]);
}

/** maskName — "Juan Dela Cruz" → "Juan D. C." (privacy on the public tracker). O(n) */
function maskName(name) {
  const words = splitText(collapseSpaces(name), ' ');
  let masked = words[0];
  for (let i = 1; i < words.length; i++) {
    masked += ' ' + toUpperText(words[i][0]) + '.';
  }
  return masked;
}

/** maskMobile — "0917 555 0199" → "0917 ••• 0199". O(n) */
function maskMobile(mobile) {
  const digits = digitsOnly(mobile);
  if (digits.length < 8) {
    return '•••';
  }
  return textSlice(digits, 0, 4) + ' ••• ' + textSlice(digits, digits.length - 4);
}

/** maskEmail — "juan.cruz@gmail.com" → "j•••@gmail.com". O(n) */
function maskEmail(email) {
  const text = textOf(email);
  const at = textFind(text, '@');
  if (at < 1) {
    return '•••';
  }
  return text[0] + '•••' + textSlice(text, at);
}

/* --------------------------------------------------------------------------
   Validation — written without regular expressions
   -------------------------------------------------------------------------- */

/**
 * isValidEmail — one "@", a non-empty name before it, and a domain with a dot
 * and a top-level part of at least 2 letters: "juan@gmail.com".
 * Time O(n) · Space O(1)
 */
function isValidEmail(value) {
  const email = trimText(value);
  if (email.length < 6 || email.length > 254) {
    return false;
  }
  let at = -1;
  for (let i = 0; i < email.length; i++) {
    const ch = email[i];
    if (ch === '@') {
      if (at !== -1) {
        return false;
      }
      at = i;
    } else if (!(isLetterChar(ch) || isDigitChar(ch) || ch === '.' || ch === '_' || ch === '-' || ch === '+' || ch === '%')) {
      return false;
    }
  }
  if (at < 1 || email[0] === '.' || email[at - 1] === '.') {
    return false;
  }
  let lastDot = -1;
  for (let i = at + 1; i < email.length; i++) {
    if (email[i] === '.') {
      if (i === at + 1 || email[i - 1] === '.') {
        return false;
      }
      lastDot = i;
    } else if (!(isLetterChar(email[i]) || isDigitChar(email[i]) || email[i] === '-')) {
      return false;
    }
  }
  return lastDot !== -1 && email.length - lastDot - 1 >= 2;
}

/**
 * normalizeMobile — a Philippine mobile number in the form "0917 555 0199",
 * or "" when invalid. Accepts spaces, dashes, brackets and the +63 prefix.
 * Time O(n) · Space O(n)
 */
function normalizeMobile(value) {
  const text = trimText(value);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!(isDigitChar(ch) || ch === ' ' || ch === '-' || ch === '+' || ch === '(' || ch === ')')) {
      return '';
    }
  }
  let digits = digitsOnly(text);
  if (digits.length === 12 && textStartsWith(digits, '63')) {
    digits = '0' + textSlice(digits, 2);
  } else if (digits.length === 10 && digits[0] === '9') {
    digits = '0' + digits;
  }
  if (digits.length !== 11 || !textStartsWith(digits, '09')) {
    return '';
  }
  return textSlice(digits, 0, 4) + ' ' + textSlice(digits, 4, 7) + ' ' + textSlice(digits, 7, 11);
}

/** isValidMobile — true for an 11-digit number starting with 09. O(n) */
function isValidMobile(value) {
  return normalizeMobile(value) !== '';
}

/**
 * normalizeReference — " e3-2026-004879 " → "E3-2026-004879" (spaces removed, capitals).
 * Time O(n) · Space O(n)
 */
function normalizeReference(value) {
  const upper = toUpperText(value);
  let result = '';
  for (let i = 0; i < upper.length; i++) {
    if (!isSpaceChar(upper[i])) {
      result += upper[i];
    }
  }
  return result;
}

/**
 * hasCodeShape — checks text against a shape like "E3-####-######"
 * ("#" = any digit, anything else must match exactly).
 * Time O(n) · Space O(1)
 */
function hasCodeShape(value, shape) {
  const text = textOf(value);
  if (text.length !== shape.length) {
    return false;
  }
  for (let i = 0; i < shape.length; i++) {
    if (shape[i] === '#') {
      if (!isDigitChar(text[i])) {
        return false;
      }
    } else if (text[i] !== shape[i]) {
      return false;
    }
  }
  return true;
}

/** isValidReference — "E3-2026-004879". O(1) */
function isValidReference(value) {
  return hasCodeShape(value, 'E3-####-######');
}

/** isValidTicketNo — "TKT-000101". O(1) */
function isValidTicketNo(value) {
  return hasCodeShape(value, 'TKT-######');
}

/**
 * isStrongPassword — at least 8 characters with a letter and a digit.
 * Time O(n) · Space O(1)
 */
function isStrongPassword(value) {
  const text = textOf(value);
  let hasLetter = false;
  let hasDigit = false;
  for (let i = 0; i < text.length; i++) {
    if (isLetterChar(text[i])) {
      hasLetter = true;
    } else if (isDigitChar(text[i])) {
      hasDigit = true;
    }
  }
  return text.length >= 8 && hasLetter && hasDigit;
}

/** isBlank — true for "", "   ", null or undefined. O(n) */
function isBlank(value) {
  return trimText(value) === '';
}

/** hasAnyErrors — true when an errors record has at least one message. O(k) */
function hasAnyErrors(errors) {
  for (const field in errors) {
    if (errors[field]) {
      return true;
    }
  }
  return false;
}

/* --------------------------------------------------------------------------
   Ids
   -------------------------------------------------------------------------- */

/** formatReferenceNo — (2026, 4887) → "E3-2026-004887". O(1) */
function formatReferenceNo(year, counter) {
  return 'E3-' + year + '-' + padLeft(counter, 6, '0');
}

/** makeBillId — (2026, 9, "E3-2026-004872") → "BILL-202609-004872". O(1) */
function makeBillId(year, month, accountNo) {
  const account = textOf(accountNo);
  return 'BILL-' + year + pad2(month) + '-' + textSlice(account, account.length - 6);
}

/** formatTicketNo — 103 → "TKT-000103". O(1) */
function formatTicketNo(counter) {
  return 'TKT-' + padLeft(counter, 6, '0');
}

/** formatPaymentId — 3 → "PAY-000003". O(1) */
function formatPaymentId(counter) {
  return 'PAY-' + padLeft(counter, 6, '0');
}

/** formatStaffId — 6 → "STF-0006". O(1) */
function formatStaffId(counter) {
  return 'STF-' + padLeft(counter, 4, '0');
}

/** formatRegistrationId — 3 → "REG-000003". O(1) */
function formatRegistrationId(counter) {
  return 'REG-' + padLeft(counter, 6, '0');
}

/* --------------------------------------------------------------------------
   Randomness and the demo password hash
   -------------------------------------------------------------------------- */

/**
 * randomIndex — a random whole number from 0 to max − 1, using the browser's
 * cryptographic random generator when it is available.
 * Time O(1) · Space O(1)
 */
function randomIndex(max) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buffer = new Uint32Array(1); // typed array required by the Web Crypto API
    crypto.getRandomValues(buffer);
    return buffer[0] % max;
  }
  return Math.floor(Math.random() * max);
}

/** toHex32 — 255 → "000000ff". O(1) */
function toHex32(number) {
  const digits = '0123456789abcdef';
  let value = number >>> 0;
  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex = digits[value % 16] + hex;
    value = Math.floor(value / 16);
  }
  return hex;
}

/**
 * hashPassword — FNV-1a, a simple hash, repeated 400 times over salt + password.
 * DEMO ONLY: it keeps plain-text passwords out of the staff table, but it is NOT
 * a secure password hash. A real system checks passwords on a server with a
 * slow algorithm such as bcrypt or Argon2.
 * Time O(r · n), r rounds · Space O(1)
 */
function hashPassword(password, salt) {
  const text = textOf(salt) + ':' + textOf(password);
  let hash = 2166136261;
  for (let round = 0; round < 400; round++) {
    for (let i = 0; i < text.length; i++) {
      hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
    }
    hash = Math.imul(hash ^ round, 16777619) >>> 0;
  }
  return toHex32(hash);
}
