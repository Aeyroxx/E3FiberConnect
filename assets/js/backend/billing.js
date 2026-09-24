/* ==========================================================================
   E3 Fiber Connect · backend/billing.js
   Monthly bills.

   Billing rule (anniversary billing): a subscriber's period starts on the same
   day of the month they were connected, ends the day before that date next
   month, and is due 15 days after it starts.

   Bill ids look like "BILL-202609-004872" (year, month, last 6 digits of the
   account) and `bills` is kept sorted by id, so:
     • one bill            → binary search                      O(log n)
     • one month's bills   → binary search to the first + scan  O(log n + k)

   Defense modules — presented by Aaron Sebastian:
     Billing: client billing list  (billsForMonth, groupBills, summarizeBills, filterBillRows)
     Billing: bill generation      (billingPeriod, createBill, generateMonthlyBills)
   ========================================================================== */

'use strict';

const BILL_DUE_AFTER_DAYS = 15;

/**
 * billingPeriod — start, end and due date of a subscriber's bill for a month.
 * Joined on the 31st? Short months use their last day instead.
 * Time O(1) · Space O(1)
 */
function billingPeriod(subscriber, year, month) {
  const anchorDay = parseISODate(subscriber.since).day;               // 1. the day of the month they were connected
  const startDay = anchorDay <= daysInMonth(year, month) ? anchorDay : daysInMonth(year, month);   // 2. short month? use its last day
  const next = addMonths(year, month, 1);
  const nextDay = anchorDay <= daysInMonth(next.year, next.month) ? anchorDay : daysInMonth(next.year, next.month);
  const periodStart = isoDate(year, month, startDay);
  const nextStart = isoDate(next.year, next.month, nextDay);          // 3. the next period's start …
  return {                                                            // 4. … minus one day ends this one; due 15 days after the start
    periodStart: periodStart,
    periodEnd: addDaysISO(nextStart, -1),
    dueDate: addDaysISO(periodStart, BILL_DUE_AFTER_DAYS),
  };
}

/** findBill — the bill with this id, or null. Binary search. Time O(log n) */
function findBill(billId) {
  const index = binarySearch(bills, 'billId', billId);
  return index === -1 ? null : bills[index];
}

/** hasBill — does this account already have a bill for the month? O(log n) */
function hasBill(accountNo, year, month) {
  return findBill(makeBillId(year, month, accountNo)) !== null;
}

/**
 * createBill — issue one month's bill for an ACTIVE subscriber.
 * The new bill is "put" in id order with sortedInsert.
 * options.quiet → no own undo/log entry (used by generateMonthlyBills).
 * Time O(log n) checks + O(n) insert · Space O(1)
 */
function createBill(accountNo, year, month, actor, options) {
  const quiet = options && options.quiet;
  const subscriber = findSubscriber(accountNo);                   // 1. binary search for the account
  if (!subscriber) {
    return { ok: false, error: 'Subscriber not found.' };
  }
  if (subscriber.status !== 'Active') {                           // 2. only active accounts are billed
    return { ok: false, error: subscriber.fullName + ' is ' + toLowerText(subscriber.status) + ' — only active accounts are billed.' };
  }
  if (!(month >= 1 && month <= 12) || !(year >= 2000 && year <= 2100)) {
    return { ok: false, error: 'Choose a valid month.' };
  }
  const since = parseISODate(subscriber.since);
  if (year * 12 + month < since.year * 12 + since.month) {
    return { ok: false, error: subscriber.fullName + ' was connected on ' + formatDate(subscriber.since) + '.' };
  }
  const clock = readClock();
  if (year * 12 + month > clock.year * 12 + clock.month + 1) {
    return { ok: false, error: 'Bills can be created up to one month ahead.' };
  }
  const billId = makeBillId(year, month, accountNo);              // 3. e.g. BILL-202609-004872
  if (findBill(billId)) {                                         // 4. binary search: already billed this month?
    return { ok: false, error: subscriber.fullName + ' already has a bill for ' + formatMonthYear(year, month) + '.' };
  }
  const period = billingPeriod(subscriber, year, month);          // 5. period and due date (anniversary billing)
  const bill = {
    billId: billId,
    accountNo: accountNo,
    billingYear: year,
    billingMonth: month,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    dueDate: period.dueDate,
    amount: planPrice(subscriber.planId, subscriber.customPrice),
    status: 'Unpaid',
    paidOn: null,
    paymentRef: '',
    createdAt: nowISO(),
  };
  sortedInsert(bills, 'billId', bill);                            // 6. "put" it in id order (binary search + shift)
  if (!quiet) {
    pushUndo('Create ' + formatMonthYear(year, month) + ' bill for ' + subscriber.fullName, [insertOperation('bills', billId)], nameOfActor(actor));
    logActivity('billing', 'Created ' + formatMonthYear(year, month) + ' bill for ' + subscriber.fullName + ' (' + formatPeso(bill.amount) + ')', nameOfActor(actor));
  }
  markDataChanged();
  return { ok: true, bill: bill };
}

