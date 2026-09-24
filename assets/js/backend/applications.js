/* ==========================================================================
   E3 Fiber Connect · backend/applications.js
   Applications: submit, validate, find, list, and move through the flow

     Pending ──approve──▶ Approved ──schedule──▶ For Installation ──install──▶ Completed
        └──reject──▶ Rejected                                  (creates a subscriber)

   `applications` stays sorted by reference number (new numbers are always
   larger, so appending keeps the order) → binary search finds any application.

   Defense modules:
     Application, Application tracking          — Joshua Santos
       (validateApplication, submitApplication, trackApplication, applicationProgress)
     Application List, Walk-in (New Application) — Justin Banaag
       (listApplications, buildReviewQueue, submitApplication with source "walk-in")
   ========================================================================== */

'use strict';

const APPLICATION_STATUSES = ['Pending', 'Approved', 'For Installation', 'Completed', 'Rejected'];
const APPLICATION_STEPS = ['Pending', 'Approved', 'For Installation', 'Completed'];
const OPEN_APPLICATION_STATUSES = ['Pending', 'Approved', 'For Installation'];
const ID_PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];
const ID_PHOTO_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_ID_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * findApplication — the application with this reference number, or null.
 * Binary search. Time O(log n) · Space O(1)
 */
function findApplication(referenceNo) {
  const index = binarySearch(applications, 'referenceNo', referenceNo);
  return index === -1 ? null : applications[index];
}

/**
 * trackApplication — public tracker: tidy the typed reference, check its shape,
 * then binary search. Returns the application (or null) with the search cost.
 * Time O(log n)
 */
function trackApplication(input) {
  const referenceNo = normalizeReference(input);            // 1. tidy it: capitals, no spaces
  if (!isValidReference(referenceNo)) {                     // 2. it must look like E3-2026-004879
    return { ok: false, referenceNo: referenceNo, error: 'Use the format E3-2026-004879.' };
  }
  const application = findApplication(referenceNo);         // 3. binary search on the sorted table
  return {                                                  // 4. the result + how many comparisons it took
    ok: application !== null,
    referenceNo: referenceNo,
    application: application,
    comparisons: dsaLastRun.comparisons,
    n: applications.length,
    error: application ? '' : 'We couldn’t find ' + referenceNo + '. Check the number and try again.',
  };
}

/** textEndsWithIgnoreCase — "ID.JPG" ends with ".jpg". O(m) */
function textEndsWithIgnoreCase(value, ending) {
  const text = toLowerText(value);
  const tail = toLowerText(ending);
  if (tail.length > text.length) {
    return false;
  }
  return textSlice(text, text.length - tail.length) === tail;
}

/** isAllowedIdPhoto — JPG, PNG or PDF, judged by the file name and (if known) its type. O(k) */
function isAllowedIdPhoto(fileName, fileType) {
  let extensionOk = false;
  for (let i = 0; i < ID_PHOTO_EXTENSIONS.length; i++) {
    if (textEndsWithIgnoreCase(fileName, ID_PHOTO_EXTENSIONS[i])) {
      extensionOk = true;
    }
  }
  const typeOk = !fileType || linearSearchValue(ID_PHOTO_TYPES, fileType) !== -1;
  return extensionOk && typeOk;
}

/**
 * findOpenApplicationFor — an application still in progress with the same
 * e-mail or mobile number (stops duplicate applications). Linear search.
 * Time O(n) · Space O(1)
 */
function findOpenApplicationFor(email, mobile) {
  const wantedEmail = toLowerText(trimText(email));
  const wantedMobile = digitsOnly(normalizeMobile(mobile));
  for (let i = 0; i < applications.length; i++) {
    const app = applications[i];
    if (linearSearchValue(OPEN_APPLICATION_STATUSES, app.status) === -1) {
      continue;
    }
    if (toLowerText(app.email) === wantedEmail || (wantedMobile !== '' && digitsOnly(app.contactNumber) === wantedMobile)) {
      return app;
    }
  }
  return null;
}

/**
 * validateApplication — field-by-field checks. Returns a record like
 * { email: 'Enter an e-mail…' } — empty when everything is fine.
 * source: "online" (public form) or "walk-in" (staff form).
 * Time O(n) for the barangay / ID look-ups · Space O(1)
 */
