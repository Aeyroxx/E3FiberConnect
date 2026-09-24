/* ==========================================================================
   E3 Fiber Connect · ui/sheets.js
   Dialogs, Apple-style: a centred sheet on larger screens, a bottom sheet on
   phones that can be dragged down to dismiss (with spring physics, see
   spring.js). Open sheets form a STACK — Esc and the backdrop always close
   the top one, and focus returns to the button that opened it.
   ========================================================================== */

'use strict';

const SHEET_TRANSITION_MS = 320;
const sheetState = { stack: createStack(), drag: null, springs: [] };

/** visibleFocusables — every focusable, visible element inside a container. O(n) */
function visibleFocusables(container) {
  const found = qsa('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', container);
  const list = [];
  for (let i = 0; i < found.length; i++) {
    if (found[i].offsetParent !== null || found[i] === document.activeElement) {
      arrayAppend(list, found[i]);
    }
  }
  return list;
}

/** setBackgroundInert — make the page behind an open sheet unreachable. */
function setBackgroundInert(inert) {
  const shells = ['publicShell', 'loginShell', 'adminShell'];
  for (let i = 0; i < shells.length; i++) {
    const shell = byId(shells[i]);
    if (shell) {
      shell.inert = inert;
    }
  }
}

/** openSheet — show a sheet on top of the stack and focus its first field. */
function openSheet(id, opener) {
  const sheet = byId(id);
  if (!sheet || sheet.classList.contains('is-open')) {
    return;
  }
  stackPush(sheetState.stack, { id: id, opener: opener || document.activeElement });
  const backdrop = byId('sheetBackdrop');
  backdrop.hidden = false;
  sheet.hidden = false;
  sheet.style.transform = '';
  sheet.style.zIndex = String(1060 + stackSize(sheetState.stack) * 2);
  backdrop.style.zIndex = String(1059 + stackSize(sheetState.stack) * 2);
  void sheet.offsetWidth; // start the CSS transition from the closed state
  backdrop.classList.add('is-open');
  sheet.classList.add('is-open');
  setBackgroundInert(true);
  document.documentElement.classList.add('has-sheet');
  const body = qs('.sheet-body', sheet) || sheet;
  const first = visibleFocusables(body)[0];
  setTimeout(function () {
    // Focus the first field only when it can be seen; on a short phone screen it may sit
    // below the fold, and focusing it there would open the keyboard for a hidden field.
    focusElement(first && isInsideBox(first, body) ? first : sheet);
  }, 40);
}

/** isInsideBox — is the element fully inside the visible part of the box? O(1) */
function isInsideBox(element, box) {
  const a = element.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  return a.top >= b.top && a.bottom <= b.bottom;
}

/**
 * closeSheet — hide a sheet (usually the top one). options.immediate skips the
 * closing transition (used after a drag already moved it off screen).
 */
function closeSheet(id, options) {
  const sheet = byId(id);
  if (!sheet || sheet.hidden) {
    return;
  }
  const entries = stackToArray(sheetState.stack);
  let opener = null;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].id === id) {
      opener = entries[i].opener;
    }
  }
  stackRemoveWhere(sheetState.stack, 'id', id);
  const immediate = (options && options.immediate) || prefersReducedMotion();
  sheet.classList.remove('is-open');
  sheet.dispatchEvent(new CustomEvent('sheetclose'));   // lets a view clean up (e.g. forget a shown password)
  if (immediate) {
    sheet.hidden = true;
    sheet.style.transform = '';
  } else {
    setTimeout(function () {
      if (!sheet.classList.contains('is-open')) {
        sheet.hidden = true;
        sheet.style.transform = '';
      }
    }, SHEET_TRANSITION_MS);
  }
  const backdrop = byId('sheetBackdrop');
  if (stackIsEmpty(sheetState.stack)) {
    backdrop.classList.remove('is-open');
    backdrop.style.opacity = '';
    setTimeout(function () {
      if (stackIsEmpty(sheetState.stack)) {
        backdrop.hidden = true;
      }
    }, immediate ? 0 : SHEET_TRANSITION_MS);
    setBackgroundInert(false);
    document.documentElement.classList.remove('has-sheet');
    if (opener && document.body.contains(opener)) {
      focusElement(opener);
    }
  } else {
    const top = byId(stackPeek(sheetState.stack).id);
    backdrop.style.zIndex = String(1059 + stackSize(sheetState.stack) * 2);
    focusElement(visibleFocusables(top)[0] || top);
  }
}

/** closeTopSheet — close whichever sheet is on top of the stack (stackPeek). */
function closeTopSheet() {
  const top = stackPeek(sheetState.stack);
  if (top) {
    closeSheet(top.id);
  }
}

/** closeAllSheets — used when the screen changes. */
function closeAllSheets() {
  while (!stackIsEmpty(sheetState.stack)) {
    closeSheet(stackPeek(sheetState.stack).id, { immediate: true });
  }
}

/** isSheetOpen — O(1) */
function isSheetOpen() {
  return !stackIsEmpty(sheetState.stack);
}

