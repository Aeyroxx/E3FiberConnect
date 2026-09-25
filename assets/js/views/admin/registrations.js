/* ==========================================================================
   E3 Fiber Connect · views/admin/registrations.js
   Approval of staff registrations: the approval QUEUE (the request at the
   front is shown with its checks), Approve / Reject, and the list of every
   request. Owners and Admins decide; Support can only look.
   Defense module: Approval of registration admins — presented by Dela Cruz Riceerich.
   ========================================================================== */

'use strict';

const registrationsViewState = { status: 'all', query: '', sort: 'submittedAt-desc', registrationId: '' };

/** registrationActionButtons — Reject and Approve (Approve only when every check passed). */
function registrationActionButtons(request, review, compact) {
  const id = escapeHTML(request.registrationId);
  const name = escapeHTML(request.fullName);
  const size = compact ? ' btn-xs' : ' btn-sm';
  return '<button class="btn btn-danger-tinted' + size + '" type="button" data-action="reject-registration" data-registration="' + id + '" aria-label="Reject the request of ' + name + '">Reject</button>'
    + '<button class="btn ' + (compact ? 'btn-success-tinted' : 'btn-accent') + size + '" type="button" data-action="approve-registration" data-registration="' + id + '" aria-label="Approve ' + name + '"'
    + (review.passed ? '' : ' disabled title="' + escapeHTML(review.firstFailure.text) + '"') + '>' + (compact ? '' : iconHTML('check')) + 'Approve</button>';
}

/** registrationCardHTML — the request at the front of the queue, with the reviewer's checks. */
function registrationCardHTML(request, review, canReview) {
  return '<div class="validate-card">'
    + '<div class="validate-head">' + avatar(request.fullName, 'md')
    + '<div class="min-w-0 flex-grow-1"><p class="validate-name">' + escapeHTML(request.fullName) + '</p>'
    + '<p class="caption-text text-truncate">' + escapeHTML(request.email) + ' · ' + escapeHTML(request.mobile) + '</p>'
    + '<p class="caption-text"><span class="mono">' + escapeHTML(request.registrationId) + '</span> · sent ' + escapeHTML(formatTimeAgoInline(request.submittedAt)) + '</p></div>'
    + '<div class="validate-amount">' + tonePill(request.role + ' access', request.role === 'Admin' ? 'purple' : 'blue') + '</div></div>'
    + (request.note ? '<p class="message-quote mb-3">' + escapeHTML(request.note) + '</p>' : '')
    + checkListHTML(review.checks)
    + '<div class="validate-foot"><p class="validate-verdict ' + (review.passed ? 'text-green' : 'text-red') + '">'
    + iconHTML(review.passed ? 'check-circle' : 'warning')
    + '<span>' + escapeHTML(review.passed ? 'Ready to approve — the account keeps the password they chose.' : review.firstFailure.text) + '</span></p>'
    + (canReview ? '<div class="cell-actions">' + registrationActionButtons(request, review, false) + '</div>' : '')
    + '</div></div>';
}

function registrationRowHTML(row, actor, manager) {
  const request = row.record;
  let detail = '';
  if (request.status === 'Approved') {
    detail = '<span class="cell-secondary text-nowrap">' + escapeHTML(request.staffId) + ' · by ' + escapeHTML(request.reviewedBy) + '</span>';
  } else if (request.status === 'Rejected') {
    detail = '<span class="cell-secondary cell-truncate" title="' + escapeHTML(request.rejectReason) + '">' + escapeHTML(request.rejectReason) + '</span>';
  }
  const actions = request.status === 'Pending' && manager ? registrationActionButtons(request, registrationChecks(request, actor), true) : '';
  return '<tr>'
    + '<td class="cell-main"><div class="cell-person">' + avatar(request.fullName, 'sm') + '<div class="min-w-0">'
    + '<span class="cell-primary">' + escapeHTML(request.fullName) + '</span>'
    + '<span class="cell-secondary text-truncate cell-truncate" title="' + escapeHTML(request.email) + '">' + escapeHTML(request.email) + '</span></div></div></td>'
    + '<td data-label="Request" class="text-nowrap"><span class="mono">' + escapeHTML(request.registrationId) + '</span></td>'
    + '<td data-label="Access">' + escapeHTML(request.role) + '</td>'
    + '<td data-label="Sent" class="col-optional text-nowrap"><span>' + escapeHTML(formatShortDate(request.submittedAt)) + '</span><span class="cell-secondary">' + escapeHTML(formatTimeAgo(request.submittedAt)) + '</span></td>'
    + '<td data-label="Status">' + statusBadge(request.status) + detail + '</td>'
    + '<td class="actions-cell"><div class="cell-actions">' + actions + '</div></td></tr>';
}

