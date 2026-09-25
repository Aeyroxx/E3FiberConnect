/* ==========================================================================
   E3 Fiber Connect · views/admin/twofactor.js
   The "Verify it's you" sheet for Google Authenticator (two-step verification)
   and the Two-step verification panel on the Account page.

   requireStepUp(action, then) — every account change goes through it:
     • verified in the last 5 minutes → run `then` right away;
     • 2FA already set up → ask for the 6-digit code;
     • not set up yet     → confirm the password, show the QR code, then ask for the code.

   Design notes (Apple-style): the six boxes react on every key press, jump
   forward on their own and accept a pasted / auto-filled code; the sixth digit
   submits by itself. A wrong code gives a short damped shake (a colour change
   only when "reduce motion" is on) and a light vibration on phones; a right
   code turns the boxes green with a check before the sheet closes. A ring
   shows how long the current code in the app has left.
   ========================================================================== */

'use strict';

const otpView = { mode: 'verify', onVerified: null, setupSecret: '', frame: 0, busy: false, lastSecond: -1 };
const OTP_RING_LENGTH = 50.27;   // 2 · π · r for the r = 8 timer ring

/** otpDigits — the six code boxes. O(1) */
function otpDigits() {
  return document.querySelectorAll('#otpCode .otp-digit');
}

/** otpValue — the code typed so far. O(6) */
function otpValue() {
  const digits = otpDigits();
  let code = '';
  for (let i = 0; i < digits.length; i++) {
    code += digits[i].value;
  }
  return code;
}

function clearOtpDigits() {
  const digits = otpDigits();
  for (let i = 0; i < digits.length; i++) {
    digits[i].value = '';
    digits[i].classList.remove('is-filled');
  }
}

/** fillOtpFrom — put the digits of `text` into the boxes from `index` on; returns the next empty box. O(n) */
function fillOtpFrom(index, text) {
  const digits = otpDigits();
  let at = index;
  for (let i = 0; i < text.length && at < digits.length; i++) {
    if (isDigitChar(text[i])) {
      digits[at].value = text[i];
      digits[at].classList.add('is-filled');
      at++;
    }
  }
  return at;
}

function focusOtpDigit(index) {
  const digits = otpDigits();
  const box = digits[index < digits.length ? index : digits.length - 1];
  box.focus({ preventScroll: true });
  box.select();
}

/** setOtpState — '' | 'error' | 'success' on the code boxes and the badge. O(1) */
function setOtpState(state) {
  const code = byId('otpCode');
  const sheet = byId('sheetOtp');
  code.classList.remove('is-error');
  code.classList.remove('is-success');
  sheet.classList.remove('is-verified');
  if (state === 'error') {
    void code.offsetWidth;                 // restart the shake if it is already running
    code.classList.add('is-error');
  } else if (state === 'success') {
    code.classList.add('is-success');
    sheet.classList.add('is-verified');
  }
}

function setOtpStatus(text, tone) {
  const status = byId('otpStatus');
  status.textContent = text;
  status.className = 'otp-status' + (tone ? ' text-' + tone : '');
}

/** buzz — a short vibration on phones that support it (success / error only). O(1) */
function buzz(pattern) {
  if (navigator.vibrate && !prefersReducedMotion()) {
    navigator.vibrate(pattern);
  }
}

/** qrSvg — the QR matrix as a crisp SVG with a 4-module quiet zone. O(size²) */
function qrSvg(matrix) {
  const quiet = 4;
  const full = matrix.size + quiet * 2;
  let path = '';
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) {
        path += 'M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z';
      }
    }
  }
  return '<svg viewBox="0 0 ' + full + ' ' + full + '" shape-rendering="crispEdges" aria-hidden="true" focusable="false">'
    + '<rect width="' + full + '" height="' + full + '" fill="#fff"></rect><path fill="#000" d="' + path + '"></path></svg>';
}

/* ------------------------------------------------------------- the timer */

/** tickOtpTimer — one animation frame: ring length and "New code in N s". O(1) */
function tickOtpTimer() {
  if (byId('sheetOtp').hidden) {
    otpView.frame = 0;
    return;
  }
  const now = Date.now();
  const left = TOTP_PERIOD_SECONDS - ((now / 1000) % TOTP_PERIOD_SECONDS);
  byId('otpTimerArc').style.strokeDashoffset = String(OTP_RING_LENGTH * (1 - left / TOTP_PERIOD_SECONDS));
  const seconds = Math.ceil(left);
  if (seconds !== otpView.lastSecond) {
    otpView.lastSecond = seconds;
    setText('otpCountdown', 'New code in ' + seconds + ' s');
    byId('otpTimerArc').classList.toggle('is-ending', seconds <= 5);
  }
  otpView.frame = requestAnimationFrame(tickOtpTimer);
}

function startOtpTimer() {
  if (otpView.frame) {
    cancelAnimationFrame(otpView.frame);
  }
  otpView.lastSecond = -1;
  otpView.frame = requestAnimationFrame(tickOtpTimer);
}

/* ----------------------------------------------------------- the sheet */

