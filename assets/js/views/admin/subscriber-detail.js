/* ==========================================================================
   E3 Fiber Connect · views/admin/subscriber-detail.js
   One subscriber: account, billing history, balance (settles the OLDEST
   unpaid bill first — a queue), plan changes, suspend / reactivate /
   terminate, payment reports and support tickets.
   Defense module: Accounts management (Subscribers) — presented by Dela Cruz Riceerich.
   ========================================================================== */

'use strict';

const subscriberDetailState = { accountNo: '' };

function subscriberDetailActions(subscriber) {
  if (subscriber.status === 'Terminated') {
    return '';
  }
  let html = '<button class="btn btn-gray" type="button" data-action="change-plan">' + iconHTML('gauge') + 'Change plan</button>';
  if (subscriber.status === 'Active') {
    html += '<button class="btn btn-gray" type="button" data-action="suspend">' + iconHTML('pause') + 'Suspend</button>';
  } else {
    html += '<button class="btn btn-accent" type="button" data-action="reactivate">' + iconHTML('play') + 'Reactivate</button>';
  }
  html += '<button class="btn btn-danger-tinted" type="button" data-action="terminate">Terminate</button>';
  return html;
}

function renderSubscriberBalance(subscriber) {
  const today = todayISO();
  const balance = subscriberBalance(subscriber.accountNo);
  const queue = unpaidBillsQueue(subscriber.accountNo);
  const oldest = queuePeek(queue);
  const next = nextBillInfo(subscriber);
  let html = '<p class="balance-value' + (oldest && oldest.dueDate < today ? ' text-red' : '') + '">' + formatPeso(balance) + '</p>'
    + '<p class="caption-text mt-1">' + (balance === 0 ? 'All paid up · ' + escapeHTML(next.label) : pluralize(queueSize(queue), 'unpaid bill') + ' · oldest due ' + escapeHTML(formatDate(oldest.dueDate))) + '</p>'
    + '<dl class="kv-list mt-3">' + kvRow('Paid so far', formatPeso(subscriberPaidTotal(subscriber.accountNo))) + '</dl>';
  if (oldest) {
    html += '<div class="callout tone-blue mt-3"><span class="icon-bubble tone-blue">' + iconHTML('queue') + '</span><div class="min-w-0">'
      + '<p class="callout-title">Next to settle: ' + escapeHTML(formatMonthYear(oldest.billingYear, oldest.billingMonth)) + ' · ' + formatPeso(oldest.amount) + '</p>'
      + '<p class="callout-text">Payments clear the oldest bill first (first in, first out).</p></div></div>'
      + '<button class="btn btn-accent w-100 mt-3" type="button" data-action="settle-oldest">Mark oldest bill paid</button>';
  }
  setHTML('subBalance', html);
}

