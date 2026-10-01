/* ==========================================================================
   E3 Fiber Connect - ui/theme.js
   Light / dark mode. Laging LIGHT mode pag binuksan yung site; lahat ng button
   na may data-theme-toggle (site nav, staff toolbar, sign-in page) ay nagpapalit
   between light at dark. Nasa memory lang yung napili, katulad ng ibang data
   (walang localStorage / cookies), kaya hanggang ma-reload lang yung page.
   ========================================================================== */

'use strict';

const themeState = { mode: 'light' };
const THEME_BAR_COLORS = { light: '#fbfbfd', dark: '#161617' };
const THEME_FADE_MS = 300;

/**
 * applyTheme - sine-set yung <html data-theme>, kulay ng browser bar at bawat toggle
 * button (pressed = dark, yung icon = kung saan lilipat pag pinindot). O(n) para sa n buttons
 */
function applyTheme(mode) {
  themeState.mode = mode === 'dark' ? 'dark' : 'light';
  const dark = themeState.mode === 'dark';
  document.documentElement.setAttribute('data-theme', themeState.mode);
  const bar = byId('themeColorMeta');
  if (bar) {
    bar.setAttribute('content', THEME_BAR_COLORS[themeState.mode]);
  }
  const buttons = document.querySelectorAll('[data-theme-toggle]');
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].setAttribute('aria-pressed', dark ? 'true' : 'false');
    buttons[i].innerHTML = iconHTML(dark ? 'sun' : 'moon');
  }
}

/** toggleTheme - palit light <-> dark na may maikling cross-fade (wala pag naka-reduced motion). O(n) */
function toggleTheme() {
  const root = document.documentElement;
  if (!prefersReducedMotion()) {
    root.classList.add('theme-switching');
    setTimeout(function () {
      root.classList.remove('theme-switching');
    }, THEME_FADE_MS);
  }
  applyTheme(themeState.mode === 'dark' ? 'light' : 'dark');
}

/** initTheme - mag-start sa light mode tapos i-wire lahat ng toggle button. O(n) */
function initTheme() {
  const buttons = document.querySelectorAll('[data-theme-toggle]');
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', toggleTheme);
  }
  applyTheme('light');
}
