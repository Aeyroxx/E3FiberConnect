/* ==========================================================================
   E3 Fiber Connect - ui/toasts.js
   Maiikling confirmation ("Application approved · Undo") na lumalabas sa floating HUD.
   Naka-QUEUE yung mga message at isa-isa silang lumalabas, kung ano yung naunang
   pumasok yun din ang unang lalabas (FIFO). Pag marami yung naghihintay, mas
   maikli yung pakita sa bawat isa.
   ========================================================================== */

'use strict';

const toastState = { queue: createQueue(4), showing: false, timer: null, element: null, current: null, shownAt: 0 };
const TOAST_MIN_VISIBLE_MS = 1200; // hanggang ganito lang katagal maghihintay yung bagong message

/**
 * showToast - ilagay sa queue yung message. options: { tone: 'success' | 'error' | 'info',
 * actionLabel, onAction, duration }
 * Time: O(1) (enqueue)
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
  // May nakalabas na: hayaan munang matapos yung minimum time niya bago mag-next,
  // para yung bagong confirmation (pati yung Undo button niya) hindi matagal maghintay sa queue.
  if (toastState.element) {
    const elapsed = performance.now() - toastState.shownAt;
    clearTimeout(toastState.timer);
    toastState.timer = setTimeout(hideCurrentToast, Math.max(0, TOAST_MIN_VISIBLE_MS - elapsed));
  }
}

/** toastIcon - yung pangalan ng icon para sa tone. */
function toastIcon(tone) {
  if (tone === 'error') {
    return 'exclamation';
  }
  if (tone === 'info') {
    return 'info';
  }
  return 'check-circle';
}

/** showNextToast - i-dequeue yung pinakamatagal nang naghihintay na message tapos ipakita. O(1) */
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

/** hideCurrentToast - i-fade out yung HUD, tapos ipakita yung susunod sa queue. */
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
