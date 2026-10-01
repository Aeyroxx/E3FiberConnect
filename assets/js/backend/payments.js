/* ==========================================================================
   E3 Fiber Connect - backend/payments.js
   Dito yung mga payment na nire-report ng customer sa public na "Pay bills" page
   (GCash, Maya, bank transfer, over the counter) at yung VALIDATION nito ng staff.

     For verification --confirm--> Confirmed (magiging Paid na yung bill)
            +--decline--> Declined

   Naka-QUEUE (FIFO) yung mga report: kung sino pinakaluma, yun ang unang iva-validate.
   Limang check yung ginagawa ng validatePayment, at pwede lang i-"Confirm" pag pasado lahat:
     1 sa account talaga yung bill        binary search sa bills   O(log n)
     2 unpaid pa yung bill                isang field              O(1)
     3 amount paid = amount billed        isang comparison         O(1)
     4 tama yung format ng reference      scan bawat character     O(n)
     5 hindi pa nagamit yung reference    HASH TABLE lookup        O(1) average
   Yung hash table (paymentReferenceIndex sa database.js) ay nagma-map ng key gaya ng
   "GCASH:5012873246119" papunta sa ids ng lahat ng payment na gumamit nito.
   Module sa defense: Payments (Payments Validation) - si Aaron Sebastian ang mag-eexplain.
   ========================================================================== */

'use strict';

const MAX_PAYMENT_AMOUNT = 100000;

// Itsura ng reference number sa bawat method (linear search; 4 na rules).
const PAYMENT_REFERENCE_RULES = [
  { method: 'GCash', minLength: 13, maxLength: 13, digitsOnly: true, shape: '13 digits', example: '5012 873 246 119' },
  { method: 'Maya', minLength: 12, maxLength: 12, digitsOnly: false, shape: '12 letters or digits', example: '4F7K 2M9Q 1T8B' },
  { method: 'Bank transfer', minLength: 8, maxLength: 20, digitsOnly: false, shape: '8–20 letters or digits', example: 'FT26 0918 8830' },
  { method: 'Over the counter', minLength: 8, maxLength: 20, digitsOnly: false, shape: '8–20 letters or digits', example: 'BC26 0918 0457' },
];

/** findPayment - binary search sa paymentId (paakyat kasi yung pagbigay ng id). O(log n) */
function findPayment(paymentId) {
  const index = binarySearch(payments, 'paymentId', paymentId);
  return index === -1 ? null : payments[index];
}

/** pendingPaymentForBill - payment para sa bill na to na hinihintay pang ma-verify. O(n) */
function pendingPaymentForBill(billId) {
  for (let i = 0; i < payments.length; i++) {
    if (payments[i].billId === billId && payments[i].status === 'For verification') {
      return payments[i];
    }
  }
  return null;
}

/** paymentReferenceRule - yung reference rule ng method, o null (linear search). O(n) */
function paymentReferenceRule(method) {
  for (let i = 0; i < PAYMENT_REFERENCE_RULES.length; i++) {
    if (PAYMENT_REFERENCE_RULES[i].method === method) {
      return PAYMENT_REFERENCE_RULES[i];
    }
  }
  return null;
}

/**
 * normalizePaymentReference - "5012 873-246 119" -> "5012873246119":
 * tanggal yung space at dash, naka-capital yung letters.
 * Time: O(n), Space: O(n)
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
 * checkReferenceFormat - pasok ba yung normalized na reference sa rule ng method?
 * Isang loop sa mga character, tapos check ng length. Binabalik { ok, text }.
 * Time: O(n), Space: O(1)
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

/** paymentReferenceKey - yung key sa hash table, halimbawa "GCASH:5012873246119". O(n) */
function paymentReferenceKey(method, reference) {
  return toUpperText(method) + ':' + normalizePaymentReference(reference);
}

