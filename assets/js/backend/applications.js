/* ==========================================================================
   E3 Fiber Connect - backend/applications.js
   Dito yung applications: pag-submit, pag-validate, paghanap, listahan, at yung
   paglipat ng status sa bawat step

     Pending --approve--> Approved --schedule--> For Installation --install--> Completed
        +--reject--> Rejected                                  (dito na gagawa ng subscriber)

   Laging naka-sort yung `applications` by reference number (laging mas malaki
   yung bagong number, kaya pag nag-append ayos pa rin yung order) -> kaya pwede
   yung binary search para mahanap kahit anong application.

   Mga module sa defense:
     Application, Application tracking           - si Joshua Santos
       (validateApplication, submitApplication, trackApplication, applicationProgress)
     Application List, Walk-in (New Application) - si Justin Banaag
       (listApplications, buildReviewQueue, submitApplication na may source "walk-in")
   ========================================================================== */

'use strict';

const APPLICATION_STATUSES = ['Pending', 'Approved', 'For Installation', 'Completed', 'Rejected'];
const APPLICATION_STEPS = ['Pending', 'Approved', 'For Installation', 'Completed'];
const OPEN_APPLICATION_STATUSES = ['Pending', 'Approved', 'For Installation'];
const ID_PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];
const ID_PHOTO_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_ID_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_OPEN_APPLICATIONS_PER_CLIENT = 3;   // pwede ang 2nd (o 3rd) na internet, pero hindi walang limit

/**
 * findApplication - hanapin yung application gamit yung reference number, null kung wala.
 * Binary search. Time: O(log n), Space: O(1)
 */
function findApplication(referenceNo) {
  const index = binarySearch(applications, 'referenceNo', referenceNo);
  return index === -1 ? null : applications[index];
}

/**
 * trackApplication - para sa public tracker: aayusin muna yung tinype na reference,
 * chine-check yung format, tapos binary search. Binabalik yung application (o null)
 * kasama kung ilang comparisons yung nagamit.
 * Time: O(log n)
 */
function trackApplication(input) {
  const referenceNo = normalizeReference(input);            // 1. ayusin muna: naka-capital, walang space
  if (!isValidReference(referenceNo)) {                     // 2. dapat ganito itsura: E3-2026-004879
    return { ok: false, referenceNo: referenceNo, error: 'Use the format E3-2026-004879.' };
  }
  const application = findApplication(referenceNo);         // 3. binary search sa naka-sort na table
  return {                                                  // 4. yung result + ilang comparisons yung nagamit
    ok: application !== null,
    referenceNo: referenceNo,
    application: application,
    comparisons: dsaLastRun.comparisons,
    n: applications.length,
    error: application ? '' : 'We couldn’t find ' + referenceNo + '. Check the number and try again.',
  };
}

/** textEndsWithIgnoreCase - check kung dun nagtatapos, halimbawa "ID.JPG" nagtatapos sa ".jpg". O(n) */
function textEndsWithIgnoreCase(value, ending) {
  const text = toLowerText(value);
  const tail = toLowerText(ending);
  if (tail.length > text.length) {
    return false;
  }
  return textSlice(text, text.length - tail.length) === tail;
}

/** isAllowedIdPhoto - JPG, PNG o PDF lang, base sa file name at sa type nito (kung alam). O(n) */
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
 * validateApplication - isa-isang check ng bawat field. Ang binabalik ay record na
 * ganito { email: 'Enter an e-mail...' } - empty lang pag okay lahat.
 * source: "online" (yung public form) o "walk-in" (yung form ng staff).
 * Time: O(n) dahil sa barangay / ID lookup, Space: O(1)
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
      errors.consent = 'Please read the Privacy Notice and give your consent to continue.';
    }
  } else {
    if (data.idPhotoName && !isAllowedIdPhoto(data.idPhotoName, data.idPhotoType)) {
      errors.idPhoto = 'Upload a JPG, PNG or PDF file.';
    }
    if (!data.idChecked) {
      errors.idChecked = 'Confirm that you checked the original ID.';
    }
    if (!data.consent) {                  // Data Privacy Act: kailangan din ng consent ng mga walk-in
      errors.consent = 'Confirm the customer agreed to the Privacy Notice.';
    }
  }
  return errors;
}

/**
 * openApplicationsFor - LAHAT ng application na in progress pa na pareho yung e-mail
 * o mobile number. Kailangan ito kasi pwede na mag-apply ng 2nd internet yung isang client.
 * Linear search. Time: O(n), Space: O(n)
 */
function openApplicationsFor(email, mobile) {
  const wantedEmail = toLowerText(trimText(email));
  const wantedMobile = digitsOnly(normalizeMobile(mobile));
  const found = [];
  for (let i = 0; i < applications.length; i++) {
    const app = applications[i];
    if (linearSearchValue(OPEN_APPLICATION_STATUSES, app.status) === -1) {
      continue;
    }
    if (toLowerText(app.email) === wantedEmail || (wantedMobile !== '' && digitsOnly(app.contactNumber) === wantedMobile)) {
      arrayAppend(found, app);
    }
  }
  return found;
}

