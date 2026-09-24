/* ==========================================================================
   E3 Fiber Connect · views/public/pay.js
   Pay Bills: a subscriber proves who they are (account number + registered
   mobile), sees the balance and bills, and reports a payment (method, amount,
   reference number). Reports join the staff's payment-validation QUEUE.
   Defense module: Payments (the customer's side) — presented by Aaron Sebastian.
   ========================================================================== */

'use strict';

const payState = { accountNo: '' };
const PAY_REPORT_FIELDS = { billId: 'payBillChoices', method: 'payMethod', amount: 'payAmount', referenceCode: 'payReference' };

/** syncPayAmount — fill "Amount paid" with the amount of the bill that is chosen. O(log n) */
function syncPayAmount() {
  const bill = findBill(checkedValue('payBill', byId('payBillChoices')));
  setFieldValue('payAmount', bill ? bill.amount : '');
}

/** updateReferenceHint — show what a reference number looks like for the chosen method. O(r) */
function updateReferenceHint() {
  const rule = paymentReferenceRule(fieldValue('payMethod'));
  setText('payReference-hint', rule ? rule.method + ' reference numbers have ' + rule.shape + ', e.g. ' + rule.example + '.' : 'Printed on your receipt or payment confirmation.');
  byId('payReference').placeholder = 'e.g. ' + (rule ? rule.example : '5012 873 246 119');
}

function payBillLabel(bill) {
  return formatMonthYear(bill.billingYear, bill.billingMonth);
}

function renderPayAccount() {
  const subscriber = findSubscriber(payState.accountNo);
  if (!subscriber) {
    payState.accountNo = '';
    renderPayView();
    return;
  }
  const today = todayISO();
  const balance = subscriberBalance(subscriber.accountNo);
  const next = nextBillInfo(subscriber);
  setText('payName', subscriber.fullName);
  setHTML('payMeta', '<span class="mono">' + escapeHTML(subscriber.accountNo) + '</span> · ' + escapeHTML(planLabel(subscriber.planId, subscriber.customPrice)) + ' · ' + statusBadge(subscriber.status));
  setText('payBalance', formatPeso(balance));
  byId('payBalance').classList.toggle('text-red', balance > 0 && next.dueDate !== null && next.dueDate < today);
  let note = 'You’re all paid up. ' + next.label + '.';
  if (balance > 0 && next.dueDate < today) {
    note = 'Your oldest bill was due ' + formatDate(next.dueDate) + ' — please pay as soon as you can. Payments settle the oldest bill first.';
  } else if (balance > 0) {
    note = 'Pay by ' + formatDate(next.dueDate) + '. Payments settle the oldest bill first.';
  }
  setText('payBalanceNote', note);

  const history = billsForAccount(subscriber.accountNo);
  let billsHTML = '';
  for (let i = 0; i < history.length && i < 6; i++) {
    const bill = history[i];
    const due = billDueText(bill, today);
    billsHTML += '<li class="row-item"><div class="row-main"><p class="row-title">' + escapeHTML(payBillLabel(bill)) + '</p>'
      + '<p class="row-meta">' + escapeHTML(formatPeriod(bill.periodStart, bill.periodEnd)) + ' · ' + tonePill(due.text, due.tone) + '</p></div>'
      + '<p class="fw-semibold tabular">' + formatPeso(bill.amount) + '</p></li>';
  }
  setHTML('payBills', billsHTML || '<li class="row-item"><p class="row-meta">No bills yet — your first bill arrives at the start of your billing period.</p></li>');

  let choices = '';
  let count = 0;
  const unpaid = queueToArray(unpaidBillsQueue(subscriber.accountNo));
  for (let i = 0; i < unpaid.length; i++) {
    if (pendingPaymentForBill(unpaid[i].billId)) {
      continue;
    }
    count++;
    const id = 'pay-bill-' + unpaid[i].billId;
    choices += '<div class="choice"><input class="choice-input" type="radio" name="payBill" id="' + escapeHTML(id) + '" value="' + escapeHTML(unpaid[i].billId) + '"' + (count === 1 ? ' checked' : '') + '>'
      + '<label class="choice-card choice-card-compact" for="' + escapeHTML(id) + '"><span class="choice-check" aria-hidden="true">' + iconHTML('check') + '</span>'
      + '<span class="choice-title">' + escapeHTML(payBillLabel(unpaid[i])) + ' · ' + formatPeso(unpaid[i].amount) + '</span>'
      + '<span class="choice-text">Due ' + escapeHTML(formatDate(unpaid[i].dueDate)) + '</span></label></div>';
  }
  setHTML('payBillChoices', choices);
  toggleElement(byId('payReportCard'), count > 0);
  syncPayAmount();

  const reports = paymentsForAccount(subscriber.accountNo);
  let reportsHTML = '';
  for (let i = 0; i < reports.length; i++) {
    const payment = reports[i];
    reportsHTML += '<li class="row-item"><div class="row-main"><p class="row-title">' + escapeHTML(payment.method) + ' · ' + formatPeso(payment.amount) + '</p>'
      + '<p class="row-meta"><span class="mono">' + escapeHTML(payment.paymentId) + '</span> · sent ' + escapeHTML(formatTimeAgoInline(payment.submittedAt))
      + (payment.note ? ' · ' + escapeHTML(payment.note) : '') + '</p></div>' + statusBadge(payment.status) + '</li>';
  }
  setHTML('payHistory', reportsHTML || '<li class="row-item"><p class="row-meta">No payment reports yet.</p></li>');
}

