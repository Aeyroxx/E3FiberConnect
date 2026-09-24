/* ==========================================================================
   E3 Fiber Connect · views/admin/register.js
   "Request staff access": a new employee asks for an account. The request is
   checked field by field (backend/registrations.js), stored with a salted
   password hash, and joins the approval QUEUE that Owners and Admins work
   through on the Registrations page.
   Defense module: Admin Registration — presented by Dela Cruz Riceerich.
   ========================================================================== */

'use strict';

const REGISTER_FIELDS = {
  fullName: 'registerName', email: 'registerEmail', mobile: 'registerMobile', role: 'registerRoles',
  note: 'registerNote', password: 'registerPassword', confirmPassword: 'registerConfirm', agree: 'registerAgree',
};
const REGISTER_ROLE_TEXT = [
  { role: 'Support', text: 'Applications, subscribers, billing, payments and support tickets.' },
  { role: 'Admin', text: 'Everything in Support, plus managing staff and approving requests.' },
];

/** registerFormData — the form as a plain record for submitRegistration. */
function registerFormData() {
  return {
    fullName: fieldValue('registerName'),
    email: fieldValue('registerEmail'),
    mobile: fieldValue('registerMobile'),
    role: checkedValue('registerRole', byId('registerRoles')),
    note: fieldValue('registerNote'),
    password: fieldValue('registerPassword'),
    confirmPassword: fieldValue('registerConfirm'),
    agree: isChecked('registerAgree'),
  };
}

/** showRegisterForm — a fresh form every time the screen opens. */
function showRegisterForm() {
  byId('registerForm').reset();              // nothing typed earlier (or a password) is left behind
  clearFieldErrors(REGISTER_FIELDS);
  setRegisterPasswordsVisible(false);
  toggleElement(byId('registerFormView'), true);
  toggleElement(byId('registerDoneView'), false);
  setFormAlert('registerAlert', '');
}

function renderRegisterView() {
  showRegisterForm();
}

function setRegisterPasswordsVisible(visible) {
  byId('registerPassword').type = visible ? 'text' : 'password';
  byId('registerConfirm').type = visible ? 'text' : 'password';
  const toggle = byId('registerPasswordToggle');
  toggle.setAttribute('aria-pressed', visible ? 'true' : 'false');
  toggle.setAttribute('aria-label', visible ? 'Hide passwords' : 'Show passwords');
  toggle.innerHTML = iconHTML(visible ? 'eye-off' : 'eye');
}

function initRegisterView() {
  let roles = '';
  for (let i = 0; i < REGISTER_ROLE_TEXT.length; i++) {
    const option = REGISTER_ROLE_TEXT[i];
    roles += compactChoice('registerRole', 'register-role-' + i, option.role, option.role, option.text, false, false);
  }
  setHTML('registerRoles', roles);
  byId('registerRoles').addEventListener('change', function () {
    setFieldError('registerRoles', '');
  });

  const live = [['registerName', 'fullName'], ['registerEmail', 'email'], ['registerMobile', 'mobile'], ['registerNote', 'note'], ['registerPassword', 'password'], ['registerConfirm', 'confirmPassword']];
  for (let i = 0; i < live.length; i++) {
    const key = live[i][1];
    liveValidate(live[i][0], function () {
      return validateRegistration(registerFormData())[key] || '';
    });
  }
  byId('registerAgree').addEventListener('change', function () {
    if (isChecked('registerAgree')) {
      setFieldError('registerAgree', '');
    }
  });

  onClick('registerPasswordToggle', function () {
    setRegisterPasswordsVisible(byId('registerPassword').type === 'password');
  });

  byId('registerForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const result = submitRegistration(registerFormData());
    if (!result.ok) {
      focusInvalid(applyFieldErrors(REGISTER_FIELDS, result.errors));
      return;
    }
    const request = result.registration;
    const place = queueSize(registrationQueue());
    clearFieldErrors(REGISTER_FIELDS);
    byId('registerForm').reset();
    setRegisterPasswordsVisible(false);
    setText('registerDoneRef', request.registrationId);
    setText('registerDoneText', 'Thanks, ' + firstNameOf(request.fullName) + '. Your request for ' + request.role + ' access is number ' + place + ' in the approval queue.');
    toggleElement(byId('registerFormView'), false);
    toggleElement(byId('registerDoneView'), true);
    byId('registerDoneTitle').setAttribute('tabindex', '-1');
    focusElement(byId('registerDoneTitle'));
    window.scrollTo(0, 0);
  });

  onClick('registerAnother', function () {
    showRegisterForm();
    focusElement(byId('registerName'));
  });
}
