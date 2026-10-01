/* ==========================================================================
   E3 Fiber Connect - views/admin/forgot.js
   "Forgot password" - e-mail -> 6-digit code -> bagong password -> tapos.

   Dumarating yung code na parang message sa phone: may banner na bumababa
   galing sa taas ng screen ilang saglit pagkatapos pindutin yung "Send code".
   Pag tinap, mapupuno yung anim na box (parang one-time-code suggestion sa
   iPhone); pag hinila pataas, mawawala siya. Pareho lang yung anim na box sa
   Google Authenticator sheet (ui/codeboxes.js); yung mga check nasa
   backend/recovery.js.
   ========================================================================== */

'use strict';

const forgotView = { step: 'email', email: '', code: '', bannerTimer: 0, resendTimer: 0, resendLeft: 0 };
const FORGOT_PASSWORD_FIELDS = { newPassword: 'forgotNewPassword', confirmPassword: 'forgotConfirmPassword' };
const NOTIFY_SHOW_MS = 12000;

/** forgotPageOpen - nasa screen yung reset page at nasa code step (doon lang pwede lumabas yung banner). O(1) */
function forgotPageOpen() {
  return !qs('[data-view="admin-forgot"]').hidden && forgotView.step === 'code';
}

/** showForgotStep - isa sa 'email' | 'code' | 'password' | 'done', naka-focus sa unang control nito. */
function showForgotStep(step) {
  forgotView.step = step;
  toggleElement(byId('forgotStepEmail'), step === 'email');
  toggleElement(byId('forgotStepCode'), step === 'code');
  toggleElement(byId('forgotStepPassword'), step === 'password');
  toggleElement(byId('forgotStepDone'), step === 'done');
  toggleElement(byId('forgotBack'), step !== 'done');
  byId('forgotCard').classList.toggle('is-done', step === 'done');
  setTimeout(function () {
    if (step === 'email') {
      focusElement(byId('forgotEmail'));
    } else if (step === 'code') {
      focusCodeBox(byId('forgotCode'), 0);
    } else if (step === 'password') {
      focusElement(byId('forgotNewPassword'));
    } else {
      focusElement(byId('forgotSignIn'));
    }
  }, 60);
}

/* ------------------------------------------------ yung message banner */

/** groupedCode - "048213" -> "048 213", para mas madaling basahin. O(1) */
function groupedCode(code) {
  return textSlice(code, 0, 3) + ' ' + textSlice(code, 3, 6);
}

/** showCodeNotification - "dumating" na yung code: bababa yung banner galing sa taas. */
function showCodeNotification(message) {
  const banner = byId('notifyBanner');
  forgotView.code = message.code;
  setText('notifyTitle', 'Password reset code');
  setText('notifyMessage', groupedCode(message.code) + ' is your code to reset your E3 Fiber Connect password. It expires in ' + message.minutes + ' minutes. Don’t share it with anyone.');
  banner.hidden = false;
  banner.style.transform = '';
  void banner.offsetWidth;                  // simulan yung slide mula sa itaas ng screen
  banner.classList.add('is-open');
  if (navigator.vibrate && !prefersReducedMotion()) {
    navigator.vibrate(12);
  }
  clearTimeout(forgotView.bannerTimer);
  forgotView.bannerTimer = setTimeout(hideCodeNotification, NOTIFY_SHOW_MS);
}

/** hideCodeNotification - ibalik pataas yung banner kung saan siya galing. */
function hideCodeNotification() {
  const banner = byId('notifyBanner');
  clearTimeout(forgotView.bannerTimer);
  if (banner.hidden) {
    return;
  }
  banner.classList.remove('is-open');
  banner.style.transform = '';
  setTimeout(function () {
    if (!banner.classList.contains('is-open')) {
      banner.hidden = true;
      setText('notifyMessage', '');           // hindi dapat maiwan yung code sa page
    }
  }, prefersReducedMotion() ? 0 : 420);
}

