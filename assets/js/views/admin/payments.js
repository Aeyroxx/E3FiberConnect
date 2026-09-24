/* ==========================================================================
   E3 Fiber Connect · views/admin/payments.js
   Payments: the validation QUEUE (the report at the front is checked
   automatically), the five validation checks, Confirm / Decline, and the list
   of every payment (filter → search → sort with the algorithm you pick).
   Defense module: Payments (Payments Validation) — presented by Aaron Sebastian.
   ========================================================================== */

'use strict';

const paymentsViewState = { status: 'all', query: '', sort: 'submittedAt-desc', algorithm: 'insertion', paymentId: '' };

/** paymentActionButtons — Decline, and Confirm (only enabled when every check passed). */
function paymentActionButtons(payment, validation, compact) {
  const id = escapeHTML(payment.paymentId);
  const size = compact ? ' btn-sm' : '';
  return '<button class="btn btn-gray' + size + '" type="button" data-action="decline-payment" data-payment="' + id + '">Decline</button>'
    + '<button class="btn btn-accent' + size + '" type="button" data-action="confirm-payment" data-payment="' + id + '"'
    + (validation.passed ? '' : ' disabled title="Every check must pass first"') + '>' + iconHTML('check') + 'Confirm payment</button>';
}

/**
 * paymentVerdictHTML — for a waiting payment, what the checks mean (confirm or
 * decline); for one already handled, only what was decided and by whom.
 */
function paymentVerdictHTML(payment, validation) {
  if (payment.status === 'Confirmed') {
    return '<p class="validate-verdict text-green">' + iconHTML('check-circle')
      + '<span>' + escapeHTML('Confirmed by ' + payment.reviewedBy + ' — this payment settled the bill.') + '</span></p>';
  }
  if (payment.status === 'Declined') {
    return '<p class="validate-verdict text-red">' + iconHTML('warning')
      + '<span>' + escapeHTML('Declined by ' + payment.reviewedBy + ' — the customer sees the reason on Pay Bills.') + '</span></p>';
  }
  return '<p class="validate-verdict ' + (validation.passed ? 'text-green' : 'text-red') + '">'
    + iconHTML(validation.passed ? 'check-circle' : 'warning')
    + '<span>' + (validation.passed ? 'All 5 checks passed — safe to confirm.' : escapeHTML(pluralize(validation.failed, 'check') + ' failed — decline it with a reason.')) + '</span></p>';
}

/** paymentCardHTML — who paid what, the five checks, and the verdict. */
function paymentCardHTML(payment, validation, withActions) {
  const bill = validation.bill;
  const billText = bill ? formatMonthYear(bill.billingYear, bill.billingMonth) + ' bill of ' + formatPeso(bill.amount) : 'bill ' + payment.billId;
  let html = '<div class="validate-card">'
    + '<div class="validate-head">' + avatar(payment.fullName, 'md')
    + '<div class="min-w-0 flex-grow-1"><p class="validate-name"><a href="#/admin/subscribers/' + escapeHTML(payment.accountNo) + '">' + escapeHTML(payment.fullName) + '</a></p>'
    + '<p class="caption-text"><span class="mono">' + escapeHTML(payment.paymentId) + '</span> · ' + escapeHTML(billText) + ' · sent ' + escapeHTML(formatTimeAgoInline(payment.submittedAt)) + '</p></div>'
    + '<div class="validate-amount"><span class="validate-amount-value">' + formatPeso(payment.amount) + '</span>'
    + '<span class="caption-text">' + escapeHTML(payment.method) + ' · <span class="mono">' + escapeHTML(payment.referenceCode) + '</span></span></div></div>'
    + checkListHTML(validation.checks)
    + '<div class="validate-foot">' + paymentVerdictHTML(payment, validation);
  if (withActions && payment.status === 'For verification') {
    html += '<div class="cell-actions">' + paymentActionButtons(payment, validation, true) + '</div>';
  }
  return html + '</div></div>';
}