/**
 * sameClient - iisang client ba yung dalawang record? Pareho yung e-mail o yung mobile. O(n)
 */
function sameClient(a, b) {
  const mobileA = digitsOnly(a.contactNumber);
  return toLowerText(a.email) === toLowerText(b.email) || (mobileA !== '' && mobileA === digitsOnly(b.contactNumber));
}

/**
 * sameRequestIn - sa mga application na in progress, meron bang pareho ang plan, barangay
 * at address? Kung meron, double submit lang yun, hindi bagong internet. Linear search.
 * Time: O(n), Space: O(1)
 */
function sameRequestIn(openApps, data) {
  const address = toLowerText(collapseSpaces(data.completeAddress));
  const barangay = findBarangay(data.barangay);                  // yung form ay key ang pinapasa, pangalan naman ang naka-save
  const barangayName = barangay ? barangay.name : data.barangay;
  for (let i = 0; i < openApps.length; i++) {
    const app = openApps[i];
    if (app.planId === data.planId && app.barangay === barangayName && toLowerText(collapseSpaces(app.completeAddress)) === address) {
      return app;
    }
  }
  return null;
}

/**
 * hasSubscriberAccount - may subscriber account na ba yung e-mail o mobile na ito? Linear search.
 * Time: O(n), Space: O(1)
 */
function hasSubscriberAccount(email, mobile) {
  const probe = { email: trimText(email), contactNumber: normalizeMobile(mobile) };
  for (let i = 0; i < subscribers.length; i++) {
    if (sameClient(subscribers[i], probe)) {
      return true;
    }
  }
  return false;
}

/**
 * clientConnections - yung ibang application at subscriber account ng parehong client
 * (para makita ng staff na 2nd internet pala ito). Hindi kasama yung record mismo.
 * Linear search sa dalawang table. Time: O(n), Space: O(n)
 */
function clientConnections(record) {
  const ownRef = record.referenceNo || record.accountNo;
  const result = { applications: [], subscribers: [] };
  for (let i = 0; i < applications.length; i++) {
    if (applications[i].referenceNo !== ownRef && sameClient(applications[i], record)) {
      arrayAppend(result.applications, applications[i]);
    }
  }
  for (let i = 0; i < subscribers.length; i++) {
    if (subscribers[i].accountNo !== ownRef && sameClient(subscribers[i], record)) {
      arrayAppend(result.subscribers, subscribers[i]);
    }
  }
  return result;
}

/**
 * submitApplication - i-validate muna, tapos mag-add ng bagong application gamit yung
 * susunod na reference number. Yung online galing sa customer; yung walk-in naman
 * tinatype ng staff (at pwedeng i-undo).
 * Pwede ang ilang application sa iisang client (halimbawa 2 internet) - tinatanggap lang
 * namin at nilalagyan ng tag na "additional line". Ang bawal lang: yung parehong plan sa
 * parehong address na in progress pa (ibig sabihin na-double submit lang), at higit sa 3
 * na sabay-sabay na in progress.
 * Time: O(n) (duplicate check) + O(1) append, Space: O(1)
 */
function submitApplication(data, source, actor) {
  const errors = validateApplication(data, source);                        // 1. i-check lahat ng field
  if (hasAnyErrors(errors)) {
    return { ok: false, errors: errors };
  }
  const open = openApplicationsFor(data.email, data.contactNumber);       // 2. may in progress pa ba ang client na ito?
  if (open.length >= MAX_OPEN_APPLICATIONS_PER_CLIENT) {
    return { ok: false, errors: { email: 'There are already ' + MAX_OPEN_APPLICATIONS_PER_CLIENT + ' applications in progress for this e-mail or mobile number. Please wait until one is installed.' } };
  }
  const repeat = sameRequestIn(open, data);                                //    parehong plan sa parehong address = na-double submit lang
  if (repeat) {
    const which = source === 'online' ? 'You already applied' : 'Application ' + repeat.referenceNo + ' is already in progress';   // sa public form, walang reference na pinapakita
    return { ok: false, errors: { completeAddress: which + ' for this plan at this address. Choose another plan or address for an additional connection.' } };
  }
  const additionalLine = open.length > 0 || hasSubscriberAccount(data.email, data.contactNumber);   // may iba na siyang application o account

  counters.reference = counters.reference + 1;                             // 3. kunin yung susunod na reference number
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
    consentAt: now,                       // proof na pumayag sila (Data Privacy Act, RA 10173)
    source: source,
    notes: '',
    installDate: null,
    installSlot: null,
    rejectReason: '',
    additionalLine: additionalLine,              // 2nd (o 3rd) na internet ng parehong client
    history: [{ status: 'Pending', at: now, by: byName, note: (source === 'online' ? 'Application received online' : 'Walk-in application at the office') + (additionalLine ? ' (additional connection)' : '') }],
  };
  arrayAppend(applications, application); // 4. pinakamalaki yung bagong number -> naka-sort pa rin yung table

  if (source === 'online') {              // 5. i-log (yung walk-in na tinype ng staff, pwede ring i-undo)
    logActivity('application', 'New online application ' + referenceNo + ' from ' + application.fullName, 'Customer');
  } else {
    logActivity('application', 'Walk-in application ' + referenceNo + ' for ' + application.fullName, nameOfActor(actor));
    pushUndo('Create walk-in application ' + referenceNo, [insertOperation('applications', referenceNo)], nameOfActor(actor));
  }
  markDataChanged();
  return { ok: true, application: application };
}

