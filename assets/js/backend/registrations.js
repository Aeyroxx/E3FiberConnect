/* ==========================================================================
   E3 Fiber Connect · backend/registrations.js
   Staff registration ("Request staff access") and its approval.

     Pending ──approve──▶ Approved   (a staff account is created)
        └──reject──▶ Rejected

   A new employee fills in the request form; the request waits in a QUEUE
   (FIFO) until an Owner or Admin reviews it — first come, first served.
   `registrations` is sorted by registrationId (ids only grow, so appending
   keeps it sorted) → binary search finds a request. Before approving, the
   e-mail is checked against the staff HASH TABLE (staffEmailIndex) in O(1).
   The password the person chose is stored only as a salted hash, and that
   hash moves to the new staff account unchanged — nobody else ever sees it.
   Defense module: Admin Registration + Approval — presented by Dela Cruz Riceerich.
   ========================================================================== */

'use strict';

/** findRegistration — binary search on registrationId. Time O(log n) · Space O(1) */
function findRegistration(registrationId) {
  const index = binarySearch(registrations, 'registrationId', registrationId);
  return index === -1 ? null : registrations[index];
}

/** isWorkEmail — a valid e-mail that ends with "@e3fiberconnect.ph". O(k) */
function isWorkEmail(email) {
  return isValidEmail(email) && textEndsWithIgnoreCase(trimText(email), STAFF_EMAIL_DOMAIN);
}

/** pendingRegistrationFor — a request for this e-mail that is still waiting (linear search). O(r) */
function pendingRegistrationFor(email) {
  const wanted = toLowerText(trimText(email));
  for (let i = 0; i < registrations.length; i++) {
    if (registrations[i].status === 'Pending' && registrations[i].email === wanted) {
      return registrations[i];
    }
  }
  return null;
}

/**
 * validateRegistration — field-by-field checks for the request form.
 * It does NOT say whether the e-mail already has a staff account (strangers
 * could use that to find out which e-mails exist); the reviewer sees that check.
 * Time O(r + k) · Space O(1)
 */
function validateRegistration(data) {
  const errors = {};
  const name = collapseSpaces(data.fullName);
  if (name.length < 3 || textFind(name, ' ') === -1) {
    errors.fullName = 'Enter your first and last name.';
  } else if (name.length > 80) {
    errors.fullName = 'Use 80 characters or fewer.';
  }
  if (!isValidEmail(data.email)) {
    errors.email = 'Enter your work e-mail, like name@e3fiberconnect.ph.';
  } else if (!isWorkEmail(data.email)) {
    errors.email = 'Use your E3 work e-mail (…' + STAFF_EMAIL_DOMAIN + ').';
  } else {
    const waiting = pendingRegistrationFor(data.email);
    if (waiting) {
      errors.email = 'A request for this e-mail is already waiting for approval.';
    }
  }
  if (!isValidMobile(data.mobile)) {
    errors.mobile = 'Enter an 11-digit mobile number like 0917 555 0199.';
  }
  if (linearSearchValue(REGISTRATION_ROLES, data.role) === -1) {
    errors.role = 'Choose the access you need.';
  }
  if (collapseSpaces(data.note).length > 150) {
    errors.note = 'Use 150 characters or fewer.';
  }
  if (!isStrongPassword(data.password)) {
    errors.password = 'Use at least 8 characters with a letter and a number.';
  }
  if (data.confirmPassword !== data.password) {
    errors.confirmPassword = 'The passwords don’t match.';
  }
  if (!data.agree) {
    errors.agree = 'Please confirm that this request is for your own E3 account.';
  }
  return errors;
}

/**
 * submitRegistration — save a request with the next id (appended → still sorted).
 * Time O(r) for the checks + O(1) append · Space O(1)
 */
function submitRegistration(data) {
  const errors = validateRegistration(data);
  if (hasAnyErrors(errors)) {
    return { ok: false, errors: errors };
  }
  counters.registration = counters.registration + 1;
  const id = formatRegistrationId(counters.registration);
  const request = {
    registrationId: id,
    fullName: collapseSpaces(data.fullName),
    email: toLowerText(trimText(data.email)),
    mobile: normalizeMobile(data.mobile),
    role: data.role,
    note: collapseSpaces(data.note),
    passwordHash: hashPassword(data.password, id),
    passwordSalt: id,
    status: 'Pending',
    submittedAt: nowISO(),
    reviewedBy: '',
    reviewedAt: null,
    rejectReason: '',
    staffId: '',
  };
  arrayAppend(registrations, request);
  logActivity('staff', 'Staff registration ' + id + ' from ' + request.fullName + ' (' + request.role + ')', request.fullName);
  markDataChanged();
  return { ok: true, registration: request };
}

