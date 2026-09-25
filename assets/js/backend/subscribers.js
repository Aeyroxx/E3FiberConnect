/* ==========================================================================
   E3 Fiber Connect · backend/subscribers.js
   Subscriber accounts. A subscriber is created when an installation is marked
   complete; the account number is the application's reference number.

     Active ◀──suspend / reactivate──▶ Suspended        Active or Suspended ──▶ Terminated

   `subscribers` is kept sorted by account number with sortedInsert
   (installations finish in any order), so look-ups are binary searches.

   Defense modules:
     Create Account           — Justin Banaag
       (previewSubscriberAccount, validateAccountDetails, createSubscriberAccount,
        createSubscriberFromApplication)
     Accounts management      — Dela Cruz Riceerich
       (findSubscriber, listSubscribers, setSubscriberStatus, changeSubscriberPlan)
   ========================================================================== */

'use strict';

const SUBSCRIBER_STATUSES = ['Active', 'Suspended', 'Terminated'];

/**
 * findSubscriber — the subscriber with this account number, or null.
 * Binary search. Time O(log n) · Space O(1)
 */
function findSubscriber(accountNo) {
  const index = binarySearch(subscribers, 'accountNo', accountNo);
  return index === -1 ? null : subscribers[index];
}

/**
 * createSubscriberFromApplication — open an account for a completed
 * application ("put" with sortedInsert). Returns { subscriber, position }.
 * Time O(log n) search + O(n) shift · Space O(1)
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
 * previewSubscriberAccount — what "Create account" will do, before it happens:
 * the account number, the billing day and first bill, and WHERE the record will
 * go in the sorted subscribers array (lowerBound = binary search for the spot).
 * Time O(log n) · Space O(1)
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

/** isSerialText — letters, digits and dashes only (modem serial numbers). O(k) */
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
 * validateAccountDetails — the "Create account" form: the installer must
 * confirm the connection was tested; the modem serial number is optional
 * (6–24 letters, digits or dashes). Time O(k) · Space O(1)
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
 * createSubscriberAccount — the "Create account" step after an installation:
 * validate the form, then complete the installation, which opens the account
 * with a sorted insert. Returns { ok, subscriber, position } or errors.
 * Time O(n) (later records shift one place) · Space O(1)
 */
function createSubscriberAccount(referenceNo, details, actor) {
  const errors = validateAccountDetails(details);
  if (hasAnyErrors(errors)) {
    return { ok: false, errors: errors, error: 'Check the form.' };
  }
  return completeInstallation(referenceNo, actor, { modemSerial: toUpperText(trimText(details.modemSerial)) });
}

/**
 * subscriberBills — every bill of one account, oldest month first
 * (bills are sorted by id "BILL-YYYYMM-…", so a linear scan keeps month order).
 * Time O(b) for b bills in the table · Space O(k)
 */
function subscriberBills(accountNo) {
  return linearSearchAll(bills, 'accountNo', accountNo);
}

/** subscriberBalance — the total of the account's unpaid bills. Time O(b) */
function subscriberBalance(accountNo) {
  let total = 0;
  for (let i = 0; i < bills.length; i++) {
    if (bills[i].accountNo === accountNo && bills[i].status === 'Unpaid') {
      total += bills[i].amount;
    }
  }
  return total;
}

/** subscriberPaidTotal — the total the account has paid so far. Time O(b) */
function subscriberPaidTotal(accountNo) {
  let total = 0;
  for (let i = 0; i < bills.length; i++) {
    if (bills[i].accountNo === accountNo && bills[i].status === 'Paid') {
      total += bills[i].amount;
    }
  }
  return total;
}

/** subscriberRow — list fields, including computed balance and price for sorting. O(b) */
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
 * listSubscribers — filter by status, search the text, sort with the chosen
 * algorithm. options: { status, query, sortField, sortOrder, algorithm }
 * Time O(n · b) for balances + O(n²) sort · Space O(n)
 */
