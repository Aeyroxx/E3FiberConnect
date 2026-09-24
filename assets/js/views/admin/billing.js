/* ==========================================================================
   E3 Fiber Connect · views/admin/billing.js
   Billing for one month at a time: totals, a note about payments waiting for
   validation (their FIFO queue lives on the Payments page), old overdue bills,
   and this month's bills grouped by how soon they're due.
   One month's bills are found with binary search on the sorted bill ids.
   Defense modules: Billing (client billing list) and Billing (bill generation)
   — presented by Aaron Sebastian.
   ========================================================================== */

'use strict';

const billingViewState = { year: 0, month: 0, filter: 'all', query: '' };

function ensureBillingMonth() {
  if (billingViewState.year === 0) {
    const clock = readClock();
    billingViewState.year = clock.year;
    billingViewState.month = clock.month;
  }
}

function billRowHTML(bill, today) {
  const subscriber = findSubscriber(bill.accountNo);
  const name = subscriber ? subscriber.fullName : bill.accountNo;
  const due = billDueText(bill, today);
  const month = formatMonthYear(bill.billingYear, bill.billingMonth);
  return '<tr>'
    + '<td class="cell-main"><div class="cell-person">' + avatar(name, 'sm') + '<div class="min-w-0">'
    + '<a class="cell-primary" href="#/admin/subscribers/' + escapeHTML(bill.accountNo) + '">' + escapeHTML(name) + '</a>'
    + '<span class="cell-secondary mono text-nowrap">' + escapeHTML(bill.accountNo) + '</span></div></div></td>'
    + '<td data-label="Period" class="text-nowrap">' + escapeHTML(formatPeriod(bill.periodStart, bill.periodEnd)) + '</td>'
    + '<td data-label="Due">' + tonePill(due.text, due.tone) + '</td>'
    + '<td data-label="Amount" class="num">' + formatPeso(bill.amount) + '</td>'
    + '<td data-label="Status">' + statusBadge(isBillOverdue(bill, today) ? 'Overdue' : bill.status) + '</td>'
    + '<td class="actions-cell"><div class="cell-actions">' + (bill.status === 'Unpaid'
      ? '<button class="btn btn-tinted btn-xs" type="button" data-action="settle" data-bill="' + escapeHTML(bill.billId) + '" aria-label="Mark ' + escapeHTML(name) + '’s ' + escapeHTML(month) + ' bill paid">Mark paid</button>'
      : '') + '</div></td></tr>';
}

function billGroupHTML(title, list, today) {
  if (list.length === 0) {
    return '';
  }
  const totals = summarizeBills(list);
  let rows = '';
  for (let i = 0; i < list.length; i++) {
    rows += billRowHTML(list[i], today);
  }
  return '<section class="bill-group"><div class="bill-group-head"><h2 class="bill-group-title">' + escapeHTML(title) + '</h2>'
    + '<p class="bill-group-sum">' + pluralize(list.length, 'bill') + ' · ' + formatPeso(totals.expected) + '</p></div>'
    + '<div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Subscriber</th><th scope="col">Period</th><th scope="col">Due</th><th scope="col" class="num">Amount</th><th scope="col">Status</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table></div></section>';
}

/** renderBillingPayments — how many reports wait in the validation queue, and who is next (queuePeek). */
function renderBillingPayments() {
  const queue = paymentsQueue();
  const front = queuePeek(queue);
  toggleElement(byId('billPaymentsPanel'), front !== null);
  if (!front) {
    return;
  }
  setText('billPaymentsTitle', pluralize(queueSize(queue), 'payment') + ' waiting for validation');
  setText('billPaymentsText', 'Next in the queue: ' + front.fullName + ' · ' + formatPeso(front.amount) + ' via ' + front.method
    + ', sent ' + formatTimeAgoInline(front.submittedAt) + '. Confirming a payment marks its bill paid here.');
}

function renderBillingEarlier(today) {
  const earlier = earlierOverdueBills(billingViewState.year, billingViewState.month, today);
  toggleElement(byId('billEarlierPanel'), earlier.length > 0);
  let html = '';
  for (let i = 0; i < earlier.length; i++) {
    const bill = earlier[i];
    const subscriber = findSubscriber(bill.accountNo);
    const due = billDueText(bill, today);
    html += '<li class="row-item"><span class="icon-bubble tone-red">' + iconHTML('warning') + '</span>'
      + '<div class="row-main"><a class="row-title" href="#/admin/subscribers/' + escapeHTML(bill.accountNo) + '">' + escapeHTML(subscriber ? subscriber.fullName : bill.accountNo) + '</a>'
      + '<p class="row-meta">' + escapeHTML(formatMonthYear(bill.billingYear, bill.billingMonth)) + ' · ' + formatPeso(bill.amount) + ' · ' + tonePill(due.text, due.tone) + '</p></div>'
      + '<button class="btn btn-tinted btn-xs" type="button" data-action="settle" data-bill="' + escapeHTML(bill.billId) + '">Mark paid</button></li>';
  }
  setHTML('billEarlier', html);
}

