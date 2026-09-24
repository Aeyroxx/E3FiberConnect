/* ==========================================================================
   E3 Fiber Connect · ui/toasts.js
   Short confirmations ("Application approved · Undo") shown in a floating HUD.
   Messages wait in a QUEUE and appear one at a time, in the order they were
   sent (FIFO). When several are waiting, each one is shown more briefly.
   ========================================================================== */

'use strict';

const toastState = { queue: createQueue(4), showing: false, timer: null, element: null, current: null, shownAt: 0 };
const TOAST_MIN_VISIBLE_MS = 1200; // a newer message waits at most this long

/**
 * showToast — queue a message. options: { tone: 'success' | 'error' | 'info',
 * actionLabel, onAction, duration }
 * Time O(1) enqueue
 */
function showToast(message, options) {
  const settings = options || {};
  enqueue(toastState.queue, {
    message: message,
    tone: settings.tone || 'success',
    actionLabel: settings.actionLabel || '',
    onAction: settings.onAction || null,
    duration: settings.duration || 3600,
  });
  if (!toastState.showing) {
    showNextToast();
    return;
  }
  // Something is already showing: let it finish its minimum time, then move on,
  // so a fresh confirmation (and its Undo button) never waits long in the queue.
  if (toastState.element) {
    const elapsed = performance.now() - toastState.shownAt;
    clearTimeout(toastState.timer);
    toastState.timer = setTimeout(hideCurrentToast, Math.max(0, TOAST_MIN_VISIBLE_MS - elapsed));
  }
}

/** toastIcon — the icon name for a tone. */
function toastIcon(tone) {
  if (tone === 'error') {
    return 'exclamation';
  }
  if (tone === 'info') {
    return 'info';
  }
  return 'check-circle';
}

/** showNextToast — dequeue the oldest waiting message and display it. O(1) */
function showNextToast() {
  const toast = dequeue(toastState.queue);
  if (!toast) {
    toastState.showing = false;
    return;
  }
  toastState.showing = true;
  toastState.current = toast;
  const host = byId('toastHost');
  const element = document.createElement('div');
  element.className = 'toast-hud toast-' + toast.tone;
  element.innerHTML = iconHTML(toastIcon(toast.tone), 'toast-icon')
    + '<span class="toast-message">' + escapeHTML(toast.message) + '</span>'
    + (toast.actionLabel ? '<button type="button" class="toast-action">' + escapeHTML(toast.actionLabel) + '</button>' : '');
  host.appendChild(element);
  toastState.element = element;
  toastState.shownAt = performance.now();
  requestAnimationFrame(function () {
    element.classList.add('is-visible');
  });
  const action = qs('.toast-action', element);
  if (action) {
    action.addEventListener('click', function () {
      if (toast.onAction) {
        toast.onAction();
      }
      hideCurrentToast();
    });
  }
  const waiting = queueSize(toastState.queue);
  const duration = waiting > 0 ? TOAST_MIN_VISIBLE_MS : toast.duration;
  toastState.timer = setTimeout(hideCurrentToast, duration);
}

/** hideCurrentToast — fade the HUD out, then show the next queued message. */
function hideCurrentToast() {
  clearTimeout(toastState.timer);
  const element = toastState.element;
  toastState.element = null;
  if (!element) {
    showNextToast();
    return;
  }
  element.classList.remove('is-visible');
  element.classList.add('is-leaving');
  setTimeout(function () {
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
    showNextToast();
  }, prefersReducedMotion() ? 0 : 220);
}