/**
 * registrationQueue — requests waiting for approval, oldest first (FIFO).
 * The table is in arrival order, so one pass enqueues them.
 * Time O(r) · Space O(p) for p pending requests
 */
function registrationQueue() {
  const queue = createQueue(4);
  for (let i = 0; i < registrations.length; i++) {
    if (registrations[i].status === 'Pending') {
      enqueue(queue, registrations[i]);
    }
  }
  return queue;
}

/** countRegistrationsByStatus — one pass, for badges and filters. Time O(r) · Space O(1) */
function countRegistrationsByStatus() {
  const counts = { all: registrations.length, Pending: 0, Approved: 0, Rejected: 0 };
  for (let i = 0; i < registrations.length; i++) {
    counts[registrations[i].status] = counts[registrations[i].status] + 1;
  }
  return counts;
}

/**
 * registrationChecks — what the reviewer should know before approving:
 * a work e-mail, no staff account with that e-mail yet (hash table), and a
 * reviewer who is allowed to approve. Returns { checks, passed, firstFailure }.
 * Time O(k) · Space O(1)
 */
function registrationChecks(request, actor) {
  const checks = [];
  const work = isWorkEmail(request.email);
  arrayAppend(checks, { key: 'domain', label: 'Work e-mail', ok: work, text: work ? 'Ends with ' + STAFF_EMAIL_DOMAIN + '.' : 'Not an ' + STAFF_EMAIL_DOMAIN + ' address.' });
  const taken = isStaffEmailTaken(request.email);
  arrayAppend(checks, {
    key: 'email',
    label: 'No staff account yet',
    ok: !taken,
    text: taken ? 'This e-mail already has a staff account — reject it as a duplicate.'
      : 'Not in the staff e-mail hash table (one look-up among ' + pluralize(staffEmailIndex.size, 'e-mail') + ').',
  });
  const allowed = canManageStaff(actor);
  arrayAppend(checks, {
    key: 'reviewer',
    label: 'You can approve it',
    ok: allowed,
    text: allowed ? 'Owners and Admins approve staff requests.' : 'Only an Owner or Admin can approve requests.',
  });
  let firstFailure = null;
  for (let i = 0; i < checks.length; i++) {
    if (!checks[i].ok && firstFailure === null) {
      firstFailure = checks[i];
    }
  }
  return { checks: checks, passed: firstFailure === null, firstFailure: firstFailure };
}

/**
 * approveRegistration — Pending → Approved. Creates the staff account with the
 * role and the (hashed) password from the request, and puts the e-mail in the
 * hash table. One undo step removes the account and re-opens the request.
 * Time O(log n) + O(1) append + O(1) average hash put · Space O(1)
 */
function approveRegistration(registrationId, actor) {
  const request = findRegistration(registrationId);           // 1. binary search by request id
  if (!request) {
    return { ok: false, error: 'Registration not found.' };
  }
  if (request.status !== 'Pending') {
    return { ok: false, error: 'This request was already ' + toLowerText(request.status) + '.' };
  }
  const review = registrationChecks(request, actor);          // 2. work e-mail, e-mail free (hash table), reviewer allowed
  if (!review.passed) {
    return { ok: false, error: 'Can’t approve — ' + review.firstFailure.text };
  }
  counters.staff = counters.staff + 1;                        // 3. build the staff account with the chosen password hash
  const id = formatStaffId(counters.staff);
  const member = {
    id: id,
    fullName: request.fullName,
    email: request.email,
    role: request.role,
    status: 'Active',
    startDate: todayISO(),
    lastSignIn: null,
    passwordHash: request.passwordHash,
    passwordSalt: request.passwordSalt,
    mustChangePassword: false,
  };
  arrayAppend(staffMembers, member);          // 4. ids increase → the table stays sorted
  hashPut(staffEmailIndex, member.email, id); // 5. index the e-mail so the new member can sign in
  const before = snapshotFields(request, ['status', 'reviewedBy', 'reviewedAt', 'staffId']);
  request.status = 'Approved';                // 6. mark the request approved (it leaves the queue)
  request.reviewedBy = nameOfActor(actor);
  request.reviewedAt = nowISO();
  request.staffId = id;
  pushUndo('Approve ' + request.fullName + ' as ' + request.role, [
    updateOperation('registrations', registrationId, before),
    insertOperation('staffMembers', id),
  ], nameOfActor(actor));
  logActivity('staff', 'Approved registration ' + registrationId + ' — ' + request.fullName + ' joined as ' + request.role + ' (' + id + ')', nameOfActor(actor));
  markDataChanged();
  return { ok: true, registration: request, staff: member };
}

