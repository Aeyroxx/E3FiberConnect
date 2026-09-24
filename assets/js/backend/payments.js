/* ==========================================================================
   E3 Fiber Connect · backend/payments.js
   Payments reported by customers on the public "Pay bills" page (GCash, Maya,
   bank transfer, over the counter) and their VALIDATION by staff.

     For verification ──confirm──▶ Confirmed (the bill becomes Paid)
            └──decline──▶ Declined

   Reports wait in a QUEUE (FIFO): the oldest report is validated first.
   validatePayment runs five checks, and "Confirm" is allowed only when all pass:
     1 the bill belongs to the account   binary search on bills   O(log n)
     2 the bill is still unpaid          one field                O(1)
     3 amount paid = amount billed       one comparison           O(1)
     4 the reference fits the method     scan its characters      O(k)
     5 the reference was never used      HASH TABLE look-up       O(1) average
   The hash table (paymentReferenceIndex in database.js) maps a key such as
   "GCASH:5012873246119" to the ids of every payment that used it.
   Defense module: Payments (Payments Validation) — presented by Aaron Sebastian.
   ========================================================================== */

'use strict';

const MAX_PAYMENT_AMOUNT = 100000;

// What a reference number looks like for each method (linear search; 4 rules).
const PAYMENT_REFERENCE_RULES = [
  { method: 'GCash', minLength: 13, maxLength: 13, digitsOnly: true, shape: '13 digits', example: '5012 873 246 119' },
  { method: 'Maya', minLength: 12, maxLength: 12, digitsOnly: false, shape: '12 letters or digits', example: '4F7K 2M9Q 1T8B' },
  { method: 'Bank transfer', minLength: 8, maxLength: 20, digitsOnly: false, shape: '8–20 letters or digits', example: 'FT26 0918 8830' },
  { method: 'Over the counter', minLength: 8, maxLength: 20, digitsOnly: false, shape: '8–20 letters or digits', example: 'BC26 0918 0457' },
];

/** findPayment — binary search on paymentId (issued in increasing order). O(log n) */
function findPayment(paymentId) {
  const index = binarySearch(payments, 'paymentId', paymentId);
  return index === -1 ? null : payments[index];
}

/** pendingPaymentForBill — a payment for this bill still waiting to be verified. O(n) */
function pendingPaymentForBill(billId) {
  for (let i = 0; i < payments.length; i++) {
    if (payments[i].billId === billId && payments[i].status === 'For verification') {
      return payments[i];
    }
  }
  return null;
}

/** paymentReferenceRule — the reference rule for a method, or null (linear search). O(r) */
function paymentReferenceRule(method) {
  for (let i = 0; i < PAYMENT_REFERENCE_RULES.length; i++) {
    if (PAYMENT_REFERENCE_RULES[i].method === method) {
      return PAYMENT_REFERENCE_RULES[i];
    }
  }
  return null;
}

/**
 * normalizePaymentReference — "5012 873-246 119" → "5012873246119":
 * spaces and dashes removed, letters in capitals.
 * Time O(k) · Space O(k)
 */
function normalizePaymentReference(value) {
  const upper = toUpperText(value);
  let result = '';
  for (let i = 0; i < upper.length; i++) {
    if (!isSpaceChar(upper[i]) && upper[i] !== '-') {
      result += upper[i];
    }
  }
  return result;
}

/**
 * checkReferenceFormat — does a normalised reference fit the method's rule?
 * One pass over the characters, then a length check. Returns { ok, text }.
 * Time O(k) · Space O(1)
 */
