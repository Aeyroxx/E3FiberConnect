/* ==========================================================================
   E3 Fiber Connect · backend/auth.js
   Staff sign-in and the current session (kept in memory, like everything else:
   reloading the page signs you out).

   After 5 wrong passwords in a row, sign-in pauses for 30 seconds.
   Someone whose staff registration is still waiting (or was not approved) is
   told so — but only after typing the password they chose when registering.
   Note: a front-end-only "login" can't truly protect data — anyone can open
   the browser's developer tools. A real system checks passwords on a server.
   Defense module: Admin Login — presented by Dela Cruz Riceerich.
   ========================================================================== */

'use strict';

const SIGN_IN_MAX_ATTEMPTS = 5;
const SIGN_IN_PAUSE_MS = 30000;

// failedByEmail — a hash table: e-mail → wrong tries in a row, so signing in to
// your own account does not reset the count for someone else's.
// failedInARow — wrong tries on ANY e-mail since the last pause (a successful sign-in
// does not reset it), so trying a few passwords on every e-mail ("password
// spraying") is paused too.
const SIGN_IN_MAX_TOTAL_ATTEMPTS = 10;
const authState = { staffId: null, failedByEmail: createHashTable(17), failedInARow: 0, pausedUntil: 0 };

/**
 * signIn — check the e-mail (hash-table look-up) and the password hash.
 * Only Active accounts may sign in.
 * Time O(1) average + one password hash (400 fixed rounds, O(k) for k characters)
 */
function signIn(email, password) {
  const now = Date.now();
  if (authState.pausedUntil > now) {                          // 1. paused after 5 wrong tries?
    const seconds = Math.ceil((authState.pausedUntil - now) / 1000);
    return { ok: false, error: 'Too many attempts. Try again in ' + pluralize(seconds, 'second') + '.' };
  }
  const emailKey = toLowerText(trimText(email));
  const member = findStaffByEmail(email);                     // 2. hash-table look-up by e-mail, O(1)
  if (!member || !staffPasswordMatches(member, password)) {   // 3. compare the salted password hash
    // Not a staff password — maybe a registration that is waiting or was not approved.
    // It is only mentioned when the password the person chose for it matches, and it
    // is checked whether or not a staff account exists, so the answer never reveals
    // which e-mails belong to staff.
    const request = registrationForSignIn(email, password);
    if (request) {
      return { ok: false, error: registrationStatusMessage(request), registration: request };
    }
    const tries = (hashGet(authState.failedByEmail, emailKey) || 0) + 1;   // 4. count wrong tries for this e-mail
    authState.failedInARow = authState.failedInARow + 1;                   //    … and in a row on any e-mail
    if (tries >= SIGN_IN_MAX_ATTEMPTS || authState.failedInARow >= SIGN_IN_MAX_TOTAL_ATTEMPTS) {   // 5th for one e-mail / 10th overall pauses
      hashPut(authState.failedByEmail, emailKey, 0);
      authState.failedInARow = 0;
      authState.pausedUntil = now + SIGN_IN_PAUSE_MS;
      return { ok: false, error: 'Too many attempts. Sign-in is paused for 30 seconds.' };
    }
    hashPut(authState.failedByEmail, emailKey, tries);
    return { ok: false, error: 'The e-mail or password is incorrect.' };
  }
  if (member.status !== 'Active') {                           // 5. suspended or deleted accounts can't sign in
    return { ok: false, error: 'This account is ' + toLowerText(member.status) + '. Ask the owner to reactivate it.' };
  }
  hashPut(authState.failedByEmail, emailKey, 0);              // 6. success: this e-mail's count starts again; remember who is signed in
  authState.staffId = member.id;
  clearUndoHistory(); // Undo only ever reverses your own actions from this sign-in
  member.lastSignIn = nowISO();
  logActivity('auth', member.fullName + ' signed in', member.fullName);
  return { ok: true, staff: member };
}

/** signOut — end the session. O(1) */
function signOut() {
  const member = currentStaff();
  if (member) {
    logActivity('auth', member.fullName + ' signed out', member.fullName);
  }
  authState.staffId = null;
  clearUndoHistory();
}

/**
 * currentStaff — the signed-in staff member, or null. If the account was
 * suspended or deleted in the meantime, the session ends immediately.
 * Time O(log n)
 */
function currentStaff() {
  if (!authState.staffId) {
    return null;
  }
  const member = findStaffById(authState.staffId);
  if (!member || member.status !== 'Active') {
    authState.staffId = null;
    return null;
  }
  return member;
}

/** isSignedIn — O(log n) */
function isSignedIn() {
  return currentStaff() !== null;
}
