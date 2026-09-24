/* ==========================================================================
   E3 Fiber Connect · views/admin/shell.js
   The admin frame shared by every admin screen: sidebar (a drawer on small
   screens), counters, the Undo button (peeks at the undo stack), the Back
   button label (peeks at the back stack), clickable table rows, a shared
   "Are you sure?" sheet and keyboard shortcuts (Ctrl/⌘+Z, "/" to search).
   ========================================================================== */

'use strict';

const adminShellState = { drawerOpen: false, confirmAction: null };

// activity kind → icon + colour (linear search; 8 entries)
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

/** activityKindStyle — icon and tone for an activity line. O(n) */
function activityKindStyle(kind) {
  const index = linearSearch(ACTIVITY_KINDS, 'kind', kind);
  return index === -1 ? { icon: 'info', tone: 'gray' } : ACTIVITY_KINDS[index];
}

/** activityRowHTML — one line of the activity feed. */
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

/** renderUndoButton — enabled only when the undo stack has something on top. O(1) */
function renderUndoButton() {
  const top = peekUndo();
  const button = byId('undoButton');
  button.disabled = top === null;
  button.title = top ? 'Undo: ' + top.label + ' (Ctrl+Z)' : 'Nothing to undo';
  button.setAttribute('aria-label', top ? 'Undo: ' + top.label : 'Undo — nothing to undo');
}

/** updateBackButtons — label each Back button with the screen it returns to. O(b) */
function updateBackButtons() {
  const previous = peekBack();
  const buttons = qsa('[data-back]');
  for (let i = 0; i < buttons.length; i++) {
    const label = qs('span', buttons[i]);
    const useStack = previous !== null && textStartsWith(previous.path, '/admin') && previous.path !== routerState.path;
    label.textContent = useStack ? previous.title : buttons[i].getAttribute('data-fallback-label');
  }
}

/** renderAdminChrome — sidebar user, counters, Undo and Back; called by every admin screen. */
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

/** performUndo — pop the undo stack, reverse the action and redraw the screen. */
function performUndo() {
  const entry = undoLastAction(nameOfActor(currentStaff()));
  if (!entry) {
    showToast('Nothing to undo', { tone: 'info' });
    return;
  }
  if (entry.blocked) {
    reportFailure(entry);
    return;
  }
  showToast('Undone: ' + entry.label, { tone: 'info' });
  refreshCurrentRoute();
}

/**
 * announce — confirm an action with a toast that offers Undo. The toast's Undo
 * only reverses the action it announced: if something newer is on top of the
 * stack by then (or it was already undone), it does nothing.
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

/** reportFailure — show a service error as a toast. */
function reportFailure(result) {
  showToast(result.error || 'That didn’t work. Please try again.', { tone: 'error' });
}

/**
 * askToConfirm — the shared "Are you sure?" sheet, used only for actions
 * that are hard to take back. options: { title, text, confirmLabel, danger, onConfirm }
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

/** isInteractiveTarget — did the click land on a link, button or field inside a row? */
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

/** isTypingTarget — keyboard shortcuts must not fire while typing. */
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

  // Whole table rows open the record; the name inside is a real link for keyboard users.
  byId('adminMain').addEventListener('click', function (event) {
    const row = findAncestorWith(event.target, 'data-href', byId('adminMain'));
    if (row && !isInteractiveTarget(event.target, row)) {
      navigate(textSlice(row.getAttribute('data-href'), 1));
    }
  });
  document.addEventListener('keydown', handleAdminShortcuts);
}
