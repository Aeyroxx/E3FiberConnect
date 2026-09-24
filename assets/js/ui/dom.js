/* ==========================================================================
   E3 Fiber Connect · ui/dom.js
   Small helpers for reading from and writing to the page.
   The browser's DOM API is only used for input and output here — every
   data operation lives in dsa/ and backend/.
   ========================================================================== */

'use strict';

/** byId — the element with this id, or null. */
function byId(id) {
  return document.getElementById(id);
}

/** qs / qsa — the first / every element matching a CSS selector inside `root`. */
function qs(selector, root) {
  return (root || document).querySelector(selector);
}

function qsa(selector, root) {
  return (root || document).querySelectorAll(selector);
}

/** setText — put plain text into an element (never interpreted as HTML). */
function setText(id, value) {
  const element = byId(id);
  if (element) {
    element.textContent = textOf(value);
  }
}

/** setHTML — put markup into an element. Callers escape user text with escapeHTML first. */
function setHTML(id, html) {
  const element = byId(id);
  if (element) {
    element.innerHTML = html;
  }
}

/** showElement / hideElement / toggleElement — use the `hidden` attribute. */
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
 * findAncestorWith — walk up from `node` to the first element that has the
 * attribute, stopping at `stopAt`. (A hand-written version of closest().)
 * Time O(depth)
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

/** findAncestorWithClass — like findAncestorWith, for a class name. Time O(depth) */
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
 * onAction — one click listener on a container handles every [data-action]
 * button inside it, even ones rendered later (event delegation).
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

/** onClick — shortcut for a click listener on an element id. */
function onClick(id, handler) {
  const element = byId(id);
  if (element) {
    element.addEventListener('click', handler);
  }
}

/** prefersReducedMotion — the visitor asked the system for less motion. */
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** isSmallScreen — phone-sized window (sheets become bottom sheets). */
function isSmallScreen() {
  return window.matchMedia('(max-width: 575.98px)').matches;
}

/** iconHTML — an inline SVG icon from the sprite in index.html. */
function iconHTML(name, extraClass) {
  return '<svg class="icon' + (extraClass ? ' ' + extraClass : '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
}

/**
 * copyToClipboard — copy text, then call done(true/false).
 * Uses the Clipboard API, with a fallback for older browsers / file:// pages.
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

/** focusElement — move keyboard focus without scrolling the page. */
function focusElement(element) {
  if (element && element.focus) {
    element.focus({ preventScroll: true });
  }
}