function validateApplication(data, source) {
  const errors = {};
  const today = todayISO();

  if (source === 'walk-in' && data.planId === 'custom') {
    const price = Number(data.customPrice);
    if (!(price >= 300 && price <= 20000)) {
      errors.customPrice = 'Enter a monthly price from ₱300 to ₱20,000.';
    }
  } else if (!findPlan(data.planId)) {
    errors.planId = 'Choose a plan.';
  }

  const name = collapseSpaces(data.fullName);
  if (name.length < 3 || textFind(name, ' ') === -1) {
    errors.fullName = 'Enter the first and last name.';
  } else if (name.length > 80) {
    errors.fullName = 'Use 80 characters or fewer.';
  }
  if (!isValidEmail(data.email)) {
    errors.email = 'Enter an e-mail like name@example.com.';
  }
  if (!isValidMobile(data.contactNumber)) {
    errors.contactNumber = 'Enter an 11-digit mobile number like 0917 555 0199.';
  }
  if (!isValidISODate(data.birthDate)) {
    errors.birthDate = 'Enter the birth date.';
  } else if (data.birthDate > today) {
    errors.birthDate = 'The birth date can’t be in the future.';
  } else if (ageOn(data.birthDate, today) < 18) {
    errors.birthDate = 'The applicant must be at least 18 years old.';
  } else if (ageOn(data.birthDate, today) > 120) {
    errors.birthDate = 'Check the birth year.';
  }

  if (!findBarangay(data.barangay)) {
    errors.barangay = 'Choose a barangay in Santa Maria.';
  }
  if (trimText(data.completeAddress).length < 5) {
    errors.completeAddress = 'Enter the house number and street.';
  } else if (trimText(data.completeAddress).length > 150) {
    errors.completeAddress = 'Use 150 characters or fewer.';
  }
  if (trimText(data.landmark).length > 100) {
    errors.landmark = 'Use 100 characters or fewer.';
  }

  if (linearSearchValue(ID_TYPES, data.idType) === -1) {
    errors.idType = 'Choose an ID type.';
  }
  if (trimText(data.idNumber).length < 4) {
    errors.idNumber = 'Enter the ID number.';
  } else if (trimText(data.idNumber).length > 30) {
    errors.idNumber = 'Use 30 characters or fewer.';
  }

  if (source === 'online') {
    if (!data.idPhotoName) {
      errors.idPhoto = 'Upload a photo of the ID.';
    } else if (!isAllowedIdPhoto(data.idPhotoName, data.idPhotoType)) {
      errors.idPhoto = 'Upload a JPG, PNG or PDF file.';
    } else if (data.idPhotoSize > MAX_ID_PHOTO_BYTES) {
      errors.idPhoto = 'The file must be 10 MB or smaller.';
    }
    if (!data.consent) {
      errors.consent = 'Please confirm the details are correct.';
    }
  } else {
    if (data.idPhotoName && !isAllowedIdPhoto(data.idPhotoName, data.idPhotoType)) {
      errors.idPhoto = 'Upload a JPG, PNG or PDF file.';
    }
    if (!data.idChecked) {
      errors.idChecked = 'Confirm that you checked the original ID.';
    }
  }
  return errors;
}

/**
 * submitApplication — validate, then add a new application with the next
 * reference number. Online applications come from customers; walk-ins are
 * typed by staff (and can be undone).
 * Time O(n) (duplicate check) + O(1) append · Space O(1)
 */