function checkReferenceFormat(method, reference) {
  const rule = paymentReferenceRule(method);
  if (!rule) {
    return { ok: false, text: 'Unknown payment method “' + textOf(method) + '”.' };
  }
  let charactersOk = true;
  for (let i = 0; i < reference.length; i++) {
    const ch = reference[i];
    if (!(isDigitChar(ch) || (!rule.digitsOnly && isLetterChar(ch)))) {
      charactersOk = false;
    }
  }
  const lengthOk = reference.length >= rule.minLength && reference.length <= rule.maxLength;
  if (lengthOk && charactersOk) {
    return { ok: true, text: method + ' references have ' + rule.shape + ' — ' + reference + ' fits.' };
  }
  return {
    ok: false,
    text: method + ' references have ' + rule.shape + ', but ' + (reference || 'this one') + ' has ' + pluralize(reference.length, 'character')
      + (charactersOk ? '' : (rule.digitsOnly ? ' and not only digits' : ' and symbols')) + '.',
  };
}

/** paymentReferenceKey — the hash-table key, e.g. "GCASH:5012873246119". O(k) */
function paymentReferenceKey(method, reference) {
  return toUpperText(method) + ':' + normalizePaymentReference(reference);
}

/**
 * indexPaymentReference — add a payment to the reference hash table. The value
 * stored under a key is the list of payment ids that used that reference.
 * Time O(1) average · Space O(1)
 */
function indexPaymentReference(payment) {
  const key = paymentReferenceKey(payment.method, payment.referenceCode);
  const ids = hashGet(paymentReferenceIndex, key);
  if (ids === null) {
    hashPut(paymentReferenceIndex, key, [payment.paymentId]);
  } else {
    arrayAppend(ids, payment.paymentId);
  }
}

/**
 * findDuplicatePayment — a payment that used the same method and reference number
 * BEFORE this one: an already confirmed payment, or an earlier report that is still
 * waiting. Declined reports don't count, and neither do later reports (the later one
 * is the duplicate, not this one). One hash-table look-up, then a binary search per id.
 * Time O(1) average + O(d log n) for d other uses (d is almost always 0) · Space O(1)
 */
function findDuplicatePayment(payment) {
  const ids = hashGet(paymentReferenceIndex, paymentReferenceKey(payment.method, payment.referenceCode));
  if (ids === null) {
    return null;                                        // 1. reference never seen before
  }
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] !== payment.paymentId) {
      const other = findPayment(ids[i]);                // 2. every other use of it (binary search)
      if (other && (other.status === 'Confirmed'
        || (other.status === 'For verification' && other.paymentId < payment.paymentId))) {
        return other;                                   // 3. confirmed, or reported earlier → duplicate
      }
    }
  }
  return null;
}

/**
 * validatePayment — the five checks shown on the Payments page. Nothing is
 * changed; the result says which checks passed and why.
 * Returns { checks: [{ key, label, ok, text }], passed, failed, firstFailure, bill }.
 * Time O(log n + k) · Space O(1)
 */
