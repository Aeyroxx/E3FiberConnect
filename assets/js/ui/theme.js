/* ==========================================================================
   E3 Fiber Connect · ui/theme.js
   Light / dark appearance. The site always opens in LIGHT mode; every button
   marked data-theme-toggle (site nav, staff toolbar, sign-in page) switches
   between light and dark. The choice lives in memory like the rest of the
   data (no localStorage / cookies), so it lasts until the page is reloaded.
   ========================================================================== */

'use strict';

const themeState = { mode: 'light' };
const THEME_BAR_COLORS = { light: '#fbfbfd', dark: '#161617' };
const THEME_FADE_MS = 300;

/**
 * applyTheme — set <html data-theme>, the browser bar colour and every toggle
 * button (pressed = dark, icon = what a press switches to). O(t) for t buttons
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

/** toggleTheme — switch light ↔ dark with a short cross-fade (none if reduced motion). O(t) */
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

/** initTheme — start in light mode and wire every toggle button. O(t) */
function initTheme() {
  const buttons = document.querySelectorAll('[data-theme-toggle]');
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', toggleTheme);
  }
  applyTheme('light');
}