/** isBillableIn — Active, and already connected by that month (no bills before the connection). O(1) */
function isBillableIn(subscriber, year, month) {
  const since = parseISODate(subscriber.since);
  return subscriber.status === 'Active' && year * 12 + month >= since.year * 12 + since.month;
}

/**
 * generateMonthlyBills — bill every active subscriber who has no bill for the
 * month yet. All the new bills form ONE undo step.
 * Time O(s · n) for s subscribers · Space O(s)
 */
function generateMonthlyBills(year, month, actor) {
  const operations = [];
  let created = 0;
  let total = 0;
  let firstError = '';
  let billable = 0;
  for (let i = 0; i < subscribers.length; i++) {                  // 1. visit every subscriber
    if (!isBillableIn(subscribers[i], year, month)) {             // 2. skip inactive accounts and months before they were connected
      continue;
    }
    billable++;
    const result = createBill(subscribers[i].accountNo, year, month, actor, { quiet: true }); // 3. refuses if already billed
    if (result.ok) {
      created++;
      total += result.bill.amount;
      arrayAppend(operations, insertOperation('bills', result.bill.billId));   // 4. remember it for one Undo
    } else if (firstError === '' && !hasBill(subscribers[i].accountNo, year, month)) {
      firstError = result.error;                                  //    a real problem (e.g. too far ahead), not "already billed"
    }
  }
  if (created === 0) {
    let error = 'Every active subscriber already has a bill for ' + formatMonthYear(year, month) + '.';
    if (firstError !== '') {
      error = firstError;
    } else if (billable === 0) {
      error = 'No active subscriber was connected yet in ' + formatMonthYear(year, month) + '.';
    }
    return { ok: false, created: 0, total: 0, error: error };
  }
  pushUndo('Generate ' + pluralize(created, 'bill') + ' for ' + formatMonthYear(year, month), operations, nameOfActor(actor));
  logActivity('billing', 'Generated ' + pluralize(created, 'bill') + ' for ' + formatMonthYear(year, month) + ' (' + formatPeso(total) + ')', nameOfActor(actor));
  return { ok: true, created: created, total: total, error: '' };
}

/**
 * billsForMonth — one month's bills. Bill ids start with "BILL-YYYYMM-", so a
 * binary search jumps to the first one and a short scan collects the rest.
 * Time O(log n + k) · Space O(k)
 */
function billsForMonth(year, month) {
  return rangeWithPrefix(bills, 'billId', 'BILL-' + year + pad2(month) + '-');
}

/** billsForAccount — one account's bills, newest period first (insertion sort). O(n + k²) */
function billsForAccount(accountNo) {
  return insertionSort(linearSearchAll(bills, 'accountNo', accountNo), 'periodStart', 'desc');
}

/**
 * unpaidBillsQueue — the account's unpaid bills as a QUEUE, oldest due date
 * first, so payments always settle the oldest debt first (FIFO).
 * Time O(n + k²) · Space O(k)
 */
