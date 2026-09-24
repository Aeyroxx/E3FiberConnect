/* ==========================================================================
   E3 Fiber Connect · views/admin/support.js
   Support tickets. Open tickets wait in a FIFO QUEUE; "Serve next" dequeues
   the oldest one and assigns it to you. Tickets open in a sheet.
   ========================================================================== */

'use strict';

const adminSupportState = { status: 'Open', query: '', ticketNo: '' };

function ticketRowHTML(row) {
  const ticket = row.record;
  const no = escapeHTML(ticket.ticketNo);
  return '<tr data-action="open-ticket" data-ticket="' + no + '" class="cursor-pointer">'
    + '<td class="cell-main"><button class="btn btn-plain btn-sm p-0 mono fw-semibold" type="button" data-action="open-ticket" data-ticket="' + no + '">' + no + '</button></td>'
    + '<td data-label="Customer"><span class="cell-primary">' + escapeHTML(ticket.fullName) + '</span><span class="cell-secondary">' + escapeHTML(ticket.accountNo || ticket.contactNumber) + '</span></td>'
    + '<td data-label="Topic">' + escapeHTML(ticket.category) + '</td>'
    + '<td data-label="Received">' + escapeHTML(formatTimeAgo(ticket.createdAt)) + '</td>'
    + '<td data-label="Assigned to">' + escapeHTML(ticket.assignedTo || '—') + '</td>'
    + '<td data-label="Status">' + statusBadge(ticket.status) + '</td></tr>';
}

function renderAdminSupportView() {
  renderAdminChrome();
  const state = adminSupportState;
  const staff = currentStaff();
  const counts = countTicketsByStatus();
  renderSegmentCounts(byId('supFilter'), counts);
  markSegment(byId('supFilter'), state.status);
  setText('supSubtitle', counts.Open + ' open · ' + counts['In progress'] + ' in progress · ' + counts.Resolved + ' resolved');
  byId('supSearch').value = state.query;

  const queue = buildSupportQueue();
  const items = queueToArray(queue);
  const labels = [];
  for (let i = 0; i < items.length; i++) {
    arrayAppend(labels, items[i].ticketNo + ' · ' + firstNameOf(items[i].fullName));
  }
  setHTML('supQueueStrip', labels.length > 0 ? queueStripHTML(labels) : '<span class="caption-text">The queue is empty — every ticket has been picked up.</span>');
  byId('supServeNext').disabled = queueIsEmpty(queue);

  const mine = ticketsInProgressFor(staff.fullName);
  let serving = '';
  for (let i = 0; i < mine.length; i++) {
    serving += '<div class="callout tone-purple mt-2"><span class="icon-bubble tone-purple">' + iconHTML('ticket') + '</span><div class="flex-grow-1 min-w-0">'
      + '<p class="callout-title">You’re working on ' + escapeHTML(mine[i].ticketNo) + '</p>'
      + '<p class="callout-text">' + escapeHTML(mine[i].category) + ' · ' + escapeHTML(mine[i].fullName) + '</p></div>'
      + '<button class="btn btn-gray btn-sm" type="button" data-action="open-ticket" data-ticket="' + escapeHTML(mine[i].ticketNo) + '">Open</button></div>';
  }
  setHTML('supServing', serving);

  const result = listTickets({ status: state.status, query: state.query, sortField: 'createdAt', sortOrder: state.status === 'Open' ? 'asc' : 'desc', algorithm: 'insertion' });
  let html = '';
  for (let i = 0; i < result.rows.length; i++) {
    html += ticketRowHTML(result.rows[i]);
  }
  setHTML('supBody', html);
  const empty = byId('supEmpty');
  empty.hidden = result.rows.length > 0;
  empty.innerHTML = result.rows.length > 0 ? '' : emptyState('chat', 'No tickets here', state.query ? 'Try a different search.' : 'Nothing with this status.');
  setHTML('supCaption', algorithmCaption(result.rows.length, result.total, 'ticket', result.stats, 'insertion'));
}

