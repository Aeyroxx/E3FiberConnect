/* ==========================================================================
   E3 Fiber Connect · views/public/track.js
   Application tracker. The reference number is found with BINARY SEARCH on
   the applications table (it is always sorted by reference number).
   Personal details are partly hidden, because anyone with the number can look.
   Defense module: Application tracking — presented by Joshua Santos.
   ========================================================================== */

'use strict';

/** sampleReference — the newest pending application, for the "Try the sample" link. O(n) */
function sampleReference() {
  for (let i = applications.length - 1; i >= 0; i--) {
    if (applications[i].status === 'Pending') {
      return applications[i].referenceNo;
    }
  }
  return applications.length > 0 ? applications[applications.length - 1].referenceNo : 'E3-2026-004879';
}

function trackCallout(app) {
  if (app.status === 'Rejected') {
    return '<div class="callout tone-red mt-3"><span class="icon-bubble tone-red">' + iconHTML('info') + '</span><div>'
      + '<p class="callout-title">This application wasn’t approved</p>'
      + '<p class="callout-text">' + escapeHTML(app.rejectReason || 'Please contact us for details.') + ' Questions? <a href="#/support">Contact support</a>.</p></div></div>';
  }
  if (app.status === 'For Installation') {
    return '<div class="callout tone-purple mt-3"><span class="icon-bubble tone-purple">' + iconHTML('calendar') + '</span><div>'
      + '<p class="callout-title">Installation on ' + escapeHTML(formatLongDate(app.installDate)) + '</p>'
      + '<p class="callout-text">' + escapeHTML(app.installSlot || '') + '. Please have someone 18 or older at home.</p></div></div>';
  }
  if (app.status === 'Completed') {
    return '<div class="callout tone-green mt-3"><span class="icon-bubble tone-green">' + iconHTML('wifi') + '</span><div>'
      + '<p class="callout-title">You’re connected — welcome to E3 Fiber!</p>'
      + '<p class="callout-text">Your account number is <strong class="mono">' + escapeHTML(app.referenceNo) + '</strong>. Use it on <a href="#/pay">Pay Bills</a>.</p></div></div>';
  }
  if (!isBarangayServiceable(app.barangay)) {
    return '<div class="callout tone-orange mt-3"><span class="icon-bubble tone-orange">' + iconHTML('clock') + '</span><div>'
      + '<p class="callout-title">On the waitlist for Brgy. ' + escapeHTML(app.barangay) + '</p>'
      + '<p class="callout-text">Fiber hasn’t reached this barangay yet. We’ll contact you when it does.</p></div></div>';
  }
  return '';
}

function showTrackResult(input) {
  const started = stopwatchStart();
  const result = trackApplication(input);
  const ms = stopwatchMs(started);
  if (!result.ok) {
    setHTML('trackResult', '<div class="result-card mx-auto">'
      + '<span class="icon-bubble tone-orange">' + iconHTML('exclamation') + '</span>'
      + '<div><p class="result-title">' + escapeHTML(result.error) + '</p>'
      + '<p class="result-text">Reference numbers look like E3-2026-004879 and are shown after you apply.</p></div></div>');
    return;
  }
  logOperation('Binary search', 'Application tracker', result.n, result.comparisons, 0, ms);
  const app = result.application;
  const steps = applicationProgress(app);
  let details = kvRow('Reference number', '<span class="mono">' + escapeHTML(app.referenceNo) + '</span>')
    + kvRow('Applicant', escapeHTML(maskName(app.fullName)))
    + kvRow('Plan', escapeHTML(planLabel(app.planId, app.customPrice)))
    + kvRow('Barangay', escapeHTML(app.barangay))
    + kvRow('Sent', escapeHTML(formatDateTime(app.submittedAt)));
  if (app.installDate) {
    details += kvRow(app.status === 'Completed' ? 'Installed' : 'Installation', escapeHTML(formatDate(app.installDate)));
  }
  setHTML('trackResult',
    '<div class="form-card">'
    + '<div class="track-summary"><div><p class="caption-text">Application</p><h2 class="headline-3">' + escapeHTML(maskName(app.fullName)) + '</h2></div>'
    + statusBadge(app.status, 'lg') + '</div>'
    + trackCallout(app)
    + '<div class="mt-4">' + timelineHTML(steps) + '</div>'
    + '<hr class="divider"><dl class="kv-list">' + details + '</dl>'
    + '<p class="algo-note">Found with binary search in ' + pluralize(result.comparisons, 'comparison') + ' among ' + pluralize(result.n, 'application') + ' (sorted by reference number).</p>'
    + '</div>');
}

function renderTrackView(params) {
  setText('trackExample', sampleReference());
  if (params.ref) {
    setFieldValue('trackInput', params.ref);
    showTrackResult(params.ref);
  } else {
    setFieldValue('trackInput', '');
    setHTML('trackResult', '');
  }
}

function initTrackView() {
  byId('trackForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const referenceNo = normalizeReference(fieldValue('trackInput'));
    if (isValidReference(referenceNo)) {
      navigate('/track/' + referenceNo);
    } else {
      showTrackResult(referenceNo);
    }
  });
  onClick('trackExample', function () {
    navigate('/track/' + byId('trackExample').textContent);
  });
}