function renderPayView() {
  const signedIn = payState.accountNo !== '';
  toggleElement(byId('payLookupForm'), !signedIn);
  toggleElement(byId('payAccountView'), signedIn);
  if (signedIn) {
    renderPayAccount();
  }
}

function initPayView() {
  fillSelect('payMethod', PAYMENT_METHODS, 'Choose one');
  byId('payLookupForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const result = verifySubscriberAccess(fieldValue('payAccount'), fieldValue('payMobile'));
    if (!result.ok) {
      setFormAlert('payLookupAlert', result.error, 'error');
      return;
    }
    setFormAlert('payLookupAlert', '');
    payState.accountNo = result.subscriber.accountNo;
    renderPayView();
    focusElement(byId('payName'));
  });
  onClick('payLeave', function () {
    payState.accountNo = '';
    byId('payLookupForm').reset();
    byId('payReportForm').reset();
    clearFieldErrors(PAY_REPORT_FIELDS);
    updateReferenceHint();
    renderPayView();
  });
  byId('payBillChoices').addEventListener('change', function () {
    syncPayAmount();
    setFieldError('payBillChoices', '');
  });
  byId('payMethod').addEventListener('change', function () {
    updateReferenceHint();
    setFieldError('payMethod', '');
    if (fieldValue('payReference') !== '') {
      setFieldError('payReference', '');
    }
  });
  liveValidate('payReference', function () {
    const rule = paymentReferenceRule(fieldValue('payMethod'));
    const code = normalizePaymentReference(fieldValue('payReference'));
    return rule && code !== '' && !checkReferenceFormat(rule.method, code).ok ? rule.method + ' reference numbers have ' + rule.shape + '.' : '';
  });
  byId('payReportForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const result = reportPayment(payState.accountNo, {
      billId: checkedValue('payBill', byId('payBillChoices')),
      method: fieldValue('payMethod'),
      amount: fieldValue('payAmount'),
      referenceCode: fieldValue('payReference'),
    });
    if (!result.ok) {
      focusInvalid(applyFieldErrors(PAY_REPORT_FIELDS, result.errors));
      return;
    }
    clearFieldErrors(PAY_REPORT_FIELDS);
    byId('payReportForm').reset();
    updateReferenceHint();
    showToast('Payment details sent. We’ll confirm within one business day.');
    renderPayAccount();
  });
}
