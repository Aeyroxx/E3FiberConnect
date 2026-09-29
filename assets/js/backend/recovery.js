/* ==========================================================================
   E3 Fiber Connect · backend/recovery.js
   "Forgot password" for staff, in three steps:

     1. requestPasswordReset(email)  — a random 6-digit code for that account,
                                       valid for 10 minutes;
     2. verifyResetCode(code)        — at most 5 tries per code;
     3. completePasswordReset(new…)  — only after step 2, sets the new password.

   The code is delivered as a message to the staff member (on this site it
   appears as a notification on the screen). The answer to step 1 is the same
   whether or not the e-mail has an account, so the page never tells anyone
   which e-mails belong to staff. Suspended and archived accounts get no code.

   Guessing is limited across resets too: one code every 30 seconds for any
   e-mail, and every 5 wrong codes pause code entry — 30 s, then 1, 2, 4 …
   minutes (at most 15). Those counters live in resetGuard, which starting
   over does not clear.
   ========================================================================== */

'use strict';

const RESET_CODE_MINUTES = 10;
const RESET_MAX_TRIES = 5;
const RESET_RESEND_SECONDS = 30;

const passwordResetState = { email: '', staffId: null, code: '', expiresAt: 0, tries: 0, verified: false, sentAt: 0 };
const resetGuard = { failures: 0, lockouts: 0, pausedUntil: 0 };   // not cleared by clearPasswordReset
const RESET_ACTOR = 'Forgot-password page';                       // who did it: someone not signed in

/** clearPasswordReset — forget the reset in progress (done, cancelled or timed out). O(1) */
function clearPasswordReset() {
  passwordResetState.email = '';
  passwordResetState.staffId = null;
  passwordResetState.code = '';
  passwordResetState.expiresAt = 0;
  passwordResetState.tries = 0;
  passwordResetState.verified = false;
}

/** newResetCode — six random digits, e.g. "048213" (secure random source when available). O(1) */
function newResetCode() {
  const bytes = randomBytes(4);
  const number = ((bytes[0] * 16777216) + (bytes[1] * 65536) + (bytes[2] * 256) + bytes[3]) % 1000000;
  return padLeft(number, 6, '0');
}

/**
 * requestPasswordReset — step 1. Checks the e-mail format and the 30-second
 * wait between codes, then creates a code when the e-mail belongs to an Active
 * staff account. Returns { ok, sentTo, message } where `message` is what the
 * staff member receives (null when there is no such account).
 * Time O(1) average (hash-table look-up by e-mail) · Space O(1)
 */
function requestPasswordReset(email) {
  if (!isValidEmail(email)) {
    return { ok: false, error: 'Enter your work e-mail address.' };
  }
  const now = Date.now();
  const key = toLowerText(trimText(email));
  if (resetGuard.pausedUntil > now) {                                         // 1. paused after too many wrong codes
    return { ok: false, error: 'Too many wrong codes. Try again in ' + pauseLengthText(resetGuard.pausedUntil - now) + '.' };
  }
  const waited = Math.floor((now - passwordResetState.sentAt) / 1000);
  if (waited < RESET_RESEND_SECONDS) {                                        //    and at most one code every 30 seconds, for any e-mail
    return { ok: false, error: 'Please wait ' + pluralize(RESET_RESEND_SECONDS - waited, 'second') + ' before asking for another code.' };
  }
  clearPasswordReset();
  passwordResetState.email = key;
  passwordResetState.sentAt = now;
  const sentTo = maskEmail(key);
  const member = findStaffByEmail(key);                                       // 2. hash-table look-up, O(1) average
  if (!member || member.status !== 'Active') {
    logActivity('auth', 'Password reset asked for an e-mail with no active staff account', RESET_ACTOR);
    return { ok: true, sentTo: sentTo, message: null };                       //    same answer: nothing is revealed
  }
  passwordResetState.staffId = member.id;                                     // 3. a fresh code, valid for 10 minutes
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
 * verifyResetCode — step 2. The code must be six digits, not expired, and
 * right within 5 tries (after that a new code is needed).
 * Time O(1)
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
    if (resetGuard.failures >= RESET_MAX_TRIES) {                             // 5 wrong codes in a row, over any resets
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
 * completePasswordReset — step 3. Only after a verified code (still within its
 * 10 minutes): checks the new password, saves its salted hash and clears the
 * reset. Returns field errors { newPassword, confirmPassword }.
 * Time O(n) for the password hash · Space O(1)
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
  hashPut(authState.failedByEmail, member.email, 0);        // earlier wrong sign-ins for this e-mail no longer count
  logActivity('auth', member.fullName + ' reset their password with an e-mailed code', RESET_ACTOR);
  markDataChanged();
  const email = member.email;
  clearPasswordReset();
  return { ok: true, email: email, errors: {} };
}