function submitApplication(data, source, actor) {
  const errors = validateApplication(data, source);                        // 1. check every field
  if (hasAnyErrors(errors)) {
    return { ok: false, errors: errors };
  }
  const duplicate = findOpenApplicationFor(data.email, data.contactNumber); // 2. one open application per person
  if (duplicate) {
    return { ok: false, errors: { email: 'An application for this e-mail or mobile number is already in progress (' + duplicate.referenceNo + ').' } };
  }

  counters.reference = counters.reference + 1;                             // 3. the next reference number
  const now = nowISO();
  const referenceNo = formatReferenceNo(readClock().year, counters.reference);
  const barangay = findBarangay(data.barangay);
  const byName = source === 'online' ? 'Online form' : nameOfActor(actor) + ' (walk-in)';
  const application = {
    referenceNo: referenceNo,
    fullName: collapseSpaces(data.fullName),
    email: trimText(data.email),
    contactNumber: normalizeMobile(data.contactNumber),
    birthDate: data.birthDate,
    city: SERVICE_CITY,
    barangay: barangay.name,
    completeAddress: collapseSpaces(data.completeAddress),
    landmark: collapseSpaces(data.landmark),
    planId: data.planId,
    customPrice: data.planId === 'custom' ? Number(data.customPrice) : null,
    idType: data.idType,
    idNumber: trimText(data.idNumber),
    idPhotoName: textOf(data.idPhotoName),
    status: 'Pending',
    submittedAt: now,
    source: source,
    notes: '',
    installDate: null,
    installSlot: null,
    rejectReason: '',
    history: [{ status: 'Pending', at: now, by: byName, note: source === 'online' ? 'Application received online' : 'Walk-in application at the office' }],
  };
  arrayAppend(applications, application); // 4. the new number is the largest → the table stays sorted

  if (source === 'online') {              // 5. log it (walk-ins typed by staff can also be undone)
    logActivity('application', 'New online application ' + referenceNo + ' from ' + application.fullName, 'Customer');
  } else {
    logActivity('application', 'Walk-in application ' + referenceNo + ' for ' + application.fullName, nameOfActor(actor));
    pushUndo('Create walk-in application ' + referenceNo, [insertOperation('applications', referenceNo)], nameOfActor(actor));
  }
  markDataChanged();
  return { ok: true, application: application };
}

/** applicationRow — the fields a list needs, including the plan price for sorting. O(1) */
function applicationRow(app) {
  return {
    referenceNo: app.referenceNo,
    fullName: app.fullName,
    email: app.email,
    barangay: app.barangay,
    submittedAt: app.submittedAt,
    status: app.status,
    planId: app.planId,
    planName: planName(app.planId),
    price: planPrice(app.planId, app.customPrice),
    installDate: app.installDate,
    source: app.source,
    record: app,
  };
}

/**
 * listApplications — filter by status (linear search), search the text
 * (naive string matching), then sort with the chosen algorithm.
 * options: { status, query, sortField, sortOrder, algorithm }
 * Time O(n · L · m) search + O(n²) sort · Space O(n)
 */
function listApplications(options) {
  const status = options.status || 'all';
  const base = status === 'all' ? applications : linearSearchAll(applications, 'status', status);  // 1. filter by status
  const found = textSearchRecords(base, ['fullName', 'email', 'referenceNo', 'barangay', 'contactNumber'], options.query || ''); // 2. search box
  const rows = [];
  for (let i = 0; i < found.length; i++) {                  // 3. add the plan name and price to each row
    arrayAppend(rows, applicationRow(found[i]));
  }
  const started = stopwatchStart();
  const sorted = sortRecords(rows, options.sortField || 'submittedAt', options.sortOrder || 'desc', options.algorithm || 'insertion'); // 4. sort
  const ms = stopwatchMs(started);
  const stats = { algorithm: dsaLastRun.algorithm, comparisons: dsaLastRun.comparisons, moves: dsaLastRun.moves, ms: ms, n: rows.length };
  logOperation(stats.algorithm, 'Applications list', rows.length, stats.comparisons, stats.moves, ms); // 5. show the cost
  return { rows: sorted, total: applications.length, stats: stats };
}

/**
 * countApplicationsByStatus — one pass over the table.
 * Time O(n) · Space O(1)
 */
function countApplicationsByStatus() {
  const counts = { all: applications.length, Pending: 0, Approved: 0, 'For Installation': 0, Completed: 0, Rejected: 0 };
  for (let i = 0; i < applications.length; i++) {
    counts[applications[i].status] = counts[applications[i].status] + 1;
  }
  return counts;
}

/**
 * buildReviewQueue — a QUEUE of pending applications, oldest first.
 * The table is already in submission order, so one pass enqueues them FIFO.
 * Time O(n) · Space O(p) for p pending applications
 */
function buildReviewQueue() {
  const queue = createQueue(8);
  for (let i = 0; i < applications.length; i++) {
    if (applications[i].status === 'Pending') {
      enqueue(queue, applications[i]);
    }
  }
  return queue;
}

/**
 * buildInstallQueue — a QUEUE of scheduled installations, earliest date first
 * (insertion sort by installDate, then enqueue in that order).
 * Time O(n + k²) · Space O(k)
 */
function buildInstallQueue() {
  const scheduled = insertionSort(linearSearchAll(applications, 'status', 'For Installation'), 'installDate', 'asc');
  const queue = createQueue(8);
  for (let i = 0; i < scheduled.length; i++) {
    enqueue(queue, scheduled[i]);
  }
  return queue;
}

