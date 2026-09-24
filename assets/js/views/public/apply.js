/* ==========================================================================
   E3 Fiber Connect · views/public/apply.js
   The public application: a five-step wizard (plan → about you → address →
   valid ID → review). Each step is checked with the same validator the
   backend uses, and the panels slide in from the direction you are moving.
   Defense module: Application (and step 1, Plan Selection) — presented by Joshua Santos.
   ========================================================================== */

'use strict';

const applyState = { step: 1, planId: 'power', photo: null };

// Which form fields (and their input ids) belong to each step. Index = step number.
const APPLY_STEP_FIELDS = [
  {},
  { planId: 'applyPlanChoices' },
  { fullName: 'applyFullName', email: 'applyEmail', contactNumber: 'applyMobile', birthDate: 'applyBirthDate' },
  { barangay: 'applyBarangay', completeAddress: 'applyAddress', landmark: 'applyLandmark' },
  { idType: 'applyIdType', idNumber: 'applyIdNumber', idPhoto: 'applyIdPhoto', consent: 'applyConsent' },
  {},
];

/** readApplyForm — the wizard's current values as one record. */
function readApplyForm() {
  const photo = applyState.photo;
  return {
    planId: checkedValue('applyPlan', byId('applyPlanChoices')) || applyState.planId,
    fullName: fieldValue('applyFullName'),
    email: fieldValue('applyEmail'),
    contactNumber: fieldValue('applyMobile'),
    birthDate: fieldValue('applyBirthDate'),
    barangay: fieldValue('applyBarangay'),
    completeAddress: fieldValue('applyAddress'),
    landmark: fieldValue('applyLandmark'),
    idType: fieldValue('applyIdType'),
    idNumber: fieldValue('applyIdNumber'),
    idPhotoName: photo ? photo.name : '',
    idPhotoType: photo ? photo.type : '',
    idPhotoSize: photo ? photo.size : 0,
    consent: isChecked('applyConsent'),
  };
}

/** applyFieldError — the current message for one field ("" when fine). */
function applyFieldError(key) {
  return validateApplication(readApplyForm(), 'online')[key] || '';
}

/** stepForField — which step owns a field (linear search over the steps). O(s · f) */
function stepForField(key) {
  for (let step = 1; step < APPLY_STEP_FIELDS.length; step++) {
    for (const field in APPLY_STEP_FIELDS[step]) {
      if (field === key) {
        return step;
      }
    }
  }
  return 1;
}

/** validateApplyStep — show this step's errors; returns true when it is complete. */
function validateApplyStep(step) {
  const errors = validateApplication(readApplyForm(), 'online');
  const first = applyFieldErrors(APPLY_STEP_FIELDS[step], errors);
  if (first) {
    focusInvalid(first);
    return false;
  }
  return true;
}

function updateApplySummary() {
  const plan = findPlan(checkedValue('applyPlan', byId('applyPlanChoices')) || applyState.planId) || findPlan('power');
  applyState.planId = plan.id;
  setText('applySummaryPlan', plan.name + ' plan');
  setText('applySummarySpeed', 'Up to ' + plan.speed + ' Mbps · ' + plan.devices);
  setHTML('applySummaryPrice', formatPeso(plan.price) + '<small>/mo</small>');
}

function updateCoverageHint(selectId, hintId) {
  const name = fieldValue(selectId);
  const hint = byId(hintId);
  if (!name) {
    hint.innerHTML = '';
    return;
  }
  const detail = coverageDetail(name);
  hint.className = 'coverage-hint text-' + detail.tone;
  hint.innerHTML = iconHTML(detail.tone === 'green' ? 'check-circle' : 'info') + '<span>' + escapeHTML(detail.tone === 'green' ? detail.text : 'Fiber isn’t here yet — you can still apply to join the waitlist.') + '</span>';
}

/** fillBarangaySelect — the 24 barangays, marking the ones not yet connected. O(n) */
function fillBarangaySelect(selectId) {
  let html = '<option value="">Choose a barangay</option>';
  for (let i = 0; i < BARANGAYS.length; i++) {
    const label = BARANGAYS[i].name + (BARANGAYS[i].status === 'available' ? '' : ' — coming soon');
    html += '<option value="' + escapeHTML(BARANGAYS[i].name) + '">' + escapeHTML(label) + '</option>';
  }
  setHTML(selectId, html);
}

