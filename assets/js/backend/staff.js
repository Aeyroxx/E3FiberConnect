/* ==========================================================================
   E3 Fiber Connect - backend/staff.js
   Dito yung mga staff account.

     Active <--suspend / reactivate--> Suspended        Active o Suspended --archive--> Archived
                                                        Archived --restore--> Active

   Hindi kami nagde-delete ng account: pag naka-archive, hindi na makaka-sign in,
   pero nandun pa rin yung record, history at e-mail, at pwede pang i-restore.

   Owners at Admins lang ang nagma-manage ng staff (hindi pwede sarili nila, at
   hindi pwedeng galawin ng Admin yung Owner). Yung staff na inadd nila, may
   temporary password at kailangan palitan pag first sign in; yung mga nag-register
   mismo (registrations.js), yung password na pinili nila yung gamit. Naka-index yung
   e-mails sa HASH TABLE (staffEmailIndex), kaya O(1) on average yung lookup sa sign-in
   at yung check kung "gamit na yung e-mail".
   Salted hash lang yung sine-save para sa password (passwordHash + passwordSalt).
   Module sa defense: Admin/Staff Creation & Management (si Dela Cruz Riceerich ang mag-eexplain)
   ========================================================================== */

'use strict';

const STAFF_STATUSES = ['Active', 'Suspended', 'Archived'];
const ROLE_RANK = { Owner: 1, Admin: 2, Support: 3 };
const TEMP_PASSWORD_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz'; // walang I, L, O, i, l, o
const TEMP_PASSWORD_DIGITS = '23456789';                                         // walang 0 at 1

/** findStaffById - binary search gamit yung id ("STF-0002"). O(log n) */
function findStaffById(id) {
  const index = binarySearch(staffMembers, 'id', id);
  return index === -1 ? null : staffMembers[index];
}

/** findStaffByEmail - hanapin yung staff gamit yung e-mail sa hash table, tapos by id. O(1) average */
function findStaffByEmail(email) {
  const id = hashGet(staffEmailIndex, toLowerText(trimText(email)));
  return id === null ? null : findStaffById(id);
}

/** isStaffEmailTaken - check kung may account na yung e-mail. O(1) average */
function isStaffEmailTaken(email) {
  return hashHas(staffEmailIndex, toLowerText(trimText(email)));
}

/**
 * staffPasswordMatches - i-hash yung tinype na password gamit yung salt ng member
 * tapos i-compare sa naka-save na hash (hindi talaga sine-save yung mismong password).
 * Time: O(n) sa hash (400 fixed rounds sa n characters), Space: O(1)
 */
function staffPasswordMatches(member, password) {
  return hashPassword(password, member.passwordSalt) === member.passwordHash;
}

/** setStaffPassword - i-save yung bagong password bilang salted hash (salt = staff id). O(n) */
function setStaffPassword(member, password) {
  member.passwordSalt = member.id;
  member.passwordHash = hashPassword(password, member.id);
}

/** canManageStaff - Owners at Admins lang pwedeng mag-manage ng team. O(1) */
function canManageStaff(actor) {
  return actor !== null && actor !== undefined && (actor.role === 'Owner' || actor.role === 'Admin');
}

/** canManageMember - pwede bang galawin ni `actor` itong member na ito? O(1) */
function canManageMember(actor, member) {
  if (!canManageStaff(actor) || !member || actor.id === member.id) {
    return false;
  }
  return actor.role === 'Owner' || member.role !== 'Owner';
}

/**
 * generateTempPassword - 10 random characters galing sa alphabet na walang
 * magkamukhang letra, tapos at least dalawang digits.
 * Time: O(n), Space: O(n)
 */
function generateTempPassword() {
  const alphabet = TEMP_PASSWORD_LETTERS + TEMP_PASSWORD_DIGITS;
  const chars = [];
  for (let i = 0; i < 10; i++) {
    arrayAppend(chars, alphabet[randomIndex(alphabet.length)]);
  }
  // siguraduhin na may dalawang digit at may kahit isang letter
  chars[randomIndex(5)] = TEMP_PASSWORD_DIGITS[randomIndex(TEMP_PASSWORD_DIGITS.length)];
  chars[5 + randomIndex(5)] = TEMP_PASSWORD_DIGITS[randomIndex(TEMP_PASSWORD_DIGITS.length)];
  let hasLetter = false;
  for (let i = 0; i < chars.length; i++) {
    if (isLetterChar(chars[i])) {
      hasLetter = true;
    }
  }
  if (!hasLetter) {
    chars[0] = TEMP_PASSWORD_LETTERS[randomIndex(TEMP_PASSWORD_LETTERS.length)];
  }
  return joinText(chars, '');
}

/**
 * validateNewStaff - check isa-isa ng fields sa "Add staff".
 * Time: O(1) average (hash lookup para sa e-mail), Space: O(1)
 */
