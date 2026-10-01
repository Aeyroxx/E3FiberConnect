/* ==========================================================================
   E3 Fiber Connect - backend/billing.js
   Dito yung monthly bills.

   Rule sa billing (anniversary billing): nagsisimula yung period ng subscriber sa
   parehong araw ng buwan kung kailan sila na-connect, natatapos sa araw bago nun
   sa susunod na buwan, at due 15 days mula nung nagsimula.

   Ganito itsura ng bill id: "BILL-202609-004872" (year, month, huling 6 digits ng
   account) at naka-sort by id yung `bills`, kaya:
     - isang bill             -> binary search                 O(log n)
     - bills ng isang buwan   -> binary search sa una + scan   O(log n) + O(n)

   Mga module sa defense (si Aaron Sebastian ang mag-eexplain):
     Billing: client billing list  (billsForMonth, groupBills, summarizeBills, filterBillRows)
     Billing: bill generation      (billingPeriod, createBill, generateMonthlyBills)
   ========================================================================== */

'use strict';

const BILL_DUE_AFTER_DAYS = 15;

/**
 * billingPeriod - start, end at due date ng bill ng subscriber para sa isang buwan.
 * Na-connect ng 31st? Pag maikli yung buwan, yung huling araw na lang gagamitin.
 * Time: O(1), Space: O(1)
 */
function billingPeriod(subscriber, year, month) {
  const anchorDay = parseISODate(subscriber.since).day;               // 1. yung araw ng buwan nung na-connect sila
  const startDay = anchorDay <= daysInMonth(year, month) ? anchorDay : daysInMonth(year, month);   // 2. maikling buwan? gamitin yung huling araw nito
  const next = addMonths(year, month, 1);
  const nextDay = anchorDay <= daysInMonth(next.year, next.month) ? anchorDay : daysInMonth(next.year, next.month);
  const periodStart = isoDate(year, month, startDay);
  const nextStart = isoDate(next.year, next.month, nextDay);          // 3. yung start ng susunod na period...
  return {                                                            // 4. ...bawas isang araw = end nitong period; due 15 days mula sa start
    periodStart: periodStart,
    periodEnd: addDaysISO(nextStart, -1),
    dueDate: addDaysISO(periodStart, BILL_DUE_AFTER_DAYS),
  };
}

/** findBill - yung bill na may ganitong id, o null. Binary search. Time: O(log n) */
function findBill(billId) {
  const index = binarySearch(bills, 'billId', billId);
  return index === -1 ? null : bills[index];
}

/** hasBill - may bill na ba itong account para sa buwan na to? O(log n) */
function hasBill(accountNo, year, month) {
  return findBill(makeBillId(year, month, accountNo)) !== null;
}

/**
 * createBill - gumawa ng bill ng isang buwan para sa ACTIVE na subscriber.
 * Yung bagong bill ay "nilalagay" sa tamang order ng id gamit sortedInsert.
 * options.quiet -> walang sariling undo/log entry (ginagamit ng generateMonthlyBills).
 * Time: O(log n) checks + O(n) insert, Space: O(1)
 */
