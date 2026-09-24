/* ==========================================================================
   E3 Fiber Connect · views/public/privacy.js
   The Privacy Notice (Data Privacy Act of 2012, RA 10173) and the privacy bar
   shown above the public pages. Dismissing the bar is remembered in memory
   only (no cookies / localStorage), like everything else on this site.
   (The bar hides itself on the notice page through CSS.)
   ========================================================================== */

'use strict';

const privacyState = { barDismissed: false };

/** renderPrivacyView — the notice is static text, so there is nothing to fill in. O(1) */
function renderPrivacyView() {
  // intentionally empty: the router shows the section; the privacy bar hides itself here (CSS)
}

/**
 * jumpToPrivacySection — the "On this page" list uses buttons, not #links,
 * because the part after # in the address picks the screen. O(1)
 */
function jumpToPrivacySection(id) {
  const heading = byId(id);
  if (!heading) {
    return;
  }
  heading.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  heading.focus({ preventScroll: true });
}

function initPrivacyView() {
  onClick('privacyBarClose', function () {
    privacyState.barDismissed = true;
    byId('privacyBar').hidden = true;
  });
  const jumps = document.querySelectorAll('[data-privacy-jump]');
  for (let i = 0; i < jumps.length; i++) {
    jumps[i].addEventListener('click', function (event) {
      jumpToPrivacySection(event.currentTarget.getAttribute('data-privacy-jump'));
    });
  }
}