/**
 * indexPaymentReference - i-add yung payment sa reference hash table. Yung value na
 * naka-store sa bawat key ay listahan ng payment ids na gumamit ng reference na yun.
 * Time: O(1) average, Space: O(1)
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
 * findDuplicatePayment - hanapin yung payment na gumamit ng parehong method at reference
 * number BAGO ito: confirmed na payment, o mas naunang report na naghihintay pa. Hindi
 * kasama yung Declined, pati yung mas huling report (yung huli yung duplicate, hindi ito).
 * Isang hash table lookup, tapos binary search bawat id.
 * Time: O(1) average, + O(log n) bawat naunang gamit ng reference (halos wala naman), Space: O(1)
 */
function findDuplicatePayment(payment) {
  const ids = hashGet(paymentReferenceIndex, paymentReferenceKey(payment.method, payment.referenceCode));
  if (ids === null) {
    return null;                                        // 1. hindi pa nakikita yung reference na to
  }
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] !== payment.paymentId) {
      const other = findPayment(ids[i]);                // 2. bawat ibang gumamit nito (binary search)
      if (other && (other.status === 'Confirmed'
        || (other.status === 'For verification' && other.paymentId < payment.paymentId))) {
        return other;                                   // 3. confirmed na, o mas naunang ni-report -> duplicate
      }
    }
  }
  return null;
}

/**
 * validatePayment - yung limang check na nakikita sa Payments page. Walang binabago
 * dito; sinasabi lang ng result kung alin ang pumasa at bakit.
 * Binabalik { checks: [{ key, label, ok, text }], passed, failed, firstFailure, bill }.
 * Time: O(log n) + O(n), Space: O(1)
 */