/* ---- Keyboard: Esc closes, Tab stays inside the top sheet ---- */
function handleSheetKeys(event) {
  if (stackIsEmpty(sheetState.stack)) {
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeTopSheet();
    return;
  }
  if (event.key === 'Tab') {
    const sheet = byId(stackPeek(sheetState.stack).id);
    const items = visibleFocusables(sheet);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !sheet.contains(document.activeElement))) {
      event.preventDefault();
      focusElement(last);
    } else if (!event.shiftKey && (document.activeElement === last || !sheet.contains(document.activeElement))) {
      event.preventDefault();
      focusElement(first);
    }
  }
}

/* ---- Phone bottom sheets: drag the header down to dismiss ---- */
function startSheetDrag(event) {
  const sheet = findAncestorWithClass(event.target, 'sheet', null);
  if (!sheet || !isSmallScreen() || prefersReducedMotion()) {
    return;
  }
  const handle = findAncestorWithClass(event.target, 'sheet-grabber', sheet) || findAncestorWithClass(event.target, 'sheet-header', sheet);
  if (!handle || findAncestorWith(event.target, 'data-close-sheet', sheet) || (event.pointerType === 'mouse' && event.button !== 0)) {
    return;
  }
  for (let i = 0; i < sheetState.springs.length; i++) {
    sheetState.springs[i].cancelled = true; // grab it mid-flight
  }
  arrayClear(sheetState.springs);
  const current = sheet.style.transform ? parseFloat(textSlice(sheet.style.transform, 11)) || 0 : 0;
  sheetState.drag = { sheet: sheet, pointerId: event.pointerId, startY: event.clientY - current, offset: current, samples: [{ y: event.clientY, t: event.timeStamp }] };
  sheet.setPointerCapture(event.pointerId);
  sheet.classList.add('is-dragging');
}

function moveSheetDrag(event) {
  const drag = sheetState.drag;
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }
  let offset = event.clientY - drag.startY;
  if (offset < 0) {
    offset = -rubberband(-offset, drag.sheet.offsetHeight, 0.55); // resist upward pulls
  }
  drag.offset = offset;
  drag.sheet.style.transform = 'translateY(' + offset + 'px)';
  const backdrop = byId('sheetBackdrop');
  backdrop.style.opacity = String(Math.max(0, 1 - Math.max(0, offset) / (drag.sheet.offsetHeight * 1.2)));
  arrayAppend(drag.samples, { y: event.clientY, t: event.timeStamp });
  if (drag.samples.length > 5) {
    arrayRemoveFirst(drag.samples);
  }
}

function endSheetDrag(event) {
  const drag = sheetState.drag;
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }
  sheetState.drag = null;
  const sheet = drag.sheet;
  sheet.classList.remove('is-dragging');
  const velocity = releaseVelocity(drag.samples);
  const height = sheet.offsetHeight;
  const projected = drag.offset + projectMomentum(velocity, 0.998);
  const backdrop = byId('sheetBackdrop');
  const id = sheet.id;
  if (projected > height * 0.45) {
    const spring = springAnimate({
      from: drag.offset, to: height + 24, velocity: velocity, response: 0.32, dampingRatio: 1,
      onUpdate: function (y) {
        sheet.style.transform = 'translateY(' + y + 'px)';
        backdrop.style.opacity = String(Math.max(0, 1 - y / height));
      },
      onComplete: function () {
        closeSheet(id, { immediate: true });
      },
    });
    arrayAppend(sheetState.springs, spring);
  } else {
    const spring = springAnimate({
      from: drag.offset, to: 0, velocity: velocity, response: 0.34, dampingRatio: 0.82,
      onUpdate: function (y) {
        sheet.style.transform = y === 0 ? '' : 'translateY(' + y + 'px)';
        backdrop.style.opacity = String(Math.max(0, 1 - Math.max(0, y) / (height * 1.2)));
      },
      onComplete: function () {
        backdrop.style.opacity = '';
      },
    });
    arrayAppend(sheetState.springs, spring);
  }
}

/** initSheets — wire the backdrop, close buttons, keyboard and drag handling once. */
function initSheets() {
  const backdrop = byId('sheetBackdrop');
  backdrop.addEventListener('click', closeTopSheet);
  document.addEventListener('keydown', handleSheetKeys);
  document.addEventListener('click', function (event) {
    const closer = findAncestorWith(event.target, 'data-close-sheet', null);
    if (closer) {
      const sheet = findAncestorWithClass(closer, 'sheet', null);
      if (sheet) {
        closeSheet(sheet.id);
      }
    }
    const opener = findAncestorWith(event.target, 'data-open-sheet', null);
    if (opener) {
      openSheet(opener.getAttribute('data-open-sheet'), opener);
    }
  });
  const sheets = qsa('.sheet');
  for (let i = 0; i < sheets.length; i++) {
    sheets[i].addEventListener('pointerdown', startSheetDrag);
    sheets[i].addEventListener('pointermove', moveSheetDrag);
    sheets[i].addEventListener('pointerup', endSheetDrag);
    sheets[i].addEventListener('pointercancel', endSheetDrag);
  }
}