function paymentRowHTML(row) {
  const payment = row.record;
  const id = escapeHTML(payment.paymentId);
  const reviewed = payment.reviewedBy ? '<span class="cell-secondary text-nowrap">by ' + escapeHTML(payment.reviewedBy) + '</span>' : '';
  return '<tr>'
    + '<td class="cell-main"><div class="cell-person">' + avatar(payment.fullName, 'sm') + '<div class="min-w-0">'
    + '<a class="cell-primary" href="#/admin/subscribers/' + escapeHTML(payment.accountNo) + '">' + escapeHTML(payment.fullName) + '</a>'
    + '<span class="cell-secondary mono text-nowrap">' + escapeHTML(payment.accountNo) + '</span></div></div></td>'
    + '<td data-label="Payment"><span class="cell-primary mono fw-normal">' + id + '</span>'
    + '<span class="cell-secondary text-nowrap">' + escapeHTML(payment.method) + ' · <span class="mono">' + escapeHTML(payment.referenceCode) + '</span></span></td>'
    + '<td data-label="Bill" class="col-optional text-nowrap">' + escapeHTML(row.billLabel) + '</td>'
    + '<td data-label="Amount" class="num">' + formatPeso(payment.amount) + '</td>'
    + '<td data-label="Sent" class="col-optional text-nowrap"><span>' + escapeHTML(formatShortDate(payment.submittedAt)) + '</span><span class="cell-secondary">' + escapeHTML(formatTime(payment.submittedAt)) + '</span></td>'
    + '<td data-label="Status">' + statusBadge(payment.status) + reviewed + '</td>'
    + '<td class="actions-cell"><div class="cell-actions">' + (payment.status === 'For verification'
      ? '<button class="btn btn-tinted btn-xs" type="button" data-action="validate-payment" data-payment="' + id + '" aria-label="Validate payment ' + id + '">Validate</button>'
      : '<button class="btn btn-gray btn-xs" type="button" data-action="validate-payment" data-payment="' + id + '" aria-label="Show the checks for ' + id + '">Checks</button>')
    + '</div></td></tr>';
}

/** renderPaymentsQueue — the queue strip and the front report with its checks (queuePeek). */
function renderPaymentsQueue() {
  const queue = paymentsQueue();
  const waiting = queueToArray(queue);
  const labels = [];
  for (let i = 0; i < waiting.length; i++) {
    arrayAppend(labels, waiting[i].paymentId);
  }
  setHTML('paymentsQueueStrip', labels.length > 0 ? queueStripHTML(labels) : '<span class="caption-text">The queue is empty — every report has been validated.</span>');
  const front = queuePeek(queue);
  if (!front) {
    setHTML('paymentsFront', emptyState('check-circle', 'All caught up', 'No customer payments are waiting for validation.'));
    return;
  }
  setHTML('paymentsFront', '<p class="next-up-label mb-2">Now validating · 1 of ' + queueSize(queue) + '</p>' + paymentCardHTML(front, validatePayment(front), true));
}

function renderPaymentsView() {
  renderAdminChrome();
  const state = paymentsViewState;
  const counts = countPaymentsByStatus();
  renderSegmentCounts(byId('paymentsFilter'), counts);
  markSegment(byId('paymentsFilter'), state.status);
  setText('paymentsSubtitle', pluralize(counts['For verification'], 'payment') + ' waiting for validation · '
    + pluralize(paymentReferenceIndex.size, 'reference number') + ' indexed in a hash table');
  byId('paymentsSort').value = state.sort;
  byId('paymentsAlgorithm').value = state.algorithm;
  byId('paymentsSearch').value = state.query;
  renderPaymentsQueue();

  const sortChoice = splitSortValue(state.sort);
  const result = listPayments({ status: state.status, query: state.query, sortField: sortChoice.field, sortOrder: sortChoice.order, algorithm: state.algorithm });
  let html = '';
  for (let i = 0; i < result.rows.length; i++) {
    html += paymentRowHTML(result.rows[i]);
  }
  setHTML('paymentsBody', html);
  const empty = byId('paymentsEmpty');
  empty.hidden = result.rows.length > 0;
  empty.innerHTML = result.rows.length > 0 ? '' : emptyState('search', 'No payments found', state.query ? 'Try another name, account or reference number.' : 'Nothing has this status right now.');
  setHTML('paymentsCaption', algorithmCaption(result.rows.length, result.total, 'payment', result.stats, state.algorithm));
}