function validatePayment(payment) {
  const checks = [];

  const bill = findBill(payment.billId);                     // 1 · binary search
  const billSteps = dsaLastRun.comparisons;
  const belongs = bill !== null && bill.accountNo === payment.accountNo;
  const billName = bill ? formatMonthYear(bill.billingYear, bill.billingMonth) + ' bill' : 'bill ' + payment.billId;
  arrayAppend(checks, {
    key: 'bill',
    label: 'Bill belongs to the account',
    ok: belongs,
    text: belongs ? 'Found the ' + billName + ' of ' + payment.accountNo + ' with binary search (' + pluralize(billSteps, 'comparison') + ').'
      : 'There is no ' + billName + ' for account ' + payment.accountNo + '.',
  });

  const paidByThis = belongs && bill.status === 'Paid' && bill.paymentRef === payment.paymentId;
  const unpaid = belongs && (bill.status === 'Unpaid' || paidByThis);   // 2 · one field (a confirmed payment settled it itself)
  let unpaidText = 'No bill to check.';
  if (paidByThis) {
    unpaidText = 'Was unpaid — this payment settled it on ' + formatDate(bill.paidOn) + '.';
  } else if (belongs) {
    unpaidText = unpaid ? 'Unpaid · due ' + formatDate(bill.dueDate) + '.'
      : 'Already paid on ' + formatDate(bill.paidOn) + (bill.paymentRef ? ' (' + bill.paymentRef + ')' : '') + '.';
  }
  arrayAppend(checks, { key: 'unpaid', label: 'Bill is still unpaid', ok: unpaid, text: unpaidText });

  const amountOk = belongs && payment.amount === bill.amount;  // 3 · one comparison
  let amountText = 'No bill amount to compare.';
  if (belongs) {
    const difference = payment.amount - bill.amount;
    amountText = amountOk ? formatPeso(payment.amount) + ' paid for a ' + formatPeso(bill.amount) + ' bill.'
      : 'Paid ' + formatPeso(payment.amount) + ' for a ' + formatPeso(bill.amount) + ' bill — '
        + formatPeso(difference < 0 ? -difference : difference) + (difference < 0 ? ' short.' : ' too much.');
  }
  arrayAppend(checks, { key: 'amount', label: 'Amount matches the bill', ok: amountOk, text: amountText });

  const format = checkReferenceFormat(payment.method, normalizePaymentReference(payment.referenceCode)); // 4 · scan
  arrayAppend(checks, { key: 'format', label: 'Reference number format', ok: format.ok, text: format.text });

  const duplicate = findDuplicatePayment(payment);             // 5 · hash table
  arrayAppend(checks, {
    key: 'duplicate',
    label: 'Reference number not used before',
    ok: duplicate === null,
    text: duplicate === null ? 'No earlier or confirmed payment used it — one hash-table look-up among ' + pluralize(paymentReferenceIndex.size, 'reference') + ' on record.'
      : 'Already used by ' + duplicate.paymentId + ' (' + duplicate.fullName + ', ' + toLowerText(duplicate.status) + ').',
  });

  let failed = 0;
  let firstFailure = null;
  for (let i = 0; i < checks.length; i++) {
    if (!checks[i].ok) {
      failed++;
      if (firstFailure === null) {
        firstFailure = checks[i];
      }
    }
  }
  return { checks: checks, passed: failed === 0, failed: failed, firstFailure: firstFailure, bill: bill };
}

/**
 * declineReasonFor — a customer-friendly reason for the first failed check,
 * suggested in the Decline sheet (it never names another customer). O(1)
 */
function declineReasonFor(payment, validation) {
  const failure = validation.firstFailure;
  if (!failure) {
    return '';
  }
  if (failure.key === 'bill') {
    return 'We couldn’t match this payment to a bill on your account.';
  }
  if (failure.key === 'unpaid') {
    return 'This bill was already paid, so this payment was not applied. Please contact us if you paid twice.';
  }
  if (failure.key === 'amount') {
    return 'You sent ' + formatPeso(payment.amount) + ' but the bill is ' + formatPeso(validation.bill.amount) + '. Please visit our office so we can settle the difference.';
  }
  if (failure.key === 'format') {
    return 'The reference number doesn’t look like a ' + payment.method + ' reference. Please check your receipt and report it again.';
  }
  return 'This reference number was already used for another payment. Please check your receipt.';
}

/**
 * reportPayment — a customer tells us they paid a bill. Checks the bill (theirs,
 * unpaid, not already being verified), the method, the reference format for that
 * method and the amount. It does NOT say whether a reference was used before —
 * that would let anyone test other people's reference numbers; staff check it.
 * Time O(n) · Space O(1)
 */
