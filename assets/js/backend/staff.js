/* ==========================================================================
   E3 Fiber Connect · backend/staff.js
   Staff accounts.

     Active ◀──suspend / reactivate──▶ Suspended        Active or Suspended ──▶ Deleted

   Owners and Admins manage staff (never themselves; an Admin can't change an
   Owner). Staff they add get a temporary password and must change it when they
   first sign in; people who register themselves (registrations.js) keep the
   password they chose. E-mails are indexed in a HASH TABLE (staffEmailIndex),
   so the sign-in look-up and the "e-mail already used" check are O(1) on average.
   Passwords are stored only as a salted hash (passwordHash + passwordSalt).
   Defense module: Admin/Staff Creation & Management — presented by Dela Cruz Riceerich.
   ========================================================================== */

'use strict';

const STAFF_STATUSES = ['Active', 'Suspended', 'Deleted'];
const ROLE_RANK = { Owner: 1, Admin: 2, Support: 3 };
const TEMP_PASSWORD_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz'; // no I, L, O, i, l, o
const TEMP_PASSWORD_DIGITS = '23456789';                                         // no 0 or 1

/** findStaffById — binary search on id ("STF-0002"). O(log n) */
function findStaffById(id) {
  const index = binarySearch(staffMembers, 'id', id);
  return index === -1 ? null : staffMembers[index];
}

/** findStaffByEmail — hash-table look-up by e-mail, then by id. O(1) average */
function findStaffByEmail(email) {
  const id = hashGet(staffEmailIndex, toLowerText(trimText(email)));
  return id === null ? null : findStaffById(id);
}

/** isStaffEmailTaken — O(1) average */
function isStaffEmailTaken(email) {
  return hashHas(staffEmailIndex, toLowerText(trimText(email)));
}

/**
 * staffPasswordMatches — hash the typed password with the member's salt and
 * compare it with the stored hash (the password itself is never stored).
 * Time O(r · n) for the hash · Space O(1)
 */
function staffPasswordMatches(member, password) {
  return hashPassword(password, member.passwordSalt) === member.passwordHash;
}

/** setStaffPassword — store a new password as a salted hash (salt = staff id). O(r · n) */
function setStaffPassword(member, password) {
  member.passwordSalt = member.id;
  member.passwordHash = hashPassword(password, member.id);
}

/** canManageStaff — Owners and Admins can manage the team. O(1) */
function canManageStaff(actor) {
  return actor !== null && actor !== undefined && (actor.role === 'Owner' || actor.role === 'Admin');
}

/** canManageMember — may `actor` change this particular member? O(1) */
function canManageMember(actor, member) {
  if (!canManageStaff(actor) || !member || actor.id === member.id || member.status === 'Deleted') {
    return false;
  }
  return actor.role === 'Owner' || member.role !== 'Owner';
}

/**
 * generateTempPassword — 10 random characters from an alphabet without look-alike
 * characters, with at least two digits.
 * Time O(k) · Space O(k)
 */
function generateTempPassword() {
  const alphabet = TEMP_PASSWORD_LETTERS + TEMP_PASSWORD_DIGITS;
  const chars = [];
  for (let i = 0; i < 10; i++) {
    arrayAppend(chars, alphabet[randomIndex(alphabet.length)]);
  }
  // make sure two positions hold digits and one holds a letter
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
 * validateNewStaff — field-by-field checks for "Add staff".
 * Time O(1) average (hash look-up for the e-mail) · Space O(1)
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
 * addStaff — create an account with a temporary password. Returns the password
 * once, so it can be shown to the admin (it is only stored as a hash).
 * Time O(1) append + O(1) hash put · Space O(1)
 */
function addStaff(data, actor) {
  if (!canManageStaff(actor)) {                     // 1. only Owners and Admins add staff
    return { ok: false, errors: { fullName: 'Only an Owner or Admin can add staff.' } };
  }
  const errors = validateNewStaff(data, actor);     // 2. check the fields (e-mail through the hash table)
  if (hasAnyErrors(errors)) {
    return { ok: false, errors: errors };
  }
  counters.staff = counters.staff + 1;              // 3. the next staff id, e.g. STF-0006
  const id = formatStaffId(counters.staff);
  const tempPassword = generateTempPassword();      // 4. a random temporary password
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
  arrayAppend(staffMembers, member);          // 5. ids increase → the table stays sorted
  hashPut(staffEmailIndex, member.email, id); // 6. index the e-mail for sign-in
  pushUndo('Add staff ' + member.fullName, [insertOperation('staffMembers', id)], nameOfActor(actor)); // 7. undo step
  logActivity('staff', 'Added ' + member.fullName + ' as ' + member.role, nameOfActor(actor));
  markDataChanged();
  return { ok: true, staff: member, tempPassword: tempPassword };
}

/**
 * setStaffStatus — suspend, reactivate or delete a staff account.
 * Time O(log n)
 */
function setStaffStatus(id, status, actor) {
  const member = findStaffById(id);
  if (!member) {
    return { ok: false, error: 'Staff member not found.' };
  }
  if (!canManageMember(actor, member)) {
    return { ok: false, error: 'You can’t change this account.' };
  }
  const allowed = (member.status === 'Active' && (status === 'Suspended' || status === 'Deleted'))
    || (member.status === 'Suspended' && (status === 'Active' || status === 'Deleted'));
  if (!allowed) {
    return { ok: false, error: 'That change is not allowed.' };
  }
  const verbs = { Active: 'Reactivate', Suspended: 'Suspend', Deleted: 'Delete' };
  const before = snapshotFields(member, ['status']);
  member.status = status;
  pushUndo(verbs[status] + ' ' + member.fullName, [updateOperation('staffMembers', id, before)], nameOfActor(actor));
  logActivity('staff', verbs[status] + 'd ' + member.fullName, nameOfActor(actor));
  markDataChanged();
  return { ok: true, staff: member };
}

/** resetStaffPassword — issue a new temporary password. Time O(log n) */
function resetStaffPassword(id, actor) {
  const member = findStaffById(id);
  if (!member) {
    return { ok: false, error: 'Staff member not found.' };
  }
  if (!canManageMember(actor, member)) {
    return { ok: false, error: 'You can’t reset this password.' };
  }
  const tempPassword = generateTempPassword();
  setStaffPassword(member, tempPassword);
  member.mustChangePassword = true;
  logActivity('staff', 'Reset the password of ' + member.fullName, nameOfActor(actor));
  markDataChanged();
  return { ok: true, staff: member, tempPassword: tempPassword };
}

/**
 * changeOwnPassword — the signed-in member sets a new password.
 * Returns field errors { currentPassword, newPassword, confirmPassword }.
 * Time O(r · n) for the hash · Space O(1)
 */
function changeOwnPassword(member, currentPassword, newPassword, confirmPassword) {
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

/** staffRow — list fields plus a role rank so "Role" sorts Owner → Admin → Support. O(1) */
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
 * listStaff — filter, search, sort. options: { status, query, sortField, sortOrder, algorithm }
 * Time O(n · L · m) + O(n²) · Space O(n)
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

/** countStaffByStatus — one pass. O(n) */
function countStaffByStatus() {
  const counts = { all: staffMembers.length, Active: 0, Suspended: 0, Deleted: 0 };
  for (let i = 0; i < staffMembers.length; i++) {
    counts[staffMembers[i].status] = counts[staffMembers[i].status] + 1;
  }
  return counts;
}
