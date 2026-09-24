/* ==========================================================================
   E3 Fiber Connect · views/admin/subscribers.js
   Subscriber list: status filter, text search and a user-chosen sort.
   ========================================================================== */

'use strict';

const subscribersViewState = { status: 'all', query: '', sort: 'since-desc', algorithm: 'insertion' };

function subscriberRowHTML(row) {
  const subscriber = row.record;
  const href = '#/admin/subscribers/' + escapeHTML(subscriber.accountNo);
  const overdue = row.balance > 0 && queuePeek(unpaidBillsQueue(subscriber.accountNo)).dueDate < todayISO();
  return '<tr data-href="' + href + '">'
    + '<td class="cell-main"><div class="cell-person">' + avatar(subscriber.fullName, 'sm') + '<div class="min-w-0">'
    + '<a class="cell-primary" href="' + href + '">' + escapeHTML(subscriber.fullName) + '</a>'
    + '<span class="cell-secondary text-truncate cell-truncate" title="' + escapeHTML(subscriber.email) + '">' + escapeHTML(subscriber.email) + '</span></div></div></td>'
    + '<td data-label="Account" class="text-nowrap"><span class="mono">' + escapeHTML(subscriber.accountNo) + '</span></td>'
    + '<td data-label="Plan" class="text-nowrap"><span class="cell-primary">' + escapeHTML(row.planName) + '</span><span class="cell-secondary">' + formatPeso(row.price) + '/mo</span></td>'
    + '<td data-label="Barangay" class="col-optional">' + escapeHTML(subscriber.barangay) + '</td>'
    + '<td data-label="Since" class="text-nowrap col-optional">' + escapeHTML(formatDate(subscriber.since)) + '</td>'
    + '<td data-label="Balance" class="num' + (overdue ? ' text-red' : '') + '">' + formatPeso(row.balance) + '</td>'
    + '<td data-label="Status">' + statusBadge(subscriber.status) + '</td></tr>';
}

function renderSubscribersView() {
  renderAdminChrome();
  const state = subscribersViewState;
  const counts = countSubscribersByStatus();
  renderSegmentCounts(byId('subsFilter'), counts);
  markSegment(byId('subsFilter'), state.status);
  setText('subsSubtitle', pluralize(counts.all, 'account') + ' · ' + counts.Active + ' active');
  byId('subsSort').value = state.sort;
  byId('subsAlgorithm').value = state.algorithm;
  byId('subsSearch').value = state.query;

  const sortChoice = splitSortValue(state.sort);
  const result = listSubscribers({ status: state.status, query: state.query, sortField: sortChoice.field, sortOrder: sortChoice.order, algorithm: state.algorithm });
  let html = '';
  for (let i = 0; i < result.rows.length; i++) {
    html += subscriberRowHTML(result.rows[i]);
  }
  setHTML('subsBody', html);
  const empty = byId('subsEmpty');
  empty.hidden = result.rows.length > 0;
  empty.innerHTML = result.rows.length > 0 ? '' : emptyState('users', 'No subscribers found', state.query ? 'Try another name, account number or barangay.' : 'No accounts have this status.');
  setHTML('subsCaption', algorithmCaption(result.rows.length, result.total, 'subscriber', result.stats, state.algorithm));
}

function initSubscribersView() {
  onSegmentChange(byId('subsFilter'), function (value) {
    subscribersViewState.status = value;
    renderSubscribersView();
  });
  byId('subsSearch').addEventListener('input', function (event) {
    subscribersViewState.query = event.target.value;
    renderSubscribersView();
  });
  byId('subsSort').addEventListener('change', function (event) {
    subscribersViewState.sort = event.target.value;
    renderSubscribersView();
  });
  byId('subsAlgorithm').addEventListener('change', function (event) {
    subscribersViewState.algorithm = event.target.value;
    renderSubscribersView();
  });
}
