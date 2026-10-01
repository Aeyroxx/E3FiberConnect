/* ==========================================================================
   E3 Fiber Connect - backend/twofactor.js
   Two-step verification gamit Google Authenticator (o kahit anong TOTP app).

   Paano gumagana yung Google Authenticator (RFC 6238, "TOTP"):
     1. Gagawa tayo ng random na 20-byte secret tapos ipapakita as QR code / setup key
        (Base32 text). Sine-save din ng app yung parehong secret.
     2. Kada 30 seconds, pareho kaming nagko-compute (site at app) ng
          code = HMAC-SHA1(secret, ilang 30-second steps na mula 1970)
        tapos 6 digits lang yung kinukuha (RFC 4226 "dynamic truncation").
     3. Kung tugma yung tinype na code sa code natin, ibig sabihin hawak nga nila yung phone.

   Lahat dito sinulat namin by hand - SHA-1, HMAC, Base32 - gamit lang plain na
   arrays ng numbers (bytes 0-255) at 32-bit bit operations. Walang crypto
   library, walang built-in helpers.

   Yung mga account change (password, pag-add / approve / suspend / archive ng
   staff, status o plan ng subscriber, at pag-undo ng alinman dito) kailangan ng
   verified na code. Pag tama yung code, may 5-minute window ("step-up") kaya hindi
   na magtatanong ulit kung sunod-sunod yung changes. Para lang yung window sa taong
   naka-sign in, at tapos na ito pag nag-sign-in / sign-out. Sa unang setup ng app,
   hihingin yung password ng account, para hindi magamit ng iba yung session na
   naiwang naka-sign in para i-link yung sarili nilang phone.
   ========================================================================== */

'use strict';

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_SECRET_BYTES = 20;          // 160 bits, ito yung hinihingi ng Google Authenticator para sa SHA-1
const STEP_UP_MINUTES = 5;
const SETUP_MINUTES = 10;               // pag nagsimula ng setup, dapat ma-confirm within 10 minutes
const OTP_MAX_ATTEMPTS = 5;
const OTP_PAUSE_MS = 30 * 1000;            // unang pause; kada susunod, dinodoble (RFC 4226 §7.3)
const OTP_PAUSE_MAX_MS = 15 * 60 * 1000;
const TOTP_ISSUER = 'E3 Fiber Connect';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const twoFactorState = { stepUpStaffId: null, stepUpUntil: 0, pendingSecret: '', pendingStaffId: null, pendingUntil: 0, failures: 0, pausedUntil: 0, lockouts: 0 };

/* --------------------------------------------------------------------------
   SHA-1 (FIPS 180-4) - 20-byte na digest ng isang byte array
   -------------------------------------------------------------------------- */

