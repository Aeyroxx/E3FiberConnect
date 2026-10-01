/* ==========================================================================
   E3 Fiber Connect - ui/router.js
   Isang page lang pero maraming screen. Yung part ng address pagkatapos ng "#"
   ang nagsasabi kung anong screen ang ipapakita:
     #/apply/power   #/track/E3-2026-004879   #/admin/applications/E3-2026-004871
   Pag lumipat ng screen, tinatago lang yung isang <section> tapos pinapakita
   yung iba, kaya yung mga array sa "database" naka-memory pa rin buong oras.

   Yung ROUTES ay array ng mga record na hinahanap gamit linear search.
   Yung Back button sa loob ng app ay gumagamit ng STACK: bawat screen na
   iniwan mo ay pinu-push (kasama yung scroll position); pag nag-Back, pop
   yung pinakabago (LIFO).
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

/** pathSegments - hinahati yung path, "/admin/applications/" -> ["admin", "applications"]. O(n) */
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

/** normalizePath - laging "/something" na walang slash sa dulo ("/" pag home). O(n) */
function normalizePath(path) {
  const segments = pathSegments(path);
  return segments.length === 0 ? '/' : '/' + joinText(segments, '/');
}

/**
 * registerRoute - dito nag-a-add ng screen. Yung pattern ay parang
 * "/admin/applications/:ref"; options: { title, nav, auth, guestOnly }.
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

/** registerNotFound - yung screen na lalabas pag hindi kilala yung address. */
function registerNotFound(viewId, render) {
  routerState.notFound = { pattern: '*', segments: [], viewId: viewId, shell: 'public', render: render, title: 'Page not found', nav: '', auth: false, guestOnly: false };
}

/**
 * matchRoute - linear search sa ROUTES; yung mga segment na ":name" ang
 * kumukuha ng value galing sa address.
 * Time: O(n²) (bawat route × bawat segment ng path), Space: O(n)
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

/** currentHashPath - "#/plans" -> "/plans"; "" -> "/"; "#main" -> null (hindi screen yan). O(n) */
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

/** navigate - pumunta sa isang screen (nadadagdagan yung history ng browser). */
function navigate(path) {
  const target = normalizePath(path);
  if (target === routerState.path && currentHashPath() === target) {
    resolveRoute(); // parehong address lang, i-draw ulit yung screen
    return;
  }
  window.location.hash = '#' + target;
}

/**
 * replaceRoute - lipat ng screen pero walang bagong history entry. Ginagamit
 * to sa redirects para hindi ma-stuck sa redirect loop yung Back ng browser.
 */
function replaceRoute(path) {
  window.history.replaceState(null, '', '#' + normalizePath(path));
  resolveRoute();
}

/** peekBack - kung saang screen babalik yung Back button (stackPeek), o null. O(1) */
function peekBack() {
  return stackPeek(routerState.backStack);
}

/**
 * goBack - i-pop yung pinakabagong screen sa back stack tapos bumalik dun sa
 * dating scroll position. Pag empty yung stack, sa `fallbackPath` pupunta.
 * Time: O(1)
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

/** showShell - tatlo yung shell natin: public site, sign-in page, at admin app. */
function showShell(name) {
  toggleElement(byId('publicShell'), name === 'public');
  toggleElement(byId('loginShell'), name === 'login');
  toggleElement(byId('adminShell'), name === 'admin');
  document.documentElement.setAttribute('data-shell', name);
}

/** showView - ipakita yung isang <section data-view>, itago lahat ng iba. O(n) */
function showView(viewId) {
  const views = qsa('[data-view]');
  for (let i = 0; i < views.length; i++) {
    views[i].hidden = views[i].getAttribute('data-view') !== viewId;
  }
}

/** markActiveNav - lagyan ng aria-current="page" yung mga link ng section na to. O(n) */
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

/** focusViewHeading - ilipat yung focus sa title ng bagong screen, para sa mga gumagamit ng screen reader. */
function focusViewHeading(viewId) {
  const view = qs('[data-view="' + viewId + '"]');
  const heading = view ? qs('h1', view) : null;
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    focusElement(heading);
  }
}

/**
 * resolveRoute - hanapin yung screen para sa address, i-apply yung rules sa
 * sign-in, i-save yung dating screen sa back stack, tapos i-draw yung bago.
 */
function resolveRoute() {
  const path = currentHashPath();
  if (path === null) {
    return; // anchor lang sa loob ng page (halimbawa #main), hindi lilipat ng screen
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

/** refreshCurrentRoute - i-draw ulit yung current screen pag may nagbago sa data (halimbawa pag nag-Undo). */
function refreshCurrentRoute() {
  if (routerState.route) {
    const y = window.scrollY;
    routerState.route.render(routerState.params);
    window.scrollTo(0, y);
  }
}

/** startRouter - makinig sa pagbabago ng address tapos i-draw yung unang screen. */
function startRouter() {
  window.addEventListener('hashchange', resolveRoute);
  resolveRoute();
}
