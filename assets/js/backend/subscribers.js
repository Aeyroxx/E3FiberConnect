/* ==========================================================================
   E3 Fiber Connect - backend/subscribers.js
   Dito yung mga subscriber account. Nagkakaroon ng subscriber pag na-mark nang
   complete yung installation; yung account number ay yung reference number ng application.

     Active <--suspend / reactivate--> Suspended        Active o Suspended --> Terminated

   Naka-sort yung `subscribers` by account number gamit sortedInsert (kasi
   kahit anong order natatapos yung installations), kaya binary search lang pag maghahanap.

   Modules sa defense:
     Create Account           - si Justin Banaag
       (previewSubscriberAccount, validateAccountDetails, createSubscriberAccount,
        createSubscriberFromApplication)
     Accounts management      - si Dela Cruz Riceerich
       (findSubscriber, listSubscribers, setSubscriberStatus, changeSubscriberPlan)
   ========================================================================== */

'use strict';

const SUBSCRIBER_STATUSES = ['Active', 'Suspended', 'Terminated'];

/**
 * findSubscriber - hanapin yung subscriber na may ganitong account number, null kung wala.
 * Binary search. Time: O(log n), Space: O(1)
 */
function findSubscriber(accountNo) {
  const index = binarySearch(subscribers, 'accountNo', accountNo);
  return index === -1 ? null : subscribers[index];
}

/**
 * createSubscriberFromApplication - gagawan ng account yung completed na
 * application ("put" gamit sortedInsert). Binabalik: { subscriber, position }.
 * Time: O(log n) search + O(n) shift, Space: O(1)
 */
function createSubscriberFromApplication(app, sinceISO, extras) {
  const subscriber = {
    accountNo: app.referenceNo,
    fullName: app.fullName,
    email: app.email,
    contactNumber: app.contactNumber,
    barangay: app.barangay,
    completeAddress: app.completeAddress,
    landmark: app.landmark,
    planId: app.planId,
    customPrice: app.customPrice,
    status: 'Active',
    since: sinceISO,
    statusChangedAt: sinceISO,
    applicationRef: app.referenceNo,
    modemSerial: extras && extras.modemSerial ? extras.modemSerial : '',
  };
  const position = sortedInsert(subscribers, 'accountNo', subscriber);
  return { subscriber: subscriber, position: position };
}

/**
 * previewSubscriberAccount - pinapakita muna kung ano yung gagawin ng "Create account"
 * bago pa mangyari: yung account number, billing day at first bill, tsaka KUNG SAAN
 * mapupunta yung record sa sorted na subscribers array (lowerBound = binary search ng pwesto).
 * Time: O(log n), Space: O(1)
 */
function previewSubscriberAccount(referenceNo) {
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
  const since = nowISO();
  const position = lowerBound(subscribers, 'accountNo', referenceNo);
  const comparisons = dsaLastRun.comparisons;
  const clock = readClock();
  return {
    ok: true,
    application: app,
    accountNo: referenceNo,
    monthly: planPrice(app.planId, app.customPrice),
    billingDay: clock.day,
    firstPeriod: billingPeriod({ since: since }, clock.year, clock.month),
    position: position,
    total: subscribers.length,
    comparisons: comparisons,
    before: position > 0 ? subscribers[position - 1].accountNo : '',
    after: position < subscribers.length ? subscribers[position].accountNo : '',
  };
}

/** isSerialText - letters, digits at dash lang dapat (para sa serial number ng modem). O(n) */
function isSerialText(text) {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!(isLetterChar(ch) || isDigitChar(ch) || ch === '-')) {
      return false;
    }
  }
  return true;
}

/**
 * validateAccountDetails - check ng "Create account" form: dapat i-confirm ng
 * installer na na-test na yung connection; optional lang yung serial number ng
 * modem (6-24 na letters, digits o dash). Time: O(n), Space: O(1)
 */
function validateAccountDetails(details) {
  const errors = {};
  const serial = toUpperText(trimText(details.modemSerial));
  if (serial !== '' && (serial.length < 6 || serial.length > 24 || !isSerialText(serial))) {
    errors.modemSerial = 'Use 6–24 letters, digits or dashes, as printed on the modem.';
  }
  if (!details.tested) {
    errors.tested = 'Confirm that the fiber is installed and the connection was tested.';
  }
  return errors;
}

/**
 * createSubscriberAccount - yung "Create account" step pagkatapos ng installation:
 * i-validate muna yung form, tapos i-complete yung installation, na siya namang
 * gagawa ng account gamit sorted insert. Binabalik: { ok, subscriber, position } o errors.
 * Time: O(n) (umuusog ng isa yung mga record sa likod), Space: O(1)
 */