/** setUploadState — show the chosen file (or the empty prompt) in an upload box. */
function setUploadState(boxId, titleId, textId, photo, emptyTitle) {
  const box = byId(boxId);
  if (photo) {
    box.classList.add('has-file');
    setText(titleId, photo.name);
    setText(textId, formatNumber(Math.max(1, Math.round(photo.size / 1024))) + ' KB · choose another file to replace it');
  } else {
    box.classList.remove('has-file');
    setText(titleId, emptyTitle);
    setText(textId, 'JPG, PNG or PDF, up to 10 MB');
  }
}

function renderApplyReview() {
  const data = readApplyForm();
  const barangay = findBarangay(data.barangay);
  const groups = [
    { step: 1, title: 'Plan', rows: [['Plan', planLabel(data.planId, null)]] },
    { step: 2, title: 'About you', rows: [['Name', collapseSpaces(data.fullName)], ['E-mail', trimText(data.email)], ['Mobile', normalizeMobile(data.contactNumber)], ['Birth date', isValidISODate(data.birthDate) ? formatDate(data.birthDate) : '—']] },
    { step: 3, title: 'Address', rows: [['Barangay', barangay ? 'Brgy. ' + barangay.name + ', Santa Maria' : '—'], ['Street', collapseSpaces(data.completeAddress)], ['Landmark', collapseSpaces(data.landmark) || '—']] },
    { step: 4, title: 'Valid ID', rows: [['ID', data.idType + ' · ' + trimText(data.idNumber)], ['File', data.idPhotoName || '—']] },
  ];
  let html = '';
  for (let g = 0; g < groups.length; g++) {
    html += '<div class="review-group"><div class="review-group-head"><p class="review-group-title">' + escapeHTML(groups[g].title) + '</p>'
      + '<button type="button" class="btn btn-plain btn-sm" data-edit-step="' + groups[g].step + '" aria-label="Edit ' + escapeHTML(groups[g].title) + '">Edit</button></div><dl class="kv-list">';
    for (let r = 0; r < groups[g].rows.length; r++) {
      html += kvRow(groups[g].rows[r][0], escapeHTML(groups[g].rows[r][1]));
    }
    html += '</dl></div>';
  }
  setHTML('applyReview', html);
}