/** fillFromNotification - pag tinap yung banner, ilalagay yung code sa mga box tapos i-check. */
function fillFromNotification() {
  const code = forgotView.code;
  hideCodeNotification();
  if (!forgotPageOpen() || code === '') {
    return;
  }
  const group = byId('forgotCode');
  clearCodeBoxes(group);
  fillCodeBoxes(group, 0, code);
  submitForgotCode();
}

/** wireNotificationDrag - hilahin pataas yung banner para mawala; pag konting hila pababa, uunat lang tapos babalik. */
function wireNotificationDrag() {
  const banner = byId('notifyBanner');
  const drag = { active: false, startY: 0, dy: 0 };
  banner.addEventListener('pointerdown', function (event) {
    drag.active = true;
    drag.startY = event.clientY;
    drag.dy = 0;
    banner.classList.add('is-dragging');
    clearTimeout(forgotView.bannerTimer);
  });
  banner.addEventListener('pointermove', function (event) {
    if (!drag.active) {
      return;
    }
    drag.dy = event.clientY - drag.startY;
    if (Math.abs(drag.dy) > 6 && !banner.hasPointerCapture(event.pointerId)) {
      banner.setPointerCapture(event.pointerId);        // sundan pa rin yung daliri kahit lumabas na sa banner
    }
    const y = drag.dy < 0 ? drag.dy : drag.dy * 0.25;    // pigilan pababa, wala naman siyang mapupuntahan
    banner.style.transform = 'translateY(' + y + 'px)';
  });
  function endDrag() {
    if (!drag.active) {
      return;
    }
    drag.active = false;
    banner.classList.remove('is-dragging');
    if (drag.dy < -30) {
      hideCodeNotification();
    } else {
      banner.style.transform = '';
      forgotView.bannerTimer = setTimeout(hideCodeNotification, NOTIFY_SHOW_MS);
    }
  }
  banner.addEventListener('pointerup', endDrag);
  banner.addEventListener('pointercancel', endDrag);
  onClick('notifyCard', function () {
    if (Math.abs(drag.dy) <= 6) {                        // tap ito, hindi dulo ng drag
      fillFromNotification();
    }
  });
}

/* ------------------------------------------------ countdown ng resend */

/** tickResend - "Resend code in 12 s", tapos babalik yung button. Isang tawag kada segundo. */
function tickResend() {
  const button = byId('forgotResend');
  if (forgotView.resendLeft <= 0 || byId('forgotStepCode').hidden) {
    button.disabled = false;
    button.textContent = 'Resend code';
    return;
  }
  button.disabled = true;
  button.textContent = 'Resend code in ' + forgotView.resendLeft + ' s';
  forgotView.resendLeft = forgotView.resendLeft - 1;
  forgotView.resendTimer = setTimeout(tickResend, 1000);
}

function startResendCountdown() {
  clearTimeout(forgotView.resendTimer);
  forgotView.resendLeft = RESET_RESEND_SECONDS;
  tickResend();
}

/* ------------------------------------------------ yung mga step */

/** sendResetCode - humingi ng code sa backend; ilang saglit pa bago dumating yung message. */
function sendResetCode(email) {
  const result = requestPasswordReset(email);
  if (!result.ok) {
    return result;
  }
  forgotView.email = email;
  forgotView.code = '';
  setText('forgotCodeText', 'If ' + result.sentTo + ' belongs to a staff account, a 6-digit code is on its way. It expires in ' + RESET_CODE_MINUTES + ' minutes.');
  if (result.message) {
    const message = result.message;
    setTimeout(function () {
      if (forgotPageOpen()) {                  // umalis na sa page o naka-sign in na habang naghihintay: hindi na ipapakita yung message
        showCodeNotification(message);
      }
    }, prefersReducedMotion() ? 300 : 1100);
  }
  return result;
}