/** addHistoryStep — append one step to an application's timeline. O(1) */
function addHistoryStep(app, status, actor, note) {
  arrayAppend(app.history, { status: status, at: nowISO(), by: nameOfActor(actor), note: note });
}

/** approveApplication — Pending → Approved. Time O(log n) */
function approveApplication(referenceNo, actor) {
  const app = findApplication(referenceNo);
  if (!app) {
    return { ok: false, error: 'Application not found.' };
  }
  if (app.status !== 'Pending') {
    return { ok: false, error: 'Only pending applications can be approved.' };
  }
  const before = snapshotFields(app, ['status', 'history']);
  app.status = 'Approved';
  addHistoryStep(app, 'Approved', actor, 'Documents verified');
  pushUndo('Approve ' + referenceNo + ' (' + app.fullName + ')', [updateOperation('applications', referenceNo, before)], nameOfActor(actor));
  logActivity('application', 'Approved ' + referenceNo + ' (' + app.fullName + ')', nameOfActor(actor));
  markDataChanged();
  return { ok: true, application: app };
}

/** rejectApplication — Pending → Rejected, with a reason. Time O(log n) */
function rejectApplication(referenceNo, reason, note, actor) {
  const app = findApplication(referenceNo);
  if (!app) {
    return { ok: false, error: 'Application not found.' };
  }
  if (app.status !== 'Pending') {
    return { ok: false, error: 'Only pending applications can be rejected.' };
  }
  if (linearSearchValue(REJECT_REASONS, reason) === -1) {
    return { ok: false, error: 'Choose a reason.' };
  }
  const extra = collapseSpaces(note);
  if (reason === 'Other' && extra.length < 5) {
    return { ok: false, error: 'Describe the reason in a few words.' };
  }
  const before = snapshotFields(app, ['status', 'history', 'rejectReason']);
  app.status = 'Rejected';
  app.rejectReason = extra ? reason + ' — ' + extra : reason;
  addHistoryStep(app, 'Rejected', actor, app.rejectReason);
  pushUndo('Reject ' + referenceNo + ' (' + app.fullName + ')', [updateOperation('applications', referenceNo, before)], nameOfActor(actor));
  logActivity('application', 'Rejected ' + referenceNo + ' (' + app.fullName + ')', nameOfActor(actor));
  markDataChanged();
  return { ok: true, application: app };
}

/**
 * scheduleInstallation — Approved → For Installation (or change the date of a
 * scheduled one). The date must be from today to 60 days ahead.
 * Time O(log n)
 */
function scheduleInstallation(referenceNo, dateISO, slot, actor) {
  const app = findApplication(referenceNo);
  if (!app) {
    return { ok: false, error: 'Application not found.' };
  }
  if (app.status !== 'Approved' && app.status !== 'For Installation') {
    return { ok: false, error: 'Approve the application before scheduling the installation.' };
  }
  const today = todayISO();
  if (!isValidISODate(dateISO) || dateISO < today) {
    return { ok: false, error: 'Choose today or a later date.' };
  }
  if (daysBetweenISO(today, dateISO) > 60) {
    return { ok: false, error: 'Choose a date within the next 60 days.' };
  }
  if (linearSearchValue(INSTALL_SLOTS, slot) === -1) {
    return { ok: false, error: 'Choose a time slot.' };
  }
  const rescheduling = app.status === 'For Installation';
  const before = snapshotFields(app, ['status', 'history', 'installDate', 'installSlot']);
  app.status = 'For Installation';
  app.installDate = dateISO;
  app.installSlot = slot;
  addHistoryStep(app, 'For Installation', actor, (rescheduling ? 'Moved to ' : 'Installation set for ') + formatDate(dateISO) + ', ' + slot);
  pushUndo((rescheduling ? 'Reschedule ' : 'Schedule ') + referenceNo + ' for ' + formatShortDate(dateISO), [updateOperation('applications', referenceNo, before)], nameOfActor(actor));
  logActivity('application', (rescheduling ? 'Rescheduled installation for ' : 'Scheduled installation for ') + referenceNo + ' on ' + formatDate(dateISO), nameOfActor(actor));
  markDataChanged();
  return { ok: true, application: app };
}

/**
 * completeInstallation — For Installation → Completed, and open the customer's
 * subscriber account (account number = reference number). Undo removes both.
 * extras: { modemSerial } from the "Create account" form (optional).
 * Time O(n) (sorted insert of the subscriber)
 */