function reportPayment(accountNo, data) {
  const subscriber = findSubscriber(accountNo);                      // 1. the signed-in account (binary search)
  if (!subscriber) {
    return { ok: false, errors: { billId: 'Account not found.' } };
  }
  const errors = {};
  const bill = findBill(data.billId);                                // 2. the bill: theirs, unpaid, not already reported
  if (!bill || bill.accountNo !== subscriber.accountNo) {
    errors.billId = 'Choose the bill you paid.';
  } else if (bill.status === 'Paid') {
    errors.billId = 'This bill is already paid.';
  } else if (pendingPaymentForBill(bill.billId)) {
    errors.billId = 'A payment for this bill is already being verified.';
  }
  const rule = paymentReferenceRule(data.method);                    // 3. a known method …
  if (!rule) {
    errors.method = 'Choose how you paid.';
  }
  const code = normalizePaymentReference(data.referenceCode);        // 4. … and a reference in that method's format
  if (code === '') {
    errors.referenceCode = 'Enter the reference number on your receipt.';
  } else if (rule && !checkReferenceFormat(data.method, code).ok) {
    errors.referenceCode = data.method + ' reference numbers have ' + rule.shape + ' (e.g. ' + rule.example + ').';
  }
  const amount = Math.round(Number(data.amount) * 100) / 100;        // 5. an amount between ₱1 and ₱100,000
  if (!(amount >= 1 && amount <= MAX_PAYMENT_AMOUNT)) {
    errors.amount = 'Enter the amount you paid, in pesos.';
  }
  if (hasAnyErrors(errors)) {
    return { ok: false, errors: errors };
  }
  counters.payment = counters.payment + 1;
  const payment = {
    paymentId: formatPaymentId(counters.payment),
    accountNo: subscriber.accountNo,
    billId: bill.billId,
    fullName: subscriber.fullName,
    amount: amount,
    method: data.method,
    referenceCode: code,
    submittedAt: nowISO(),
    status: 'For verification',
    reviewedBy: '',
    reviewedAt: null,
    note: '',
  };
  arrayAppend(payments, payment);       // 6. the new id is the largest → the table stays sorted
  indexPaymentReference(payment);        // 7. add its reference to the hash table, O(1) average
  logActivity('payment', 'Payment ' + payment.paymentId + ' reported by ' + subscriber.fullName + ' (' + formatPeso(payment.amount) + ' via ' + payment.method + ')', 'Customer');
  markDataChanged();
  return { ok: true, payment: payment };
}

/**
 * paymentsQueue — payments waiting for validation, first reported first.
 * The table is in arrival order, so one pass enqueues them FIFO.
 * Time O(n) · Space O(k)
 */
function paymentsQueue() {
  const queue = createQueue(4);
  for (let i = 0; i < payments.length; i++) {
    if (payments[i].status === 'For verification') {
      enqueue(queue, payments[i]);
    }
  }
  return queue;
}

/** countPaymentsForVerification — for badges. O(n) */
function countPaymentsForVerification() {
  return countMatches(payments, 'status', 'For verification');
}

/** countPaymentsByStatus — one pass, for the filter counts. Time O(n) · Space O(1) */
function countPaymentsByStatus() {
  const counts = { all: payments.length, 'For verification': 0, Confirmed: 0, Declined: 0 };
  for (let i = 0; i < payments.length; i++) {
    counts[payments[i].status] = counts[payments[i].status] + 1;
  }
  return counts;
}

/**
 * confirmPayment — accept the payment and mark its bill paid. Refused unless
 * all five validation checks pass. One undo step reverses both changes.
 * Time O(log n + k) · Space O(1)
 */
function confirmPayment(paymentId, actor) {
  if (!actor) {
    return { ok: false, error: 'Please sign in again.' };
  }
  const payment = findPayment(paymentId);
  if (!payment) {
    return { ok: false, error: 'Payment not found.' };
  }
  if (payment.status !== 'For verification') {
    return { ok: false, error: 'This payment was already ' + toLowerText(payment.status) + '.' };
  }
  const validation = validatePayment(payment);
  if (!validation.passed) {
    return { ok: false, error: 'Can’t confirm — “' + validation.firstFailure.label + '” failed. Decline it instead.', validation: validation };
  }
  const bill = validation.bill;
  const beforePayment = snapshotFields(payment, ['status', 'reviewedBy', 'reviewedAt']);
  const beforeBill = snapshotFields(bill, ['status', 'paidOn', 'paymentRef']);
  payment.status = 'Confirmed';
  payment.reviewedBy = nameOfActor(actor);
  payment.reviewedAt = nowISO();
  settleBill(bill.billId, actor, payment.paymentId, { quiet: true });
  pushUndo('Confirm payment ' + paymentId + ' (' + payment.fullName + ')', [
    updateOperation('payments', paymentId, beforePayment),
    updateOperation('bills', bill.billId, beforeBill),
  ], nameOfActor(actor));
  logActivity('payment', 'Confirmed payment ' + paymentId + ' — ' + payment.fullName + ' paid ' + formatPeso(payment.amount), nameOfActor(actor));
  markDataChanged();
  return { ok: true, payment: payment, bill: bill };
}

