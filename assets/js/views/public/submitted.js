/* ==========================================================================
   E3 Fiber Connect · views/public/submitted.js
   "Application received" — shows the new reference number (found again with
   binary search, since the application is already in the array).
   ========================================================================== */

'use strict';

const submittedViewState = { referenceNo: '' };

function renderSubmittedView(params) {
  const app = findApplication(params.ref);
  toggleElement(byId('submittedCard'), app !== null);
  toggleElement(byId('submittedMissing'), app === null);
  if (!app) {
    return;
  }
  submittedViewState.referenceNo = app.referenceNo;
  setText('submittedRef', app.referenceNo);
  setText('submittedLead', 'Thank you, ' + firstNameOf(app.fullName) + '. We’ll review your application within one to two days and text you at ' + maskMobile(app.contactNumber) + '.');
  setHTML('submittedSummary',
    kvRow('Plan', escapeHTML(planLabel(app.planId, app.customPrice)))
    + kvRow('Installation address', escapeHTML('Brgy. ' + app.barangay + ', Santa Maria'))
    + kvRow('Sent', escapeHTML(formatDateTime(app.submittedAt)))
    + kvRow('Status', statusBadge(app.status)));
  byId('submittedTrack').setAttribute('href', '#/track/' + app.referenceNo);
}

function initSubmittedView() {
  onClick('submittedCopy', function () {
    copyToClipboard(submittedViewState.referenceNo, function (copied) {
      showToast(copied ? 'Reference number copied' : 'Couldn’t copy — please write it down', { tone: copied ? 'success' : 'error' });
    });
  });
}
