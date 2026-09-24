/* ==========================================================================
   E3 Fiber Connect · views/admin/dashboard.js
   Overview: key numbers, the review QUEUE (peek at the front), the
   installation schedule (sorted by date), the support QUEUE, this month's
   billing and the latest activity with Undo.
   ========================================================================== */

'use strict';

function greetingFor(hour) {
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

function kpiHTML(href, label, value, note, iconName, tone) {
  return '<a class="kpi" href="' + href + '">'
    + '<span class="icon-bubble tone-' + tone + '">' + iconHTML(iconName) + '</span>'
    + '<span class="kpi-label">' + escapeHTML(label) + '</span>'
    + '<span class="kpi-value">' + escapeHTML(value) + '</span>'
    + '<span class="kpi-note">' + escapeHTML(note) + '</span></a>';
}

/**
 * queueStripHTML — draw a queue from front to rear as boxes, so the FIFO order
 * is visible. `labels` is an array of short strings (front first).
 */
function queueStripHTML(labels) {
  if (labels.length === 0) {
    return '';
  }
  let html = '<span class="queue-end">Front</span>';
  for (let i = 0; i < labels.length; i++) {
    html += '<span class="queue-cell' + (i === 0 ? ' is-front' : '') + '">' + escapeHTML(labels[i]) + '</span>';
  }
  return html + '<span class="queue-end">Rear</span>';
}

function renderDashQueue() {
  const queue = buildReviewQueue();
  const front = queuePeek(queue);
  if (!front) {
    setHTML('dashQueue', emptyState('check-circle', 'All caught up', 'No applications are waiting for review.'));
    return;
  }
  const waited = waitingDays(front);
  const labels = [];
  const items = queueToArray(queue);
  for (let i = 0; i < items.length; i++) {
    arrayAppend(labels, firstNameOf(items[i].fullName));
  }
  const coverage = isBarangayServiceable(front.barangay) ? '' : ' · ' + tonePill('Coming-soon area', 'orange');
  setHTML('dashQueue',
    '<div class="next-up">' + avatar(front.fullName, 'lg')
    + '<div class="flex-grow-1 min-w-0"><p class="next-up-label">Next up</p>'
    + '<p class="next-up-name">' + escapeHTML(front.fullName) + '</p>'
    + '<p class="caption-text">' + escapeHTML(planName(front.planId)) + ' plan · Brgy. ' + escapeHTML(front.barangay) + ' · waiting ' + (waited === 0 ? 'since today' : pluralize(waited, 'day')) + coverage + '</p></div>'
    + '<a class="btn btn-accent btn-sm" href="#/admin/applications/' + escapeHTML(front.referenceNo) + '">Review now</a></div>'
    + '<div class="queue-strip mt-3" aria-label="Review queue from front to rear">' + queueStripHTML(labels) + '</div>'
    + '<p class="caption-text mt-1">' + pluralize(queueSize(queue), 'application') + ' waiting. The front is read with peek, without removing it.</p>');
}

function renderDashInstalls() {
  const items = queueToArray(buildInstallQueue());
  if (items.length === 0) {
    setHTML('dashInstalls', emptyState('calendar', 'Nothing scheduled', 'Approved applications appear here once a date is set.'));
    return;
  }
  const today = todayISO();
  let html = '<ul class="row-list">';
  for (let i = 0; i < items.length && i < 5; i++) {
    const app = items[i];
    const days = daysBetweenISO(today, app.installDate);
    const when = days < 0 ? tonePill(pluralize(-days, 'day') + ' late', 'red') : tonePill(formatDayDistance(days), days <= 1 ? 'orange' : 'gray');
    html += '<li class="row-item"><span class="icon-bubble tone-purple">' + iconHTML('calendar') + '</span>'
      + '<div class="row-main"><a class="row-title" href="#/admin/applications/' + escapeHTML(app.referenceNo) + '">' + escapeHTML(app.fullName) + '</a>'
      + '<p class="row-meta">' + escapeHTML(formatDate(app.installDate)) + ' · ' + escapeHTML(app.installSlot || '') + ' · Brgy. ' + escapeHTML(app.barangay) + '</p></div>' + when + '</li>';
  }
  setHTML('dashInstalls', html + '</ul>');
}

function renderDashSupport() {
  const queue = buildSupportQueue();
  const front = queuePeek(queue);
  if (!front) {
    setHTML('dashSupport', emptyState('chat', 'No open tickets', 'New messages from the Support page appear here.'));
    return;
  }
  setHTML('dashSupport',
    '<div class="next-up" style="--accent-tint: var(--purple-tint)"><span class="icon-bubble icon-bubble-lg tone-purple">' + iconHTML('ticket') + '</span>'
    + '<div class="flex-grow-1 min-w-0"><p class="next-up-label text-gray">Next ticket · ' + escapeHTML(front.ticketNo) + '</p>'
    + '<p class="next-up-name">' + escapeHTML(front.category) + '</p>'
    + '<p class="caption-text">' + escapeHTML(front.fullName) + ' · ' + escapeHTML(formatTimeAgo(front.createdAt)) + '</p></div>'
    + '<button class="btn btn-accent btn-sm" type="button" data-action="dash-serve">Serve next</button></div>'
    + '<p class="caption-text mt-2">' + pluralize(queueSize(queue), 'open ticket') + ' in the queue.</p>');
}

function renderDashBilling() {
  const clock = readClock();
  const today = todayISO();
  const summary = summarizeBills(billsForMonth(clock.year, clock.month));
  const receivables = receivablesSummary(today);
  const toVerify = countPaymentsForVerification();
  const percent = percentOf(summary.collected, summary.expected);
  setText('dashBillingMonth', formatMonthYear(clock.year, clock.month));
  let html = '<div class="d-flex justify-content-between align-items-baseline mb-2"><span class="balance-value" style="font-size:1.75rem">' + formatPeso(summary.collected) + '</span>'
    + '<span class="caption-text">of ' + formatPeso(summary.expected) + ' · ' + percent + '%</span></div>'
    + '<div class="progress-track" role="progressbar" aria-label="Collected this month" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"><div class="progress-fill" style="width:' + percent + '%"></div></div>'
    + '<dl class="kv-list mt-2">'
    + kvRow('Outstanding this month', formatPeso(summary.outstanding))
    + kvRow('Overdue (all months)', receivables.overdueCount > 0 ? '<span class="text-red">' + pluralize(receivables.overdueCount, 'bill') + ' · ' + formatPeso(receivables.overdueAmount) + '</span>' : 'None')
    + kvRow('Payments to validate', toVerify > 0 ? '<a href="#/admin/payments">' + pluralize(toVerify, 'payment') + '</a>' : 'None')
    + '</dl>';
  setHTML('dashBilling', html);
}

function renderDashActivity() {
  const items = recentActivity(6);
  let html = '<ul class="row-list">';
  for (let i = 0; i < items.length; i++) {
    html += activityRowHTML(items[i]);
  }
  html += '</ul>';
  const top = peekUndo();
  if (top) {
    html += '<button class="btn btn-gray btn-sm mt-2" type="button" data-action="dash-undo">' + iconHTML('undo') + 'Undo: ' + escapeHTML(top.label) + '</button>';
  }
  setHTML('dashActivity', html);
}

function renderDashboardView() {
  renderAdminChrome();
  const staff = currentStaff();
  const clock = readClock();
  setText('dashTitle', greetingFor(clock.hour) + ', ' + firstNameOf(staff.fullName) + '.');
  setText('dashDate', formatLongDate(todayISO()) + ' · signed in as ' + staff.role);

  const apps = countApplicationsByStatus();
  const subs = countSubscribersByStatus();
  const ticketsCount = countTicketsByStatus();
  const month = summarizeBills(billsForMonth(clock.year, clock.month));
  setHTML('dashKpis',
    kpiHTML('#/admin/applications', 'Pending applications', formatNumber(apps.Pending), apps['For Installation'] + ' installations scheduled', 'doc', 'orange')
    + kpiHTML('#/admin/subscribers', 'Active subscribers', formatNumber(subs.Active), subs.Suspended + ' suspended · ' + subs.Terminated + ' terminated', 'users', 'green')
    + kpiHTML('#/admin/billing', 'Collected this month', formatPeso(month.collected), 'of ' + formatPeso(month.expected) + ' expected', 'card', 'blue')
    + kpiHTML('#/admin/support', 'Open tickets', formatNumber(ticketsCount.Open), ticketsCount['In progress'] + ' in progress', 'chat', 'purple'));

  renderDashQueue();
  renderDashInstalls();
  renderDashSupport();
  renderDashBilling();
  renderDashActivity();
}

function initDashboardView() {
  onAction(byId('dashSupport'), function (action) {
    if (action === 'dash-serve') {
      const result = serveNextTicket(currentStaff());
      if (!result.ok) {
        reportFailure(result);
        return;
      }
      announce('Now serving ' + result.ticket.ticketNo + ' — ' + result.ticket.fullName);
      renderDashboardView();
    }
  });
  onAction(byId('dashActivity'), function (action) {
    if (action === 'dash-undo') {
      performUndo();
    }
  });
}