/** declinePayment — reject a report that did not pass validation. Time O(log n) */
function declinePayment(paymentId, note, actor) {
  if (!actor) {
    return { ok: false, error: 'Please sign in again.' };
  }
  const payment = findPayment(paymentId);
  if (!payment) {
    return { ok: false, error: 'Payment not found.' };
  }
  if (payment.status !== 'For verification') {
    return { ok: false, error: 'This payment was already ' + toLowerText(payment.status) + '.' };
  }
  const reason = collapseSpaces(note);
  if (reason.length < 5) {
    return { ok: false, error: 'Tell the customer why in a few words.' };
  }
  const before = snapshotFields(payment, ['status', 'reviewedBy', 'reviewedAt', 'note']);
  payment.status = 'Declined';
  payment.reviewedBy = nameOfActor(actor);
  payment.reviewedAt = nowISO();
  payment.note = reason;
  pushUndo('Decline payment ' + paymentId + ' (' + payment.fullName + ')', [updateOperation('payments', paymentId, before)], nameOfActor(actor));
  logActivity('payment', 'Declined payment ' + paymentId + ' — ' + reason, nameOfActor(actor));
  markDataChanged();
  return { ok: true, payment: payment };
}

/** paymentsForAccount — an account's payment reports, newest first. O(n) */
function paymentsForAccount(accountNo) {
  const list = [];
  for (let i = payments.length - 1; i >= 0; i--) {
    if (payments[i].accountNo === accountNo) {
      arrayAppend(list, payments[i]);
    }
  }
  return list;
}

/** paymentRow — list fields plus the bill's month, for the Payments table. O(log n) */
function paymentRow(payment) {
  const bill = findBill(payment.billId);
  return {
    paymentId: payment.paymentId,
    fullName: payment.fullName,
    accountNo: payment.accountNo,
    billLabel: bill ? formatMonthYear(bill.billingYear, bill.billingMonth) : payment.billId,
    amount: payment.amount,
    method: payment.method,
    referenceCode: payment.referenceCode,
    submittedAt: payment.submittedAt,
    status: payment.status,
    record: payment,
  };
}

/**
 * listPayments — filter by status (linear search), search the text (naive
 * string matching), then sort with the chosen algorithm.
 * options: { status, query, sortField, sortOrder, algorithm }
 * Time O(n · L · m) search + O(n²) sort · Space O(n)
 */
function listPayments(options) {
  const status = options.status || 'all';
  const base = status === 'all' ? payments : linearSearchAll(payments, 'status', status);
  const found = textSearchRecords(base, ['fullName', 'accountNo', 'paymentId', 'referenceCode', 'method'], options.query || '');
  const rows = [];
  for (let i = 0; i < found.length; i++) {
    arrayAppend(rows, paymentRow(found[i]));
  }
  const started = stopwatchStart();
  const sorted = sortRecords(rows, options.sortField || 'submittedAt', options.sortOrder || 'desc', options.algorithm || 'insertion');
  const ms = stopwatchMs(started);
  const stats = { algorithm: dsaLastRun.algorithm, comparisons: dsaLastRun.comparisons, moves: dsaLastRun.moves, ms: ms, n: rows.length };
  logOperation(stats.algorithm, 'Payments list', rows.length, stats.comparisons, stats.moves, ms);
  return { rows: sorted, total: payments.length, stats: stats };
}