function completeInstallation(referenceNo, actor, extras) {
  const app = findApplication(referenceNo);
  if (!app) {
    return { ok: false, error: 'Application not found.' };
  }
  if (app.status !== 'For Installation') {
    return { ok: false, error: 'Schedule the installation first.' };
  }
  if (findSubscriber(referenceNo)) {
    return { ok: false, error: 'This customer already has a subscriber account.' };
  }
  const today = todayISO();
  const before = snapshotFields(app, ['status', 'history', 'installDate']);
  app.status = 'Completed';
  if (!app.installDate || app.installDate > today) {
    app.installDate = today;
  }
  addHistoryStep(app, 'Completed', actor, 'Installed and connected');
  const created = createSubscriberFromApplication(app, nowISO(), extras);
  pushUndo('Create account ' + referenceNo + ' for ' + app.fullName, [
    updateOperation('applications', referenceNo, before),
    insertOperation('subscribers', created.subscriber.accountNo),
  ], nameOfActor(actor));
  logActivity('application', 'Installed ' + referenceNo + ' — new subscriber ' + app.fullName, nameOfActor(actor));
  markDataChanged();
  return { ok: true, application: app, subscriber: created.subscriber, position: created.position };
}

/** updateApplicationNotes — save staff notes (not part of Undo). Time O(log n) */
function updateApplicationNotes(referenceNo, notes, actor) {
  const app = findApplication(referenceNo);
  if (!app) {
    return { ok: false, error: 'Application not found.' };
  }
  const text = trimText(notes);
  if (text.length > 500) {
    return { ok: false, error: 'Notes can be up to 500 characters.' };
  }
  app.notes = text;
  logActivity('application', 'Updated notes on ' + referenceNo, nameOfActor(actor));
  markDataChanged();
  return { ok: true, application: app };
}

/** historyStepFor — the latest timeline step with a given status, or null. O(h) */
function historyStepFor(app, status) {
  for (let i = app.history.length - 1; i >= 0; i--) {
    if (app.history[i].status === status) {
      return app.history[i];
    }
  }
  return null;
}

/**
 * applicationProgress — the steps shown on the tracker and the review page.
 * Steps up to the current status are "done", the next one is "current",
 * the rest "upcoming". A rejected application shows a short two-step path.
 * Time O(h) for h timeline entries · Space O(1)
 */
function applicationProgress(app) {
  if (app.status === 'Rejected') {
    const rejected = historyStepFor(app, 'Rejected');
    return [
      { key: 'Pending', title: 'Application received', state: 'done', at: app.submittedAt, note: 'We received the application.' },
      { key: 'Rejected', title: 'Not approved', state: 'failed', at: rejected ? rejected.at : null, note: app.rejectReason || 'The application was not approved.' },
    ];
  }
  const visit = app.installDate ? formatDate(app.installDate) + (app.installSlot ? ', ' + app.installSlot : '') : '';
  const text = [
    { done: 'Application received', current: 'Application received', note: 'We received the application.', currentNote: '' },
    { done: 'Approved', current: 'Under review', note: 'Documents and coverage checked.', currentNote: 'Our team is checking the documents and coverage — usually 1 to 2 days.' },
    { done: 'Installation scheduled', current: 'Scheduling installation', note: 'Technician visit: ' + visit + '.', currentNote: 'We will call to agree on an installation date.' },
    { done: 'Connected', current: 'Installation day', note: 'Fiber installed — welcome to E3 Fiber!', currentNote: 'Our technician will install the fiber on ' + visit + '.' },
  ];
  const currentIndex = linearSearchValue(APPLICATION_STEPS, app.status);
  const steps = [];
  for (let i = 0; i < APPLICATION_STEPS.length; i++) {
    const step = historyStepFor(app, APPLICATION_STEPS[i]);
    let state = 'upcoming';
    if (i <= currentIndex) {
      state = 'done';
    } else if (i === currentIndex + 1) {
      state = 'current';
    }
    arrayAppend(steps, {
      key: APPLICATION_STEPS[i],
      title: state === 'current' ? text[i].current : text[i].done,
      state: state,
      at: state === 'done' && step ? step.at : null,
      note: state === 'current' ? text[i].currentNote : (state === 'done' ? text[i].note : ''),
    });
  }
  return steps;
}

/** waitingDays — whole days since the application was sent. O(1) */
function waitingDays(app) {
  return daysBetweenISO(datePart(app.submittedAt), todayISO());
}