function validatePayment(payment) {
  const checks = [];

  const bill = findBill(payment.billId);                     // 1 - binary search
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
  const unpaid = belongs && (bill.status === 'Unpaid' || paidByThis);   // 2 - isang field lang (pag confirmed na yung payment, ito mismo yung nag-settle)
  let unpaidText = 'No bill to check.';
  if (paidByThis) {
    unpaidText = 'Was unpaid — this payment settled it on ' + formatDate(bill.paidOn) + '.';
  } else if (belongs) {
    unpaidText = unpaid ? 'Unpaid · due ' + formatDate(bill.dueDate) + '.'
      : 'Already paid on ' + formatDate(bill.paidOn) + (bill.paymentRef ? ' (' + bill.paymentRef + ')' : '') + '.';
  }
  arrayAppend(checks, { key: 'unpaid', label: 'Bill is still unpaid', ok: unpaid, text: unpaidText });

  const amountOk = belongs && payment.amount === bill.amount;  // 3 - isang comparison
  let amountText = 'No bill amount to compare.';
  if (belongs) {
    const difference = payment.amount - bill.amount;
    amountText = amountOk ? formatPeso(payment.amount) + ' paid for a ' + formatPeso(bill.amount) + ' bill.'
      : 'Paid ' + formatPeso(payment.amount) + ' for a ' + formatPeso(bill.amount) + ' bill — '
        + formatPeso(difference < 0 ? -difference : difference) + (difference < 0 ? ' short.' : ' too much.');
  }
  arrayAppend(checks, { key: 'amount', label: 'Amount matches the bill', ok: amountOk, text: amountText });

  const format = checkReferenceFormat(payment.method, normalizePaymentReference(payment.referenceCode)); // 4 - scan
  arrayAppend(checks, { key: 'format', label: 'Reference number format', ok: format.ok, text: format.text });

  const duplicate = findDuplicatePayment(payment);             // 5 - hash table
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
 * declineReasonFor - maayos na reason para sa customer base sa unang check na bumagsak,
 * sina-suggest sa Decline sheet (hindi nito binabanggit yung ibang customer). O(1)
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
 * reportPayment - sinasabi ng customer na nagbayad na sila ng bill. Chine-check yung bill
 * (kanila, unpaid, hindi pa vine-verify), yung method, yung format ng reference para sa
 * method na yun, at yung amount. HINDI nito sinasabi kung nagamit na yung reference -
 * kasi pwede yun gamitin ng kahit sino para i-test yung reference ng ibang tao; staff
 * ang mag-check nun.
 * Time: O(n), Space: O(1)
 */
function reportPayment(accountNo, data) {
  const subscriber = findSubscriber(accountNo);                      // 1. yung naka-sign in na account (binary search)
  if (!subscriber) {
    return { ok: false, errors: { billId: 'Account not found.' } };
  }
  const errors = {};
  const bill = findBill(data.billId);                                // 2. yung bill: dapat kanila, unpaid, hindi pa na-report
  if (!bill || bill.accountNo !== subscriber.accountNo) {
    errors.billId = 'Choose the bill you paid.';
  } else if (bill.status === 'Paid') {
    errors.billId = 'This bill is already paid.';
  } else if (pendingPaymentForBill(bill.billId)) {
    errors.billId = 'A payment for this bill is already being verified.';
  }
  const rule = paymentReferenceRule(data.method);                    // 3. dapat kilalang method...
  if (!rule) {
    errors.method = 'Choose how you paid.';
  }
  const code = normalizePaymentReference(data.referenceCode);        // 4. ...at pasok yung reference sa format ng method na yun
  if (code === '') {
    errors.referenceCode = 'Enter the reference number on your receipt.';
  } else if (rule && !checkReferenceFormat(data.method, code).ok) {
    errors.referenceCode = data.method + ' reference numbers have ' + rule.shape + ' (e.g. ' + rule.example + ').';
  }
  const amount = Math.round(Number(data.amount) * 100) / 100;        // 5. amount na nasa pagitan ng ₱1 at ₱100,000
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
  arrayAppend(payments, payment);       // 6. pinakamalaki yung bagong id -> naka-sort pa rin yung table
  indexPaymentReference(payment);        // 7. i-add yung reference nito sa hash table, O(1) average
  logActivity('payment', 'Payment ' + payment.paymentId + ' reported by ' + subscriber.fullName + ' (' + formatPeso(payment.amount) + ' via ' + payment.method + ')', 'Customer');
  markDataChanged();
  return { ok: true, payment: payment };
}

/**
 * paymentsQueue - mga payment na naghihintay ng validation, kung sino unang nag-report
 * siya una. Naka-order na by dating yung table, kaya isang loop lang tapos enqueue (FIFO).
 * Time: O(n), Space: O(n)
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

/** countPaymentsForVerification - para sa mga badge. O(n) */
function countPaymentsForVerification() {
  return countMatches(payments, 'status', 'For verification');
}

/** countPaymentsByStatus - isang loop lang, para sa bilang sa filter. Time: O(n), Space: O(1) */
function countPaymentsByStatus() {
  const counts = { all: payments.length, 'For verification': 0, Confirmed: 0, Declined: 0 };
  for (let i = 0; i < payments.length; i++) {
    counts[payments[i].status] = counts[payments[i].status] + 1;
  }
  return counts;
}

/**
 * confirmPayment - tanggapin yung payment tapos i-mark na paid yung bill. Hindi to
 * tutuloy kung hindi pasado lahat ng limang check. Isang undo step lang pang-balik
 * sa dalawang binago.
 * Time: O(log n) + O(n), Space: O(1)
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

/** declinePayment - i-reject yung report na hindi pumasa sa validation. Time: O(log n) */
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

/** paymentsForAccount - mga payment report ng isang account, pinakabago una. O(n) */
function paymentsForAccount(accountNo) {
  const list = [];
  for (let i = payments.length - 1; i >= 0; i--) {
    if (payments[i].accountNo === accountNo) {
      arrayAppend(list, payments[i]);
    }
  }
  return list;
}

/** paymentRow - mga field para sa list plus yung buwan ng bill, para sa Payments table. O(log n) */
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
 * listPayments - i-filter by status (linear search), hanapin yung text (naive
 * string matching), tapos i-sort gamit yung napiling algorithm.
 * options: { status, query, sortField, sortOrder, algorithm }
 * Time: O(n²) search + O(n²) sort, Space: O(n)
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
