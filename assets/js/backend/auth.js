/* ==========================================================================
   E3 Fiber Connect - backend/auth.js
   Sign-in ng staff at yung current session (nasa memory lang, tulad ng lahat:
   pag ni-reload yung page, signed out ka na).

   Pag 5 maling password nang sunod-sunod, naka-pause yung sign-in ng 30 seconds.
   Kung naghihintay pa (o hindi na-approve) yung staff registration ng isang tao,
   sasabihan siya - pero pag na-type lang niya yung password na pinili niya nung nag-register.
   Note: yung "login" na front-end lang ay hindi talaga kayang protektahan yung data -
   kahit sino pwedeng magbukas ng developer tools ng browser. Sa totoong system, sa
   server chine-check yung password.
   Module sa defense: Admin Login (si Dela Cruz Riceerich ang mag-eexplain)
   ========================================================================== */

'use strict';

const SIGN_IN_MAX_ATTEMPTS = 5;
const SIGN_IN_PAUSE_MS = 30000;

// failedByEmail - hash table ito: e-mail -> ilang sunod-sunod na maling try, para
// hindi ma-reset yung count ng iba kapag nag-sign in ka sa sarili mong account.
// failedInARow - maling tries sa KAHIT ANONG e-mail mula nung huling pause (hindi ito
// nire-reset ng successful sign-in), para ma-pause din yung nagta-try ng ilang
// password sa bawat e-mail ("password spraying").
const SIGN_IN_MAX_TOTAL_ATTEMPTS = 10;
const authState = { staffId: null, failedByEmail: createHashTable(17), failedInARow: 0, pausedUntil: 0 };

/**
 * signIn - i-check yung e-mail (hash table lookup) at yung password hash.
 * Active na accounts lang ang pwedeng mag-sign in.
 * Time: O(1) average + isang password hash (400 fixed rounds, O(n) para sa n na characters)
 */
function signIn(email, password) {
  const now = Date.now();
  if (authState.pausedUntil > now) {                          // 1. naka-pause ba after 5 maling try?
    const seconds = Math.ceil((authState.pausedUntil - now) / 1000);
    return { ok: false, error: 'Too many attempts. Try again in ' + pluralize(seconds, 'second') + '.' };
  }
  const emailKey = toLowerText(trimText(email));
  const member = findStaffByEmail(email);                     // 2. hanapin yung e-mail sa hash table, O(1)
  if (!member || !staffPasswordMatches(member, password)) {   // 3. i-compare yung salted password hash
    // Hindi staff password - baka registration na naghihintay pa o hindi na-approve.
    // Binabanggit lang ito kapag tugma yung password na pinili nila para dito, at
    // chine-check ito may staff account man o wala, para hindi malaman sa sagot
    // kung aling e-mail ang sa staff.
    const request = registrationForSignIn(email, password);
    if (request) {
      return { ok: false, error: registrationStatusMessage(request), registration: request };
    }
    const tries = (hashGet(authState.failedByEmail, emailKey) || 0) + 1;   // 4. bilangin yung maling tries ng e-mail na ito
    authState.failedInARow = authState.failedInARow + 1;                   //    ... at yung sunod-sunod sa kahit anong e-mail
    if (tries >= SIGN_IN_MAX_ATTEMPTS || authState.failedInARow >= SIGN_IN_MAX_TOTAL_ATTEMPTS) {   // pause pag pang-5 na sa isang e-mail / pang-10 overall
      hashPut(authState.failedByEmail, emailKey, 0);
      authState.failedInARow = 0;
      authState.pausedUntil = now + SIGN_IN_PAUSE_MS;
      return { ok: false, error: 'Too many attempts. Sign-in is paused for 30 seconds.' };
    }
    hashPut(authState.failedByEmail, emailKey, tries);
    return { ok: false, error: 'The e-mail or password is incorrect.' };
  }
  if (member.status !== 'Active') {                           // 5. bawal mag-sign in yung Suspended o Archived na account
    return { ok: false, error: 'This account is ' + toLowerText(member.status) + '. Ask the owner to ' + (member.status === 'Archived' ? 'restore' : 'reactivate') + ' it.' };
  }
  hashPut(authState.failedByEmail, emailKey, 0);              // 6. success: balik sa zero yung count ng e-mail na ito; tandaan kung sino naka-sign in
  authState.staffId = member.id;
  clearUndoHistory(); // sariling actions mo lang sa sign-in na ito ang pwedeng i-undo
  endStepUp();        // bawat bagong sign-in, kailangan ulit ng sariling Google Authenticator code
  clearPasswordReset(); // ... at tapusin yung kahit anong "forgot password" na nagaganap sa browser na ito
  member.lastSignIn = nowISO();
  logActivity('auth', member.fullName + ' signed in', member.fullName);
  return { ok: true, staff: member };
}

/** signOut - tapusin yung session. O(1) */
function signOut() {
  const member = currentStaff();
  if (member) {
    logActivity('auth', member.fullName + ' signed out', member.fullName);
  }
  authState.staffId = null;
  clearUndoHistory();
  endStepUp();
}

/**
 * currentStaff - yung staff na naka-sign in, o null. Kung na-suspend o na-archive
 * yung account habang naka-sign in, tapos agad yung session.
 * Time: O(log n)
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

/** isSignedIn - true kung may naka-sign in. O(log n) */
function isSignedIn() {
  return currentStaff() !== null;
}