function renderSubscriberDetailView(params) {
  renderAdminChrome();
  const subscriber = findSubscriber(params.account);
  toggleElement(byId('subDetail'), subscriber !== null);
  toggleElement(byId('subNotFound'), subscriber === null);
  if (!subscriber) {
    setHTML('subNotFound', '<div class="panel">' + emptyState('users', 'Subscriber not found', 'The account may have been undone, or the link is wrong.') + '</div>');
    return;
  }
  subscriberDetailState.accountNo = subscriber.accountNo;
  const today = todayISO();
  document.title = subscriber.fullName + ' — Subscribers — E3 Fiber Connect';
  setText('adminToolbarTitle', subscriber.fullName);
  setText('subTitle', subscriber.fullName);
  setHTML('subMeta', '<span class="mono">' + escapeHTML(subscriber.accountNo) + '</span>'
    + '<span>Since ' + escapeHTML(formatDate(subscriber.since)) + ' · Brgy. ' + escapeHTML(subscriber.barangay) + '</span>'
    + statusBadge(subscriber.status, 'lg'));
  setHTML('subActions', subscriberDetailActions(subscriber));

  setHTML('subAccount',
    kvRow('E-mail', '<a href="mailto:' + escapeHTML(subscriber.email) + '">' + escapeHTML(subscriber.email) + '</a>')
    + kvRow('Mobile', '<a href="tel:' + escapeHTML(digitsOnly(subscriber.contactNumber)) + '">' + escapeHTML(subscriber.contactNumber) + '</a>')
    + kvRow('Address', escapeHTML(subscriber.completeAddress + ', Brgy. ' + subscriber.barangay))
    + kvRow('Landmark', escapeHTML(subscriber.landmark || '—'))
    + (subscriber.applicationRef ? kvRow('Application', '<a class="mono" href="#/admin/applications/' + escapeHTML(subscriber.applicationRef) + '">' + escapeHTML(subscriber.applicationRef) + '</a>') : '')
    + (subscriber.modemSerial ? kvRow('Modem serial', '<span class="mono">' + escapeHTML(subscriber.modemSerial) + '</span>') : '')
    + (subscriber.status !== 'Active' && subscriber.statusChangedAt ? kvRow(subscriber.status + ' on', escapeHTML(formatDate(subscriber.statusChangedAt))) : ''));

  const history = billsForAccount(subscriber.accountNo);
  let rows = '';
  for (let i = 0; i < history.length; i++) {
    const bill = history[i];
    const due = billDueText(bill, today);
    rows += '<tr><td class="cell-main"><span class="cell-primary">' + escapeHTML(formatMonthYear(bill.billingYear, bill.billingMonth)) + '</span><span class="cell-secondary">' + escapeHTML(formatPeriod(bill.periodStart, bill.periodEnd)) + '</span></td>'
      + '<td data-label="Due">' + tonePill(due.text, due.tone) + '</td>'
      + '<td data-label="Amount" class="num">' + formatPeso(bill.amount) + '</td>'
      + '<td data-label="Status">' + statusBadge(isBillOverdue(bill, today) ? 'Overdue' : bill.status) + '</td></tr>';
  }
  setHTML('subBillsBody', rows);
  const billsEmpty = byId('subBillsEmpty');
  billsEmpty.hidden = history.length > 0;
  billsEmpty.innerHTML = history.length > 0 ? '' : emptyState('receipt', 'No bills yet', 'Create one from Billing.');

  renderSubscriberBalance(subscriber);

  const plan = findPlan(subscriber.planId);
  setHTML('subPlan', '<p class="plan-name">' + escapeHTML(planName(subscriber.planId)) + '</p>'
    + (plan ? '<p class="plan-speed mt-1"><strong style="font-size:2rem">' + plan.speed + '</strong><span>Mbps</span></p>' : '')
    + '<p class="plan-price mt-1">' + formatPeso(planPrice(subscriber.planId, subscriber.customPrice)) + '<small>/mo</small></p>');

  const reports = paymentsForAccount(subscriber.accountNo);
  let reportsHTML = '';
  for (let i = 0; i < reports.length; i++) {
    reportsHTML += '<li class="row-item"><div class="row-main"><p class="row-title">' + escapeHTML(reports[i].method) + ' · ' + formatPeso(reports[i].amount) + '</p>'
      + '<p class="row-meta"><span class="mono">' + escapeHTML(reports[i].referenceCode) + '</span> · ' + escapeHTML(formatTimeAgo(reports[i].submittedAt)) + '</p></div>' + statusBadge(reports[i].status) + '</li>';
  }
  setHTML('subPayments', reportsHTML || '<li class="row-item"><p class="row-meta">No payment reports.</p></li>');

  const accountTickets = ticketsForAccount(subscriber.accountNo);
  let ticketsHTML = '';
  for (let i = 0; i < accountTickets.length; i++) {
    const ticket = accountTickets[i];
    ticketsHTML += '<li class="row-item"><span class="icon-bubble tone-purple">' + iconHTML('chat') + '</span><div class="row-main">'
      + '<button class="btn btn-plain btn-sm p-0 fw-semibold" type="button" data-action="open-ticket" data-ticket="' + escapeHTML(ticket.ticketNo) + '">' + escapeHTML(ticket.ticketNo) + ' · ' + escapeHTML(ticket.category) + '</button>'
      + '<p class="row-meta">' + escapeHTML(formatTimeAgo(ticket.createdAt)) + '</p></div>' + statusBadge(ticket.status) + '</li>';
  }
  setHTML('subTickets', ticketsHTML || '<li class="row-item"><p class="row-meta">No support tickets.</p></li>');
}

