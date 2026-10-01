/* ==========================================================================
   E3 Fiber Connect - ui/sheets.js
   Mga dialog na parang sa Apple: sheet sa gitna pag malaki yung screen, tapos
   sa phone bottom sheet siya na pwedeng hilahin pababa para isara (may spring
   physics, tingnan yung spring.js). Yung mga bukas na sheet naka-STACK - yung
   Esc at yung backdrop laging yung nasa taas ang sinasara, tapos babalik yung
   focus sa button na nagbukas nito.
   ========================================================================== */

'use strict';

const SHEET_TRANSITION_MS = 320;
const sheetState = { stack: createStack(), drag: null, springs: [] };

/** visibleFocusables - lahat ng focusable at nakikitang element sa loob ng container. O(n) */
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

/** setBackgroundInert - para hindi ma-click o ma-focus yung page sa likod ng bukas na sheet. */
function setBackgroundInert(inert) {
  const shells = ['publicShell', 'loginShell', 'adminShell'];
  for (let i = 0; i < shells.length; i++) {
    const shell = byId(shells[i]);
    if (shell) {
      shell.inert = inert;
    }
  }
}

/** openSheet - ilagay yung sheet sa taas ng stack tapos i-focus yung unang field. */
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
  void sheet.offsetWidth; // simulan yung CSS transition galing sa closed state
  backdrop.classList.add('is-open');
  sheet.classList.add('is-open');
  setBackgroundInert(true);
  document.documentElement.classList.add('has-sheet');
  const body = qs('.sheet-body', sheet) || sheet;
  const first = visibleFocusables(body)[0];
  setTimeout(function () {
    // I-focus lang yung unang field kung kita siya; sa maliit na phone screen baka nasa
    // baba pa siya, at pag na-focus dun lalabas yung keyboard para sa field na hindi naman kita.
    focusElement(first && isInsideBox(first, body) ? first : sheet);
  }, 40);
}

/** isInsideBox - buo bang nakikita yung element sa loob ng box? O(1) */
function isInsideBox(element, box) {
  const a = element.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  return a.top >= b.top && a.bottom <= b.bottom;
}

/**
 * closeSheet - itago yung sheet (kadalasan yung nasa taas). Pag may options.immediate,
 * wala nang closing transition (gamit to pag nailabas na ng drag yung sheet sa screen).
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
  sheet.dispatchEvent(new CustomEvent('sheetclose'));   // para makapaglinis yung view (halimbawa, kalimutan na yung pinakitang password)
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

/** closeTopSheet - isara kung anong sheet yung nasa taas ng stack (stackPeek). */
function closeTopSheet() {
  const top = stackPeek(sheetState.stack);
  if (top) {
    closeSheet(top.id);
  }
}

/** closeAllSheets - tinatawag pag lumipat ng screen. */
function closeAllSheets() {
  while (!stackIsEmpty(sheetState.stack)) {
    closeSheet(stackPeek(sheetState.stack).id, { immediate: true });
  }
}

/** isSheetOpen - may bukas bang sheet? O(1) */
function isSheetOpen() {
  return !stackIsEmpty(sheetState.stack);
}

/* ---- Keyboard: Esc pang-close, tapos yung Tab hindi lalabas sa top sheet ---- */
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

/* ---- Bottom sheet sa phone: hilahin pababa yung header para isara ---- */
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
    sheetState.springs[i].cancelled = true; // nahawakan habang gumagalaw pa
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
    offset = -rubberband(-offset, drag.sheet.offsetHeight, 0.55); // may pigil pag hinihila pataas
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

/** initSheets - isang beses lang i-wire yung backdrop, close buttons, keyboard at drag. */
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
