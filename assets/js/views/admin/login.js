/* ==========================================================================
   E3 Fiber Connect - views/admin/login.js
   Sign-in ng staff. Hinahanap yung e-mail gamit HASH TABLE lookup (auth.js);
   pag mali yung password, dahan-dahang nag-shake yung card, parang sa Mac login window.
   Module sa defense: Admin Login - si Dela Cruz Riceerich ang mag-eexplain.
   ========================================================================== */

'use strict';

function shakeLoginCard() {
  const card = byId('loginCard');
  card.classList.remove('is-shaking');
  void card.offsetWidth;
  card.classList.add('is-shaking');
}

function renderLoginView() {
  hideCodeNotification();
  forgotView.step = 'email';
  forgotView.code = '';
  clearPasswordReset();                       // dito natatapos yung reset na naiwan sa kalagitnaan
  const pending = routerState.pendingAdminPath;
  setFormAlert('loginAlert', pending && pending !== '/admin' ? 'Please sign in to continue.' : '', 'info');
  setFieldValue('loginPassword', '');
  setFieldError('loginEmail', '');
  setFieldError('loginPassword', '');
}

function initLoginView() {
  byId('loginForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const email = fieldValue('loginEmail');
    const password = fieldValue('loginPassword');
    setFieldError('loginEmail', isBlank(email) ? 'Enter your e-mail.' : '');
    setFieldError('loginPassword', password === '' ? 'Enter your password.' : '');
    if (isBlank(email) || password === '') {
      focusElement(isBlank(email) ? byId('loginEmail') : byId('loginPassword'));
      return;
    }
    const result = signIn(email, password);
    if (!result.ok) {
      setFormAlert('loginAlert', result.error, 'error');
      shakeLoginCard();
      byId('loginPassword').select();
      focusElement(byId('loginPassword'));
      return;
    }
    const pending = routerState.pendingAdminPath;
    routerState.pendingAdminPath = '';
    byId('loginForm').reset();
    setFormAlert('loginAlert', '');
    showToast('Welcome, ' + firstNameOf(result.staff.fullName) + '.');
    if (result.staff.mustChangePassword) {
      navigate('/admin/account');
    } else {
      navigate(pending && pending !== '/admin/login' ? pending : '/admin');
    }
  });

  onClick('loginPasswordToggle', function () {
    const input = byId('loginPassword');
    const toggle = byId('loginPasswordToggle');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    toggle.setAttribute('aria-pressed', showing ? 'false' : 'true');
    toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    toggle.innerHTML = iconHTML(showing ? 'eye' : 'eye-off');
  });

  byId('loginCard').addEventListener('animationend', function () {
    byId('loginCard').classList.remove('is-shaking');
  });
}
