/* ==========================================================================
   E3 Fiber Connect - views/admin/twofactor.js
   Dito yung "Verify it's you" sheet para sa Google Authenticator (two-step
   verification) at yung Two-step verification panel sa Account page.

   requireStepUp(action, then) - lahat ng account change dadaan dito:
     - na-verify na sa loob ng 5 minutes -> run agad yung `then`;
     - naka-setup na yung 2FA -> hihingin yung 6-digit code;
     - wala pang setup -> password muna, tapos ipapakita yung QR code, saka hihingin yung code.

   Notes sa design (Apple-style): yung anim na box nagre-react sa bawat pindot,
   kusang lumilipat sa susunod at tumatanggap ng pasted / auto-filled na code;
   pag na-type na yung pang-anim na digit, kusa na siyang nagsu-submit. Pag mali
   yung code, may maikling shake (kulay lang ang nagbabago pag naka-on yung
   "reduce motion") at konting vibrate sa phone; pag tama, nagiging green yung
   mga box na may check bago magsara yung sheet. Yung ring naman pinapakita kung
   gaano pa katagal bago mag-expire yung current code sa app.
   ========================================================================== */

'use strict';

const otpView = { mode: 'verify', onVerified: null, setupSecret: '', frame: 0, busy: false, lastSecond: -1 };
const OTP_RING_LENGTH = 50.27;   // 2 x pi x r para sa timer ring na r = 8

/* Yung anim na box gumagamit ng shared helpers sa ui/codeboxes.js. */
function otpDigits() {
  return codeBoxes(byId('otpCode'));
}

function otpValue() {
  return codeBoxesValue(byId('otpCode'));
}

function clearOtpDigits() {
  clearCodeBoxes(byId('otpCode'));
}

function focusOtpDigit(index) {
  focusCodeBox(byId('otpCode'), index);
}

/** setOtpState - nilalagay yung '' | 'error' | 'success' sa mga code box at sa badge. O(1) */
function setOtpState(state) {
  setCodeBoxesState(byId('otpCode'), state);
  byId('sheetOtp').classList.toggle('is-verified', state === 'success');
}

function setOtpStatus(text, tone) {
  const status = byId('otpStatus');
  status.textContent = text;
  status.className = 'otp-status' + (tone ? ' text-' + tone : '');
}

/** buzz - maikling vibrate sa phone na kaya ito (pag success / error lang). O(1) */
function buzz(pattern) {
  if (navigator.vibrate && !prefersReducedMotion()) {
    navigator.vibrate(pattern);
  }
}

/** qrSvg - ginagawang malinaw na SVG yung QR matrix, may 4-module na quiet zone. O(n²) */
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

/* ------------------------------------------------------------- yung timer */

/** tickOtpTimer - isang animation frame: haba ng ring at yung "New code in N s". O(1) */
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

/* ----------------------------------------------------------- yung sheet */

/**
 * openOtpSheet - mode 'verify' (magta-type ng code) o 'setup' (QR code + key,
 * tapos yung unang code). Tatakbo yung `onVerified` pag tama na yung code.
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
  const askPassword = setup;                        // sa setup laging password muna, para sure na sila talaga yun
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
  setTimeout(function () {                // pagkatapos ng sariling focus ng sheet: punta sa unang field kung nasa screen na
    if (askPassword) {
      focusElement(byId('otpPassword'));
    } else {
      focusFirstOtpDigit();
    }
  }, 60);
}

/** showOtpSetupStep - pinapakita yung QR code, phone link at setup key ng sinimulang setup. O(n²) */
function showOtpSetupStep(started) {
  otpView.setupSecret = started.secret;
  setHTML('otpQr', qrSvg(makeQrMatrix(started.uri)));
  setText('otpKey', started.key);
  byId('otpOpenApp').setAttribute('href', started.uri);   // pag naka-phone: buksan na lang diretso yung app imbes na i-scan
  toggleElement(byId('otpSetup'), true);
  toggleElement(byId('otpForm'), true);
}

/** wipeOtpSetup - tanggalin sa page yung secret (QR, key, link) at kalimutan yung hindi natapos na setup. O(1) */
function wipeOtpSetup() {
  otpView.setupSecret = '';
  setHTML('otpQr', '');
  setText('otpKey', '—');
  byId('otpOpenApp').setAttribute('href', '#');
  if (otpView.mode === 'setup') {
    clearPendingSetup();
  }
}

/** focusFirstOtpDigit - kapag nasa screen lang yung box; sa phone, naghihintay muna yung setup para hindi matakpan ng keyboard yung QR code. */
function focusFirstOtpDigit() {
  const first = otpDigits()[0];
  const body = qs('.sheet-body', byId('sheetOtp'));
  if (isInsideBox(first, body) && !(otpView.mode === 'setup' && isSmallScreen())) {
    focusOtpDigit(0);
  }
}

/** submitOtpPassword - first setup, step 1: yung password ang magbubukas ng QR code. */
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
 * requireStepUp - run lang yung `then` pag may Google Authenticator code na
 * (o diretso na kung nasa loob pa ng 5-minute window). Yung `action` ang
 * dudugtong sa "... to <action>".
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

/** submitOtp - i-check yung anim na digit (setup: i-confirm yung bagong secret; verify: buksan yung 5-minute window). */
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

/* -------------------------------------------------- yung panel sa Account page */

/** renderTwoFactorPanel - status at yung isang action na bagay dito. O(1) */
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
  wireCodeBoxes(byId('otpCode'), submitOtp, function () {
    setOtpState('');
    setOtpStatus('', '');
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
    otpView.onVerified = null;     // pag sinara nang walang code, cancel yung change
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