/** applicationRow - yung mga field na kailangan ng list, kasama yung presyo ng plan para sa sorting. O(1) */
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
 * listApplications - i-filter by status (linear search), hanapin yung text
 * (naive string matching), tapos i-sort gamit yung napiling algorithm.
 * options: { status, query, sortField, sortOrder, algorithm }
 * Time: O(n²) search + O(n²) sort, Space: O(n)
 */
function listApplications(options) {
  const status = options.status || 'all';
  const base = status === 'all' ? applications : linearSearchAll(applications, 'status', status);  // 1. i-filter by status
  const found = textSearchRecords(base, ['fullName', 'email', 'referenceNo', 'barangay', 'contactNumber'], options.query || ''); // 2. galing sa search box
  const rows = [];
  for (let i = 0; i < found.length; i++) {                  // 3. lagyan ng plan name at presyo bawat row
    arrayAppend(rows, applicationRow(found[i]));
  }
  const started = stopwatchStart();
  const sorted = sortRecords(rows, options.sortField || 'submittedAt', options.sortOrder || 'desc', options.algorithm || 'insertion'); // 4. i-sort
  const ms = stopwatchMs(started);
  const stats = { algorithm: dsaLastRun.algorithm, comparisons: dsaLastRun.comparisons, moves: dsaLastRun.moves, ms: ms, n: rows.length };
  logOperation(stats.algorithm, 'Applications list', rows.length, stats.comparisons, stats.moves, ms); // 5. ipakita yung cost
  return { rows: sorted, total: applications.length, stats: stats };
}

/**
 * countApplicationsByStatus - isang daan lang sa buong table.
 * Time: O(n), Space: O(1)
 */
function countApplicationsByStatus() {
  const counts = { all: applications.length, Pending: 0, Approved: 0, 'For Installation': 0, Completed: 0, Rejected: 0 };
  for (let i = 0; i < applications.length; i++) {
    counts[applications[i].status] = counts[applications[i].status] + 1;
  }
  return counts;
}

/**
 * buildReviewQueue - QUEUE ng mga pending na application, yung pinakaluma una.
 * Naka-order na by submission yung table, kaya isang loop lang tapos enqueue na (FIFO).
 * Time: O(n), Space: O(n) para sa mga pending
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
 * buildInstallQueue - QUEUE ng mga naka-schedule na installation, pinakamaagang date una
 * (insertion sort by installDate, tapos enqueue sa ganung order).
 * Time: O(n²), Space: O(n)
 */
function buildInstallQueue() {
  const scheduled = insertionSort(linearSearchAll(applications, 'status', 'For Installation'), 'installDate', 'asc');
  const queue = createQueue(8);
  for (let i = 0; i < scheduled.length; i++) {
    enqueue(queue, scheduled[i]);
  }
  return queue;
}

/** addHistoryStep - mag-append ng isang step sa timeline ng application. O(1) */
function addHistoryStep(app, status, actor, note) {
  arrayAppend(app.history, { status: status, at: nowISO(), by: nameOfActor(actor), note: note });
}

/** approveApplication - Pending -> Approved. Time: O(log n) */
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

/** rejectApplication - Pending -> Rejected, may kasamang reason. Time: O(log n) */
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
 * scheduleInstallation - Approved -> For Installation (o kaya palitan yung date ng
 * naka-schedule na). Dapat yung date ay mula ngayon hanggang 60 days.
 * Time: O(log n)
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
 * completeInstallation - For Installation -> Completed, tapos gagawa na ng subscriber
 * account ng customer (account number = reference number). Pag in-undo, tanggal pareho.
 * extras: { modemSerial } galing sa "Create account" form (optional).
 * Time: O(n) (sorted insert ng subscriber)
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

/** updateApplicationNotes - i-save yung notes ng staff (hindi kasama sa Undo). Time: O(log n) */
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

/** historyStepFor - yung pinakabagong step sa timeline na may ganitong status, o null. O(n) */
function historyStepFor(app, status) {
  for (let i = app.history.length - 1; i >= 0; i--) {
    if (app.history[i].status === status) {
      return app.history[i];
    }
  }
  return null;
}

/**
 * applicationProgress - yung mga step na lumalabas sa tracker at sa review page.
 * Yung mga step hanggang current status ay "done", yung kasunod ay "current",
 * tapos "upcoming" na yung iba. Pag rejected, maikling two-step path lang ang lalabas.
 * Time: O(n) para sa n na timeline entries, Space: O(1)
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

/** waitingDays - ilang buong araw na mula nung pinasa yung application. O(1) */
function waitingDays(app) {
  return daysBetweenISO(datePart(app.submittedAt), todayISO());
}
