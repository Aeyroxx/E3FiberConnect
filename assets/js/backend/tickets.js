/* ==========================================================================
   E3 Fiber Connect · backend/tickets.js
   Support tickets from the public Support page.

     Open ──serve / start──▶ In progress ──resolve──▶ Resolved ──reopen──▶ Open

   Open tickets are served first come, first served — a QUEUE (FIFO).
   ========================================================================== */

'use strict';

const TICKET_STATUSES = ['Open', 'In progress', 'Resolved'];

/** findTicket — binary search on ticketNo (issued in increasing order). O(log n) */
function findTicket(ticketNo) {
  const index = binarySearch(tickets, 'ticketNo', ticketNo);
  return index === -1 ? null : tickets[index];
}

/**
 * validateTicket — field-by-field checks for the public ticket form.
 * Time O(log n) for the optional account check · Space O(1)
 */
function validateTicket(data) {
  const errors = {};
  if (collapseSpaces(data.fullName).length < 3) {
    errors.fullName = 'Enter your name.';
  }
  if (!isValidMobile(data.contactNumber)) {
    errors.contactNumber = 'Enter an 11-digit mobile number like 0917 555 0199.';
  }
  if (!isBlank(data.email) && !isValidEmail(data.email)) {
    errors.email = 'Enter a valid e-mail, or leave it empty.';
  }
  if (!isBlank(data.accountNo)) {
    const accountNo = normalizeReference(data.accountNo);
    if (!isValidReference(accountNo) || !findSubscriber(accountNo)) {
      errors.accountNo = 'Check the account number, or leave it empty.';
    }
  }
  if (linearSearchValue(TICKET_CATEGORIES, data.category) === -1) {
    errors.category = 'Choose a topic.';
  }
  const message = trimText(data.message);
  if (message.length < 10) {
    errors.message = 'Tell us a little more (at least 10 characters).';
  } else if (message.length > 1000) {
    errors.message = 'Keep it under 1,000 characters.';
  }
  return errors;
}

/**
 * createTicket — add a ticket with the next number. Time O(1) append · Space O(1)
 */
function createTicket(data) {
  const errors = validateTicket(data);
  if (hasAnyErrors(errors)) {
    return { ok: false, errors: errors };
  }
  counters.ticket = counters.ticket + 1;
  const ticket = {
    ticketNo: formatTicketNo(counters.ticket),
    fullName: collapseSpaces(data.fullName),
    contactNumber: normalizeMobile(data.contactNumber),
    email: trimText(data.email),
    accountNo: isBlank(data.accountNo) ? '' : normalizeReference(data.accountNo),
    category: data.category,
    message: trimText(data.message),
    createdAt: nowISO(),
    status: 'Open',
    assignedTo: '',
    startedAt: null,
    resolution: '',
    resolvedAt: null,
  };
  arrayAppend(tickets, ticket);
  logActivity('ticket', 'New ticket ' + ticket.ticketNo + ' — ' + ticket.category + ' (' + ticket.fullName + ')', 'Customer');
  markDataChanged();
  return { ok: true, ticket: ticket };
}

/**
 * lookupTicket — public status check: the ticket number AND the mobile
 * number used on it must match. Time O(log n)
 */
function lookupTicket(ticketInput, mobileInput) {
  const ticketNo = normalizeReference(ticketInput);
  const fail = { ok: false, error: 'We couldn’t find a ticket with those details.' };
  if (!isValidTicketNo(ticketNo) || !isValidMobile(mobileInput)) {
    return fail;
  }
  const ticket = findTicket(ticketNo);
  if (!ticket || digitsOnly(ticket.contactNumber) !== digitsOnly(normalizeMobile(mobileInput))) {
    return fail;
  }
  return { ok: true, ticket: ticket };
}

/** ticketRow — list fields. O(1) */
function ticketRow(ticket) {
  return {
    ticketNo: ticket.ticketNo,
    fullName: ticket.fullName,
    category: ticket.category,
    status: ticket.status,
    createdAt: ticket.createdAt,
    assignedTo: ticket.assignedTo,
    accountNo: ticket.accountNo,
    message: ticket.message,
    record: ticket,
  };
}

/**
 * listTickets — filter by status, search, sort (newest first by default).
 * Time O(n · L · m) + O(n²) · Space O(n)
 */
function listTickets(options) {
  const status = options.status || 'all';
  const base = status === 'all' ? tickets : linearSearchAll(tickets, 'status', status);
  const found = textSearchRecords(base, ['ticketNo', 'fullName', 'category', 'message', 'accountNo', 'assignedTo'], options.query || '');
  const rows = [];
  for (let i = 0; i < found.length; i++) {
    arrayAppend(rows, ticketRow(found[i]));
  }
  const started = stopwatchStart();
  const sorted = sortRecords(rows, options.sortField || 'createdAt', options.sortOrder || 'desc', options.algorithm || 'insertion');
  const ms = stopwatchMs(started);
  const stats = { algorithm: dsaLastRun.algorithm, comparisons: dsaLastRun.comparisons, moves: dsaLastRun.moves, ms: ms, n: rows.length };
  logOperation(stats.algorithm, 'Support tickets', rows.length, stats.comparisons, stats.moves, ms);
  return { rows: sorted, total: tickets.length, stats: stats };
}

