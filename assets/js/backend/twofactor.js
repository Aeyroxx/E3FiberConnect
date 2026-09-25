/* ==========================================================================
   E3 Fiber Connect · backend/twofactor.js
   Two-step verification with Google Authenticator (or any TOTP app).

   How Google Authenticator works (RFC 6238, "TOTP"):
     1. We create a random 20-byte secret and show it as a QR code / setup key
        (Base32 text). The app stores the same secret.
     2. Every 30 seconds both sides compute
          code = HMAC-SHA1(secret, number of 30-second steps since 1970)
        and keep 6 digits of it (RFC 4226 "dynamic truncation").
     3. If the code the person types matches ours, they hold the phone.

   Everything here is written by hand — SHA-1, HMAC, Base32 — with plain
   arrays of numbers (bytes 0–255) and 32-bit bit operations. No crypto
   library, no built-in helpers.

   Account changes (passwords, adding / approving / suspending / deleting
   staff, subscriber status or plan, and undoing any of these) need a
   verified code. A correct code opens a 5-minute window ("step-up"), so
   several changes in a row don't ask again. The window belongs to the person
   signed in and ends at sign-in / sign-out. Setting the app up the first time
   asks for the account password, so a session left signed in can't be used to
   link someone else's phone.
   ========================================================================== */

'use strict';

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_SECRET_BYTES = 20;          // 160 bits, what Google Authenticator expects for SHA-1
const STEP_UP_MINUTES = 5;
const SETUP_MINUTES = 10;               // a started setup must be confirmed within 10 minutes
const OTP_MAX_ATTEMPTS = 5;
const OTP_PAUSE_MS = 30 * 1000;            // the first pause; every further one doubles (RFC 4226 §7.3)
const OTP_PAUSE_MAX_MS = 15 * 60 * 1000;
const TOTP_ISSUER = 'E3 Fiber Connect';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const twoFactorState = { stepUpStaffId: null, stepUpUntil: 0, pendingSecret: '', pendingStaffId: null, pendingUntil: 0, failures: 0, pausedUntil: 0, lockouts: 0 };

/* --------------------------------------------------------------------------
   SHA-1 (FIPS 180-4) — 20-byte digest of a byte array
   -------------------------------------------------------------------------- */

