/* ==========================================================================
   E3 Fiber Connect · ui/router.js
   One page, many screens. The part of the address after "#" picks the screen:
     #/apply/power   #/track/E3-2026-004879   #/admin/applications/E3-2026-004871
   Changing screens only hides one <section> and shows another, so the arrays
   in the "database" stay in memory the whole time.

   ROUTES is an array of records searched with a linear search.
   The in-app Back button uses a STACK: every screen you leave is pushed
   (with its scroll position); Back pops the newest one (LIFO).
   ========================================================================== */

'use strict';

const ROUTES = [];
const BACK_STACK_LIMIT = 30;

const routerState = {
  path: '',
  route: null,
  params: {},
  backStack: createStack(),
  goingBack: false,
  restoreScrollY: null,
  pendingAdminPath: '',
  started: false,
  notFound: null,
};

/** pathSegments — "/admin/applications/" → ["admin", "applications"]. O(n) */
function pathSegments(path) {
  const parts = splitText(path, '/');
  const segments = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== '') {
      arrayAppend(segments, parts[i]);
    }
  }
  return segments;
}

/** normalizePath — always "/something" with no trailing slash ("/" for home). O(n) */
function normalizePath(path) {
  const segments = pathSegments(path);
  return segments.length === 0 ? '/' : '/' + joinText(segments, '/');
}

/**
 * registerRoute — add a screen. pattern like "/admin/applications/:ref";
 * options: { title, nav, auth, guestOnly }.
 */
function registerRoute(pattern, viewId, shell, render, options) {
  const settings = options || {};
  arrayAppend(ROUTES, {
    pattern: pattern,
    segments: pathSegments(pattern),
    viewId: viewId,
    shell: shell,
    render: render,
    title: settings.title || 'E3 Fiber Connect',
    nav: settings.nav || '',
    auth: settings.auth === true,
    guestOnly: settings.guestOnly === true,
  });
}

/** registerNotFound — the screen shown for unknown addresses. */
function registerNotFound(viewId, render) {
  routerState.notFound = { pattern: '*', segments: [], viewId: viewId, shell: 'public', render: render, title: 'Page not found', nav: '', auth: false, guestOnly: false };
}

/**
 * matchRoute — linear search over ROUTES; ":name" segments capture values.
 * Time O(r · s) for r routes of s segments · Space O(s)
 */
function matchRoute(path) {
  const segments = pathSegments(path);
  for (let r = 0; r < ROUTES.length; r++) {
    const route = ROUTES[r];
    if (route.segments.length !== segments.length) {
      continue;
    }
    const params = {};
    let matched = true;
    for (let s = 0; s < segments.length; s++) {
      const expected = route.segments[s];
      if (expected[0] === ':') {
        params[textSlice(expected, 1)] = decodeURIComponent(segments[s]);
      } else if (expected !== segments[s]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return { route: route, params: params };
    }
  }
  return null;
}

/** currentHashPath — "#/plans" → "/plans"; "" → "/"; "#main" → null (not a screen). O(n) */
function currentHashPath() {
  const hash = window.location.hash;
  if (hash === '' || hash === '#') {
    return '/';
  }
  if (!textStartsWith(hash, '#/')) {
    return null;
  }
  return normalizePath(textSlice(hash, 1));
}

/** navigate — go to a screen (adds a browser history entry). */
function navigate(path) {
  const target = normalizePath(path);
  if (target === routerState.path && currentHashPath() === target) {
    resolveRoute(); // same address: just draw the screen again
    return;
  }
  window.location.hash = '#' + target;
}

/**
 * replaceRoute — go to a screen without adding a history entry (used for
 * redirects, so the browser's Back button never bounces into a redirect loop).
 */
function replaceRoute(path) {
  window.history.replaceState(null, '', '#' + normalizePath(path));
  resolveRoute();
}

/** peekBack — the screen the Back button would return to (stackPeek), or null. O(1) */
function peekBack() {
  return stackPeek(routerState.backStack);
}

/**
 * goBack — pop the newest screen from the back stack and return to it at the
 * same scroll position; with an empty stack, go to `fallbackPath`.
 * Time O(1)
 */
function goBack(fallbackPath) {
  const previous = stackPop(routerState.backStack);
  if (!previous) {
    navigate(fallbackPath);
    return;
  }
  routerState.goingBack = true;
  routerState.restoreScrollY = previous.scrollY;
  navigate(previous.path);
}

/** showShell — the public site, the sign-in page and the admin app are three shells. */
function showShell(name) {
  toggleElement(byId('publicShell'), name === 'public');
  toggleElement(byId('loginShell'), name === 'login');
  toggleElement(byId('adminShell'), name === 'admin');
  document.documentElement.setAttribute('data-shell', name);
}

/** showView — reveal one <section data-view> and hide all others. O(v) */
function showView(viewId) {
  const views = qsa('[data-view]');
  for (let i = 0; i < views.length; i++) {
    views[i].hidden = views[i].getAttribute('data-view') !== viewId;
  }
}

/** markActiveNav — aria-current="page" on the links for this section. O(links) */
function markActiveNav(navKey) {
  const links = qsa('[data-nav]');
  for (let i = 0; i < links.length; i++) {
    if (navKey && links[i].getAttribute('data-nav') === navKey) {
      links[i].setAttribute('aria-current', 'page');
    } else {
      links[i].removeAttribute('aria-current');
    }
  }
}

/** focusViewHeading — move focus to the new screen's title for screen-reader users. */
function focusViewHeading(viewId) {
  const view = qs('[data-view="' + viewId + '"]');
  const heading = view ? qs('h1', view) : null;
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    focusElement(heading);
  }
}

