/* ==========================================================================
   E3 Fiber Connect · views/admin/applications.js
   Applications list (filter → search → sort with the algorithm you pick) and
   the actions shared with the detail page: approve, reject, schedule, and
   "Create account" once installed (a sorted insert into subscribers).
   Defense modules: Application List and Create Account — presented by Justin Banaag.
   ========================================================================== */

'use strict';

const applicationsViewState = { status: 'all', query: '', sort: 'submittedAt-desc', algorithm: 'insertion' };
const applicationActionState = { referenceNo: '' };
const CREATE_ACCOUNT_FIELDS = { modemSerial: 'createAccountSerial', tested: 'createAccountTested' };

/** applicationRowActions — the quick buttons for the next step of an application. */
function applicationRowActions(app) {
  const ref = escapeHTML(app.referenceNo);
  const name = escapeHTML(app.fullName);
  if (app.status === 'Pending') {
    return '<button class="btn btn-success-tinted btn-xs" type="button" data-action="approve" data-ref="' + ref + '" aria-label="Approve ' + name + '">Approve</button>'
      + '<button class="btn btn-danger-tinted btn-xs" type="button" data-action="reject" data-ref="' + ref + '" aria-label="Reject ' + name + '">Reject</button>';
  }
  if (app.status === 'Approved') {
    return '<button class="btn btn-tinted btn-xs" type="button" data-action="schedule" data-ref="' + ref + '" aria-label="Schedule installation for ' + name + '">Schedule</button>';
  }
  if (app.status === 'For Installation') {
    return '<button class="btn btn-tinted btn-xs" type="button" data-action="install" data-ref="' + ref + '" aria-label="Create the subscriber account of ' + name + '">Create account</button>';
  }
  return '';
}

function applicationRowHTML(row) {
  const app = row.record;
  const href = '#/admin/applications/' + escapeHTML(app.referenceNo);
  const serviceable = isBarangayServiceable(app.barangay);
  return '<tr data-href="' + href + '">'
    + '<td class="cell-main"><div class="cell-person">' + avatar(app.fullName, 'sm') + '<div class="min-w-0">'
    + '<a class="cell-primary" href="' + href + '">' + escapeHTML(app.fullName) + '</a>'
    + '<span class="cell-secondary text-truncate cell-truncate" title="' + escapeHTML(app.email) + '">' + escapeHTML(app.email) + '</span></div></div></td>'
    + '<td data-label="Reference" class="text-nowrap"><span class="mono">' + escapeHTML(app.referenceNo) + '</span>' + (app.source === 'walk-in' ? '<span class="cell-secondary">Walk-in</span>' : '') + '</td>'
    + '<td data-label="Plan" class="text-nowrap"><span class="cell-primary">' + escapeHTML(row.planName) + '</span><span class="cell-secondary">' + formatPeso(row.price) + '/mo</span></td>'
    + '<td data-label="Barangay" class="col-optional">' + escapeHTML(app.barangay) + (serviceable ? '' : '<span class="cell-secondary text-orange">Coming soon</span>') + '</td>'
    + '<td data-label="Submitted" class="text-nowrap col-optional"><span>' + escapeHTML(formatShortDate(app.submittedAt)) + '</span>'
    + (waitingDays(app) < 7 ? '<span class="cell-secondary">' + escapeHTML(formatTimeAgo(app.submittedAt)) + '</span>' : '') + '</td>'
    + '<td data-label="Status">' + statusBadge(app.status) + '</td>'
    + '<td class="actions-cell"><div class="cell-actions">' + applicationRowActions(app) + '</div></td></tr>';
}

function renderApplicationsView() {
  renderAdminChrome();
  const state = applicationsViewState;
  const counts = countApplicationsByStatus();
  renderSegmentCounts(byId('appsFilter'), counts);
  markSegment(byId('appsFilter'), state.status);
  setText('appsSubtitle', pluralize(counts.all, 'application') + ' · ' + counts.Pending + ' waiting for review');
  byId('appsSort').value = state.sort;
  byId('appsAlgorithm').value = state.algorithm;
  byId('appsSearch').value = state.query;

  const sortChoice = splitSortValue(state.sort);
  const result = listApplications({ status: state.status, query: state.query, sortField: sortChoice.field, sortOrder: sortChoice.order, algorithm: state.algorithm });
  let html = '';
  for (let i = 0; i < result.rows.length; i++) {
    html += applicationRowHTML(result.rows[i]);
  }
  setHTML('appsBody', html);
  const empty = byId('appsEmpty');
  empty.hidden = result.rows.length > 0;
  empty.innerHTML = result.rows.length > 0 ? '' : emptyState('search', 'No applications found', state.query ? 'Try a different name, e-mail or reference number.' : 'Nothing has this status right now.');
  setHTML('appsCaption', algorithmCaption(result.rows.length, result.total, 'application', result.stats, state.algorithm));
}