/**
 * openOtpSheet — mode 'verify' (type a code) or 'setup' (QR code + key, then
 * the first code). `onVerified` runs after a correct code.
 */
function openOtpSheet(mode, text, onVerified) {
  const staff = currentStaff();
  if (!staff) {
    return;
  }
  otpView.mode = mode;
  otpView.onVerified = onVerified;
  otpView.busy = false;
  const setup = mode === 'setup';
  const askPassword = setup;                        // setup always starts with the password: prove it's them
  setText('otpTitle', setup ? 'Set up Google Authenticator' : 'Verify it’s you');
  setText('otpText', text);
  setText('otpSubmit', setup ? 'Turn on and continue' : 'Verify');
  toggleElement(byId('otpPasswordForm'), askPassword);
  toggleElement(byId('otpSetup'), false);
  toggleElement(byId('otpForm'), !askPassword);
  byId('otpPassword').value = '';
  setFieldError('otpPassword', '');
  wipeOtpSetup();
  clearOtpDigits();
  setOtpState('');
  setOtpStatus('', '');
  openSheet('sheetOtp', document.activeElement);
  startOtpTimer();
  setTimeout(function () {                // after the sheet's own focus: go to the first field when it is on screen
    if (askPassword) {
      focusElement(byId('otpPassword'));
    } else {
      focusFirstOtpDigit();
    }
  }, 60);
}

/** showOtpSetupStep — the QR code, the phone link and the setup key for a started setup. O(size²) */
function showOtpSetupStep(started) {
  otpView.setupSecret = started.secret;
  setHTML('otpQr', qrSvg(makeQrMatrix(started.uri)));
  setText('otpKey', started.key);
  byId('otpOpenApp').setAttribute('href', started.uri);   // on a phone: open the app directly instead of scanning
  toggleElement(byId('otpSetup'), true);
  toggleElement(byId('otpForm'), true);
}

/** wipeOtpSetup — take the secret off the page (QR, key, link) and forget an unfinished setup. O(1) */
function wipeOtpSetup() {
  otpView.setupSecret = '';
  setHTML('otpQr', '');
  setText('otpKey', '—');
  byId('otpOpenApp').setAttribute('href', '#');
  if (otpView.mode === 'setup') {
    clearPendingSetup();
  }
}

/** focusFirstOtpDigit — only when the box is on screen; on a phone, setup waits so the keyboard doesn't cover the QR code. */
function focusFirstOtpDigit() {
  const first = otpDigits()[0];
  const body = qs('.sheet-body', byId('sheetOtp'));
  if (isInsideBox(first, body) && !(otpView.mode === 'setup' && isSmallScreen())) {
    focusOtpDigit(0);
  }
}

/** submitOtpPassword — first setup, step 1: the password unlocks the QR code. */
function submitOtpPassword() {
  const input = byId('otpPassword');
  const started = startTotpSetup(currentStaff(), input.value);
  input.value = '';
  if (!started.ok) {
    setFieldError('otpPassword', started.error);
    buzz([30, 40, 30]);
    focusElement(input);
    return;
  }
  setFieldError('otpPassword', '');
  toggleElement(byId('otpPasswordForm'), false);
  showOtpSetupStep(started);
  focusFirstOtpDigit();
}

/**
 * requireStepUp — run `then` only after a Google Authenticator code (or right
 * away inside the 5-minute window). `action` completes "… to <action>".
 */
function requireStepUp(action, then) {
  const staff = currentStaff();
  if (!staff) {
    return;
  }
  if (stepUpActive()) {
    then();
    return;
  }
  if (staff.totpEnabled) {
    openOtpSheet('verify', 'Enter the 6-digit code from Google Authenticator to ' + action + '.', then);
  } else {
    openOtpSheet('setup', 'Account changes are protected with Google Authenticator. Set it up once to ' + action + ' — it takes about a minute.', then);
  }
}

/** submitOtp — check the six digits (setup: confirm the new secret; verify: open the 5-minute window). */
function submitOtp() {
  if (otpView.busy) {
    return;
  }
  const staff = currentStaff();
  const code = otpValue();
  const result = otpView.mode === 'setup' ? confirmTotpSetup(staff, code) : verifyStepUp(staff, code);
  if (!result.ok) {
    setOtpState('error');
    setOtpStatus(result.error, 'red');
    buzz([30, 40, 30]);
    setTimeout(function () {
      clearOtpDigits();
      focusOtpDigit(0);
    }, prefersReducedMotion() ? 0 : 420);
    return;
  }
  otpView.busy = true;
  setOtpState('success');
  setOtpStatus(otpView.mode === 'setup' ? 'Google Authenticator is set up.' : 'Verified.', 'green');
  buzz(15);
  setTimeout(function () {
    const then = otpView.onVerified;
    otpView.onVerified = null;
    closeSheet('sheetOtp');
    if (then) {
      then();
    }
  }, prefersReducedMotion() ? 250 : 650);
}

/* -------------------------------------------------- the Account page panel */