/**
 * resolveRoute — find the screen for the address, apply the sign-in rules,
 * remember the previous screen on the back stack, then draw the new one.
 */
function resolveRoute() {
  const path = currentHashPath();
  if (path === null) {
    return; // an in-page anchor such as #main — not a screen change
  }
  const match = matchRoute(path) || { route: routerState.notFound, params: {} };
  const route = match.route;
  const staff = currentStaff();

  if (route.auth && !staff) {
    routerState.pendingAdminPath = path;
    replaceRoute('/admin/login');
    return;
  }
  if (route.guestOnly && staff) {
    replaceRoute(staff.mustChangePassword ? '/admin/account' : '/admin');
    return;
  }
  if (route.auth && staff && staff.mustChangePassword && route.viewId !== 'admin-account') {
    replaceRoute('/admin/account');
    return;
  }

  if (routerState.route && !routerState.goingBack && routerState.path !== path) {
    if (stackSize(routerState.backStack) >= BACK_STACK_LIMIT) {
      stackRemoveBottom(routerState.backStack);
    }
    stackPush(routerState.backStack, { path: routerState.path, title: routerState.route.title, scrollY: window.scrollY });
  }
  const restoreY = routerState.goingBack ? routerState.restoreScrollY : null;
  routerState.goingBack = false;
  routerState.restoreScrollY = null;
  routerState.path = path;
  routerState.route = route;
  routerState.params = match.params;

  closeAllSheets();
  closePublicMenu();
  closeAdminDrawer();
  showShell(route.shell);
  showView(route.viewId);
  document.title = route.title === 'E3 Fiber Connect' ? route.title : route.title + ' — E3 Fiber Connect';
  markActiveNav(route.nav);
  route.render(match.params);
  window.scrollTo(0, restoreY === null ? 0 : restoreY);
  if (routerState.started) {
    focusViewHeading(route.viewId);
  }
  routerState.started = true;
}

/** refreshCurrentRoute — draw the current screen again after data changed (e.g. Undo). */
function refreshCurrentRoute() {
  if (routerState.route) {
    const y = window.scrollY;
    routerState.route.render(routerState.params);
    window.scrollTo(0, y);
  }
}

/** startRouter — listen for address changes and draw the first screen. */
function startRouter() {
  window.addEventListener('hashchange', resolveRoute);
  resolveRoute();
}
