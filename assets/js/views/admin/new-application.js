/* ==========================================================================
   E3 Fiber Connect · views/admin/new-application.js
   Walk-in application typed by staff. Same validator as the public form, plus
   a custom-price option and an "I checked the original ID" confirmation.
   Defense module: Walk-in override (New Application) — presented by Justin Banaag.
   ========================================================================== */

'use strict';

const newApplicationState = { photo: null };

const NEW_APP_FIELDS = {
  planId: 'newAppPlanChoices', customPrice: 'newAppCustomPrice',
  fullName: 'newAppFullName', email: 'newAppEmail', contactNumber: 'newAppMobile', birthDate: 'newAppBirthDate',
  barangay: 'newAppBarangay', completeAddress: 'newAppAddress', landmark: 'newAppLandmark',
  idType: 'newAppIdType', idNumber: 'newAppIdNumber', idPhoto: 'newAppIdPhoto', idChecked: 'newAppIdChecked',
  consent: 'newAppConsent',
};

function readNewApplicationForm() {
  const photo = newApplicationState.photo;
  return {
    planId: checkedValue('newAppPlan', byId('newAppPlanChoices')),
    customPrice: fieldValue('newAppCustomPrice'),
    fullName: fieldValue('newAppFullName'),
    email: fieldValue('newAppEmail'),
    contactNumber: fieldValue('newAppMobile'),
    birthDate: fieldValue('newAppBirthDate'),
    barangay: fieldValue('newAppBarangay'),
    completeAddress: fieldValue('newAppAddress'),
    landmark: fieldValue('newAppLandmark'),
    idType: fieldValue('newAppIdType'),
    idNumber: fieldValue('newAppIdNumber'),
    idPhotoName: photo ? photo.name : '',
    idPhotoType: photo ? photo.type : '',
    idPhotoSize: photo ? photo.size : 0,
    idChecked: isChecked('newAppIdChecked'),
    consent: isChecked('newAppConsent'),
  };
}

function newApplicationFieldError(key) {
  return validateApplication(readNewApplicationForm(), 'walk-in')[key] || '';
}

function updateNewApplicationSummary() {
  const data = readNewApplicationForm();
  const isCustom = data.planId === 'custom';
  toggleElement(byId('newAppCustomField'), isCustom);
  const price = planPrice(data.planId, data.customPrice);
  setHTML('newAppSummary',
    kvRow('Plan', escapeHTML(data.planId ? planName(data.planId) : 'Not chosen'))
    + kvRow('Monthly price', price > 0 ? formatPeso(price) : '—')
    + kvRow('Source', 'Walk-in')
    + kvRow('Queue position', 'No. ' + (queueSize(buildReviewQueue()) + 1)));
}

function resetNewApplicationForm() {
  byId('newAppForm').reset();
  newApplicationState.photo = null;
  setUploadState('newAppUpload', 'newAppUploadTitle', 'newAppUploadText', null, 'Choose a file');
  clearFieldErrors(NEW_APP_FIELDS);
  setFormAlert('newAppAlert', '');
  updateCoverageHint('newAppBarangay', 'newAppCoverageHint');
  updateNewApplicationSummary();
}

function renderNewApplicationView() {
  renderAdminChrome();
  byId('newAppBirthDate').setAttribute('max', todayISO());
  updateNewApplicationSummary();
}

function initNewApplicationView() {
  let choices = '';
  for (let i = 0; i < PLANS.length; i++) {
    choices += planChoiceCard(PLANS[i], 'newAppPlan', 'new-app-plan', false);
  }
  choices += customPlanChoiceCard('newAppPlan', 'new-app-plan', false);
  setHTML('newAppPlanChoices', choices);
  fillBarangaySelect('newAppBarangay');
  fillSelect('newAppIdType', ID_TYPES, 'Choose an ID type');
  byId('newAppBirthDate').setAttribute('min', '1900-01-01');

  byId('newAppPlanChoices').addEventListener('change', function () {
    setFieldError('newAppPlanChoices', '');
    updateNewApplicationSummary();
    if (checkedValue('newAppPlan', byId('newAppPlanChoices')) === 'custom') {
      focusElement(byId('newAppCustomPrice'));
    }
  });
  byId('newAppCustomPrice').addEventListener('input', updateNewApplicationSummary);
  byId('newAppBarangay').addEventListener('change', function () {
    setFieldError('newAppBarangay', newApplicationFieldError('barangay'));
    updateCoverageHint('newAppBarangay', 'newAppCoverageHint');
  });
  byId('newAppIdPhoto').addEventListener('change', function (event) {
    const file = event.target.files && event.target.files.length > 0 ? event.target.files[0] : null;
    newApplicationState.photo = file ? { name: file.name, type: file.type, size: file.size } : null;
    setUploadState('newAppUpload', 'newAppUploadTitle', 'newAppUploadText', newApplicationState.photo, 'Choose a file');
    setFieldError('newAppIdPhoto', newApplicationFieldError('idPhoto'));
  });
  byId('newAppIdChecked').addEventListener('change', function () {
    setFieldError('newAppIdChecked', newApplicationFieldError('idChecked'));
  });
  byId('newAppConsent').addEventListener('change', function () {
    setFieldError('newAppConsent', newApplicationFieldError('consent'));
  });
  byId('newAppIdType').addEventListener('change', function () {
    setFieldError('newAppIdType', newApplicationFieldError('idType'));
  });
  const live = [
    ['newAppFullName', 'fullName'], ['newAppEmail', 'email'], ['newAppMobile', 'contactNumber'], ['newAppBirthDate', 'birthDate'],
    ['newAppAddress', 'completeAddress'], ['newAppLandmark', 'landmark'], ['newAppIdNumber', 'idNumber'], ['newAppCustomPrice', 'customPrice'],
  ];
  for (let i = 0; i < live.length; i++) {
    const key = live[i][1];
    liveValidate(live[i][0], function () { return newApplicationFieldError(key); });
  }

  byId('newAppForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const result = submitApplication(readNewApplicationForm(), 'walk-in', currentStaff());
    if (!result.ok) {
      setFormAlert('newAppAlert', 'Please check the highlighted fields.', 'error');
      focusInvalid(applyFieldErrors(NEW_APP_FIELDS, result.errors));
      return;
    }
    const app = result.application;
    resetNewApplicationForm();
    announce('Created walk-in application for ' + app.fullName);
    navigate('/admin/applications/' + app.referenceNo);
  });
  updateNewApplicationSummary();
}
