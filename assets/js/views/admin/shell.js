/* ==========================================================================
   E3 Fiber Connect - views/admin/shell.js
   Ito yung admin frame na share ng lahat ng admin screen: sidebar (drawer
   pag maliit yung screen), mga counter, yung Undo button (sinisilip yung
   undo stack), label ng Back button (sinisilip yung back stack), table rows
   na pwedeng i-click, isang shared "Are you sure?" sheet at keyboard
   shortcuts (Ctrl/Cmd+Z, "/" para mag-search).
   ========================================================================== */

'use strict';

const adminShellState = { drawerOpen: false, confirmAction: null };

// activity kind -> icon + kulay (linear search; 8 entries)
const ACTIVITY_KINDS = [
  { kind: 'application', icon: 'doc', tone: 'blue' },
  { kind: 'subscriber', icon: 'users', tone: 'green' },
  { kind: 'billing', icon: 'receipt', tone: 'orange' },
  { kind: 'payment', icon: 'card', tone: 'teal' },
  { kind: 'ticket', icon: 'chat', tone: 'purple' },
  { kind: 'staff', icon: 'user', tone: 'gray' },
  { kind: 'auth', icon: 'lock', tone: 'gray' },
  { kind: 'undo', icon: 'undo', tone: 'red' },
];

/** activityKindStyle - icon at tone para sa isang activity line. O(n) */
function activityKindStyle(kind) {
  const index = linearSearch(ACTIVITY_KINDS, 'kind', kind);
  return index === -1 ? { icon: 'info', tone: 'gray' } : ACTIVITY_KINDS[index];
}

/** activityRowHTML - isang line sa activity feed. */
function activityRowHTML(entry) {
  const style = activityKindStyle(entry.kind);
  return '<li class="row-item"><span class="icon-bubble tone-' + style.tone + '">' + iconHTML(style.icon) + '</span>'
    + '<div class="row-main"><p class="row-title fw-normal">' + escapeHTML(entry.message) + '</p>'
    + '<p class="row-meta">' + escapeHTML(entry.actor) + ' · <time datetime="' + escapeHTML(entry.at) + '" title="' + escapeHTML(formatDateTime(entry.at)) + '">' + escapeHTML(formatTimeAgo(entry.at)) + '</time></p></div></li>';
}

function openAdminDrawer() {
  const sidebar = byId('adminSidebar');
  const scrim = byId('sidebarScrim');
  sidebar.classList.add('is-open');
  scrim.hidden = false;
  void scrim.offsetWidth;
  scrim.classList.add('is-open');
  byId('adminMenuButton').setAttribute('aria-expanded', 'true');
  adminShellState.drawerOpen = true;
  focusElement(qs('.sidebar-link', sidebar));
}

function closeAdminDrawer() {
  if (!adminShellState.drawerOpen) {
    return;
  }
  const scrim = byId('sidebarScrim');
  byId('adminSidebar').classList.remove('is-open');
  scrim.classList.remove('is-open');
  setTimeout(function () {
    if (!adminShellState.drawerOpen) {
      scrim.hidden = true;
    }
  }, 300);
  byId('adminMenuButton').setAttribute('aria-expanded', 'false');
  adminShellState.drawerOpen = false;
}

/** renderUndoButton - enabled lang pag may laman sa taas ng undo stack. O(1) */
function renderUndoButton() {
  const top = peekUndo();
  const button = byId('undoButton');
  button.disabled = top === null;
  button.title = top ? 'Undo: ' + top.label + ' (Ctrl+Z)' : 'Nothing to undo';
  button.setAttribute('aria-label', top ? 'Undo: ' + top.label : 'Undo — nothing to undo');
}

/** updateBackButtons - lagyan ng label bawat Back button kung saang screen siya babalik. O(n) */
function updateBackButtons() {
  const previous = peekBack();
  const buttons = qsa('[data-back]');
  for (let i = 0; i < buttons.length; i++) {
    const label = qs('span', buttons[i]);
    const useStack = previous !== null && textStartsWith(previous.path, '/admin') && previous.path !== routerState.path;
    label.textContent = useStack ? previous.title : buttons[i].getAttribute('data-fallback-label');
  }
}

/** renderAdminChrome - sidebar user, mga counter, Undo at Back; tinatawag ng bawat admin screen. */
function renderAdminChrome() {
  const staff = currentStaff();
  if (!staff) {
    return;
  }
  setHTML('sidebarAvatar', avatar(staff.fullName, 'md'));
  setText('sidebarUserName', staff.fullName);
  setText('sidebarUserRole', staff.role + ' · ' + staff.id);
  setHTML('navCountApplications', countBadge(countApplicationsByStatus().Pending));
  setHTML('navCountBilling', countBadge(receivablesSummary(todayISO()).overdueCount));
  setHTML('navCountPayments', countBadge(countPaymentsForVerification()));
  setHTML('navCountRegistrations', countBadge(countRegistrationsByStatus().Pending));
  setHTML('navCountSupport', countBadge(countTicketsByStatus().Open));
  renderUndoButton();
  updateBackButtons();
  setText('adminToolbarTitle', routerState.route ? routerState.route.title : '');
}

