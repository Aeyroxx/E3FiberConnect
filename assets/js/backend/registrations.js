/* ==========================================================================
   E3 Fiber Connect - backend/registrations.js
   Dito yung staff registration ("Request staff access") at yung pag-approve nito.

     Pending --approve--> Approved   (gagawa ng staff account)
        `--reject--> Rejected

   Yung bagong empleyado, magfi-fill up ng request form; tapos maghihintay yung
   request sa QUEUE (FIFO) hanggang i-review ng Owner o Admin, first come first served.
   Naka-sort yung `registrations` by registrationId (pataas lang yung id, kaya kahit
   append lang, sorted pa rin) -> binary search yung panghanap ng request. Bago
   i-approve, chine-check muna yung e-mail sa staff HASH TABLE (staffEmailIndex), O(1).
   Yung password na pinili ng tao, salted hash lang yung sine-save, at yung hash na
   yun mismo yung nililipat sa bagong staff account. Walang ibang nakakakita nito.
   Module sa defense: Admin Registration + Approval (si Dela Cruz Riceerich ang mag-eexplain)
   ========================================================================== */

'use strict';

/** findRegistration - binary search gamit yung registrationId. Time: O(log n), Space: O(1) */
function findRegistration(registrationId) {
  const index = binarySearch(registrations, 'registrationId', registrationId);
  return index === -1 ? null : registrations[index];
}

/** isWorkEmail - valid na e-mail at nagtatapos sa "@e3fiberconnect.ph". O(n) */
function isWorkEmail(email) {
  return isValidEmail(email) && textEndsWithIgnoreCase(trimText(email), STAFF_EMAIL_DOMAIN);
}

/** pendingRegistrationFor - hanapin kung may naghihintay pang request para sa e-mail na ito (linear search). O(n) */
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
 * validateRegistration - isa-isang check ng mga field sa request form.
 * HINDI nito sinasabi kung may staff account na yung e-mail (pwede kasing gamitin
 * ng ibang tao para malaman kung anong e-mail ang meron); sa reviewer lang lumalabas yun.
 * Time: O(n), Space: O(1)
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
 * submitRegistration - i-save yung request gamit yung susunod na id (append lang -> sorted pa rin).
 * Time: O(n) sa mga check + O(1) append, Space: O(1)
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
 * registrationQueue - yung mga request na naghihintay ng approval, oldest first (FIFO).
 * Naka-order na yung table ayon sa pagdating, kaya isang loop lang para ma-enqueue lahat.
 * Time: O(n), Space: O(n) para sa mga Pending na request
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

/** countRegistrationsByStatus - isang loop lang, para sa mga badge at filter. Time: O(n), Space: O(1) */
function countRegistrationsByStatus() {
  const counts = { all: registrations.length, Pending: 0, Approved: 0, Rejected: 0 };
  for (let i = 0; i < registrations.length; i++) {
    counts[registrations[i].status] = counts[registrations[i].status] + 1;
  }
  return counts;
}

/**
 * registrationChecks - mga dapat malaman ng reviewer bago mag-approve:
 * work e-mail ba, wala pa bang staff account na may ganung e-mail (hash table),
 * at allowed ba yung reviewer na mag-approve.
 * Binabalik: { checks, passed, firstFailure }
 * Time: O(n), Space: O(1)
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
 * approveRegistration - Pending -> Approved. Gagawa ng staff account gamit yung
 * role at yung (naka-hash na) password galing sa request, tapos ilalagay yung
 * e-mail sa hash table. Isang undo lang, tanggal yung account at bukas ulit yung request.
 * Time: O(log n) + O(1) append + O(1) average na hash put, Space: O(1)
 */
function approveRegistration(registrationId, actor) {
  const stepUp = stepUpRequired();                            // 0. two-step verification: kailangan may Google Authenticator code sa nakaraang 5 minutes
  if (stepUp) {
    return stepUp;
  }
  const request = findRegistration(registrationId);           // 1. binary search gamit yung request id
  if (!request) {
    return { ok: false, error: 'Registration not found.' };
  }
  if (request.status !== 'Pending') {
    return { ok: false, error: 'This request was already ' + toLowerText(request.status) + '.' };
  }
  const review = registrationChecks(request, actor);          // 2. work e-mail, hindi pa gamit yung e-mail (hash table), allowed yung reviewer
  if (!review.passed) {
    return { ok: false, error: 'Can’t approve — ' + review.firstFailure.text };
  }
  counters.staff = counters.staff + 1;                        // 3. buuin yung staff account gamit yung hash ng pinili niyang password
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
  arrayAppend(staffMembers, member);          // 4. pataas yung id -> sorted pa rin yung table
  hashPut(staffEmailIndex, member.email, id); // 5. i-index yung e-mail para makapag-sign in na yung bagong member
  const before = snapshotFields(request, ['status', 'reviewedBy', 'reviewedAt', 'staffId']);
  request.status = 'Approved';                // 6. gawing Approved yung request (aalis na siya sa queue)
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

/** rejectRegistration - Pending -> Rejected, may kasamang reason. Time: O(log n), Space: O(1) */
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

/** registrationRow - mga field para sa list, plus role rank pang-sort. O(1) */
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
 * listRegistrations - i-filter by status, i-search yung text, tapos i-sort gamit
 * yung napiling algorithm. options: { status, query, sortField, sortOrder, algorithm }
 * Time: O(n²) search + O(n²) sort, Space: O(n)
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
 * registrationForSignIn - para sa sign-in page: yung pinakabagong request ng e-mail
 * na ito, kung naghihintay pa o na-reject, pero kung tugma lang yung password sa
 * pinili nung nag-register (kung hindi, null).
 * Time: O(n) linear search mula sa pinakabago + isang password hash (400 fixed rounds
 * sa n characters, kaya O(n)), Space: O(1)
 */
function registrationForSignIn(email, password) {
  const wanted = toLowerText(trimText(email));
  for (let i = registrations.length - 1; i >= 0; i--) {
    const request = registrations[i];
    if (request.email === wanted) {                  // yung PINAKABAGONG request lang ng e-mail na ito ang binibilang
      if (request.status === 'Approved') {
        return null;                                 // may account na sila, wala nang epekto yung mga lumang request
      }
      return hashPassword(password, request.passwordSalt) === request.passwordHash ? request : null;
    }
  }
  return null;
}

/**
 * registrationStatusMessage - yung sasabihin ng sign-in page tungkol sa request.
 * Hindi namin pinapakita yung "Duplicate request" sa tao, kasi parang sinabi na rin
 * namin na may staff account na yung e-mail. Time: O(n) sa haba ng reason
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
    reason = textSlice(reason, 0, reason.length - 1);   // may sariling period na yung sentence sa baba
  }
  return 'Your request ' + request.registrationId + ' was not approved: ' + reason + '. You can send a new request.';
}