function validateNewStaff(data, actor) {
  const errors = {};
  const name = collapseSpaces(data.fullName);
  if (name.length < 3 || textFind(name, ' ') === -1) {
    errors.fullName = 'Enter the first and last name.';
  } else if (name.length > 80) {
    errors.fullName = 'Use 80 characters or fewer.';
  }
  if (!isValidEmail(data.email)) {
    errors.email = 'Enter a work e-mail like name@e3fiberconnect.ph.';
  } else if (isStaffEmailTaken(data.email)) {
    errors.email = 'That e-mail already has an account.';
  }
  if (linearSearchValue(STAFF_ROLES, data.role) === -1) {
    errors.role = 'Choose a role.';
  } else if (data.role === 'Owner' && (!actor || actor.role !== 'Owner')) {
    errors.role = 'Only the Owner can add another Owner.';
  }
  if (!isValidISODate(data.startDate)) {
    errors.startDate = 'Enter the start date.';
  } else if (daysBetweenISO(todayISO(), data.startDate) > 365) {
    errors.startDate = 'Choose a date within the next year.';
  }
  return errors;
}

/**
 * addStaff - gagawa ng account na may temporary password. Isang beses lang
 * binabalik yung password para maipakita sa admin (hash lang kasi yung naka-save).
 * Time: O(1) append + O(1) hash put, Space: O(1)
 */
function addStaff(data, actor) {
  const stepUp = stepUpRequired();                  // 0. two-step verification: dapat may Google Authenticator code sa huling 5 minutes
  if (stepUp) {
    return stepUp;
  }
  if (!canManageStaff(actor)) {                     // 1. Owners at Admins lang pwedeng mag-add ng staff
    return { ok: false, errors: { fullName: 'Only an Owner or Admin can add staff.' } };
  }
  const errors = validateNewStaff(data, actor);     // 2. i-check yung fields (yung e-mail, sa hash table)
  if (hasAnyErrors(errors)) {
    return { ok: false, errors: errors };
  }
  counters.staff = counters.staff + 1;              // 3. susunod na staff id, halimbawa STF-0006
  const id = formatStaffId(counters.staff);
  const tempPassword = generateTempPassword();      // 4. random na temporary password
  const member = {
    id: id,
    fullName: collapseSpaces(data.fullName),
    email: toLowerText(trimText(data.email)),
    role: data.role,
    status: 'Active',
    startDate: data.startDate,
    lastSignIn: null,
    passwordHash: hashPassword(tempPassword, id),
    passwordSalt: id,
    mustChangePassword: true,
  };
  arrayAppend(staffMembers, member);          // 5. pataas yung ids -> naka-sort pa rin yung table
  hashPut(staffEmailIndex, member.email, id); // 6. i-index yung e-mail para sa sign-in
  pushUndo('Add staff ' + member.fullName, [insertOperation('staffMembers', id)], nameOfActor(actor)); // 7. undo step
  logActivity('staff', 'Added ' + member.fullName + ' as ' + member.role, nameOfActor(actor));
  markDataChanged();
  return { ok: true, staff: member, tempPassword: tempPassword };
}

/**
 * setStaffStatus - i-suspend, i-reactivate, i-archive o i-restore yung staff account
 * (archive lang, hindi kami nagde-delete ng account).
 * Time: O(log n)
 */
function setStaffStatus(id, status, actor) {
  const stepUp = stepUpRequired();            // 0. two-step verification: dapat may Google Authenticator code sa huling 5 minutes
  if (stepUp) {
    return stepUp;
  }
  const member = findStaffById(id);
  if (!member) {
    return { ok: false, error: 'Staff member not found.' };
  }
  if (!canManageMember(actor, member)) {
    return { ok: false, error: 'You can’t change this account.' };
  }
  const allowed = (member.status === 'Active' && (status === 'Suspended' || status === 'Archived'))
    || (member.status === 'Suspended' && (status === 'Active' || status === 'Archived'))
    || (member.status === 'Archived' && status === 'Active');
  if (!allowed) {
    return { ok: false, error: 'That change is not allowed.' };
  }
  const verbs = { Active: member.status === 'Archived' ? 'Restore' : 'Reactivate', Suspended: 'Suspend', Archived: 'Archive' };
  const before = snapshotFields(member, ['status']);
  member.status = status;
  pushUndo(verbs[status] + ' ' + member.fullName, [updateOperation('staffMembers', id, before)], nameOfActor(actor));
  logActivity('staff', verbs[status] + 'd ' + member.fullName, nameOfActor(actor));
  markDataChanged();
  return { ok: true, staff: member };
}

/** resetStaffPassword - bigyan ng bagong temporary password. Time: O(log n) */
function resetStaffPassword(id, actor) {
  const stepUp = stepUpRequired();            // 0. two-step verification: dapat may Google Authenticator code sa huling 5 minutes
  if (stepUp) {
    return stepUp;
  }
  const member = findStaffById(id);
  if (!member) {
    return { ok: false, error: 'Staff member not found.' };
  }
  if (!canManageMember(actor, member)) {
    return { ok: false, error: 'You can’t reset this password.' };
  }
  if (member.status === 'Archived') {
    return { ok: false, error: 'Restore the account first.' };
  }
  const tempPassword = generateTempPassword();
  setStaffPassword(member, tempPassword);
  member.mustChangePassword = true;
  logActivity('staff', 'Reset the password of ' + member.fullName, nameOfActor(actor));
  markDataChanged();
  return { ok: true, staff: member, tempPassword: tempPassword };
}

