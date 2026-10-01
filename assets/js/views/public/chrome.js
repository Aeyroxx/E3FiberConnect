/* ==========================================================================
   E3 Fiber Connect - views/public/chrome.js
   Yung mga nakapaligid sa bawat public page: yung medyo see-through na navigation
   bar (may manipis na linya sa baba na lalabas lang pag may content nang
   naka-scroll sa ilalim niya), yung full-screen menu sa phone, yung skip link,
   yung year sa footer at yung 404 page.
   ========================================================================== */

'use strict';

const publicChromeState = { menuOpen: false };

function openPublicMenu() {
  const button = byId('publicMenuButton');
  byId('publicMenu').hidden = false;
  button.setAttribute('aria-expanded', 'true');
  button.setAttribute('aria-label', 'Close menu');
  byId('globalNav').classList.add('is-menu-open');
  document.documentElement.classList.add('has-sheet');
  publicChromeState.menuOpen = true;
}

function closePublicMenu() {
  if (!publicChromeState.menuOpen) {
    return;
  }
  const button = byId('publicMenuButton');
  byId('publicMenu').hidden = true;
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', 'Open menu');
  byId('globalNav').classList.remove('is-menu-open');
  if (!isSheetOpen()) {
    document.documentElement.classList.remove('has-sheet');
  }
  publicChromeState.menuOpen = false;
}

function togglePublicMenu() {
  if (publicChromeState.menuOpen) {
    closePublicMenu();
  } else {
    openPublicMenu();
  }
}

/** updateScrollEdges - ipakita lang yung manipis na linya ng bar pag may content sa ilalim niya. */
function updateScrollEdges() {
  const scrolled = window.scrollY > 4;
  byId('globalNav').classList.toggle('is-scrolled', scrolled);
  byId('adminToolbar').classList.toggle('is-scrolled', scrolled);
}

/** skipToContent - i-focus yung main region ng kung anong shell yung nakalabas. */
function skipToContent(event) {
  event.preventDefault();
  let main = byId('publicMain');
  if (!byId('adminShell').hidden) {
    main = byId('adminMain');
  } else if (!byId('loginShell').hidden) {
    main = byId('loginMain');
  }
  main.setAttribute('tabindex', '-1');
  focusElement(main);
}

function renderNotFoundView() {
  // Static page lang to, walang kailangang i-fill in.
}

function initPublicChrome() {
  onClick('publicMenuButton', togglePublicMenu);
  byId('publicMenu').addEventListener('click', function (event) {
    if (findAncestorWith(event.target, 'href', byId('publicMenu'))) {
      closePublicMenu();
    }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && publicChromeState.menuOpen) {
      closePublicMenu();
      focusElement(byId('publicMenuButton'));
    }
  });
  window.matchMedia('(min-width: 992px)').addEventListener('change', function (event) {
    if (event.matches) {
      closePublicMenu();
    }
  });
  window.addEventListener('scroll', updateScrollEdges, { passive: true });
  byId('skipLink').addEventListener('click', skipToContent);
  setText('footerYear', readClock().year);
  updateScrollEdges();
}