/**
 * performUndo - i-pop yung undo stack, i-reverse yung action tapos i-redraw
 * yung screen. Pag account change (staff o subscriber) yung ia-undo, hihingi
 * muna ng Google Authenticator code, gaya nung ginawa yung change.
 */
function performUndo() {
  const top = peekUndo();
  if (top && undoTouchesAccounts(top) && undoBlockedReason(top) === '') {
    requireStepUp('undo “' + top.label + '”', runUndo);
    return;
  }
  runUndo();
}

function runUndo() {
  const entry = undoLastAction(nameOfActor(currentStaff()));
  if (!entry) {
    showToast('Nothing to undo', { tone: 'info' });
    return;
  }
  if (entry.blocked || entry.needsStepUp) {
    reportFailure(entry);
    return;
  }
  showToast('Undone: ' + entry.label, { tone: 'info' });
  refreshCurrentRoute();
}

/**
 * announce - i-confirm yung action gamit ang toast na may Undo. Yung Undo sa
 * toast, yung action lang na in-announce niya ang ire-reverse: kung may mas
 * bago na sa taas ng stack (o na-undo na dati), wala siyang gagawin.
 */
function announce(message) {
  const announced = peekUndo();
  showToast(message, {
    actionLabel: 'Undo',
    onAction: function () {
      if (peekUndo() !== announced) {
        showToast('That action was already undone or is no longer the latest.', { tone: 'info' });
        return;
      }
      performUndo();
    },
  });
}

/** reportFailure - ipakita bilang toast yung service error. */
function reportFailure(result) {
  showToast(result.error || 'That didn’t work. Please try again.', { tone: 'error' });
}

/**
 * askToConfirm - yung shared "Are you sure?" sheet, ginagamit lang sa mga
 * action na mahirap nang ibalik. options: { title, text, confirmLabel, danger, onConfirm }
 */
function askToConfirm(options) {
  setText('confirmTitle', options.title);
  setText('confirmText', options.text);
  const button = byId('confirmButton');
  button.textContent = options.confirmLabel;
  button.className = 'btn ' + (options.danger ? 'btn-danger-solid' : 'btn-accent');
  adminShellState.confirmAction = options.onConfirm;
  openSheet('sheetConfirm', document.activeElement);
}

/** isInteractiveTarget - sa link, button o field ba sa loob ng row tumama yung click? */
function isInteractiveTarget(node, stopAt) {
  let current = node;
  while (current && current !== stopAt) {
    const tag = current.nodeName;
    if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'LABEL') {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}

/** isTypingTarget - hindi dapat gumana yung keyboard shortcuts habang nagta-type. */
function isTypingTarget(element) {
  if (!element) {
    return false;
  }
  const tag = element.nodeName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
}

function handleAdminShortcuts(event) {
  if (byId('adminShell').hidden || isSheetOpen() || isTypingTarget(event.target)) {
    return;
  }
  if ((event.key === 'z' || event.key === 'Z') && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
    event.preventDefault();
    performUndo();
    return;
  }
  if (event.key === '/' && !event.ctrlKey && !event.metaKey) {
    const view = qs('[data-view]:not([hidden]) .search-input', byId('adminMain'));
    if (view) {
      event.preventDefault();
      focusElement(view);
    }
  }
}

function initAdminShell() {
  onClick('adminMenuButton', function () {
    if (adminShellState.drawerOpen) {
      closeAdminDrawer();
    } else {
      openAdminDrawer();
    }
  });
  onClick('sidebarScrim', closeAdminDrawer);
  byId('adminSidebar').addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && adminShellState.drawerOpen) {
      closeAdminDrawer();
      focusElement(byId('adminMenuButton'));
    }
  });
  window.matchMedia('(min-width: 992px)').addEventListener('change', function (event) {
    if (event.matches) {
      closeAdminDrawer();
    }
  });
  onClick('undoButton', performUndo);
  onClick('signOutButton', function () {
    signOut();
    showToast('Signed out', { tone: 'info' });
    navigate('/admin/login');
  });
  onClick('confirmButton', function () {
    const action = adminShellState.confirmAction;
    adminShellState.confirmAction = null;
    closeSheet('sheetConfirm');
    if (action) {
      action();
    }
  });

  const backButtons = qsa('[data-back]');
  for (let i = 0; i < backButtons.length; i++) {
    backButtons[i].setAttribute('data-fallback-label', qs('span', backButtons[i]).textContent);
  }
  document.addEventListener('click', function (event) {
    const back = findAncestorWith(event.target, 'data-back', null);
    if (back) {
      goBack(back.getAttribute('data-fallback'));
    }
  });

  // Buong table row nagbubukas ng record; yung name sa loob ay totoong link para sa mga keyboard user.
  byId('adminMain').addEventListener('click', function (event) {
    const row = findAncestorWith(event.target, 'data-href', byId('adminMain'));
    if (row && !isInteractiveTarget(event.target, row)) {
      navigate(textSlice(row.getAttribute('data-href'), 1));
    }
  });
  document.addEventListener('keydown', handleAdminShortcuts);
}