/**
 * resetStaffTwoFactor - i-off yung Google Authenticator ng member (nawala yung phone,
 * o ibang tao yung naka-link na phone). Ise-setup ulit ng member, gamit password
 * niya, sa susunod na may babaguhin siya. Wala ito sa Undo stack kasi hindi na
 * dapat bumalik yung lumang secret. Time: O(log n)
 */
function resetStaffTwoFactor(id, actor) {
  const stepUp = stepUpRequired();            // 0. two-step verification: dapat may Google Authenticator code sa huling 5 minutes
  if (stepUp) {
    return stepUp;
  }
  const member = findStaffById(id);
  if (!member) {
    return { ok: false, error: 'Staff member not found.' };
  }
  if (!canManageMember(actor, member)) {
    return { ok: false, error: 'You can’t reset this account’s two-step verification.' };
  }
  if (member.status === 'Archived') {
    return { ok: false, error: 'Restore the account first.' };
  }
  if (member.role !== 'Support' && actor.role !== 'Owner') {   // pag sinabay sa password reset, parang binigay na rin yung account
    return { ok: false, error: 'Only an Owner can reset an Admin’s authenticator.' };
  }
  if (!member.totpEnabled) {
    return { ok: false, error: member.fullName + ' hasn’t set up Google Authenticator.' };
  }
  member.totpEnabled = false;
  member.totpSecret = '';
  member.totpEnabledAt = null;
  member.totpLastStep = -1;
  logActivity('staff', 'Reset the two-step verification of ' + member.fullName, nameOfActor(actor));
  markDataChanged();
  return { ok: true, staff: member };
}

/**
 * changeOwnPassword - dito nagpapalit ng password yung naka-sign in na member.
 * Binabalik yung field errors { currentPassword, newPassword, confirmPassword }.
 * Time: O(n) sa hash (400 fixed rounds sa n characters), Space: O(1)
 */
function changeOwnPassword(member, currentPassword, newPassword, confirmPassword) {
  const stepUp = stepUpRequired();            // 0. two-step verification: dapat may Google Authenticator code sa huling 5 minutes
  if (stepUp) {
    return stepUp;
  }
  const errors = {};
  if (!member) {
    return { ok: false, errors: { currentPassword: 'Please sign in again.' } };
  }
  if (!staffPasswordMatches(member, currentPassword)) {
    errors.currentPassword = 'That isn’t your current password.';
  }
  if (!isStrongPassword(newPassword)) {
    errors.newPassword = 'Use at least 8 characters with a letter and a number.';
  } else if (newPassword === currentPassword) {
    errors.newPassword = 'Choose a password you haven’t used here.';
  }
  if (confirmPassword !== newPassword) {
    errors.confirmPassword = 'The passwords don’t match.';
  }
  if (hasAnyErrors(errors)) {
    return { ok: false, errors: errors };
  }
  setStaffPassword(member, newPassword);
  member.mustChangePassword = false;
  logActivity('staff', member.fullName + ' changed their password', member.fullName);
  markDataChanged();
  return { ok: true, errors: {} };
}

/** staffRow - mga field para sa list, may role rank para ma-sort yung "Role" as Owner -> Admin -> Support. O(1) */
function staffRow(member) {
  return {
    id: member.id,
    fullName: member.fullName,
    email: member.email,
    role: member.role,
    roleRank: ROLE_RANK[member.role],
    status: member.status,
    startDate: member.startDate,
    lastSignIn: member.lastSignIn,
    record: member,
  };
}

/**
 * listStaff - filter, search, tapos sort. options: { status, query, sortField, sortOrder, algorithm }
 * Time: O(n²) + O(n²), Space: O(n)
 */
function listStaff(options) {
  const status = options.status || 'all';
  const base = status === 'all' ? staffMembers : linearSearchAll(staffMembers, 'status', status);
  const found = textSearchRecords(base, ['fullName', 'email', 'role', 'id'], options.query || '');
  const rows = [];
  for (let i = 0; i < found.length; i++) {
    arrayAppend(rows, staffRow(found[i]));
  }
  const started = stopwatchStart();
  const sorted = sortRecords(rows, options.sortField || 'roleRank', options.sortOrder || 'asc', options.algorithm || 'insertion');
  const ms = stopwatchMs(started);
  const stats = { algorithm: dsaLastRun.algorithm, comparisons: dsaLastRun.comparisons, moves: dsaLastRun.moves, ms: ms, n: rows.length };
  logOperation(stats.algorithm, 'Staff list', rows.length, stats.comparisons, stats.moves, ms);
  return { rows: sorted, total: staffMembers.length, stats: stats };
}

/** countStaffByStatus - bilangin yung staff per status, isang ikot lang. O(n) */
function countStaffByStatus() {
  const counts = { all: staffMembers.length, Active: 0, Suspended: 0, Archived: 0 };
  for (let i = 0; i < staffMembers.length; i++) {
    counts[staffMembers[i].status] = counts[staffMembers[i].status] + 1;
  }
  return counts;
}
