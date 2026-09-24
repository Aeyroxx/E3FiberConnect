/* ==========================================================================
   E3 Fiber Connect · views/public/support.js
   Support page: FAQ (Bootstrap accordion), "Send us a message" (creates a
   ticket that joins the staff's FIFO support queue) and "Check a ticket".
   ========================================================================== */

'use strict';

const TICKET_FORM_FIELDS = { fullName: 'ticketName', contactNumber: 'ticketMobile', email: 'ticketEmail', accountNo: 'ticketAccount', category: 'ticketCategory', message: 'ticketMessage' };

function readTicketForm() {
  return {
    fullName: fieldValue('ticketName'),
    contactNumber: fieldValue('ticketMobile'),
    email: fieldValue('ticketEmail'),
    accountNo: fieldValue('ticketAccount'),
    category: fieldValue('ticketCategory'),
    message: fieldValue('ticketMessage'),
  };
}

function updateTicketCounter() {
  setText('ticketMessage-count', formatNumber(fieldValue('ticketMessage').length) + ' / 1,000');
}

function renderSupportView() {
  updateTicketCounter();
}

function initSupportView() {
  fillSelect('ticketCategory', TICKET_CATEGORIES, 'Choose a topic');
  byId('ticketMessage').addEventListener('input', updateTicketCounter);
  const live = [['ticketName', 'fullName'], ['ticketMobile', 'contactNumber'], ['ticketEmail', 'email'], ['ticketAccount', 'accountNo'], ['ticketMessage', 'message']];
  for (let i = 0; i < live.length; i++) {
    const key = live[i][1];
    liveValidate(live[i][0], function () { return validateTicket(readTicketForm())[key] || ''; });
  }
  byId('ticketCategory').addEventListener('change', function () {
    setFieldError('ticketCategory', validateTicket(readTicketForm()).category || '');
  });

  byId('ticketForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const result = createTicket(readTicketForm());
    if (!result.ok) {
      focusInvalid(applyFieldErrors(TICKET_FORM_FIELDS, result.errors));
      return;
    }
    clearFieldErrors(TICKET_FORM_FIELDS);
    const ticket = result.ticket;
    const position = queueSize(buildSupportQueue());
    setText('ticketSentNo', ticket.ticketNo);
    setText('ticketSentText', 'Thanks, ' + firstNameOf(ticket.fullName) + '. You’re number ' + position + ' in our support queue — we’ll text ' + maskMobile(ticket.contactNumber) + '.');
    hideElement(byId('ticketForm'));
    showElement(byId('ticketSent'));
    focusElement(byId('ticketSentNo'));
  });
  onClick('ticketAnother', function () {
    byId('ticketForm').reset();
    updateTicketCounter();
    hideElement(byId('ticketSent'));
    showElement(byId('ticketForm'));
    focusElement(byId('ticketName'));
  });

  byId('ticketLookupForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const result = lookupTicket(fieldValue('lookupTicketNo'), fieldValue('lookupMobile'));
    if (!result.ok) {
      setHTML('ticketLookupResult', '<div class="form-alert form-alert-error">' + iconHTML('exclamation', 'form-alert-icon') + '<span>' + escapeHTML(result.error) + '</span></div>');
      return;
    }
    const ticket = result.ticket;
    let rows = kvRow('Ticket', '<span class="mono">' + escapeHTML(ticket.ticketNo) + '</span>')
      + kvRow('Status', statusBadge(ticket.status))
      + kvRow('Topic', escapeHTML(ticket.category))
      + kvRow('Sent', escapeHTML(formatDateTime(ticket.createdAt)));
    if (ticket.assignedTo) {
      rows += kvRow('Handled by', escapeHTML(ticket.assignedTo));
    }
    if (ticket.status === 'Resolved') {
      rows += kvRow('Resolution', escapeHTML(ticket.resolution));
    }
    setHTML('ticketLookupResult', '<dl class="kv-list">' + rows + '</dl>');
  });
}