function createBill(accountNo, year, month, actor, options) {
  const quiet = options && options.quiet;
  const subscriber = findSubscriber(accountNo);                   // 1. binary search para hanapin yung account
  if (!subscriber) {
    return { ok: false, error: 'Subscriber not found.' };
  }
  if (subscriber.status !== 'Active') {                           // 2. active accounts lang ang bini-bill
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
  const billId = makeBillId(year, month, accountNo);              // 3. halimbawa BILL-202609-004872
  if (findBill(billId)) {                                         // 4. binary search: may bill na ba ngayong buwan?
    return { ok: false, error: subscriber.fullName + ' already has a bill for ' + formatMonthYear(year, month) + '.' };
  }
  const period = billingPeriod(subscriber, year, month);          // 5. period at due date (anniversary billing)
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
  sortedInsert(bills, 'billId', bill);                            // 6. "ilagay" sa id order (binary search + shift)
  if (!quiet) {
    pushUndo('Create ' + formatMonthYear(year, month) + ' bill for ' + subscriber.fullName, [insertOperation('bills', billId)], nameOfActor(actor));
    logActivity('billing', 'Created ' + formatMonthYear(year, month) + ' bill for ' + subscriber.fullName + ' (' + formatPeso(bill.amount) + ')', nameOfActor(actor));
  }
  markDataChanged();
  return { ok: true, bill: bill };
}

/** isBillableIn - Active, at connected na sa buwan na yun (walang bill bago ma-connect). O(1) */
function isBillableIn(subscriber, year, month) {
  const since = parseISODate(subscriber.since);
  return subscriber.status === 'Active' && year * 12 + month >= since.year * 12 + since.month;
}

/**
 * generateMonthlyBills - gawan ng bill lahat ng active na subscriber na wala pang bill
 * sa buwan na yun. Lahat ng bagong bill ay ISANG undo step lang.
 * Time: O(n²) - O(n) na sorted insert bawat subscriber, Space: O(n)
 */
function generateMonthlyBills(year, month, actor) {
  const operations = [];
  let created = 0;
  let total = 0;
  let firstError = '';
  let billable = 0;
  for (let i = 0; i < subscribers.length; i++) {                  // 1. puntahan isa-isa lahat ng subscriber
    if (!isBillableIn(subscribers[i], year, month)) {             // 2. skip yung inactive at yung mga buwan bago sila na-connect
      continue;
    }
    billable++;
    const result = createBill(subscribers[i].accountNo, year, month, actor, { quiet: true }); // 3. hindi tutuloy kung may bill na
    if (result.ok) {
      created++;
      total += result.bill.amount;
      arrayAppend(operations, insertOperation('bills', result.bill.billId));   // 4. tandaan para sa iisang Undo
    } else if (firstError === '' && !hasBill(subscribers[i].accountNo, year, month)) {
      firstError = result.error;                                  //    totoong problema (halimbawa sobrang advance), hindi yung "already billed"
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
 * billsForMonth - mga bill ng isang buwan. Nagsisimula sa "BILL-YYYYMM-" yung bill ids,
 * kaya tatalon muna yung binary search sa una, tapos maikling scan para sa iba.
 * Time: O(log n) + O(n), Space: O(n)
 */
function billsForMonth(year, month) {
  return rangeWithPrefix(bills, 'billId', 'BILL-' + year + pad2(month) + '-');
}

/** billsForAccount - mga bill ng isang account, pinakabagong period una (insertion sort). O(n²) */
function billsForAccount(accountNo) {
  return insertionSort(linearSearchAll(bills, 'accountNo', accountNo), 'periodStart', 'desc');
}

/**
 * unpaidBillsQueue - mga unpaid bill ng account bilang QUEUE, pinakalumang due date
 * una, para laging yung pinakalumang utang yung unang nababayaran (FIFO).
 * Time: O(n²), Space: O(n)
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
 * settleBill - i-mark na paid ngayong araw yung bill. options.quiet -> walang sariling undo/log entry.
 * Time: O(log n), Space: O(1)
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
 * settleOldestBill - kunin yung nasa unahan ng unpaid-bills queue (dequeue) tapos bayaran.
 * Time: O(n²), Space: O(n)
 */
function settleOldestBill(accountNo, actor) {
  const oldest = dequeue(unpaidBillsQueue(accountNo));
  if (!oldest) {
    return { ok: false, error: 'There are no unpaid bills.' };
  }
  return settleBill(oldest.billId, actor, 'Office payment');
}

/** isBillOverdue - unpaid at lampas na sa due date. O(1) */
function isBillOverdue(bill, today) {
  return bill.status === 'Unpaid' && bill.dueDate < today;
}

/**
 * groupBills - hatiin yung bills sa apat na array, base sa due date kumpara sa araw
 * ngayon; tapos bawat bucket ay sine-sort by due date (insertion sort).
 * Time: O(n²), Space: O(n)
 */
function groupBills(list, today) {
  const overdue = [];
  const dueSoon = [];
  const upcoming = [];
  const paid = [];
  for (let i = 0; i < list.length; i++) {                         // 1. isang loop lang sa bills ng buwan
    const bill = list[i];
    if (bill.status === 'Paid') {
      arrayAppend(paid, bill);
    } else {
      const daysLeft = daysBetweenISO(today, bill.dueDate);       // 2. ilang araw pa bago (o lampas na sa) due date
      if (daysLeft < 0) {
        arrayAppend(overdue, bill);
      } else if (daysLeft <= 7) {
        arrayAppend(dueSoon, bill);
      } else {
        arrayAppend(upcoming, bill);
      }
    }
  }
  return {                                                        // 3. i-sort bawat group by date (insertion sort)
    overdue: insertionSort(overdue, 'dueDate', 'asc'),
    dueSoon: insertionSort(dueSoon, 'dueDate', 'asc'),
    upcoming: insertionSort(upcoming, 'dueDate', 'asc'),
    paid: insertionSort(paid, 'paidOn', 'desc'),
  };
}

/** summarizeBills - total ng expected / collected / outstanding sa isang loop lang. O(n) */
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
 * earlierOverdueBills - mga unpaid at lampas due na bill galing sa mga buwan BAGO yung
 * nasa screen, para hindi mawala sa view yung mga lumang utang.
 * Time: O(n²), Space: O(n)
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

/** billDueText - yung may kulay na status text sa bawat bill row. O(1) */
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

/** billRow - yung bill plus pangalan at plan ng subscriber, para sa list at search. O(log n) */
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
 * filterBillRows - status filter ("all", "unpaid", "paid") + text search sa pangalan
 * ng subscriber, account number at bill id.
 * Time: O(n²), Space: O(n)
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

/** receivablesSummary - mga overdue na bill sa lahat ng buwan (para sa dashboard, sidebar). O(n) */
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
 * billableSubscribers - lahat ng active na subscriber na connected na sa buwan na yun,
 * kasama kung may bill na sila dun (para sa "New bill" sheet).
 * Time: O(n²) at most - isang O(log n) binary search bawat subscriber, Space: O(n)
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
