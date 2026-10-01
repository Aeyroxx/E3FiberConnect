/* ==========================================================================
   E3 Fiber Connect - views/public/privacy.js
   Yung Privacy Notice (Data Privacy Act of 2012, RA 10173) at yung privacy bar
   sa taas ng mga public page. Pag na-dismiss yung bar, sa memory lang natatandaan
   (walang cookies / localStorage), katulad ng lahat ng iba sa site na to.
   (Kusa namang nawawala yung bar sa notice page mismo, gamit CSS.)
   ========================================================================== */

'use strict';

const privacyState = { barDismissed: false };

/** renderPrivacyView - static text lang yung notice, kaya walang kailangang i-fill in. O(1) */
function renderPrivacyView() {
  // sinadyang walang laman: yung router na bahala magpakita ng section; yung privacy bar kusang nagtatago dito (CSS)
}

/**
 * jumpToPrivacySection - buttons yung gamit ng "On this page" list, hindi #links,
 * kasi yung part pagkatapos ng # sa address ang pumipili ng screen. O(1)
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