/* ---- Actions shared with the detail page ---------------------------------- */

function runApplicationAction(action, referenceNo) {
  const staff = currentStaff();
  const app = findApplication(referenceNo);
  if (!app) {
    showToast('That application no longer exists.', { tone: 'error' });
    refreshCurrentRoute();
    return;
  }
  if (action === 'approve') {
    const result = approveApplication(referenceNo, staff);
    if (!result.ok) {
      reportFailure(result);
    } else {
      announce('Approved ' + app.fullName);
    }
    refreshCurrentRoute();
  } else if (action === 'reject') {
    openRejectSheet(referenceNo);
  } else if (action === 'schedule') {
    openScheduleSheet(referenceNo);
  } else if (action === 'install') {
    openCreateAccountSheet(referenceNo);
  }
}

/**
 * insertPreviewHTML — where the new account lands in the sorted subscribers
 * array: its neighbours, and how many comparisons the binary search took.
 */
function insertPreviewHTML(preview) {
  let boxes = '';
  if (preview.before) {
    boxes += (preview.position > 1 ? '<span class="ds-gap" aria-hidden="true">…</span>' : '') + '<span class="ds-box">' + escapeHTML(preview.before) + '</span>';
  }
  boxes += '<span class="ds-box is-new">' + escapeHTML(preview.accountNo) + '</span>';
  if (preview.after) {
    boxes += '<span class="ds-box">' + escapeHTML(preview.after) + '</span>' + (preview.position + 1 < preview.total ? '<span class="ds-gap" aria-hidden="true">…</span>' : '');
  }
  const shifted = preview.total - preview.position;
  return '<p class="form-label mb-1">Where the account goes</p>'
    + '<div class="ds-visual">' + boxes + '</div>'
    + '<p class="caption-text mt-1">Subscribers are kept sorted by account number. Binary search found position ' + (preview.position + 1)
    + ' of ' + (preview.total + 1) + ' in ' + pluralize(preview.comparisons, 'comparison') + '; '
    + (shifted === 0 ? 'it goes at the end, so nothing has to move.' : 'the ' + pluralize(shifted, 'account') + ' after it move one place to the right.') + '</p>';
}

/** openCreateAccountSheet — review the new subscriber account before it is created. */
function openCreateAccountSheet(referenceNo) {
  const preview = previewSubscriberAccount(referenceNo);
  if (!preview.ok) {
    reportFailure(preview);
    refreshCurrentRoute();
    return;
  }
  const app = preview.application;
  const period = preview.firstPeriod;
  applicationActionState.referenceNo = referenceNo;
  setText('createAccountText', app.fullName + ' · Brgy. ' + app.barangay + '. Creating the account completes the installation — you can undo it right after.');
  setHTML('createAccountSummary',
    kvRow('Account number', '<span class="mono">' + escapeHTML(preview.accountNo) + '</span> <span class="caption-text">(same as the application)</span>')
    + kvRow('Plan', escapeHTML(planLabel(app.planId, app.customPrice)))
    + kvRow('Billing day', 'The ' + escapeHTML(formatOrdinal(preview.billingDay)) + ' of every month' + (preview.billingDay > 28 ? ' (or the last day of shorter months)' : ''))
    + kvRow('First bill', escapeHTML(formatPeriod(period.periodStart, period.periodEnd)) + ' · ' + formatPeso(preview.monthly) + ' · due ' + escapeHTML(formatDate(period.dueDate)))
    + kvRow('Pay Bills sign-in', 'Account number + mobile ' + escapeHTML(maskMobile(app.contactNumber))));
  setHTML('createAccountInsert', insertPreviewHTML(preview));
  byId('createAccountForm').reset();
  clearFieldErrors(CREATE_ACCOUNT_FIELDS);
  setFormAlert('createAccountAlert', '');
  openSheet('sheetCreateAccount', document.activeElement);
}

function openRejectSheet(referenceNo) {
  const app = findApplication(referenceNo);
  applicationActionState.referenceNo = referenceNo;
  setText('rejectText', app.fullName + ' (' + referenceNo + ') will see this reason on the tracker. You can undo it right after.');
  const suggested = isBarangayServiceable(app.barangay) ? '' : 'Outside the coverage area';
  let html = '';
  for (let i = 0; i < REJECT_REASONS.length; i++) {
    html += compactChoice('rejectReason', 'reject-reason-' + i, REJECT_REASONS[i], REJECT_REASONS[i], '', REJECT_REASONS[i] === suggested, false);
  }
  setHTML('rejectReasons', html);
  setFieldValue('rejectNote', '');
  setFieldError('rejectReasons', '');
  setFieldError('rejectNote', '');
  openSheet('sheetReject', document.activeElement);
}