/** openPaymentSheet — the checks for one payment (any status), with the actions if it is waiting. */
function openPaymentSheet(paymentId) {
  const payment = findPayment(paymentId);
  if (!payment) {
    return;
  }
  paymentsViewState.paymentId = paymentId;
  const validation = validatePayment(payment);
  setText('paymentSheetTitle', (payment.status === 'For verification' ? 'Validate ' : 'Checks for ') + payment.paymentId);
  setHTML('paymentSheetBody', paymentCardHTML(payment, validation, false)
    + (payment.status === 'For verification' ? '' : '<p class="caption-text mt-3">' + escapeHTML(payment.status + ' by ' + payment.reviewedBy + ' · ' + formatDateTime(payment.reviewedAt) + (payment.note ? ' — “' + payment.note + '”' : '')) + '</p>'));
  setHTML('paymentSheetActions', '<button class="btn btn-gray" type="button" data-close-sheet>Close</button>'
    + (payment.status === 'For verification' ? paymentActionButtons(payment, validation, false) : ''));
  openSheet('sheetPayment', document.activeElement);
}

/** openDeclineSheet — the reason is pre-filled from the first failed check. */
function openDeclineSheet(paymentId) {
  const payment = findPayment(paymentId);
  if (!payment) {
    return;
  }
  paymentsViewState.paymentId = paymentId;
  setText('declineText', payment.fullName + ' reported ' + formatPeso(payment.amount) + ' via ' + payment.method + ' (ref ' + payment.referenceCode + '). They will see your reason on the Pay Bills page.');
  setFieldValue('declineNote', declineReasonFor(payment, validatePayment(payment)));
  setFieldError('declineNote', '');
  openSheet('sheetDecline', document.activeElement);
}

function runPaymentAction(action, element, event) {
  if (event && event.detail > 1) {
    return; // the 2nd click of a double-click would land on the NEXT payment's button after the redraw
  }
  const paymentId = element.getAttribute('data-payment');
  if (action === 'validate-payment') {
    openPaymentSheet(paymentId);
  } else if (action === 'confirm-payment') {
    const result = confirmPayment(paymentId, currentStaff());
    closeSheet('sheetPayment');
    if (!result.ok) {
      reportFailure(result);
    } else {
      announce('Confirmed ' + formatPeso(result.payment.amount) + ' from ' + result.payment.fullName + ' — bill paid');
    }
    renderPaymentsView();
  } else if (action === 'decline-payment') {
    openDeclineSheet(paymentId);
  }
}

function initPaymentsView() {
  onSegmentChange(byId('paymentsFilter'), function (value) {
    paymentsViewState.status = value;
    renderPaymentsView();
  });
  byId('paymentsSearch').addEventListener('input', function (event) {
    paymentsViewState.query = event.target.value;
    renderPaymentsView();
  });
  byId('paymentsSort').addEventListener('change', function (event) {
    paymentsViewState.sort = event.target.value;
    renderPaymentsView();
  });
  byId('paymentsAlgorithm').addEventListener('change', function (event) {
    paymentsViewState.algorithm = event.target.value;
    renderPaymentsView();
  });
  onAction(byId('paymentsFront'), runPaymentAction);
  onAction(byId('paymentsBody'), runPaymentAction);
  onAction(byId('paymentSheetActions'), runPaymentAction);

  byId('declineForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const result = declinePayment(paymentsViewState.paymentId, fieldValue('declineNote'), currentStaff());
    if (!result.ok) {
      setFieldError('declineNote', result.error);
      focusElement(byId('declineNote'));
      return;
    }
    closeAllSheets();
    announce('Declined payment from ' + result.payment.fullName);
    refreshCurrentRoute();
  });
}