function renderBillingView() {
  renderAdminChrome();
  ensureBillingMonth();
  const state = billingViewState;
  const today = todayISO();
  const monthLabel = formatMonthYear(state.year, state.month);
  setText('billMonthLabel', monthLabel);
  setText('billSubtitle', 'Bills for ' + monthLabel + ' · each is due 15 days after its period starts');
  markSegment(byId('billFilter'), state.filter);
  byId('billSearch').value = state.query;

  const started = stopwatchStart();
  const monthBills = billsForMonth(state.year, state.month);
  logOperation('Binary search + scan', 'Bills of ' + monthLabel, bills.length, dsaLastRun.comparisons, 0, stopwatchMs(started));
  const summary = summarizeBills(monthBills);
  const receivables = receivablesSummary(today);
  const percent = percentOf(summary.collected, summary.expected);
  setHTML('billKpis',
    '<div class="kpi"><span class="icon-bubble tone-blue">' + iconHTML('receipt') + '</span><span class="kpi-label">Expected</span><span class="kpi-value">' + formatPeso(summary.expected) + '</span><span class="kpi-note">' + pluralize(summary.count, 'bill') + '</span></div>'
    + '<div class="kpi"><span class="icon-bubble tone-green">' + iconHTML('check-circle') + '</span><span class="kpi-label">Collected</span><span class="kpi-value">' + formatPeso(summary.collected) + '</span><span class="kpi-note">' + percent + '% of expected</span></div>'
    + '<div class="kpi"><span class="icon-bubble tone-orange">' + iconHTML('clock') + '</span><span class="kpi-label">Outstanding</span><span class="kpi-value">' + formatPeso(summary.outstanding) + '</span><span class="kpi-note">' + pluralize(summary.unpaidCount, 'unpaid bill') + '</span></div>'
    + '<div class="kpi"><span class="icon-bubble tone-red">' + iconHTML('warning') + '</span><span class="kpi-label">Overdue, all months</span><span class="kpi-value">' + formatPeso(receivables.overdueAmount) + '</span><span class="kpi-note">' + pluralize(receivables.overdueCount, 'bill') + ' past due</span></div>');

  renderBillingPayments();
  renderBillingEarlier(today);

  const rows = filterBillRows(monthBills, state.filter, state.query);
  const records = [];
  for (let i = 0; i < rows.length; i++) {
    arrayAppend(records, rows[i].record);
  }
  const groups = groupBills(records, today);
  const html = billGroupHTML('Overdue', groups.overdue, today)
    + billGroupHTML('Due within 7 days', groups.dueSoon, today)
    + billGroupHTML('Upcoming', groups.upcoming, today)
    + billGroupHTML('Paid', groups.paid, today);
  setHTML('billGroups', html);
  const empty = byId('billEmpty');
  empty.hidden = html !== '';
  if (monthBills.length === 0) {
    empty.innerHTML = emptyState('receipt', 'No bills for ' + monthLabel, 'Use “Generate bills” to bill every active subscriber for this month.');
  } else {
    empty.innerHTML = emptyState('search', 'No matching bills', 'Try another name or filter.');
  }
}

function changeBillingMonth(delta) {
  const next = addMonths(billingViewState.year, billingViewState.month, delta);
  billingViewState.year = next.year;
  billingViewState.month = next.month;
  renderBillingView();
}

function renderNewBillList() {
  const year = Number(fieldValue('newBillYear'));
  const month = Number(fieldValue('newBillMonth'));
  const list = textSearchRecords(billableSubscribers(year, month), ['fullName', 'accountNo'], fieldValue('newBillSearch'));
  let html = '';
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const text = item.billed ? 'Already billed for ' + formatMonthYear(year, month) : item.accountNo + ' · ' + item.planName + ' · ' + formatPeso(item.amount);
    html += compactChoice('newBillAccount', 'new-bill-' + item.accountNo, item.accountNo, item.fullName, text, false, item.billed);
  }
  setHTML('newBillList', html || '<p class="caption-text">No active subscribers match.</p>');
}