function renderTicketSheet() {
  const ticket = findTicket(adminSupportState.ticketNo);
  if (!ticket) {
    closeSheet('sheetTicket');
    return;
  }
  setText('ticketSheetTitle', ticket.ticketNo + ' · ' + ticket.category);
  let details = kvRow('Customer', escapeHTML(ticket.fullName))
    + kvRow('Mobile', '<a href="tel:' + escapeHTML(digitsOnly(ticket.contactNumber)) + '">' + escapeHTML(ticket.contactNumber) + '</a>');
  if (ticket.email) {
    details += kvRow('E-mail', '<a href="mailto:' + escapeHTML(ticket.email) + '">' + escapeHTML(ticket.email) + '</a>');
  }
  if (ticket.accountNo) {
    details += kvRow('Account', '<a class="mono" href="#/admin/subscribers/' + escapeHTML(ticket.accountNo) + '">' + escapeHTML(ticket.accountNo) + '</a>');
  }
  details += kvRow('Received', escapeHTML(formatDateTime(ticket.createdAt)));
  if (ticket.assignedTo) {
    details += kvRow('Handled by', escapeHTML(ticket.assignedTo) + (ticket.startedAt ? ' · started ' + escapeHTML(formatTimeAgoInline(ticket.startedAt)) : ''));
  }
  let body = '<div class="d-flex flex-wrap gap-2 mb-3">' + statusBadge(ticket.status, 'lg') + tonePill(ticket.category, 'gray') + '</div>'
    + '<p class="form-label">Message</p><p class="message-quote">' + escapeHTML(ticket.message) + '</p>'
    + '<dl class="kv-list mt-3">' + details + '</dl>';
  if (ticket.status === 'Resolved') {
    body += '<div class="callout tone-green mt-3"><span class="icon-bubble tone-green">' + iconHTML('check') + '</span><div><p class="callout-title">Resolved ' + escapeHTML(formatTimeAgoInline(ticket.resolvedAt)) + '</p><p class="callout-text">' + escapeHTML(ticket.resolution) + '</p></div></div>';
  }
  setHTML('ticketSheetBody', body);
  toggleElement(byId('ticketResolveField'), ticket.status !== 'Resolved');
  setFieldError('ticketResolution', '');

  let actions = '<button class="btn btn-gray" type="button" data-close-sheet>Close</button>';
  if (ticket.status === 'Open') {
    actions += '<button class="btn btn-tinted" type="button" data-action="start-ticket">Start working</button>';
  }
  if (ticket.status !== 'Resolved') {
    actions += '<button class="btn btn-accent" type="button" data-action="resolve-ticket">Resolve</button>';
  } else {
    actions += '<button class="btn btn-tinted" type="button" data-action="reopen-ticket">Reopen</button>';
  }
  setHTML('ticketSheetActions', actions);
}

function openTicketSheet(ticketNo) {
  adminSupportState.ticketNo = ticketNo;
  setFieldValue('ticketResolution', '');
  renderTicketSheet();
  openSheet('sheetTicket', document.activeElement);
}

function afterTicketChange() {
  if (routerState.route && routerState.route.viewId === 'admin-support') {
    renderAdminSupportView();
  } else {
    refreshCurrentRoute();
  }
}

function initAdminSupportView() {
  onSegmentChange(byId('supFilter'), function (value) {
    adminSupportState.status = value;
    renderAdminSupportView();
  });
  byId('supSearch').addEventListener('input', function (event) {
    adminSupportState.query = event.target.value;
    renderAdminSupportView();
  });
  onAction(byId('supBody'), function (action, element) {
    if (action === 'open-ticket') {
      openTicketSheet(element.getAttribute('data-ticket'));
    }
  });
  onAction(byId('supServing'), function (action, element) {
    if (action === 'open-ticket') {
      openTicketSheet(element.getAttribute('data-ticket'));
    }
  });
  onClick('supServeNext', function () {
    const result = serveNextTicket(currentStaff());
    if (!result.ok) {
      reportFailure(result);
      return;
    }
    announce('Now serving ' + result.ticket.ticketNo + ' — ' + result.ticket.fullName);
    renderAdminSupportView();
    openTicketSheet(result.ticket.ticketNo);
  });
  onAction(byId('ticketSheetActions'), function (action) {
    const ticketNo = adminSupportState.ticketNo;
    const staff = currentStaff();
    if (action === 'start-ticket') {
      const result = startTicket(ticketNo, staff);
      if (!result.ok) {
        reportFailure(result);
        return;
      }
      announce('Started ' + ticketNo);
      renderTicketSheet();
      afterTicketChange();
    } else if (action === 'resolve-ticket') {
      const result = resolveTicket(ticketNo, fieldValue('ticketResolution'), staff);
      if (!result.ok) {
        setFieldError('ticketResolution', result.error);
        focusElement(byId('ticketResolution'));
        return;
      }
      closeSheet('sheetTicket');
      announce('Resolved ' + ticketNo);
      afterTicketChange();
    } else if (action === 'reopen-ticket') {
      const result = reopenTicket(ticketNo, staff);
      if (!result.ok) {
        reportFailure(result);
        return;
      }
      announce('Reopened ' + ticketNo);
      renderTicketSheet();
      afterTicketChange();
    }
  });
}