function listSubscribers(options) {
  const status = options.status || 'all';
  const base = status === 'all' ? subscribers : linearSearchAll(subscribers, 'status', status);   // 1. filter by status
  const found = textSearchRecords(base, ['fullName', 'email', 'accountNo', 'barangay', 'contactNumber'], options.query || ''); // 2. search
  const rows = [];
  for (let i = 0; i < found.length; i++) {                  // 3. each row gets its plan, price and balance
    arrayAppend(rows, subscriberRow(found[i]));
  }
  const started = stopwatchStart();
  const sorted = sortRecords(rows, options.sortField || 'since', options.sortOrder || 'desc', options.algorithm || 'insertion'); // 4. sort
  const ms = stopwatchMs(started);
  const stats = { algorithm: dsaLastRun.algorithm, comparisons: dsaLastRun.comparisons, moves: dsaLastRun.moves, ms: ms, n: rows.length };
  logOperation(stats.algorithm, 'Subscribers list', rows.length, stats.comparisons, stats.moves, ms);
  return { rows: sorted, total: subscribers.length, stats: stats };
}

/** countSubscribersByStatus — one pass. Time O(n) · Space O(1) */
function countSubscribersByStatus() {
  const counts = { all: subscribers.length, Active: 0, Suspended: 0, Terminated: 0 };
  for (let i = 0; i < subscribers.length; i++) {
    counts[subscribers[i].status] = counts[subscribers[i].status] + 1;
  }
  return counts;
}

/**
 * setSubscriberStatus — suspend, reactivate or terminate an account.
 * Allowed: Active → Suspended, Suspended → Active, Active/Suspended → Terminated.
 * Time O(log n)
 */
function setSubscriberStatus(accountNo, status, actor) {
  const stepUp = stepUpRequired();            // 0. two-step verification: a Google Authenticator code in the last 5 minutes
  if (stepUp) {
    return stepUp;
  }
  const subscriber = findSubscriber(accountNo);                 // 1. binary search by account number
  if (!subscriber) {
    return { ok: false, error: 'Subscriber not found.' };
  }
  if (subscriber.status === 'Terminated') {
    return { ok: false, error: 'This account is already terminated.' };
  }
  const allowed = (subscriber.status === 'Active' && (status === 'Suspended' || status === 'Terminated'))
    || (subscriber.status === 'Suspended' && (status === 'Active' || status === 'Terminated'));
  if (!allowed) {                                               // 2. only the allowed moves
    return { ok: false, error: 'That change is not allowed.' };
  }
  const verbs = { Active: 'Reactivate', Suspended: 'Suspend', Terminated: 'Terminate' };
  const before = snapshotFields(subscriber, ['status', 'statusChangedAt']);   // 3. remember the old values
  subscriber.status = status;                                   // 4. change the status
  subscriber.statusChangedAt = nowISO();
  // 5. one undo step (stack push)
  pushUndo(verbs[status] + ' ' + subscriber.fullName, [updateOperation('subscribers', accountNo, before)], nameOfActor(actor));
  logActivity('subscriber', verbs[status] + 'd ' + subscriber.fullName + ' (' + accountNo + ')', nameOfActor(actor));
  markDataChanged();
  return { ok: true, subscriber: subscriber };
}

/**
 * changeSubscriberPlan — move an account to another plan (or a custom price).
 * Bills already issued keep their amount; the next bill uses the new price.
 * Time O(log n)
 */
function changeSubscriberPlan(accountNo, planId, customPrice, actor) {
  const stepUp = stepUpRequired();            // 0. two-step verification: a Google Authenticator code in the last 5 minutes
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
 * verifySubscriberAccess — public "Pay bills" sign-in: the account number AND
 * the registered mobile number must both match. The error never says which
 * part was wrong, so account numbers can't be guessed one piece at a time.
 * Time O(log n)
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
 * nextBillInfo — the next date a subscriber should pay: the due date of the
 * oldest unpaid bill, or the start of the next billing period.
 * Time O(b)
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