/** submitForgotCode - i-check yung anim na digit; pag tama, tuloy na sa bagong password. */
function submitForgotCode() {
  const group = byId('forgotCode');
  const result = verifyResetCode(codeBoxesValue(group));
  const status = byId('forgotCodeStatus');
  if (!result.ok) {
    setCodeBoxesState(group, 'error');
    status.textContent = result.error;
    status.className = 'otp-status text-red';
    buzz([30, 40, 30]);
    setTimeout(function () {
      clearCodeBoxes(group);
      focusCodeBox(group, 0);
    }, prefersReducedMotion() ? 0 : 420);
    return;
  }
  hideCodeNotification();
  forgotView.code = '';
  setCodeBoxesState(group, 'success');
  status.textContent = 'Verified.';
  status.className = 'otp-status text-green';
  buzz(15);
  setTimeout(function () {
    setFieldValue('forgotPasswordUser', forgotView.email);
    clearCodeBoxes(group);
    showForgotStep('password');
  }, prefersReducedMotion() ? 200 : 600);
}

function resetForgotCodeStep() {
  const group = byId('forgotCode');
  clearCodeBoxes(group);
  setCodeBoxesState(group, '');
  byId('forgotCodeStatus').textContent = '';
}

function renderForgotView() {
  clearPasswordReset();
  hideCodeNotification();
  clearTimeout(forgotView.resendTimer);
  forgotView.email = '';
  forgotView.code = '';
  setFormAlert('forgotAlert', '');
  setFormAlert('forgotPasswordAlert', '');
  setFieldError('forgotEmail', '');
  setFieldValue('forgotEmail', fieldValue('loginEmail'));    // dalhin yung na-type na sa sign-in page
  setFieldValue('forgotNewPassword', '');
  setFieldValue('forgotConfirmPassword', '');
  clearFieldErrors(FORGOT_PASSWORD_FIELDS);
  resetForgotCodeStep();
  showForgotStep('email');
}

function initForgotView() {
  byId('forgotEmailForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const email = fieldValue('forgotEmail');
    const result = sendResetCode(email);
    if (!result.ok) {
      setFieldError('forgotEmail', result.error);
      focusElement(byId('forgotEmail'));
      return;
    }
    setFieldError('forgotEmail', '');
    resetForgotCodeStep();
    showForgotStep('code');
    startResendCountdown();
  });

  wireCodeBoxes(byId('forgotCode'), submitForgotCode, function () {
    setCodeBoxesState(byId('forgotCode'), '');
    byId('forgotCodeStatus').textContent = '';
  });
  byId('forgotCodeForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (codeBoxesValue(byId('forgotCode')).length < CODE_LENGTH) {
      setCodeBoxesState(byId('forgotCode'), 'error');
      byId('forgotCodeStatus').textContent = 'Enter all 6 digits.';
      byId('forgotCodeStatus').className = 'otp-status text-red';
      return;
    }
    submitForgotCode();
  });

  onClick('forgotResend', function () {
    const result = sendResetCode(forgotView.email);
    if (!result.ok) {
      showToast(result.error, { tone: 'error' });
      return;
    }
    hideCodeNotification();
    resetForgotCodeStep();
    focusCodeBox(byId('forgotCode'), 0);
    showToast('A new code is on its way', { tone: 'info' });
    startResendCountdown();
  });
  onClick('forgotChangeEmail', function () {
    clearPasswordReset();
    hideCodeNotification();
    clearTimeout(forgotView.resendTimer);
    showForgotStep('email');
  });

  byId('forgotPasswordForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const result = completePasswordReset(fieldValue('forgotNewPassword'), fieldValue('forgotConfirmPassword'));
    if (!result.ok) {
      if (result.error) {
        setFormAlert('forgotPasswordAlert', result.error, 'error');
      }
      focusInvalid(applyFieldErrors(FORGOT_PASSWORD_FIELDS, result.errors));
      return;
    }
    setFieldValue('forgotNewPassword', '');
    setFieldValue('forgotConfirmPassword', '');
    setFieldValue('loginEmail', result.email);                 // ready na sa sign-in page
    showForgotStep('done');
  });

  wireNotificationDrag();
}
