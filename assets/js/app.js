/* ==========================================================================
   E3 Fiber Connect · app.js
   Start-up: fill the arrays with sample data, list every screen in the route
   table, wire up each screen once, then draw the screen in the address bar.
   ========================================================================== */

'use strict';

/**
 * registerAllRoutes — the route table (an array, searched in order).
 * "/admin/applications/new" must come before "/admin/applications/:ref",
 * because the first matching route wins.
 */
function registerAllRoutes() {
  registerRoute('/', 'home', 'public', renderHomeView, { title: 'E3 Fiber Connect', nav: 'home' });
  registerRoute('/plans', 'plans', 'public', renderPlansView, { title: 'Plans', nav: 'plans' });
  registerRoute('/coverage', 'coverage', 'public', renderCoverageView, { title: 'Coverage', nav: 'coverage' });
  registerRoute('/apply', 'apply', 'public', renderApplyView, { title: 'Apply', nav: 'apply' });
  registerRoute('/apply/:plan', 'apply', 'public', renderApplyView, { title: 'Apply', nav: 'apply' });
  registerRoute('/submitted/:ref', 'submitted', 'public', renderSubmittedView, { title: 'Application received' });
  registerRoute('/track', 'track', 'public', renderTrackView, { title: 'Track', nav: 'track' });
  registerRoute('/track/:ref', 'track', 'public', renderTrackView, { title: 'Track', nav: 'track' });
  registerRoute('/pay', 'pay', 'public', renderPayView, { title: 'Pay bills', nav: 'pay' });
  registerRoute('/support', 'support', 'public', renderSupportView, { title: 'Support', nav: 'support' });
  registerRoute('/privacy', 'privacy', 'public', renderPrivacyView, { title: 'Privacy Notice' });

  registerRoute('/admin/login', 'admin-login', 'login', renderLoginView, { title: 'Staff sign in', guestOnly: true });
  registerRoute('/admin/register', 'admin-register', 'login', renderRegisterView, { title: 'Request staff access', guestOnly: true });
  registerRoute('/admin', 'admin-dashboard', 'admin', renderDashboardView, { title: 'Dashboard', nav: 'dashboard', auth: true });
  registerRoute('/admin/applications', 'admin-applications', 'admin', renderApplicationsView, { title: 'Applications', nav: 'applications', auth: true });
  registerRoute('/admin/applications/new', 'admin-new-application', 'admin', renderNewApplicationView, { title: 'New application', nav: 'new-application', auth: true });
  registerRoute('/admin/applications/:ref', 'admin-application', 'admin', renderApplicationDetailView, { title: 'Application', nav: 'applications', auth: true });
  registerRoute('/admin/subscribers', 'admin-subscribers', 'admin', renderSubscribersView, { title: 'Subscribers', nav: 'subscribers', auth: true });
  registerRoute('/admin/subscribers/:account', 'admin-subscriber', 'admin', renderSubscriberDetailView, { title: 'Subscriber', nav: 'subscribers', auth: true });
  registerRoute('/admin/billing', 'admin-billing', 'admin', renderBillingView, { title: 'Billing', nav: 'billing', auth: true });
  registerRoute('/admin/payments', 'admin-payments', 'admin', renderPaymentsView, { title: 'Payments', nav: 'payments', auth: true });
  registerRoute('/admin/support', 'admin-support', 'admin', renderAdminSupportView, { title: 'Support', nav: 'support-admin', auth: true });
  registerRoute('/admin/staff', 'admin-staff', 'admin', renderStaffView, { title: 'Staff', nav: 'staff', auth: true });
  registerRoute('/admin/registrations', 'admin-registrations', 'admin', renderRegistrationsView, { title: 'Registrations', nav: 'registrations', auth: true });
  registerRoute('/admin/activity', 'admin-activity', 'admin', renderActivityView, { title: 'Activity', nav: 'activity', auth: true });
  registerRoute('/admin/algorithms', 'admin-algorithms', 'admin', renderAlgorithmsView, { title: 'Algorithms', nav: 'algorithms', auth: true });
  registerRoute('/admin/account', 'admin-account', 'admin', renderAccountView, { title: 'Account', nav: 'account', auth: true });
  registerNotFound('not-found', renderNotFoundView);
}

/** initAllScreens — attach every screen's event listeners exactly once. */
function initAllScreens() {
  initTheme();
  initPublicChrome();
  initSheets();
  initHomeView();
  initPlansView();
  initCoverageView();
  initApplyView();
  initSubmittedView();
  initTrackView();
  initPayView();
  initSupportView();
  initPrivacyView();
  initAdminShell();
  initLoginView();
  initRegisterView();
  initDashboardView();
  initApplicationsView();
  initApplicationDetailView();
  initNewApplicationView();
  initSubscribersView();
  initSubscriberDetailView();
  initBillingView();
  initPaymentsView();
  initAdminSupportView();
  initStaffView();
  initRegistrationsView();
  initActivityView();
  initAlgorithmsView();
  initAccountView();
}

/**
 * warnBeforeLeaving — the data lives only in memory, so a reload would erase
 * any changes. After something changed, ask the browser to confirm first.
 */
function warnBeforeLeaving(event) {
  if (databaseState.changed) {
    event.preventDefault();
    event.returnValue = '';
  }
}

function startApp() {
  seedDatabase();
  registerAllRoutes();
  initAllScreens();
  window.addEventListener('beforeunload', warnBeforeLeaving);
  if (currentHashPath() === null) {
    window.history.replaceState(null, '', '#/'); // e.g. opened as index.html#main
  }
  startRouter();
}

startApp();