function openScheduleSheet(referenceNo) {
  const app = findApplication(referenceNo);
  applicationActionState.referenceNo = referenceNo;
  const rescheduling = app.status === 'For Installation';
  const today = todayISO();
  setText('scheduleTitle', rescheduling ? 'Reschedule installation' : 'Schedule installation');
  setText('scheduleSubmit', rescheduling ? 'Save new date' : 'Schedule');
  setText('scheduleText', app.fullName + ' · ' + planName(app.planId) + ' plan · Brgy. ' + app.barangay);
  const dateInput = byId('scheduleDate');
  dateInput.min = today;
  dateInput.max = addDaysISO(today, 60);
  dateInput.value = app.installDate && app.installDate >= today ? app.installDate : addDaysISO(today, 1);
  let html = '';
  for (let i = 0; i < INSTALL_SLOTS.length; i++) {
    const checked = app.installSlot ? app.installSlot === INSTALL_SLOTS[i] : i === 0;
    html += compactChoice('installSlot', 'install-slot-' + i, INSTALL_SLOTS[i], INSTALL_SLOTS[i], '', checked, false);
  }
  setHTML('scheduleSlots', html);
  setFieldError('scheduleDate', '');
  setFieldError('scheduleSlots', '');
  openSheet('sheetSchedule', document.activeElement);
}

function reviewNextApplication() {
  const front = queuePeek(buildReviewQueue());
  if (!front) {
    showToast('No applications are waiting for review.', { tone: 'info' });
    return;
  }
  navigate('/admin/applications/' + front.referenceNo);
}

function initApplicationsView() {
  onSegmentChange(byId('appsFilter'), function (value) {
    applicationsViewState.status = value;
    renderApplicationsView();
  });
  byId('appsSearch').addEventListener('input', function (event) {
    applicationsViewState.query = event.target.value;
    renderApplicationsView();
  });
  byId('appsSort').addEventListener('change', function (event) {
    applicationsViewState.sort = event.target.value;
    renderApplicationsView();
  });
  byId('appsAlgorithm').addEventListener('change', function (event) {
    applicationsViewState.algorithm = event.target.value;
    renderApplicationsView();
  });
  onAction(byId('appsBody'), function (action, element) {
    runApplicationAction(action, element.getAttribute('data-ref'));
  });
  onClick('appsReviewNext', reviewNextApplication);

  byId('rejectForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const reason = checkedValue('rejectReason', byId('rejectReasons'));
    if (!reason) {
      setFieldError('rejectReasons', 'Choose a reason.');
      return;
    }
    setFieldError('rejectReasons', '');
    const referenceNo = applicationActionState.referenceNo;
    const app = findApplication(referenceNo);
    const result = rejectApplication(referenceNo, reason, fieldValue('rejectNote'), currentStaff());
    if (!result.ok) {
      setFieldError('rejectNote', result.error);
      focusElement(byId('rejectNote'));
      return;
    }
    closeSheet('sheetReject');
    announce('Rejected ' + app.fullName);
    refreshCurrentRoute();
  });
  byId('rejectReasons').addEventListener('change', function () {
    setFieldError('rejectReasons', '');
  });

  byId('scheduleForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const slot = checkedValue('installSlot', byId('scheduleSlots'));
    const date = fieldValue('scheduleDate');
    const result = scheduleInstallation(applicationActionState.referenceNo, date, slot, currentStaff());
    if (!result.ok) {
      setFieldError(slot ? 'scheduleDate' : 'scheduleSlots', result.error);
      return;
    }
    closeSheet('sheetSchedule');
    announce('Installation set for ' + formatLongDate(date));
    refreshCurrentRoute();
  });

  byId('createAccountForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const result = createSubscriberAccount(applicationActionState.referenceNo, {
      modemSerial: fieldValue('createAccountSerial'),
      tested: isChecked('createAccountTested'),
    }, currentStaff());
    if (!result.ok) {
      if (result.errors) {
        focusInvalid(applyFieldErrors(CREATE_ACCOUNT_FIELDS, result.errors));
      } else {
        setFormAlert('createAccountAlert', result.error, 'error');
      }
      return;
    }
    closeSheet('sheetCreateAccount');
    announce('Created account ' + result.subscriber.accountNo + ' for ' + result.subscriber.fullName);
    refreshCurrentRoute();
  });
  byId('createAccountTested').addEventListener('change', function () {
    if (isChecked('createAccountTested')) {
      setFieldError('createAccountTested', '');
    }
  });
  liveValidate('createAccountSerial', function () {
    return validateAccountDetails({ modemSerial: fieldValue('createAccountSerial'), tested: true }).modemSerial || '';
  });
}
