/* ==========================================================================
   E3 Fiber Connect · views/admin/application-detail.js
   One application: details, coverage check, the progress timeline, history,
   staff notes and the action for the next step. Found with binary search.
   ========================================================================== */

'use strict';

const applicationDetailState = { referenceNo: '' };

function applicationDetailActions(app) {
  const ref = escapeHTML(app.referenceNo);
  let html = '';
  if (app.status === 'Pending') {
    html = '<button class="btn btn-danger-tinted" type="button" data-action="reject" data-ref="' + ref + '">Reject</button>'
      + '<button class="btn btn-accent" type="button" data-action="approve" data-ref="' + ref + '">' + iconHTML('check') + 'Approve</button>';
  } else if (app.status === 'Approved') {
    html = '<button class="btn btn-accent" type="button" data-action="schedule" data-ref="' + ref + '">' + iconHTML('calendar') + 'Schedule installation</button>';
  } else if (app.status === 'For Installation') {
    html = '<button class="btn btn-gray" type="button" data-action="schedule" data-ref="' + ref + '">Reschedule</button>'
      + '<button class="btn btn-accent" type="button" data-action="install" data-ref="' + ref + '">' + iconHTML('wifi') + 'Installed — create account</button>';
  } else if (app.status === 'Completed') {
    html = '<a class="btn btn-gray" href="#/admin/subscribers/' + ref + '">' + iconHTML('users') + 'Open subscriber</a>';
  }
  const front = queuePeek(buildReviewQueue());
  if (front && front.referenceNo !== app.referenceNo) {
    html += '<button class="btn btn-tinted" type="button" data-action="next-pending">Next pending' + iconHTML('chevron-right') + '</button>';
  }
  return html;
}

function renderApplicationDetailView(params) {
  renderAdminChrome();
  const app = findApplication(params.ref);
  toggleElement(byId('appDetail'), app !== null);
  toggleElement(byId('appNotFound'), app === null);
  if (!app) {
    setHTML('appNotFound', '<div class="panel">' + emptyState('doc', 'Application not found', 'It may have been undone, or the link is wrong.') + '</div>');
    return;
  }
  applicationDetailState.referenceNo = app.referenceNo;
  document.title = app.fullName + ' — Applications — E3 Fiber Connect';
  setText('adminToolbarTitle', app.fullName);
  setText('appTitle', app.fullName);
  setHTML('appMeta', '<span class="mono">' + escapeHTML(app.referenceNo) + '</span>'
    + '<span>' + (app.source === 'walk-in' ? 'Walk-in' : 'Online') + ' · ' + escapeHTML(formatDateTime(app.submittedAt)) + '</span>'
    + statusBadge(app.status, 'lg'));
  setHTML('appActions', applicationDetailActions(app));

  const age = isValidISODate(app.birthDate) ? ageOn(app.birthDate, todayISO()) : 0;
  setHTML('appApplicant',
    kvRow('Full name', escapeHTML(app.fullName))
    + kvRow('E-mail', '<a href="mailto:' + escapeHTML(app.email) + '">' + escapeHTML(app.email) + '</a>')
    + kvRow('Mobile', '<a href="tel:' + escapeHTML(digitsOnly(app.contactNumber)) + '">' + escapeHTML(app.contactNumber) + '</a>')
    + kvRow('Birth date', escapeHTML(formatDate(app.birthDate)) + ' · ' + age + ' years old'));
  setHTML('appAddress',
    kvRow('City', escapeHTML(app.city + ', ' + SERVICE_PROVINCE))
    + kvRow('Barangay', escapeHTML(app.barangay))
    + kvRow('Street', escapeHTML(app.completeAddress))
    + kvRow('Landmark', escapeHTML(app.landmark || '—')));
  const coverage = coverageDetail(app.barangay);
  setHTML('appCoverage', '<div class="callout tone-' + coverage.tone + '"><span class="icon-bubble tone-' + coverage.tone + '">' + iconHTML(coverage.tone === 'green' ? 'wifi' : 'warning') + '</span>'
    + '<div><p class="callout-title">Coverage check</p><p class="callout-text">' + escapeHTML(coverage.text) + '</p></div></div>');
  setHTML('appPlan',
    kvRow('Plan', escapeHTML(planLabel(app.planId, app.customPrice)))
    + kvRow('ID type', escapeHTML(app.idType))
    + kvRow('ID number', '<span class="mono">' + escapeHTML(app.idNumber) + '</span>')
    + (app.installDate ? kvRow(app.status === 'Completed' ? 'Installed on' : 'Installation', escapeHTML(formatDate(app.installDate) + (app.installSlot && app.status !== 'Completed' ? ' · ' + app.installSlot : ''))) : '')
    + (app.rejectReason ? kvRow('Reason not approved', escapeHTML(app.rejectReason)) : ''));
  setHTML('appIdFile', '<div class="id-file">' + iconHTML('doc')
    + '<span>' + (app.idPhotoName ? escapeHTML(app.idPhotoName) + '' : 'No file — the ID was checked in person') + '</span></div>');

  setFieldValue('appNotes', app.notes);
  setText('appNotesCount', formatNumber(app.notes.length) + ' / 500');
  setHTML('appTimeline', timelineHTML(applicationProgress(app)));

  let history = '';
  for (let i = app.history.length - 1; i >= 0; i--) {
    const step = app.history[i];
    history += '<li class="row-item"><div class="row-main"><p class="row-title fw-normal">' + statusBadge(step.status) + ' <span class="ms-1">' + escapeHTML(step.note || '') + '</span></p>'
      + '<p class="row-meta">' + escapeHTML(step.by) + ' · ' + escapeHTML(formatDateTime(step.at)) + '</p></div></li>';
  }
  setHTML('appHistory', history);
}

function initApplicationDetailView() {
  onAction(byId('appActions'), function (action, element) {
    if (action === 'next-pending') {
      reviewNextApplication();
      return;
    }
    runApplicationAction(action, element.getAttribute('data-ref'));
  });
  byId('appNotes').addEventListener('input', function () {
    setText('appNotesCount', formatNumber(fieldValue('appNotes').length) + ' / 500');
  });
  onClick('appNotesSave', function () {
    const result = updateApplicationNotes(applicationDetailState.referenceNo, fieldValue('appNotes'), currentStaff());
    if (!result.ok) {
      reportFailure(result);
      return;
    }
    showToast('Notes saved');
  });
}