/** countTicketsByStatus — one pass. O(n) */
function countTicketsByStatus() {
  const counts = { all: tickets.length, Open: 0, 'In progress': 0, Resolved: 0 };
  for (let i = 0; i < tickets.length; i++) {
    counts[tickets[i].status] = counts[tickets[i].status] + 1;
  }
  return counts;
}

/**
 * buildSupportQueue — open tickets as a QUEUE, oldest first (the table is in
 * creation order, so one pass keeps FIFO order). Time O(n) · Space O(k)
 */
function buildSupportQueue() {
  const queue = createQueue(8);
  for (let i = 0; i < tickets.length; i++) {
    if (tickets[i].status === 'Open') {
      enqueue(queue, tickets[i]);
    }
  }
  return queue;
}

/** startTicket — Open → In progress, assigned to the staff member. O(log n) */
function startTicket(ticketNo, actor) {
  const ticket = findTicket(ticketNo);
  if (!ticket) {
    return { ok: false, error: 'Ticket not found.' };
  }
  if (ticket.status !== 'Open') {
    return { ok: false, error: 'Only open tickets can be started.' };
  }
  const before = snapshotFields(ticket, ['status', 'assignedTo', 'startedAt']);
  ticket.status = 'In progress';
  ticket.assignedTo = nameOfActor(actor);
  ticket.startedAt = nowISO();
  pushUndo('Start ' + ticketNo, [updateOperation('tickets', ticketNo, before)], nameOfActor(actor));
  logActivity('ticket', 'Started working on ' + ticketNo + ' (' + ticket.fullName + ')', nameOfActor(actor));
  markDataChanged();
  return { ok: true, ticket: ticket };
}

/**
 * serveNextTicket — dequeue the oldest open ticket and start it.
 * Time O(n) to build the queue + O(1) dequeue
 */
function serveNextTicket(actor) {
  const next = dequeue(buildSupportQueue());
  if (!next) {
    return { ok: false, error: 'No open tickets — the queue is empty.' };
  }
  return startTicket(next.ticketNo, actor);
}

/** resolveTicket — Open / In progress → Resolved with a short resolution note. O(log n) */
function resolveTicket(ticketNo, resolution, actor) {
  const ticket = findTicket(ticketNo);
  if (!ticket) {
    return { ok: false, error: 'Ticket not found.' };
  }
  if (ticket.status === 'Resolved') {
    return { ok: false, error: 'This ticket is already resolved.' };
  }
  const note = collapseSpaces(resolution);
  if (note.length < 5) {
    return { ok: false, error: 'Describe what was done (at least 5 characters).' };
  }
  const before = snapshotFields(ticket, ['status', 'assignedTo', 'startedAt', 'resolution', 'resolvedAt']);
  ticket.status = 'Resolved';
  if (!ticket.assignedTo) {
    ticket.assignedTo = nameOfActor(actor);
    ticket.startedAt = nowISO();
  }
  ticket.resolution = note;
  ticket.resolvedAt = nowISO();
  pushUndo('Resolve ' + ticketNo, [updateOperation('tickets', ticketNo, before)], nameOfActor(actor));
  logActivity('ticket', 'Resolved ' + ticketNo + ' (' + ticket.fullName + ')', nameOfActor(actor));
  markDataChanged();
  return { ok: true, ticket: ticket };
}

/** reopenTicket — Resolved → Open (back of the queue by its original time). O(log n) */
function reopenTicket(ticketNo, actor) {
  const ticket = findTicket(ticketNo);
  if (!ticket) {
    return { ok: false, error: 'Ticket not found.' };
  }
  if (ticket.status !== 'Resolved') {
    return { ok: false, error: 'Only resolved tickets can be reopened.' };
  }
  const before = snapshotFields(ticket, ['status', 'resolvedAt']);
  ticket.status = 'Open';
  ticket.resolvedAt = null;
  pushUndo('Reopen ' + ticketNo, [updateOperation('tickets', ticketNo, before)], nameOfActor(actor));
  logActivity('ticket', 'Reopened ' + ticketNo, nameOfActor(actor));
  markDataChanged();
  return { ok: true, ticket: ticket };
}

/** ticketsForAccount — a subscriber's tickets, newest first. O(n) */
function ticketsForAccount(accountNo) {
  const list = [];
  for (let i = tickets.length - 1; i >= 0; i--) {
    if (tickets[i].accountNo === accountNo) {
      arrayAppend(list, tickets[i]);
    }
  }
  return list;
}

/** ticketsInProgressFor — tickets a staff member is working on. O(n) */
function ticketsInProgressFor(staffName) {
  const list = [];
  for (let i = 0; i < tickets.length; i++) {
    if (tickets[i].status === 'In progress' && tickets[i].assignedTo === staffName) {
      arrayAppend(list, tickets[i]);
    }
  }
  return list;
}