function openChangePlanSheet() {
  const subscriber = findSubscriber(subscriberDetailState.accountNo);
  let html = '';
  for (let i = 0; i < PLANS.length; i++) {
    html += planChoiceCard(PLANS[i], 'changePlan', 'change-plan', subscriber.planId === PLANS[i].id);
  }
  html += customPlanChoiceCard('changePlan', 'change-plan', subscriber.planId === 'custom');
  setHTML('changePlanChoices', html);
  setFieldValue('changePlanCustomPrice', subscriber.customPrice || '');
  toggleElement(byId('changePlanCustomField'), subscriber.planId === 'custom');
  setFormAlert('changePlanAlert', '');
  setText('changePlanText', subscriber.fullName + ' is on ' + planLabel(subscriber.planId, subscriber.customPrice) + '. The next bill uses the new price; bills already issued stay the same.');
  openSheet('sheetChangePlan', document.activeElement);
}

function initSubscriberDetailView() {
  onAction(byId('subActions'), function (action) {
    const accountNo = subscriberDetailState.accountNo;
    const subscriber = findSubscriber(accountNo);
    const staff = currentStaff();
    if (action === 'change-plan') {
      openChangePlanSheet();
    } else if (action === 'suspend' || action === 'reactivate') {
      const result = setSubscriberStatus(accountNo, action === 'suspend' ? 'Suspended' : 'Active', staff);
      if (!result.ok) {
        reportFailure(result);
      } else {
        announce((action === 'suspend' ? 'Suspended ' : 'Reactivated ') + subscriber.fullName);
      }
      refreshCurrentRoute();
    } else if (action === 'terminate') {
      askToConfirm({
        title: 'Terminate this account?',
        text: subscriber.fullName + ' will stop being billed and the account can’t be reactivated afterwards. Unpaid bills stay on record.',
        confirmLabel: 'Terminate account',
        danger: true,
        onConfirm: function () {
          const result = setSubscriberStatus(accountNo, 'Terminated', currentStaff());
          if (!result.ok) {
            reportFailure(result);
          } else {
            announce('Terminated ' + subscriber.fullName);
          }
          refreshCurrentRoute();
        },
      });
    }
  });
  onAction(byId('subBalance'), function (action) {
    if (action === 'settle-oldest') {
      const accountNo = subscriberDetailState.accountNo;
      const result = settleOldestBill(accountNo, currentStaff());
      if (!result.ok) {
        reportFailure(result);
      } else {
        announce('Marked the ' + formatMonthYear(result.bill.billingYear, result.bill.billingMonth) + ' bill paid');
      }
      refreshCurrentRoute();
    }
  });
  onAction(byId('subTickets'), function (action, element) {
    if (action === 'open-ticket') {
      openTicketSheet(element.getAttribute('data-ticket'));
    }
  });
  byId('changePlanChoices').addEventListener('change', function () {
    const isCustom = checkedValue('changePlan', byId('changePlanChoices')) === 'custom';
    toggleElement(byId('changePlanCustomField'), isCustom);
    if (isCustom) {
      focusElement(byId('changePlanCustomPrice'));
    }
  });
  byId('changePlanForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const accountNo = subscriberDetailState.accountNo;
    const planId = checkedValue('changePlan', byId('changePlanChoices'));
    const result = changeSubscriberPlan(accountNo, planId, fieldValue('changePlanCustomPrice'), currentStaff());
    if (!result.ok) {
      setFormAlert('changePlanAlert', result.error, 'error');
      return;
    }
    closeSheet('sheetChangePlan');
    announce('Plan changed to ' + planName(planId));
    refreshCurrentRoute();
  });
}