function openNewBillSheet() {
  ensureBillingMonth();
  let months = '';
  for (let m = 1; m <= 12; m++) {
    months += '<option value="' + m + '"' + (m === billingViewState.month ? ' selected' : '') + '>' + MONTH_NAMES[m - 1] + '</option>';
  }
  setHTML('newBillMonth', months);
  const clock = readClock();
  let years = '';
  for (let y = clock.year - 1; y <= clock.year + 1; y++) {
    years += '<option value="' + y + '"' + (y === billingViewState.year ? ' selected' : '') + '>' + y + '</option>';
  }
  setHTML('newBillYear', years);
  setFieldValue('newBillSearch', '');
  setFormAlert('newBillAlert', '');
  renderNewBillList();
  openSheet('sheetNewBill', document.activeElement);
}

function runBillingAction(action, element) {
  const staff = currentStaff();
  if (action === 'settle') {
    const bill = findBill(element.getAttribute('data-bill'));
    const subscriber = bill ? findSubscriber(bill.accountNo) : null;
    const result = settleBill(element.getAttribute('data-bill'), staff);
    if (!result.ok) {
      reportFailure(result);
    } else {
      announce('Marked ' + (subscriber ? subscriber.fullName + '’s ' : '') + formatMonthYear(bill.billingYear, bill.billingMonth) + ' bill paid');
    }
    renderBillingView();
  }
}

function initBillingView() {
  onClick('billPrev', function () { changeBillingMonth(-1); });
  onClick('billNext', function () { changeBillingMonth(1); });
  onClick('billToday', function () {
    const clock = readClock();
    billingViewState.year = clock.year;
    billingViewState.month = clock.month;
    renderBillingView();
  });
  onSegmentChange(byId('billFilter'), function (value) {
    billingViewState.filter = value;
    renderBillingView();
  });
  byId('billSearch').addEventListener('input', function (event) {
    billingViewState.query = event.target.value;
    renderBillingView();
  });
  onAction(byId('billGroups'), runBillingAction);
  onAction(byId('billEarlier'), runBillingAction);

  onClick('billGenerate', function () {
    ensureBillingMonth();
    const year = billingViewState.year;
    const month = billingViewState.month;
    const clock = readClock();
    if (year * 12 + month > clock.year * 12 + clock.month + 1) {
      showToast('Bills can be created up to one month ahead.', { tone: 'info' });
      return;
    }
    const list = billableSubscribers(year, month);
    if (list.length === 0) {
      showToast('No active subscriber was connected yet in ' + formatMonthYear(year, month) + '.', { tone: 'info' });
      return;
    }
    let missing = 0;
    for (let i = 0; i < list.length; i++) {
      if (!list[i].billed) {
        missing++;
      }
    }
    if (missing === 0) {
      showToast('Every active subscriber already has a ' + formatMonthYear(year, month) + ' bill.', { tone: 'info' });
      return;
    }
    askToConfirm({
      title: 'Generate ' + pluralize(missing, 'bill') + '?',
      text: 'Creates a ' + formatMonthYear(year, month) + ' bill for each active subscriber who doesn’t have one yet. You can undo this in one step.',
      confirmLabel: 'Generate bills',
      danger: false,
      onConfirm: function () {
        const result = generateMonthlyBills(year, month, currentStaff());
        if (!result.ok) {
          reportFailure(result);
        } else {
          announce('Created ' + pluralize(result.created, 'bill') + ' · ' + formatPeso(result.total));
        }
        renderBillingView();
      },
    });
  });

  onClick('billNew', openNewBillSheet);
  byId('newBillMonth').addEventListener('change', renderNewBillList);
  byId('newBillYear').addEventListener('change', renderNewBillList);
  byId('newBillSearch').addEventListener('input', renderNewBillList);
  byId('newBillForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const accountNo = checkedValue('newBillAccount', byId('newBillList'));
    if (!accountNo) {
      setFormAlert('newBillAlert', 'Choose a subscriber to bill.', 'error');
      return;
    }
    const year = Number(fieldValue('newBillYear'));
    const month = Number(fieldValue('newBillMonth'));
    const result = createBill(accountNo, year, month, currentStaff());
    if (!result.ok) {
      setFormAlert('newBillAlert', result.error, 'error');
      return;
    }
    closeSheet('sheetNewBill');
    billingViewState.year = year;
    billingViewState.month = month;
    const subscriber = findSubscriber(accountNo);
    announce('Created ' + formatMonthYear(year, month) + ' bill for ' + subscriber.fullName);
    renderBillingView();
  });
}