/** rotateLeft — 32-bit rotation. O(1) */
function rotateLeft(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

/**
 * sha1Bytes — the SHA-1 digest of `bytes`.
 * 1. pad: add 0x80, zeros, then the length in bits (64-bit, big-endian) → a multiple of 64 bytes;
 * 2. for every 64-byte block: expand 16 words to 80, run 80 rounds, add into h0..h4.
 * Time O(n) for n bytes · Space O(n) for the padded copy
 */
function sha1Bytes(bytes) {
  const message = [];
  for (let i = 0; i < bytes.length; i++) {
    arrayAppend(message, bytes[i]);
  }
  const bitLength = bytes.length * 8;
  arrayAppend(message, 0x80);                                   // 1. padding
  while (message.length % 64 !== 56) {
    arrayAppend(message, 0);
  }
  const high = Math.floor(bitLength / 4294967296);
  const low = bitLength >>> 0;
  const lengthWords = [high, low];
  for (let w = 0; w < 2; w++) {
    arrayAppend(message, (lengthWords[w] >>> 24) & 0xff);
    arrayAppend(message, (lengthWords[w] >>> 16) & 0xff);
    arrayAppend(message, (lengthWords[w] >>> 8) & 0xff);
    arrayAppend(message, lengthWords[w] & 0xff);
  }

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = [];
  for (let block = 0; block < message.length; block += 64) {    // 2. one 64-byte block at a time
    for (let t = 0; t < 16; t++) {
      const i = block + t * 4;
      words[t] = ((message[i] << 24) | (message[i + 1] << 16) | (message[i + 2] << 8) | message[i + 3]) >>> 0;
    }
    for (let t = 16; t < 80; t++) {
      words[t] = rotateLeft(words[t - 3] ^ words[t - 8] ^ words[t - 14] ^ words[t - 16], 1);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let t = 0; t < 80; t++) {
      let f;
      let k;
      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotateLeft(a, 5) + f + e + k + words[t]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const digest = [];
  const hs = [h0, h1, h2, h3, h4];
  for (let i = 0; i < 5; i++) {
    arrayAppend(digest, (hs[i] >>> 24) & 0xff);
    arrayAppend(digest, (hs[i] >>> 16) & 0xff);
    arrayAppend(digest, (hs[i] >>> 8) & 0xff);
    arrayAppend(digest, hs[i] & 0xff);
  }
  return digest;
}

/**
 * hmacSha1 — HMAC(key, message) = SHA1((key ⊕ opad) + SHA1((key ⊕ ipad) + message)).
 * Time O(k + n) · Space O(k + n)
 */
function hmacSha1(keyBytes, messageBytes) {
  let key = keyBytes;
  if (key.length > 64) {
    key = sha1Bytes(key);                 // long keys are hashed first
  }
  const inner = [];
  const outer = [];
  for (let i = 0; i < 64; i++) {
    const byte = i < key.length ? key[i] : 0;   // shorter keys are padded with zeros
    arrayAppend(inner, byte ^ 0x36);
    arrayAppend(outer, byte ^ 0x5c);
  }
  for (let i = 0; i < messageBytes.length; i++) {
    arrayAppend(inner, messageBytes[i]);
  }
  const innerHash = sha1Bytes(inner);
  for (let i = 0; i < innerHash.length; i++) {
    arrayAppend(outer, innerHash[i]);
  }
  return sha1Bytes(outer);
}

/* --------------------------------------------------------------------------
   Base32 (RFC 4648) — how the secret is written in the QR code / setup key
   -------------------------------------------------------------------------- */

/** base32Encode — 5 bytes become 8 letters (A–Z, 2–7). Time O(n) */
function base32Encode(bytes) {
  let text = '';
  let buffer = 0;
  let bitsInBuffer = 0;
  for (let i = 0; i < bytes.length; i++) {
    buffer = ((buffer << 8) | bytes[i]) & 0xffff;
    bitsInBuffer += 8;
    while (bitsInBuffer >= 5) {
      text += BASE32_ALPHABET[(buffer >>> (bitsInBuffer - 5)) & 31];
      bitsInBuffer -= 5;
    }
  }
  if (bitsInBuffer > 0) {
    text += BASE32_ALPHABET[(buffer << (5 - bitsInBuffer)) & 31];
  }
  return text;
}

/** base32Value — the 0–31 value of one Base32 letter, or -1 (linear search over 32 letters). O(1) */
function base32Value(ch) {
  for (let i = 0; i < BASE32_ALPHABET.length; i++) {
    if (BASE32_ALPHABET[i] === ch) {
      return i;
    }
  }
  return -1;
}

/** base32Decode — letters back to bytes; spaces, dashes and "=" are ignored. Time O(n) */
function base32Decode(text) {
  const upper = toUpperText(text);
  const bytes = [];
  let buffer = 0;
  let bitsInBuffer = 0;
  for (let i = 0; i < upper.length; i++) {
    const value = base32Value(upper[i]);
    if (value === -1) {
      continue;
    }
    buffer = ((buffer << 5) | value) & 0xffff;
    bitsInBuffer += 5;
    if (bitsInBuffer >= 8) {
      arrayAppend(bytes, (buffer >>> (bitsInBuffer - 8)) & 0xff);
      bitsInBuffer -= 8;
    }
  }
  return bytes;
}

/* --------------------------------------------------------------------------
   TOTP (RFC 6238 on top of HOTP, RFC 4226)
   -------------------------------------------------------------------------- */

/** totpStep — how many 30-second steps have passed since 1970 at time `ms`. O(1) */
function totpStep(ms) {
  return Math.floor(ms / 1000 / TOTP_PERIOD_SECONDS);
}

/** totpSecondsLeft — seconds until the code shown in the app changes. O(1) */
function totpSecondsLeft(ms) {
  return TOTP_PERIOD_SECONDS - (Math.floor(ms / 1000) % TOTP_PERIOD_SECONDS);
}

/**
 * hotpCode — the code for one counter value:
 * 1. the counter as 8 bytes (big-endian); 2. HMAC-SHA1 with the secret;
 * 3. dynamic truncation: the last 4 bits pick where 4 bytes are read;
 * 4. keep the last `digits` digits, padded with zeros.
 * Time O(1) (fixed-size SHA-1 work) · Space O(1)
 */
function hotpCode(secretBytes, counter, digits) {
  const high = Math.floor(counter / 4294967296);
  const low = counter >>> 0;
  const counterBytes = [
    (high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff,
    (low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff,
  ];
  const hash = hmacSha1(secretBytes, counterBytes);
  const offset = hash[hash.length - 1] & 0x0f;
  const binary = ((hash[offset] & 0x7f) * 16777216) + (hash[offset + 1] << 16) + (hash[offset + 2] << 8) + hash[offset + 3];
  let modulo = 1;
  for (let i = 0; i < digits; i++) {
    modulo *= 10;
  }
  return padLeft(binary % modulo, digits, '0');
}

/** totpCode — the 6-digit code for a Base32 secret at a given 30-second step. O(1) */
function totpCode(secretBase32, step) {
  return hotpCode(base32Decode(secretBase32), step, TOTP_DIGITS);
}

/**
 * matchTotp — which step (now, 30 s before or 30 s after — clocks drift) the
 * code belongs to, or -1. Steps not newer than `lastStep` are refused, so a
 * code can only be used once. Time O(1) (3 tries)
 */
function matchTotp(secretBase32, code, ms, lastStep) {
  const secret = base32Decode(secretBase32);
  const now = totpStep(ms);
  const tries = [now, now - 1, now + 1];
  for (let i = 0; i < tries.length; i++) {
    if (tries[i] > lastStep && hotpCode(secret, tries[i], TOTP_DIGITS) === code) {
      return tries[i];
    }
  }
  return -1;
}

/* --------------------------------------------------------------------------
   Setup: secret, setup key and the otpauth:// link for the QR code
   -------------------------------------------------------------------------- */

/** randomBytes — `count` random bytes from the browser's secure random source when it exists. O(count) */
function randomBytes(count) {
  const bytes = [];
  const secure = typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function';
  if (secure) {
    const buffer = new Uint8Array(count);
    crypto.getRandomValues(buffer);
    for (let i = 0; i < count; i++) {
      arrayAppend(bytes, buffer[i]);
    }
  } else {
    for (let i = 0; i < count; i++) {
      arrayAppend(bytes, Math.floor(Math.random() * 256));
    }
  }
  return bytes;
}

/** formatSetupKey — "ABCD EFGH IJKL …" for typing into the app by hand. O(n) */
function formatSetupKey(secretBase32) {
  let text = '';
  for (let i = 0; i < secretBase32.length; i++) {
    if (i > 0 && i % 4 === 0) {
      text += ' ';
    }
    text += secretBase32[i];
  }
  return text;
}

/** percentEncode — URL-encode text for the otpauth link (letters, digits and - . _ ~ stay). O(n) */
function percentEncode(text) {
  const hex = '0123456789ABCDEF';
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = text.charCodeAt(i);
    const safe = isLetterChar(ch) || isDigitChar(ch) || ch === '-' || ch === '.' || ch === '_' || ch === '~';
    out += safe ? ch : '%' + hex[(code >>> 4) & 15] + hex[code & 15];
  }
  return out;
}

/** otpauthUri — the link inside the QR code; Google Authenticator reads it when scanning. O(n) */
function otpauthUri(email, secretBase32) {
  return 'otpauth://totp/' + percentEncode(TOTP_ISSUER) + ':' + percentEncode(email)
    + '?secret=' + secretBase32 + '&issuer=' + percentEncode(TOTP_ISSUER)
    + '&algorithm=SHA1&digits=' + TOTP_DIGITS + '&period=' + TOTP_PERIOD_SECONDS;
}

/**
 * startTotpSetup — a new secret for the signed-in member. It is only kept as
 * "pending" until they prove the app shows the right code (confirmTotpSetup).
 * Whoever is at the keyboard must prove it is the account's owner first:
 *   • always          → the account password (someone using a session left
 *                       signed in can't link their own phone);
 *   • new phone       → also a code from the current app in the last 5 minutes.
 * A wrong password counts toward the same 5-tries pause as a wrong code.
 * The new secret must be confirmed within SETUP_MINUTES.
 * Time O(r · n) for the password hash · Space O(1)
 */
function startTotpSetup(member, password) {
  if (!member || member.id !== authState.staffId) {
    return { ok: false, error: 'Please sign in again.' };
  }
  if (member.totpEnabled) {
    const stepUp = stepUpRequired();
    if (stepUp) {
      return stepUp;
    }
  }
  const now = Date.now();
  if (twoFactorState.pausedUntil > now) {
    return { ok: false, error: 'Too many wrong tries. Try again in ' + pauseLengthText(twoFactorState.pausedUntil - now) + '.' };
  }
  if (!staffPasswordMatches(member, password || '')) {
    const failed = otpFailed('tries');
    return { ok: false, error: twoFactorState.pausedUntil > now ? failed.error : 'That isn’t your password.' };
  }
  const secret = base32Encode(randomBytes(TOTP_SECRET_BYTES));
  twoFactorState.pendingSecret = secret;
  twoFactorState.pendingStaffId = member.id;
  twoFactorState.pendingUntil = now + SETUP_MINUTES * 60 * 1000;
  return { ok: true, secret: secret, key: formatSetupKey(secret), uri: otpauthUri(member.email, secret) };
}

/** clearPendingSetup — forget a setup that was finished, cancelled or ran out of time. O(1) */
function clearPendingSetup() {
  twoFactorState.pendingSecret = '';
  twoFactorState.pendingStaffId = null;
  twoFactorState.pendingUntil = 0;
}

/* --------------------------------------------------------------------------
   Checking a code, the 5-minute window, and turning 2FA on / off
   -------------------------------------------------------------------------- */

/** isSixDigits — exactly 6 digits. O(1) */
function isSixDigits(code) {
  if (code.length !== TOTP_DIGITS) {
    return false;
  }
  for (let i = 0; i < code.length; i++) {
    if (!isDigitChar(code[i])) {
      return false;
    }
  }
  return true;
}

/**
 * checkOtpAttempt — shared checks before comparing a code: paused after 5
 * wrong codes? six digits? Returns an error text or ''. O(1)
 */
function checkOtpAttempt(code) {
  const now = Date.now();
  if (twoFactorState.pausedUntil > now) {
    return 'Too many wrong codes. Try again in ' + pauseLengthText(twoFactorState.pausedUntil - now) + '.';
  }
  if (!isSixDigits(code)) {
    return 'Enter the 6-digit code from Google Authenticator.';
  }
  return '';
}

/** pauseLengthText — "30 seconds", "2 minutes" (rounded up). O(1) */
function pauseLengthText(ms) {
  const seconds = Math.ceil(ms / 1000);
  return seconds < 60 ? pluralize(seconds, 'second') : pluralize(Math.ceil(seconds / 60), 'minute');
}

/**
 * otpFailed — count a wrong code. The 5th in a row pauses code entry: 30 s the
 * first time, then 1, 2, 4, 8 … minutes (at most 15) until a code is right,
 * so guessing all 1,000,000 codes stays out of reach. O(1)
 */
function otpFailed(kind) {
  twoFactorState.failures = twoFactorState.failures + 1;
  if (twoFactorState.failures >= OTP_MAX_ATTEMPTS) {
    let pause = OTP_PAUSE_MS;
    for (let i = 0; i < twoFactorState.lockouts && pause < OTP_PAUSE_MAX_MS; i++) {
      pause = pause * 2;
    }
    if (pause > OTP_PAUSE_MAX_MS) {
      pause = OTP_PAUSE_MAX_MS;
    }
    twoFactorState.failures = 0;
    twoFactorState.lockouts = twoFactorState.lockouts + 1;
    twoFactorState.pausedUntil = Date.now() + pause;
    return { ok: false, error: 'Too many wrong ' + (kind || 'codes') + '. Please wait ' + pauseLengthText(pause) + ' before trying again.' };
  }
  return { ok: false, error: 'That code isn’t right. Check the app and try the current code.' };
}

/** grantStepUp — open the 5-minute window for the signed-in member. O(1) */
function grantStepUp(member) {
  twoFactorState.failures = 0;
  twoFactorState.lockouts = 0;
  twoFactorState.stepUpStaffId = member.id;
  twoFactorState.stepUpUntil = Date.now() + STEP_UP_MINUTES * 60 * 1000;
}

/** endStepUp — close the window (sign-in, sign-out). O(1) */
function endStepUp() {
  twoFactorState.stepUpStaffId = null;
  twoFactorState.stepUpUntil = 0;
  clearPendingSetup();
}

/** stepUpActive — has the person signed in verified a code in the last 5 minutes? O(1) */
function stepUpActive() {
  return authState.staffId !== null && twoFactorState.stepUpStaffId === authState.staffId && twoFactorState.stepUpUntil > Date.now();
}

/** stepUpRequired — the error every account change returns until a code is verified, or null. O(1) */
function stepUpRequired() {
  if (stepUpActive()) {
    return null;
  }
  return { ok: false, needsStepUp: true, error: 'For your security, confirm it’s you with the code from Google Authenticator first.', errors: {} };
}

/**
 * confirmTotpSetup — the first code from the app proves it has the secret:
 * 1. checks (pause, six digits, a setup in progress for this member; replacing
 *    a working authenticator also needs the 5-minute window);
 * 2. compare with the pending secret (now ± 30 s);
 * 3. save the secret on the staff record, turn 2FA on, open the 5-minute window.
 * Time O(1)
 */
function confirmTotpSetup(member, code) {
  if (member.totpEnabled) {
    const stepUp = stepUpRequired();
    if (stepUp) {
      return stepUp;
    }
  }
  const problem = checkOtpAttempt(code);
  if (problem) {
    return { ok: false, error: problem };
  }
  if (twoFactorState.pendingStaffId !== member.id || twoFactorState.pendingSecret === '' || twoFactorState.pendingUntil < Date.now()) {
    clearPendingSetup();
    return { ok: false, error: 'Start the setup again.' };
  }
  const step = matchTotp(twoFactorState.pendingSecret, code, Date.now(), -1);
  if (step === -1) {
    return otpFailed();
  }
  member.totpSecret = twoFactorState.pendingSecret;
  member.totpEnabled = true;
  member.totpEnabledAt = nowISO();
  member.totpLastStep = step;
  clearPendingSetup();
  grantStepUp(member);
  logActivity('staff', member.fullName + ' turned on two-step verification (Google Authenticator)', member.fullName);
  markDataChanged();
  return { ok: true };
}

/**
 * verifyStepUp — check a code from the app and open the 5-minute window.
 * A code that was already used is refused (it must be newer than totpLastStep).
 * Time O(1)
 */
function verifyStepUp(member, code) {
  if (!member.totpEnabled) {
    return { ok: false, error: 'Set up Google Authenticator first.' };
  }
  const problem = checkOtpAttempt(code);
  if (problem) {
    return { ok: false, error: problem };
  }
  const step = matchTotp(member.totpSecret, code, Date.now(), member.totpLastStep);
  if (step === -1) {
    if (matchTotp(member.totpSecret, code, Date.now(), -1) !== -1) {
      return { ok: false, error: 'That code was already used. Wait for the next one in the app.' };
    }
    return otpFailed();
  }
  member.totpLastStep = step;
  grantStepUp(member);
  return { ok: true };
}

/** stepUpMinutesLeft — whole minutes left in the window (for the Account page). O(1) */
function stepUpMinutesLeft() {
  return stepUpActive() ? Math.ceil((twoFactorState.stepUpUntil - Date.now()) / 60000) : 0;
}