function unpaidBillsQueue(accountNo) {
  const unpaid = [];
  for (let i = 0; i < bills.length; i++) {
    if (bills[i].accountNo === accountNo && bills[i].status === 'Unpaid') {
      arrayAppend(unpaid, bills[i]);
    }
  }
  const ordered = insertionSort(unpaid, 'dueDate', 'asc');
  const queue = createQueue(4);
  for (let i = 0; i < ordered.length; i++) {
    enqueue(queue, ordered[i]);
  }
  return queue;
}

/**
 * settleBill — mark a bill paid today. options.quiet → no own undo/log entry.
 * Time O(log n) · Space O(1)
 */
function settleBill(billId, actor, paymentRef, options) {
  const quiet = options && options.quiet;
  const bill = findBill(billId);
  if (!bill) {
    return { ok: false, error: 'Bill not found.' };
  }
  if (bill.status === 'Paid') {
    return { ok: false, error: 'This bill is already paid.' };
  }
  const before = snapshotFields(bill, ['status', 'paidOn', 'paymentRef']);
  bill.status = 'Paid';
  bill.paidOn = todayISO();
  bill.paymentRef = paymentRef || 'Office payment';
  if (!quiet) {
    const subscriber = findSubscriber(bill.accountNo);
    const who = subscriber ? subscriber.fullName : bill.accountNo;
    pushUndo('Settle ' + formatMonthYear(bill.billingYear, bill.billingMonth) + ' bill of ' + who, [updateOperation('bills', billId, before)], nameOfActor(actor));
    logActivity('billing', 'Settled ' + formatMonthYear(bill.billingYear, bill.billingMonth) + ' bill of ' + who + ' (' + formatPeso(bill.amount) + ')', nameOfActor(actor));
  }
  markDataChanged();
  return { ok: true, bill: bill };
}

/**
 * settleOldestBill — take the front of the unpaid-bills queue (dequeue) and pay it.
 * Time O(n + k²) · Space O(k)
 */
function settleOldestBill(accountNo, actor) {
  const oldest = dequeue(unpaidBillsQueue(accountNo));
  if (!oldest) {
    return { ok: false, error: 'There are no unpaid bills.' };
  }
  return settleBill(oldest.billId, actor, 'Office payment');
}

/** isBillOverdue — unpaid and past its due date. O(1) */
function isBillOverdue(bill, today) {
  return bill.status === 'Unpaid' && bill.dueDate < today;
}

/**
 * groupBills — bucket bills into four arrays by comparing the due date with
 * today; each bucket is then sorted by due date (insertion sort).
 * Time O(n + k²) · Space O(n)
 */
function groupBills(list, today) {
  const overdue = [];
  const dueSoon = [];
  const upcoming = [];
  const paid = [];
  for (let i = 0; i < list.length; i++) {                         // 1. one pass over the month's bills
    const bill = list[i];
    if (bill.status === 'Paid') {
      arrayAppend(paid, bill);
    } else {
      const daysLeft = daysBetweenISO(today, bill.dueDate);       // 2. days until (or since) the due date
      if (daysLeft < 0) {
        arrayAppend(overdue, bill);
      } else if (daysLeft <= 7) {
        arrayAppend(dueSoon, bill);
      } else {
        arrayAppend(upcoming, bill);
      }
    }
  }
  return {                                                        // 3. sort each group by date (insertion sort)
    overdue: insertionSort(overdue, 'dueDate', 'asc'),
    dueSoon: insertionSort(dueSoon, 'dueDate', 'asc'),
    upcoming: insertionSort(upcoming, 'dueDate', 'asc'),
    paid: insertionSort(paid, 'paidOn', 'desc'),
  };
}

/** summarizeBills — expected / collected / outstanding totals in one pass. O(n) */
function summarizeBills(list) {
  const totals = { expected: 0, collected: 0, outstanding: 0, count: list.length, paidCount: 0, unpaidCount: 0 };
  for (let i = 0; i < list.length; i++) {
    totals.expected += list[i].amount;
    if (list[i].status === 'Paid') {
      totals.collected += list[i].amount;
      totals.paidCount++;
    } else {
      totals.outstanding += list[i].amount;
      totals.unpaidCount++;
    }
  }
  return totals;
}