/** goToApplyStep — show one step; `direction` picks the slide-in animation. */
function goToApplyStep(step, direction) {
  applyState.step = step;
  const panels = qsa('[data-step-panel]', byId('applyForm'));
  for (let i = 0; i < panels.length; i++) {
    const isCurrent = panels[i].getAttribute('data-step-panel') === String(step);
    panels[i].hidden = !isCurrent;
    panels[i].classList.remove('enter-forward', 'enter-back');
    if (isCurrent && direction) {
      void panels[i].offsetWidth; // restart the slide-in animation
      panels[i].classList.add(direction === 'back' ? 'enter-back' : 'enter-forward');
    }
  }
  const items = qsa('li', byId('applyStepper'));
  for (let i = 0; i < items.length; i++) {
    const itemStep = i + 1;
    items[i].classList.toggle('is-done', itemStep < step);
    items[i].classList.toggle('is-current', itemStep === step);
    if (itemStep === step) {
      items[i].setAttribute('aria-current', 'step');
    } else {
      items[i].removeAttribute('aria-current');
    }
  }
  setText('applyStepLabel', 'Step ' + step + ' of 5');
  byId('applyBack').style.visibility = step === 1 ? 'hidden' : '';
  byId('applyNext').hidden = step === 5;
  byId('applySubmit').hidden = step !== 5;
  if (step === 5) {
    renderApplyReview();
  }
  if (direction) {
    const legend = qs('[data-step-panel="' + step + '"] legend', byId('applyForm'));
    legend.setAttribute('tabindex', '-1');
    focusElement(legend);
    const card = byId('applyForm');
    if (card.getBoundingClientRect().top < 0) {
      card.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }
}

function resetApplyForm() {
  byId('applyForm').reset();
  applyState.photo = null;
  setUploadState('applyUpload', 'applyUploadTitle', 'applyUploadText', null, 'Choose a file');
  for (let step = 1; step < APPLY_STEP_FIELDS.length; step++) {
    clearFieldErrors(APPLY_STEP_FIELDS[step]);
  }
  setFormAlert('applyAlert', '');
  setCheckedValue('applyPlan', applyState.planId, byId('applyPlanChoices'));
  updateCoverageHint('applyBarangay', 'applyCoverageHint');
  goToApplyStep(1, '');
}

function submitApplyForm() {
  const result = submitApplication(readApplyForm(), 'online', null);
  if (!result.ok) {
    let firstKey = '';
    for (const key in result.errors) {
      firstKey = key;
      break;
    }
    const step = stepForField(firstKey);
    goToApplyStep(step, 'back');
    focusInvalid(applyFieldErrors(APPLY_STEP_FIELDS[step], result.errors));
    setFormAlert('applyAlert', 'Please check the highlighted field.', 'error');
    return;
  }
  const referenceNo = result.application.referenceNo;
  resetApplyForm();
  navigate('/submitted/' + referenceNo);
}

function renderApplyView(params) {
  byId('applyBirthDate').setAttribute('max', todayISO());
  if (params.plan && findPlan(params.plan)) {
    applyState.planId = params.plan;
    setCheckedValue('applyPlan', params.plan, byId('applyPlanChoices'));
    goToApplyStep(1, '');
  }
  updateApplySummary();
}

function initApplyView() {
  let choices = '';
  for (let i = 0; i < PLANS.length; i++) {
    choices += planChoiceCard(PLANS[i], 'applyPlan', 'apply-plan', PLANS[i].id === applyState.planId);
  }
  setHTML('applyPlanChoices', choices);
  fillBarangaySelect('applyBarangay');
  fillSelect('applyIdType', ID_TYPES, 'Choose an ID type');
  byId('applyBirthDate').setAttribute('min', '1900-01-01');

  byId('applyPlanChoices').addEventListener('change', function () {
    setFieldError('applyPlanChoices', '');
    updateApplySummary();
  });
  byId('applyBarangay').addEventListener('change', function () {
    setFieldError('applyBarangay', applyFieldError('barangay'));
    updateCoverageHint('applyBarangay', 'applyCoverageHint');
  });
  byId('applyIdPhoto').addEventListener('change', function (event) {
    const file = event.target.files && event.target.files.length > 0 ? event.target.files[0] : null;
    applyState.photo = file ? { name: file.name, type: file.type, size: file.size } : null;
    setUploadState('applyUpload', 'applyUploadTitle', 'applyUploadText', applyState.photo, 'Choose a file');
    setFieldError('applyIdPhoto', applyFieldError('idPhoto'));
  });
  const upload = byId('applyUpload');
  upload.addEventListener('dragenter', function () { upload.classList.add('is-dragover'); });
  upload.addEventListener('dragleave', function () { upload.classList.remove('is-dragover'); });
  upload.addEventListener('drop', function () { upload.classList.remove('is-dragover'); });
  byId('applyConsent').addEventListener('change', function () {
    setFieldError('applyConsent', applyFieldError('consent'));
  });

  const live = [
    ['applyFullName', 'fullName'], ['applyEmail', 'email'], ['applyMobile', 'contactNumber'], ['applyBirthDate', 'birthDate'],
    ['applyAddress', 'completeAddress'], ['applyLandmark', 'landmark'], ['applyIdNumber', 'idNumber'],
  ];
  for (let i = 0; i < live.length; i++) {
    const key = live[i][1];
    liveValidate(live[i][0], function () { return applyFieldError(key); });
  }
  byId('applyIdType').addEventListener('change', function () {
    setFieldError('applyIdType', applyFieldError('idType'));
  });

  onClick('applyNext', function () {
    setFormAlert('applyAlert', '');
    if (validateApplyStep(applyState.step)) {
      goToApplyStep(applyState.step + 1, 'forward');
    }
  });
  onClick('applyBack', function () {
    setFormAlert('applyAlert', '');
    if (applyState.step > 1) {
      goToApplyStep(applyState.step - 1, 'back');
    }
  });
  byId('applyReview').addEventListener('click', function (event) {
    const edit = findAncestorWith(event.target, 'data-edit-step', byId('applyReview'));
    if (edit) {
      goToApplyStep(Number(edit.getAttribute('data-edit-step')), 'back');
    }
  });
  byId('applyForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (applyState.step < 5) {
      if (validateApplyStep(applyState.step)) {
        goToApplyStep(applyState.step + 1, 'forward');
      }
      return;
    }
    submitApplyForm();
  });
  goToApplyStep(1, '');
  updateApplySummary();
}