function createSubscriberAccount(referenceNo, details, actor) {
  const errors = validateAccountDetails(details);
  if (hasAnyErrors(errors)) {
    return { ok: false, errors: errors, error: 'Check the form.' };
  }
  return completeInstallation(referenceNo, actor, { modemSerial: toUpperText(trimText(details.modemSerial)) });
}

/**
 * subscriberBills - lahat ng bill ng isang account, oldest month first
 * (naka-sort yung bills by id "BILL-YYYYMM-...", kaya sunod-sunod pa rin yung buwan sa linear scan).
 * Time: O(n) para sa n bills sa table, Space: O(n)
 */
function subscriberBills(accountNo) {
  return linearSearchAll(bills, 'accountNo', accountNo);
}

/** subscriberBalance - total ng lahat ng unpaid na bill ng account. Time: O(n) */
function subscriberBalance(accountNo) {
  let total = 0;
  for (let i = 0; i < bills.length; i++) {
    if (bills[i].accountNo === accountNo && bills[i].status === 'Unpaid') {
      total += bills[i].amount;
    }
  }
  return total;
}

/** subscriberPaidTotal - magkano na lahat yung nabayaran ng account so far. Time: O(n) */
function subscriberPaidTotal(accountNo) {
  let total = 0;
  for (let i = 0; i < bills.length; i++) {
    if (bills[i].accountNo === accountNo && bills[i].status === 'Paid') {
      total += bills[i].amount;
    }
  }
  return total;
}

/** subscriberRow - mga field para sa list, kasama na yung computed na balance at price para ma-sort. O(n) */
function subscriberRow(subscriber) {
  return {
    accountNo: subscriber.accountNo,
    fullName: subscriber.fullName,
    email: subscriber.email,
    barangay: subscriber.barangay,
    since: subscriber.since,
    status: subscriber.status,
    planId: subscriber.planId,
    planName: planName(subscriber.planId),
    price: planPrice(subscriber.planId, subscriber.customPrice),
    balance: subscriberBalance(subscriber.accountNo),
    record: subscriber,
  };
}

/**
 * listSubscribers - i-filter by status, hanapin yung text, tapos i-sort gamit yung
 * napiling algorithm. options: { status, query, sortField, sortOrder, algorithm }
 * Time: O(n²) sa balances + O(n²) sort, Space: O(n)
 */
function listSubscribers(options) {
  const status = options.status || 'all';
  const base = status === 'all' ? subscribers : linearSearchAll(subscribers, 'status', status);   // 1. filter muna by status
  const found = textSearchRecords(base, ['fullName', 'email', 'accountNo', 'barangay', 'contactNumber'], options.query || ''); // 2. search
  const rows = [];
  for (let i = 0; i < found.length; i++) {                  // 3. bawat row, lagyan ng plan, price at balance
    arrayAppend(rows, subscriberRow(found[i]));
  }
  const started = stopwatchStart();
  const sorted = sortRecords(rows, options.sortField || 'since', options.sortOrder || 'desc', options.algorithm || 'insertion'); // 4. sort
  const ms = stopwatchMs(started);
  const stats = { algorithm: dsaLastRun.algorithm, comparisons: dsaLastRun.comparisons, moves: dsaLastRun.moves, ms: ms, n: rows.length };
  logOperation(stats.algorithm, 'Subscribers list', rows.length, stats.comparisons, stats.moves, ms);
  return { rows: sorted, total: subscribers.length, stats: stats };
}

/** countSubscribersByStatus - bilangin per status, isang ikot lang. Time: O(n), Space: O(1) */
function countSubscribersByStatus() {
  const counts = { all: subscribers.length, Active: 0, Suspended: 0, Terminated: 0 };
  for (let i = 0; i < subscribers.length; i++) {
    counts[subscribers[i].status] = counts[subscribers[i].status] + 1;
  }
  return counts;
}

/**
 * setSubscriberStatus - i-suspend, i-reactivate o i-terminate yung account.
 * Pwede lang: Active -> Suspended, Suspended -> Active, Active/Suspended -> Terminated.
 * Time: O(log n)
 */