function renderRegistrationsView() {
  renderAdminChrome();
  const state = registrationsViewState;
  const actor = currentStaff();
  const manager = canManageStaff(actor);
  toggleElement(byId('regNotice'), !manager);
  const counts = countRegistrationsByStatus();
  renderSegmentCounts(byId('regFilter'), counts);
  markSegment(byId('regFilter'), state.status);
  setText('regSubtitle', pluralize(counts.Pending, 'request') + ' waiting for approval · first come, first served');
  byId('regSort').value = state.sort;
  byId('regSearch').value = state.query;

  const queue = registrationQueue();
  const waiting = queueToArray(queue);
  const labels = [];
  for (let i = 0; i < waiting.length; i++) {
    arrayAppend(labels, waiting[i].registrationId);
  }
  setHTML('regQueueStrip', labels.length > 0 ? queueStripHTML(labels) : '<span class="caption-text">The queue is empty — every request has been reviewed.</span>');
  const front = queuePeek(queue);
  setHTML('regFront', front
    ? '<p class="next-up-label mb-2">Next to review · 1 of ' + queueSize(queue) + '</p>' + registrationCardHTML(front, registrationChecks(front, actor), manager)
    : emptyState('check-circle', 'No requests waiting', 'New employees can ask for access from the sign-in page (“Request staff access”).'));

  const sortChoice = splitSortValue(state.sort);
  const result = listRegistrations({ status: state.status, query: state.query, sortField: sortChoice.field, sortOrder: sortChoice.order, algorithm: 'insertion' });
  let html = '';
  for (let i = 0; i < result.rows.length; i++) {
    html += registrationRowHTML(result.rows[i], actor, manager);
  }
  setHTML('regBody', html);
  const empty = byId('regEmpty');
  empty.hidden = result.rows.length > 0;
  empty.innerHTML = result.rows.length > 0 ? '' : emptyState('search', 'No requests found', state.query ? 'Try another name or e-mail.' : 'Nothing has this status right now.');
  setHTML('regCaption', algorithmCaption(result.rows.length, result.total, 'request', result.stats, 'insertion'));
}

function openRejectRegistrationSheet(registrationId) {
  const request = findRegistration(registrationId);
  if (!request) {
    return;
  }
  registrationsViewState.registrationId = registrationId;
  setText('rejectRegText', request.fullName + ' asked for ' + request.role + ' access (' + request.registrationId + '). They will see your reason when they try to sign in.');
  const suggested = isStaffEmailTaken(request.email) ? 'Duplicate request' : '';
  let html = '';
  for (let i = 0; i < REGISTRATION_REJECT_REASONS.length; i++) {
    const reason = REGISTRATION_REJECT_REASONS[i];
    html += compactChoice('rejectRegReason', 'reject-reg-reason-' + i, reason, reason, '', reason === suggested, false);
  }
  setHTML('rejectRegReasons', html);
  setFieldValue('rejectRegNote', '');
  setFieldError('rejectRegReasons', '');
  setFieldError('rejectRegNote', '');
  openSheet('sheetRejectRegistration', document.activeElement);
}

function runRegistrationAction(action, element, event) {
  if (event && event.detail > 1) {
    return; // the 2nd click of a double-click would land on the NEXT request's button after the redraw
  }
  const registrationId = element.getAttribute('data-registration');
  if (action === 'approve-registration') {
    const request = findRegistration(registrationId);
    requireStepUp('approve ' + (request ? request.fullName : 'this request') + ' as staff', function () {
      const result = approveRegistration(registrationId, currentStaff());
      if (!result.ok) {
        reportFailure(result);
      } else {
        announce('Approved ' + result.staff.fullName + ' — ' + result.staff.id + ' can sign in now');
      }
      renderRegistrationsView();
    });
  } else if (action === 'reject-registration') {
    openRejectRegistrationSheet(registrationId);
  }
}

function initRegistrationsView() {
  onSegmentChange(byId('regFilter'), function (value) {
    registrationsViewState.status = value;
    renderRegistrationsView();
  });
  byId('regSearch').addEventListener('input', function (event) {
    registrationsViewState.query = event.target.value;
    renderRegistrationsView();
  });
  byId('regSort').addEventListener('change', function (event) {
    registrationsViewState.sort = event.target.value;
    renderRegistrationsView();
  });
  onAction(byId('regFront'), runRegistrationAction);
  onAction(byId('regBody'), runRegistrationAction);

  byId('rejectRegForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const reason = checkedValue('rejectRegReason', byId('rejectRegReasons'));
    if (!reason) {
      setFieldError('rejectRegReasons', 'Choose a reason.');
      return;
    }
    setFieldError('rejectRegReasons', '');
    const result = rejectRegistration(registrationsViewState.registrationId, reason, fieldValue('rejectRegNote'), currentStaff());
    if (!result.ok) {
      setFieldError('rejectRegNote', result.error);
      focusElement(byId('rejectRegNote'));
      return;
    }
    closeSheet('sheetRejectRegistration');
    announce('Rejected the request of ' + result.registration.fullName);
    refreshCurrentRoute();
  });
  byId('rejectRegReasons').addEventListener('change', function () {
    setFieldError('rejectRegReasons', '');
  });
}
