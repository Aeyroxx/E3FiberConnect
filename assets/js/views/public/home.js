/* ==========================================================================
   E3 Fiber Connect · views/public/home.js
   The landing page: hero, plan cards, stats, steps and shortcuts.
   ========================================================================== */

'use strict';

const homeViewState = { heroAnimated: false };

/**
 * planTileHTML — one plan card, used on the home page and the plans page.
 * `scope` keeps element ids unique per page; `recommendedId` highlights the
 * recommender's pick.
 */
function planTileHTML(plan, scope, recommendedId) {
  const recommended = recommendedId === plan.id;
  let features = '';
  for (let i = 0; i < PLAN_FEATURES.length; i++) {
    features += '<li>' + iconHTML('check') + '<span>' + escapeHTML(PLAN_FEATURES[i]) + '</span></li>';
  }
  let flag = '';
  if (recommended) {
    flag = 'Recommended for you';
  } else if (plan.popular) {
    flag = 'Most popular';
  }
  const classes = 'plan-tile' + (plan.popular && !recommended ? ' is-popular' : '') + (recommended ? ' is-recommended' : '');
  const titleId = scope + '-plan-' + plan.id;
  return '<article class="' + classes + '" aria-labelledby="' + titleId + '">'
    + '<p class="plan-flag">' + escapeHTML(flag) + '</p>'
    + '<h3 class="plan-name" id="' + titleId + '">' + escapeHTML(plan.name) + '</h3>'
    + '<p class="plan-speed"><strong>' + plan.speed + '</strong><span>Mbps</span></p>'
    + '<p class="plan-price">' + formatPeso(plan.price) + '<small>/mo</small></p>'
    + '<p class="plan-best">' + escapeHTML(plan.bestFor) + ' · ' + escapeHTML(plan.devices) + '</p>'
    + '<ul class="plan-features">' + features + '</ul>'
    + '<div class="plan-actions"><a class="btn btn-accent btn-sm" href="#/apply/' + plan.id + '">Choose ' + escapeHTML(plan.name) + '</a></div>'
    + '</article>';
}

/** cheapestPlan — linear scan for the lowest price. O(n) */
function cheapestPlan() {
  let best = PLANS[0];
  for (let i = 1; i < PLANS.length; i++) {
    if (PLANS[i].price < best.price) {
      best = PLANS[i];
    }
  }
  return best;
}

/** fastestPlan — linear scan for the highest speed. O(n) */
function fastestPlan() {
  let best = PLANS[0];
  for (let i = 1; i < PLANS.length; i++) {
    if (PLANS[i].speed > best.speed) {
      best = PLANS[i];
    }
  }
  return best;
}

function renderHomeView() {
  let html = '';
  for (let i = 0; i < PLANS.length; i++) {
    html += planTileHTML(PLANS[i], 'home', '');
  }
  setHTML('homePlanRail', html);
  setText('homeFromPrice', 'Plans from ' + formatPeso(cheapestPlan().price) + ' a month.');
  const fastest = fastestPlan();
  setText('homeTopSpeed', fastest.speed);
  setText('homeStatSpeed', fastest.speed);
  setText('homeStatBarangays', coverageSummary().available);
  if (!homeViewState.heroAnimated && !prefersReducedMotion()) {
    byId('homeHeroVisual').classList.add('is-animated');
    homeViewState.heroAnimated = true;
  }
}

function initHomeView() {
  // Everything on the home page is drawn by renderHomeView.
}
