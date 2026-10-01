/* ==========================================================================
   E3 Fiber Connect - ui/dom.js
   Maliliit na helper para magbasa at magsulat sa page.
   Dito lang ginagamit yung DOM API ng browser, pang-input at output lang -
   lahat ng data operation nasa dsa/ at backend/.
   ========================================================================== */

'use strict';

/** byId - kinukuha yung element na may ganitong id, o null kung wala. */
function byId(id) {
  return document.getElementById(id);
}

/** qs / qsa - yung una / lahat ng element na tugma sa CSS selector sa loob ng `root`. */
function qs(selector, root) {
  return (root || document).querySelector(selector);
}

function qsa(selector, root) {
  return (root || document).querySelectorAll(selector);
}

/** setText - naglalagay ng plain text sa element (hindi ito babasahin as HTML). */
function setText(id, value) {
  const element = byId(id);
  if (element) {
    element.textContent = textOf(value);
  }
}

/** setHTML - naglalagay ng markup sa element. Dapat naka-escapeHTML na yung text ng user bago ipasa dito. */
function setHTML(id, html) {
  const element = byId(id);
  if (element) {
    element.innerHTML = html;
  }
}

/** showElement / hideElement / toggleElement - gamit lang yung `hidden` attribute. */
function showElement(element) {
  if (element) {
    element.hidden = false;
  }
}

function hideElement(element) {
  if (element) {
    element.hidden = true;
  }
}

function toggleElement(element, visible) {
  if (element) {
    element.hidden = !visible;
  }
}

/**
 * findAncestorWith - aakyat mula sa `node` hanggang makita yung unang element na
 * may ganung attribute, titigil pag umabot sa `stopAt`. (Sariling gawa naming
 * version ng closest().)
 * Time: O(n)
 */
function findAncestorWith(node, attributeName, stopAt) {
  let current = node;
  while (current && current !== stopAt && current !== document) {
    if (current.nodeType === 1 && current.hasAttribute(attributeName)) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

/** findAncestorWithClass - parang findAncestorWith, pero class name yung hinahanap. Time: O(n) */
function findAncestorWithClass(node, className, stopAt) {
  let current = node;
  while (current && current !== stopAt && current !== document) {
    if (current.nodeType === 1 && current.classList.contains(className)) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

/**
 * onAction - isang click listener lang sa container para sa lahat ng [data-action]
 * button sa loob, kahit yung mga na-render pa lang mamaya (event delegation tawag dito).
 * handler(actionName, element, event)
 */
function onAction(container, handler) {
  if (!container) {
    return;
  }
  container.addEventListener('click', function (event) {
    const element = findAncestorWith(event.target, 'data-action', container.parentNode);
    if (element && container.contains(element)) {
      handler(element.getAttribute('data-action'), element, event);
    }
  });
}

/** onClick - shortcut para maglagay ng click listener sa element gamit yung id. */
function onClick(id, handler) {
  const element = byId(id);
  if (element) {
    element.addEventListener('click', handler);
  }
}

/** prefersReducedMotion - true kung naka-set sa system ng user na bawasan yung animation. */
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** isSmallScreen - pang-phone na laki ng window (dito nagiging bottom sheet yung mga sheet). */
function isSmallScreen() {
  return window.matchMedia('(max-width: 575.98px)').matches;
}

/** iconHTML - inline SVG icon galing sa sprite na nasa index.html. */
function iconHTML(name, extraClass) {
  return '<svg class="icon' + (extraClass ? ' ' + extraClass : '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
}

/**
 * copyToClipboard - kokopyahin yung text, tapos tatawagin yung done(true/false).
 * Clipboard API yung gamit, pero may fallback para sa lumang browser o file:// na page.
 */
function copyToClipboard(text, done) {
  function fallback() {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }
    document.body.removeChild(area);
    done(copied);
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
  } else {
    fallback();
  }
}

/** focusElement - ilipat yung keyboard focus nang hindi gumagalaw yung scroll ng page. */
function focusElement(element) {
  if (element && element.focus) {
    element.focus({ preventScroll: true });
  }
}