/** rejectRegistration — Pending → Rejected, with a reason. Time O(log n) · Space O(1) */
function rejectRegistration(registrationId, reason, note, actor) {
  if (!canManageStaff(actor)) {
    return { ok: false, error: 'Only an Owner or Admin can review staff requests.' };
  }
  const request = findRegistration(registrationId);
  if (!request) {
    return { ok: false, error: 'Registration not found.' };
  }
  if (request.status !== 'Pending') {
    return { ok: false, error: 'This request was already ' + toLowerText(request.status) + '.' };
  }
  if (linearSearchValue(REGISTRATION_REJECT_REASONS, reason) === -1) {
    return { ok: false, error: 'Choose a reason.' };
  }
  const extra = collapseSpaces(note);
  if (reason === 'Other' && extra.length < 5) {
    return { ok: false, error: 'Describe the reason in a few words.' };
  }
  const before = snapshotFields(request, ['status', 'reviewedBy', 'reviewedAt', 'rejectReason']);
  request.status = 'Rejected';
  request.reviewedBy = nameOfActor(actor);
  request.reviewedAt = nowISO();
  request.rejectReason = extra ? reason + ' — ' + extra : reason;
  pushUndo('Reject the request of ' + request.fullName, [updateOperation('registrations', registrationId, before)], nameOfActor(actor));
  logActivity('staff', 'Rejected registration ' + registrationId + ' (' + request.fullName + ')', nameOfActor(actor));
  markDataChanged();
  return { ok: true, registration: request };
}

/** registrationRow — list fields plus a role rank for sorting. O(1) */
function registrationRow(request) {
  return {
    registrationId: request.registrationId,
    fullName: request.fullName,
    email: request.email,
    role: request.role,
    roleRank: ROLE_RANK[request.role],
    submittedAt: request.submittedAt,
    status: request.status,
    record: request,
  };
}

/**
 * listRegistrations — filter by status, search the text, sort with the chosen
 * algorithm. options: { status, query, sortField, sortOrder, algorithm }
 * Time O(r · L · m) search + O(r²) sort · Space O(r)
 */
function listRegistrations(options) {
  const status = options.status || 'all';
  const base = status === 'all' ? registrations : linearSearchAll(registrations, 'status', status);
  const found = textSearchRecords(base, ['fullName', 'email', 'registrationId', 'role'], options.query || '');
  const rows = [];
  for (let i = 0; i < found.length; i++) {
    arrayAppend(rows, registrationRow(found[i]));
  }
  const started = stopwatchStart();
  const sorted = sortRecords(rows, options.sortField || 'submittedAt', options.sortOrder || 'desc', options.algorithm || 'insertion');
  const ms = stopwatchMs(started);
  const stats = { algorithm: dsaLastRun.algorithm, comparisons: dsaLastRun.comparisons, moves: dsaLastRun.moves, ms: ms, n: rows.length };
  logOperation(stats.algorithm, 'Registrations list', rows.length, stats.comparisons, stats.moves, ms);
  return { rows: sorted, total: registrations.length, stats: stats };
}

/**
 * registrationForSignIn — for the sign-in page: the newest request for this
 * e-mail, when it is still waiting or was rejected, but only if the password
 * matches the one chosen when registering (otherwise null).
 * Time O(r) linear search from the newest + one password hash (400 fixed rounds
 * over the k characters, so O(k)) · Space O(1)
 */
function registrationForSignIn(email, password) {
  const wanted = toLowerText(trimText(email));
  for (let i = registrations.length - 1; i >= 0; i--) {
    const request = registrations[i];
    if (request.email === wanted) {                  // only the NEWEST request for this e-mail counts
      if (request.status === 'Approved') {
        return null;                                 // they have an account now — old requests don't matter
      }
      return hashPassword(password, request.passwordSalt) === request.passwordHash ? request : null;
    }
  }
  return null;
}

/**
 * registrationStatusMessage — what the sign-in page says about a request.
 * "Duplicate request" is not repeated to the person: it would hint that the
 * e-mail already belongs to a staff account. Time O(k) for the reason's length
 */
function registrationStatusMessage(request) {
  if (request.status === 'Pending') {
    return 'Your request ' + request.registrationId + ' is still waiting for an Owner or Admin to approve it. Try again once it’s approved.';
  }
  let reason = request.rejectReason;
  if (textStartsWith(reason, 'Duplicate request')) {
    return 'Your request ' + request.registrationId + ' was not approved. Please ask the office before sending a new request.';
  }
  if (reason.length > 0 && reason[reason.length - 1] === '.') {
    reason = textSlice(reason, 0, reason.length - 1);   // the sentence below adds its own full stop
  }
  return 'Your request ' + request.registrationId + ' was not approved: ' + reason + '. You can send a new request.';
}