/** renderTwoFactorPanel — status and the one action that fits it. O(1) */
function renderTwoFactorPanel() {
  const staff = currentStaff();
  if (!staff) {
    return;
  }
  if (staff.totpEnabled) {
    const windowText = stepUpActive() ? ' Verified — no code needed for the next ' + pluralize(stepUpMinutesLeft(), 'minute') + '.' : '';
    setHTML('accountTwoFactor',
      '<div class="twofactor-row"><span class="icon-bubble tone-green">' + iconHTML('shield') + '</span><div class="min-w-0">'
      + '<p class="twofactor-title">On · Google Authenticator</p>'
      + '<p class="caption-text">Password and account changes ask for a code from the app. Turned on ' + escapeHTML(formatDate(staff.totpEnabledAt)) + '.' + escapeHTML(windowText) + '</p></div></div>'
      + '<button class="btn btn-gray btn-sm mt-3" type="button" data-action="move-2fa">' + iconHTML('phone') + 'Move to a new phone</button>');
  } else {
    setHTML('accountTwoFactor',
      '<div class="twofactor-row"><span class="icon-bubble tone-orange">' + iconHTML('shield') + '</span><div class="min-w-0">'
      + '<p class="twofactor-title">Not set up</p>'
      + '<p class="caption-text">Protect password and account changes with a 6-digit code from Google Authenticator on your phone. You’ll be asked to set it up the first time you change something.</p></div></div>'
      + '<button class="btn btn-accent btn-sm mt-3" type="button" data-action="setup-2fa">' + iconHTML('shield') + 'Set up Google Authenticator</button>');
  }
}

function initTwoFactorView() {
  const code = byId('otpCode');
  code.addEventListener('input', function (event) {
    const box = event.target;
    const index = Number(box.getAttribute('data-index'));
    const typed = box.value;
    box.value = '';
    box.classList.remove('is-filled');
    if (code.classList.contains('is-error')) {
      setOtpState('');
      setOtpStatus('', '');
    }
    const next = fillOtpFrom(index, typed);     // one digit, or a whole code from auto-fill
    if (otpValue().length === TOTP_DIGITS) {
      submitOtp();
    } else if (next > index) {
      focusOtpDigit(next);
    }
  });
  code.addEventListener('keydown', function (event) {
    const index = Number(event.target.getAttribute('data-index'));
    if (event.key === 'Backspace' && event.target.value === '' && index > 0) {
      event.preventDefault();
      const digits = otpDigits();
      digits[index - 1].value = '';
      digits[index - 1].classList.remove('is-filled');
      focusOtpDigit(index - 1);
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusOtpDigit(index - 1);
    } else if (event.key === 'ArrowRight' && index < TOTP_DIGITS - 1) {
      event.preventDefault();
      focusOtpDigit(index + 1);
    }
  });
  code.addEventListener('paste', function (event) {
    const text = event.clipboardData ? event.clipboardData.getData('text') : '';
    event.preventDefault();
    clearOtpDigits();
    const next = fillOtpFrom(0, text);
    if (otpValue().length === TOTP_DIGITS) {
      submitOtp();
    } else {
      focusOtpDigit(next);
    }
  });
  code.addEventListener('focusin', function (event) {
    if (event.target.select) {
      event.target.select();
    }
  });
  byId('otpForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (otpValue().length < TOTP_DIGITS) {
      setOtpState('error');
      setOtpStatus('Enter all 6 digits from Google Authenticator.', 'red');
      return;
    }
    submitOtp();
  });
  onClick('otpCopyKey', function () {
    copyToClipboard(otpView.setupSecret, function (copied) {
      showToast(copied ? 'Setup key copied' : 'Couldn’t copy — type it from the screen', { tone: copied ? 'success' : 'error' });
    });
  });
  byId('otpPasswordForm').addEventListener('submit', function (event) {
    event.preventDefault();
    submitOtpPassword();
  });
  byId('sheetOtp').addEventListener('sheetclose', function () {
    byId('otpPassword').value = '';
    wipeOtpSetup();
    if (otpView.frame) {
      cancelAnimationFrame(otpView.frame);
      otpView.frame = 0;
    }
    otpView.onVerified = null;     // closing without a code cancels the change
  });
  onAction(byId('accountTwoFactor'), function (action) {
    if (action === 'setup-2fa') {
      openOtpSheet('setup', 'Confirm your password, then scan the QR code with Google Authenticator and type the 6-digit code it shows.', function () {
        announceTwoFactor('Google Authenticator is on — account changes now ask for a code.');
      });
    } else if (action === 'move-2fa') {
      requireStepUp('move Google Authenticator to a new phone', function () {
        setTimeout(function () {
          openOtpSheet('setup', 'Confirm your password, then scan the new QR code with Google Authenticator on your new phone and type its code. The old phone stops working.', function () {
            announceTwoFactor('Google Authenticator moved to your new phone.');
          });
        }, 320);
      });
    }
  });
}

function announceTwoFactor(message) {
  showToast(message, { tone: 'success' });
  renderTwoFactorPanel();
}