function setSubscriberStatus(accountNo, status, actor) {
  const stepUp = stepUpRequired();            // 0. two-step verification: dapat may Google Authenticator code sa huling 5 minutes
  if (stepUp) {
    return stepUp;
  }
  const subscriber = findSubscriber(accountNo);                 // 1. binary search gamit account number
  if (!subscriber) {
    return { ok: false, error: 'Subscriber not found.' };
  }
  if (subscriber.status === 'Terminated') {
    return { ok: false, error: 'This account is already terminated.' };
  }
  const allowed = (subscriber.status === 'Active' && (status === 'Suspended' || status === 'Terminated'))
    || (subscriber.status === 'Suspended' && (status === 'Active' || status === 'Terminated'));
  if (!allowed) {                                               // 2. yung mga allowed na lipat lang
    return { ok: false, error: 'That change is not allowed.' };
  }
  const verbs = { Active: 'Reactivate', Suspended: 'Suspend', Terminated: 'Terminate' };
  const before = snapshotFields(subscriber, ['status', 'statusChangedAt']);   // 3. i-save muna yung dating values
  subscriber.status = status;                                   // 4. palitan na yung status
  subscriber.statusChangedAt = nowISO();
  // 5. isang undo step (push sa stack)
  pushUndo(verbs[status] + ' ' + subscriber.fullName, [updateOperation('subscribers', accountNo, before)], nameOfActor(actor));
  logActivity('subscriber', verbs[status] + 'd ' + subscriber.fullName + ' (' + accountNo + ')', nameOfActor(actor));
  markDataChanged();
  return { ok: true, subscriber: subscriber };
}

/**
 * changeSubscriberPlan - ilipat yung account sa ibang plan (o custom price).
 * Yung mga bill na na-issue na, same pa rin yung amount; sa susunod na bill na
 * gagamitin yung bagong price.
 * Time: O(log n)
 */
function changeSubscriberPlan(accountNo, planId, customPrice, actor) {
  const stepUp = stepUpRequired();            // 0. two-step verification: dapat may Google Authenticator code sa huling 5 minutes
  if (stepUp) {
    return stepUp;
  }
  const subscriber = findSubscriber(accountNo);
  if (!subscriber) {
    return { ok: false, error: 'Subscriber not found.' };
  }
  if (subscriber.status === 'Terminated') {
    return { ok: false, error: 'A terminated account can’t change plans.' };
  }
  let price = null;
  if (planId === 'custom') {
    price = Number(customPrice);
    if (!(price >= 300 && price <= 20000)) {
      return { ok: false, error: 'Enter a monthly price from ₱300 to ₱20,000.' };
    }
  } else if (!findPlan(planId)) {
    return { ok: false, error: 'Choose a plan.' };
  }
  if (planId === subscriber.planId && price === subscriber.customPrice) {
    return { ok: false, error: 'That is already the current plan.' };
  }
  const before = snapshotFields(subscriber, ['planId', 'customPrice']);
  const oldLabel = planName(subscriber.planId);
  subscriber.planId = planId;
  subscriber.customPrice = price;
  pushUndo('Change ' + subscriber.fullName + ' to ' + planName(planId), [updateOperation('subscribers', accountNo, before)], nameOfActor(actor));
  logActivity('subscriber', 'Changed ' + subscriber.fullName + ' from ' + oldLabel + ' to ' + planName(planId), nameOfActor(actor));
  markDataChanged();
  return { ok: true, subscriber: subscriber };
}

/**
 * verifySubscriberAccess - sign-in para sa public na "Pay bills": dapat parehong
 * tama yung account number AT yung registered na mobile number. Hindi sinasabi
 * ng error kung alin yung mali, para hindi mahulaan yung account number paisa-isa.
 * Time: O(log n)
 */
function verifySubscriberAccess(accountInput, mobileInput) {
  const accountNo = normalizeReference(accountInput);
  const fail = { ok: false, error: 'We couldn’t find an account with those details. Check both and try again.' };
  if (!isValidReference(accountNo) || !isValidMobile(mobileInput)) {
    return fail;
  }
  const subscriber = findSubscriber(accountNo);
  if (!subscriber || digitsOnly(subscriber.contactNumber) !== digitsOnly(normalizeMobile(mobileInput))) {
    return fail;
  }
  return { ok: true, subscriber: subscriber };
}

/**
 * nextBillInfo - kailan dapat magbayad ulit yung subscriber: yung due date ng
 * pinakalumang unpaid na bill, o kaya yung simula ng susunod na billing period.
 * Time: O(n)
 */
function nextBillInfo(subscriber) {
  const unpaid = unpaidBillsQueue(subscriber.accountNo);
  const oldest = queuePeek(unpaid);
  if (oldest) {
    return { label: 'Due ' + formatDate(oldest.dueDate), dueDate: oldest.dueDate, bill: oldest };
  }
  const clock = readClock();
  const next = addMonths(clock.year, clock.month, 1);
  const period = billingPeriod(subscriber, next.year, next.month);
  return { label: 'Next period starts ' + formatDate(period.periodStart), dueDate: null, bill: null };
}