/**
 * earlierOverdueBills — unpaid, past-due bills from months BEFORE the one on
 * screen, so old debts never disappear from view.
 * Time O(n + k²) · Space O(k)
 */
function earlierOverdueBills(year, month, today) {
  const viewKey = year * 12 + month;
  const list = [];
  for (let i = 0; i < bills.length; i++) {
    const bill = bills[i];
    if (isBillOverdue(bill, today) && bill.billingYear * 12 + bill.billingMonth < viewKey) {
      arrayAppend(list, bill);
    }
  }
  return insertionSort(list, 'dueDate', 'asc');
}

/** billDueText — the coloured status words shown on a bill row. O(1) */
function billDueText(bill, today) {
  if (bill.status === 'Paid') {
    return { text: 'Paid ' + formatShortDate(bill.paidOn), tone: 'green' };
  }
  const daysLeft = daysBetweenISO(today, bill.dueDate);
  if (daysLeft < 0) {
    return { text: pluralize(-daysLeft, 'day') + ' overdue', tone: 'red' };
  }
  if (daysLeft === 0) {
    return { text: 'Due today', tone: 'orange' };
  }
  if (daysLeft <= 7) {
    return { text: 'Due in ' + pluralize(daysLeft, 'day'), tone: 'orange' };
  }
  return { text: 'Due ' + formatShortDate(bill.dueDate), tone: 'gray' };
}

/** billRow — a bill plus the subscriber's name and plan, for lists and search. O(log n) */
function billRow(bill) {
  const subscriber = findSubscriber(bill.accountNo);
  return {
    billId: bill.billId,
    accountNo: bill.accountNo,
    fullName: subscriber ? subscriber.fullName : bill.accountNo,
    planName: subscriber ? planName(subscriber.planId) : '',
    amount: bill.amount,
    dueDate: bill.dueDate,
    status: bill.status,
    record: bill,
  };
}

/**
 * filterBillRows — status filter ("all", "unpaid", "paid") + text search on
 * the subscriber name, account number and bill id.
 * Time O(n · L · m) · Space O(n)
 */
function filterBillRows(list, statusFilter, query) {
  const rows = [];
  for (let i = 0; i < list.length; i++) {
    const bill = list[i];
    if (statusFilter === 'unpaid' && bill.status !== 'Unpaid') {
      continue;
    }
    if (statusFilter === 'paid' && bill.status !== 'Paid') {
      continue;
    }
    arrayAppend(rows, billRow(bill));
  }
  return textSearchRecords(rows, ['fullName', 'accountNo', 'billId'], query);
}

/** receivablesSummary — overdue bills across every month (dashboard, sidebar). O(n) */
function receivablesSummary(today) {
  let overdueCount = 0;
  let overdueAmount = 0;
  let unpaidAmount = 0;
  for (let i = 0; i < bills.length; i++) {
    if (bills[i].status === 'Unpaid') {
      unpaidAmount += bills[i].amount;
      if (bills[i].dueDate < today) {
        overdueCount++;
        overdueAmount += bills[i].amount;
      }
    }
  }
  return { overdueCount: overdueCount, overdueAmount: overdueAmount, unpaidAmount: unpaidAmount };
}

/**
 * billableSubscribers — every active subscriber already connected by that month,
 * with whether they already have a bill for it (for the "New bill" sheet).
 * Time O(s · log n) · Space O(s)
 */
function billableSubscribers(year, month) {
  const list = [];
  for (let i = 0; i < subscribers.length; i++) {
    const subscriber = subscribers[i];
    if (isBillableIn(subscriber, year, month)) {
      arrayAppend(list, {
        accountNo: subscriber.accountNo,
        fullName: subscriber.fullName,
        planName: planName(subscriber.planId),
        amount: planPrice(subscriber.planId, subscriber.customPrice),
        billed: hasBill(subscriber.accountNo, year, month),
      });
    }
  }
  return insertionSort(list, 'fullName', 'asc');
}