/** rotateLeft - 32-bit na rotation pa-kaliwa. O(1) */
function rotateLeft(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

/**
 * sha1Bytes - yung SHA-1 digest ng `bytes`.
 * 1. pad: lagyan ng 0x80, zeros, tapos yung length in bits (64-bit, big-endian) -> multiple ng 64 bytes;
 * 2. kada 64-byte block: i-expand yung 16 words to 80, 80 rounds, tapos i-add sa h0..h4.
 * Time: O(n) para sa n na bytes, Space: O(n) para sa padded na copy
 */
function sha1Bytes(bytes) {
  const message = [];
  for (let i = 0; i < bytes.length; i++) {
    arrayAppend(message, bytes[i]);
  }
  const bitLength = bytes.length * 8;
  arrayAppend(message, 0x80);                                   // 1. padding muna
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
  for (let block = 0; block < message.length; block += 64) {    // 2. isang 64-byte block kada ikot
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
 * hmacSha1 - HMAC(key, message) = SHA1((key XOR opad) + SHA1((key XOR ipad) + message)).
 * Time: O(n), Space: O(n)
 */
function hmacSha1(keyBytes, messageBytes) {
  let key = keyBytes;
  if (key.length > 64) {
    key = sha1Bytes(key);                 // pag mahaba yung key, hina-hash muna
  }
  const inner = [];
  const outer = [];
  for (let i = 0; i < 64; i++) {
    const byte = i < key.length ? key[i] : 0;   // pag maikli, dinadagdagan ng zeros
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
   Base32 (RFC 4648) - ganito sinusulat yung secret sa QR code / setup key
   -------------------------------------------------------------------------- */

/** base32Encode - bawat 5 bytes nagiging 8 letters (A-Z, 2-7). Time: O(n) */
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

/** base32Value - yung 0-31 na value ng isang Base32 letter, o -1 (linear search sa 32 letters). O(1) */
function base32Value(ch) {
  for (let i = 0; i < BASE32_ALPHABET.length; i++) {
    if (BASE32_ALPHABET[i] === ch) {
      return i;
    }
  }
  return -1;
}

/** base32Decode - ibabalik yung letters sa bytes; hindi pinapansin yung spaces, dashes at "=". Time: O(n) */
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
   TOTP (RFC 6238, nakapatong sa HOTP na RFC 4226)
   -------------------------------------------------------------------------- */

/** totpStep - ilang 30-second steps na ang lumipas mula 1970 sa oras na `ms`. O(1) */
function totpStep(ms) {
  return Math.floor(ms / 1000 / TOTP_PERIOD_SECONDS);
}

/** totpSecondsLeft - ilang seconds pa bago magpalit yung code sa app. O(1) */
function totpSecondsLeft(ms) {
  return TOTP_PERIOD_SECONDS - (Math.floor(ms / 1000) % TOTP_PERIOD_SECONDS);
}

/**
 * hotpCode - yung code para sa isang counter value:
 * 1. gawing 8 bytes yung counter (big-endian); 2. HMAC-SHA1 gamit yung secret;
 * 3. dynamic truncation: yung huling 4 bits ang magsasabi kung saan babasahin yung 4 bytes;
 * 4. kunin yung huling `digits` na digits, lagyan ng zeros sa unahan kung kulang.
 * Time: O(1) (fixed size lang yung SHA-1 work), Space: O(1)
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

/** totpCode - yung 6-digit code ng isang Base32 secret sa isang 30-second step. O(1) */
function totpCode(secretBase32, step) {
  return hotpCode(base32Decode(secretBase32), step, TOTP_DIGITS);
}

/**
 * matchTotp - kung saang step galing yung code (ngayon, 30 s bago, o 30 s after - kasi
 * minsan hindi sabay yung orasan), o -1 kung wala. Hindi tinatanggap yung steps na hindi
 * mas bago sa `lastStep`, kaya isang beses lang magagamit yung code. Time: O(1) (3 tries)
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
   Setup: secret, setup key at yung otpauth:// link para sa QR code
   -------------------------------------------------------------------------- */

/** randomBytes - `count` na random bytes galing sa secure random source ng browser kung meron. O(n) */
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

/** formatSetupKey - "ABCD EFGH IJKL ..." para madaling i-type ng mano-mano sa app. O(n) */
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

/** percentEncode - URL-encode ng text para sa otpauth link (hindi ginagalaw yung letters, digits at - . _ ~). O(n) */
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

/** otpauthUri - yung link sa loob ng QR code; ito binabasa ng Google Authenticator pag nag-scan. O(n) */
function otpauthUri(email, secretBase32) {
  return 'otpauth://totp/' + percentEncode(TOTP_ISSUER) + ':' + percentEncode(email)
    + '?secret=' + secretBase32 + '&issuer=' + percentEncode(TOTP_ISSUER)
    + '&algorithm=SHA1&digits=' + TOTP_DIGITS + '&period=' + TOTP_PERIOD_SECONDS;
}

/**
 * startTotpSetup - bagong secret para sa naka-sign in na member. "Pending" lang muna ito
 * hangga't hindi pa napapatunayan na tama yung code na pinapakita ng app (confirmTotpSetup).
 * Kailangan munang patunayan ng nasa keyboard na siya talaga yung may-ari ng account:
 *   - lagi            -> yung password ng account (para yung gumagamit ng session na
 *                        naiwang naka-sign in ay hindi ma-link yung sarili nilang phone);
 *   - bagong phone    -> kasama pa yung code galing sa current app sa huling 5 minutes.
 * Yung maling password, bilang din sa parehong 5-tries na pause tulad ng maling code.
 * Dapat ma-confirm yung bagong secret within SETUP_MINUTES.
 * Time: O(n) para sa password hash, Space: O(1)
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

/** clearPendingSetup - kalimutan yung setup na tapos na, kinansel, o naubusan ng oras. O(1) */
function clearPendingSetup() {
  twoFactorState.pendingSecret = '';
  twoFactorState.pendingStaffId = null;
  twoFactorState.pendingUntil = 0;
}

/* --------------------------------------------------------------------------
   Pag-check ng code, yung 5-minute window, at pag-on / off ng 2FA
   -------------------------------------------------------------------------- */

/** isSixDigits - dapat exactly 6 digits. O(1) */
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
 * checkOtpAttempt - mga check bago i-compare yung code: naka-pause ba after 5 na
 * maling code? six digits ba? Binabalik yung error text, o '' kung okay. O(1)
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

/** pauseLengthText - "30 seconds", "2 minutes" (pinapa-round up). O(1) */
function pauseLengthText(ms) {
  const seconds = Math.ceil(ms / 1000);
  return seconds < 60 ? pluralize(seconds, 'second') : pluralize(Math.ceil(seconds / 60), 'minute');
}

/**
 * otpFailed - bilangin yung maling code. Pag pang-5 na sunod-sunod, naka-pause yung
 * pag-enter ng code: 30 s sa una, tapos 1, 2, 4, 8 ... minutes (max 15) hanggang may
 * tamang code, kaya imposibleng mahulaan lahat ng 1,000,000 na codes. O(1)
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

/** grantStepUp - buksan yung 5-minute window para sa naka-sign in na member. O(1) */
function grantStepUp(member) {
  twoFactorState.failures = 0;
  twoFactorState.lockouts = 0;
  twoFactorState.stepUpStaffId = member.id;
  twoFactorState.stepUpUntil = Date.now() + STEP_UP_MINUTES * 60 * 1000;
}

/** endStepUp - isara yung window (pag sign-in, sign-out). O(1) */
function endStepUp() {
  twoFactorState.stepUpStaffId = null;
  twoFactorState.stepUpUntil = 0;
  clearPendingSetup();
}

/** stepUpActive - naka-verify ba ng code yung naka-sign in sa huling 5 minutes? O(1) */
function stepUpActive() {
  return authState.staffId !== null && twoFactorState.stepUpStaffId === authState.staffId && twoFactorState.stepUpUntil > Date.now();
}

/** stepUpRequired - yung error na binabalik ng bawat account change hangga't wala pang verified na code, o null. O(1) */
function stepUpRequired() {
  if (stepUpActive()) {
    return null;
  }
  return { ok: false, needsStepUp: true, error: 'For your security, confirm it’s you with the code from Google Authenticator first.', errors: {} };
}

/**
 * confirmTotpSetup - yung unang code galing sa app ang patunay na nasa kanya yung secret:
 * 1. checks (pause, six digits, may setup na nagaganap para sa member na ito; kung
 *    papalitan yung gumaganang authenticator, kailangan din ng 5-minute window);
 * 2. i-compare sa pending secret (ngayon ± 30 s);
 * 3. i-save yung secret sa staff record, i-on yung 2FA, tapos buksan yung 5-minute window.
 * Time: O(1)
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
 * verifyStepUp - i-check yung code galing sa app tapos buksan yung 5-minute window.
 * Hindi tinatanggap yung code na nagamit na (dapat mas bago siya sa totpLastStep).
 * Time: O(1)
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

/** stepUpMinutesLeft - ilang buong minuto pa natitira sa window (para sa Account page). O(1) */
function stepUpMinutesLeft() {
  return stepUpActive() ? Math.ceil((twoFactorState.stepUpUntil - Date.now()) / 60000) : 0;
}
