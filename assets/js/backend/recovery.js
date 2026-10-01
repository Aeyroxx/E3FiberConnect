/* ==========================================================================
   E3 Fiber Connect - backend/recovery.js
   "Forgot password" para sa staff, tatlong steps:

     1. requestPasswordReset(email)  - random na 6-digit code para sa account na yun,
                                       valid ng 10 minutes;
     2. verifyResetCode(code)        - hanggang 5 tries lang kada code;
     3. completePasswordReset(new...) - pagkatapos lang ng step 2, dito sine-set yung bagong password.

   Pinapadala yung code as message sa staff member (dito sa site, lumalabas siya
   as notification sa screen). Pareho lang yung sagot sa step 1 may account man o
   wala yung e-mail, para hindi malaman ng kahit sino kung aling e-mail ang sa staff.
   Walang code na binibigay sa Suspended at Archived na accounts.

   Limitado din yung panghuhula kahit mag-reset ulit: isang code lang kada 30 seconds
   para sa kahit anong e-mail, at kada 5 maling code naka-pause yung pag-enter ng code -
   30 s, tapos 1, 2, 4 ... minutes (max 15). Nasa resetGuard yung mga counter na yun,
   at hindi ito nare-reset kahit magsimula ulit.
   ========================================================================== */

'use strict';

const RESET_CODE_MINUTES = 10;
const RESET_MAX_TRIES = 5;
const RESET_RESEND_SECONDS = 30;

const passwordResetState = { email: '', staffId: null, code: '', expiresAt: 0, tries: 0, verified: false, sentAt: 0 };
const resetGuard = { failures: 0, lockouts: 0, pausedUntil: 0 };   // hindi ito binubura ng clearPasswordReset
const RESET_ACTOR = 'Forgot-password page';                       // sino gumawa: taong hindi naka-sign in

/** clearPasswordReset - kalimutan yung reset na nagaganap (tapos na, kinansel, o nag-time out). O(1) */
function clearPasswordReset() {
  passwordResetState.email = '';
  passwordResetState.staffId = null;
  passwordResetState.code = '';
  passwordResetState.expiresAt = 0;
  passwordResetState.tries = 0;
  passwordResetState.verified = false;
}

/** newResetCode - anim na random digits, halimbawa "048213" (secure random source kung meron). O(1) */
function newResetCode() {
  const bytes = randomBytes(4);
  const number = ((bytes[0] * 16777216) + (bytes[1] * 65536) + (bytes[2] * 256) + bytes[3]) % 1000000;
  return padLeft(number, 6, '0');
}

/**
 * requestPasswordReset - step 1 ng forgot password. Chine-check muna yung format
 * ng e-mail at yung 30 seconds na pagitan bago humingi ulit ng code. Kung Active na
 * staff account yung e-mail, gagawa tayo ng bagong code.
 * Binabalik: { ok, sentTo, message } - yung `message` ang matatanggap ng staff
 * (null yung message pag walang ganung account).
 * Time: O(1) average (hash table lookup ng e-mail), Space: O(1)
 */
function requestPasswordReset(email) {
  if (!isValidEmail(email)) {
    return { ok: false, error: 'Enter your work e-mail address.' };
  }
  const now = Date.now();
  const key = toLowerText(trimText(email));
  if (resetGuard.pausedUntil > now) {                                         // 1. naka-pause ba kasi sobrang daming maling code?
    return { ok: false, error: 'Too many wrong codes. Try again in ' + pauseLengthText(resetGuard.pausedUntil - now) + '.' };
  }
  const waited = Math.floor((now - passwordResetState.sentAt) / 1000);
  if (waited < RESET_RESEND_SECONDS) {                                        //    tapos isang code lang kada 30 seconds, kahit anong e-mail
    return { ok: false, error: 'Please wait ' + pluralize(RESET_RESEND_SECONDS - waited, 'second') + ' before asking for another code.' };
  }
  clearPasswordReset();
  passwordResetState.email = key;
  passwordResetState.sentAt = now;
  const sentTo = maskEmail(key);
  const member = findStaffByEmail(key);                                       // 2. hanapin sa hash table, O(1) average
  if (!member || member.status !== 'Active') {
    logActivity('auth', 'Password reset asked for an e-mail with no active staff account', RESET_ACTOR);
    return { ok: true, sentTo: sentTo, message: null };                       //    parehong sagot lang, walang nalalaman yung nagtanong
  }
  passwordResetState.staffId = member.id;                                     // 3. bagong code, valid ng 10 minutes
  passwordResetState.code = newResetCode();
  passwordResetState.expiresAt = now + RESET_CODE_MINUTES * 60 * 1000;
  logActivity('auth', 'Password reset code sent to ' + member.fullName, RESET_ACTOR);
  return {
    ok: true,
    sentTo: sentTo,
    message: { code: passwordResetState.code, minutes: RESET_CODE_MINUTES },
  };
}

/**
 * verifyResetCode - step 2. Dapat six digits yung code, hindi pa expired, at tama
 * within 5 tries (pag lumampas, kailangan na ng bagong code).
 * Time: O(1)
 */
function verifyResetCode(code) {
  if (passwordResetState.email === '') {
    return { ok: false, error: 'Start again and ask for a new code.' };
  }
  if (!isSixDigits(code)) {
    return { ok: false, error: 'Enter the 6-digit code.' };
  }
  const now = Date.now();
  if (resetGuard.pausedUntil > now) {
    return { ok: false, error: 'Too many wrong codes. Try again in ' + pauseLengthText(resetGuard.pausedUntil - now) + '.' };
  }
  if (passwordResetState.tries >= RESET_MAX_TRIES) {
    return { ok: false, error: 'Too many wrong codes. Ask for a new code.' };
  }
  if (passwordResetState.code !== '' && passwordResetState.expiresAt < Date.now()) {
    passwordResetState.code = '';
    return { ok: false, error: 'This code has expired. Ask for a new code.' };
  }
  if (passwordResetState.code === '' || code !== passwordResetState.code) {
    passwordResetState.tries = passwordResetState.tries + 1;
    resetGuard.failures = resetGuard.failures + 1;
    if (resetGuard.failures >= RESET_MAX_TRIES) {                             // 5 maling code nang sunod-sunod, kahit ilang reset pa
      let pause = OTP_PAUSE_MS;
      for (let i = 0; i < resetGuard.lockouts && pause < OTP_PAUSE_MAX_MS; i++) {
        pause = pause * 2;
      }
      if (pause > OTP_PAUSE_MAX_MS) {
        pause = OTP_PAUSE_MAX_MS;
      }
      resetGuard.failures = 0;
      resetGuard.lockouts = resetGuard.lockouts + 1;
      resetGuard.pausedUntil = now + pause;
      passwordResetState.code = '';
      logActivity('auth', 'Password reset locked after ' + RESET_MAX_TRIES + ' wrong codes', RESET_ACTOR);
      return { ok: false, error: 'Too many wrong codes. Please wait ' + pauseLengthText(pause) + ', then ask for a new code.' };
    }
    if (passwordResetState.tries >= RESET_MAX_TRIES) {
      passwordResetState.code = '';
      return { ok: false, error: 'Too many wrong codes. Ask for a new code.' };
    }
    return { ok: false, error: 'That code isn’t right. Check the message and try again.' };
  }
  passwordResetState.verified = true;
  resetGuard.failures = 0;
  resetGuard.lockouts = 0;
  return { ok: true };
}

/**
 * completePasswordReset - step 3. Pwede lang pag verified na yung code (at pasok pa sa
 * 10 minutes nito): chine-check yung bagong password, sine-save yung salted hash, tapos
 * kini-clear yung reset. Binabalik yung field errors { newPassword, confirmPassword }.
 * Time: O(n) para sa password hash, Space: O(1)
 */
function completePasswordReset(newPassword, confirmPassword) {
  const member = passwordResetState.staffId ? findStaffById(passwordResetState.staffId) : null;
  if (!passwordResetState.verified || !member || member.status !== 'Active' || passwordResetState.expiresAt < Date.now()) {
    clearPasswordReset();
    return { ok: false, error: 'This reset has expired. Start again and ask for a new code.', errors: {} };
  }
  const errors = {};
  if (!isStrongPassword(newPassword)) {
    errors.newPassword = 'Use at least 8 characters with a letter and a number.';
  } else if (staffPasswordMatches(member, newPassword)) {
    errors.newPassword = 'That is your current password. Choose a new one.';
  }
  if (confirmPassword !== newPassword) {
    errors.confirmPassword = 'The passwords don’t match.';
  }
  if (hasAnyErrors(errors)) {
    return { ok: false, errors: errors };
  }
  setStaffPassword(member, newPassword);
  member.mustChangePassword = false;
  hashPut(authState.failedByEmail, member.email, 0);        // hindi na bilang yung mga dating maling sign-in ng e-mail na ito
  logActivity('auth', member.fullName + ' reset their password with an e-mailed code', RESET_ACTOR);
  markDataChanged();
  const email = member.email;
  clearPasswordReset();
  return { ok: true, email: email, errors: {} };
}
