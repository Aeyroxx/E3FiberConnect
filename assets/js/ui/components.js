/* ==========================================================================
   E3 Fiber Connect - ui/components.js
   Maliliit na piraso ng markup na share ng maraming screen: status badges,
   avatars, empty states, label/value rows, plan choice cards, at yung caption
   na "algorithm used" sa ilalim ng bawat list. Lahat ng text galing sa user
   dumadaan muna sa escapeHTML.
   ========================================================================== */

'use strict';

/**
 * clientConnectionsHTML - links papunta sa ibang application at account ng parehong client
 * (galing sa clientConnections). Blangko kung wala. O(n)
 */
function clientConnectionsHTML(connections) {
  let html = '';
  for (let i = 0; i < connections.subscribers.length; i++) {
    const sub = connections.subscribers[i];
    html += '<a class="connection-link" href="#/admin/subscribers/' + escapeHTML(sub.accountNo) + '"><span class="mono">' + escapeHTML(sub.accountNo) + '</span> ' + statusBadge(sub.status) + ' <span class="caption-text">' + escapeHTML(planName(sub.planId)) + '</span></a>';
  }
  for (let i = 0; i < connections.applications.length; i++) {
    const app = connections.applications[i];
    if (app.status === 'Completed') {
      continue;                                  // naging subscriber na, nasa taas na siya
    }
    html += '<a class="connection-link" href="#/admin/applications/' + escapeHTML(app.referenceNo) + '"><span class="mono">' + escapeHTML(app.referenceNo) + '</span> ' + statusBadge(app.status) + ' <span class="caption-text">' + escapeHTML(planName(app.planId)) + '</span></a>';
  }
  return html;
}

// status -> anong kulay at anong salita yung lalabas (linear search lang, mga 20 entries)
const STATUS_STYLES = [
  { status: 'Pending', tone: 'orange', label: 'Pending' },
  { status: 'Approved', tone: 'blue', label: 'Approved' },
  { status: 'For Installation', tone: 'purple', label: 'Scheduled' },
  { status: 'Completed', tone: 'green', label: 'Installed' },
  { status: 'Rejected', tone: 'red', label: 'Rejected' },
  { status: 'Active', tone: 'green', label: 'Active' },
  { status: 'Suspended', tone: 'orange', label: 'Suspended' },
  { status: 'Terminated', tone: 'gray', label: 'Terminated' },
  { status: 'Archived', tone: 'gray', label: 'Archived' },
  { status: 'Paid', tone: 'green', label: 'Paid' },
  { status: 'Unpaid', tone: 'orange', label: 'Unpaid' },
  { status: 'Overdue', tone: 'red', label: 'Overdue' },
  { status: 'Open', tone: 'blue', label: 'Open' },
  { status: 'In progress', tone: 'purple', label: 'In progress' },
  { status: 'Resolved', tone: 'green', label: 'Resolved' },
  { status: 'For verification', tone: 'orange', label: 'For verification' },
  { status: 'Confirmed', tone: 'green', label: 'Confirmed' },
  { status: 'Declined', tone: 'red', label: 'Declined' },
  { status: 'available', tone: 'green', label: 'Available' },
  { status: 'coming-soon', tone: 'orange', label: 'Coming soon' },
];

/** statusStyle - kunin yung tone at label ng status (linear search). O(n) */
function statusStyle(status) {
  const index = linearSearch(STATUS_STYLES, 'status', status);
  return index === -1 ? { tone: 'gray', label: textOf(status) } : STATUS_STYLES[index];
}

/** statusBadge - pill na may kulay at dot, parang "● Pending". Pag size "lg", mas malaki. */
function statusBadge(status, size) {
  const style = statusStyle(status);
  return '<span class="status status-' + style.tone + (size === 'lg' ? ' status-lg' : '') + '"><span class="status-dot" aria-hidden="true"></span>' + escapeHTML(style.label) + '</span>';
}

/**
 * onSegmentChange - para sa clicks sa mga button ng segmented control
 * ([data-value]); lilipat yung pressed state sa button na kinlick.
 */
function onSegmentChange(container, handler) {
  if (!container) {
    return;
  }
  container.addEventListener('click', function (event) {
    const button = findAncestorWith(event.target, 'data-value', container.parentNode);
    if (button && container.contains(button)) {
      const value = button.getAttribute('data-value');
      markSegment(container, value);
      handler(value);
    }
  });
}

/** avatar - initials sa loob ng bilog; yung kulay galing sa hash ng pangalan. */
function avatar(name, size) {
  const tone = hashText(name, 6);
  return '<span class="avatar avatar-' + (size || 'md') + ' avatar-tone-' + tone + '" aria-hidden="true">' + escapeHTML(initialsOf(name)) + '</span>';
}

/** emptyState - lumalabas pag walang laman yung list. */
function emptyState(iconName, title, text) {
  return '<div class="empty-state">' + iconHTML(iconName, 'empty-state-icon')
    + '<p class="empty-state-title">' + escapeHTML(title) + '</p>'
    + (text ? '<p class="empty-state-text">' + escapeHTML(text) + '</p>' : '') + '</div>';
}

/** kvRow - isang linya ng label / value sa detail panel (safe na HTML na yung value). */
function kvRow(label, valueHTML) {
  return '<div class="kv-row"><dt>' + escapeHTML(label) + '</dt><dd>' + valueHTML + '</dd></div>';
}

/** splitSortValue - hatiin yung value ng sort menu, "price-desc" -> { field: "price", order: "desc" }. O(n) */
function splitSortValue(value) {
  const parts = splitText(value, '-');
  return { field: parts[0], order: parts.length > 1 ? parts[1] : 'asc' };
}

/** formatMs - gawing text yung ms, 0.0421 -> "0.04 ms". */
function formatMs(ms) {
  if (ms < 0.01) {
    return '< 0.01 ms';
  }
  return (Math.round(ms * 100) / 100) + ' ms';
}

/**
 * algorithmCaption - yung linya sa ilalim ng bawat list, halimbawa
 * "Showing 4 of 16 - Insertion sort - 9 comparisons - 3 moves - O(n²)"
 */
function algorithmCaption(shown, total, noun, stats, algorithmId) {
  const info = sortAlgorithmInfo(algorithmId);
  return '<span>Showing ' + formatNumber(shown) + ' of ' + pluralize(total, noun) + '</span>'
    + '<span class="caption-dot" aria-hidden="true">·</span>'
    + '<span>' + escapeHTML(info.name) + ': ' + pluralize(stats.comparisons, 'comparison') + ', ' + pluralize(stats.moves, 'move') + '</span>'
    + '<span class="caption-dot" aria-hidden="true">·</span>'
    + '<span class="caption-big-o">avg ' + escapeHTML(info.average) + '</span>'
    + '<span class="caption-dot" aria-hidden="true">·</span>'
    + '<span>' + formatMs(stats.ms) + '</span>';
}

/**
 * planChoiceCard - radio card para pumili ng plan (apply form, walk-in form,
 * change-plan sheet). Totoong radio pa rin yung <input> para gumana sa keyboard.
 */
function planChoiceCard(plan, groupName, idPrefix, checked) {
  const id = idPrefix + '-' + plan.id;
  return '<div class="choice">'
    + '<input class="choice-input" type="radio" name="' + groupName + '" id="' + id + '" value="' + plan.id + '"' + (checked ? ' checked' : '') + '>'
    + '<label class="choice-card" for="' + id + '">'
    + '<span class="choice-check" aria-hidden="true">' + iconHTML('check') + '</span>'
    + (plan.popular ? '<span class="choice-flag">Most popular</span>' : '')
    + '<span class="choice-title">' + escapeHTML(plan.name) + '</span>'
    + '<span class="choice-speed"><strong>' + plan.speed + '</strong> Mbps</span>'
    + '<span class="choice-price">' + formatPeso(plan.price) + '<span>/mo</span></span>'
    + '</label></div>';
}

/** customPlanChoiceCard - yung option na "Custom price" katabi ng plan cards (sa staff forms lang). */
function customPlanChoiceCard(groupName, idPrefix, checked) {
  const id = idPrefix + '-custom';
  return '<div class="choice">'
    + '<input class="choice-input" type="radio" name="' + groupName + '" id="' + id + '" value="custom"' + (checked ? ' checked' : '') + '>'
    + '<label class="choice-card" for="' + id + '">'
    + '<span class="choice-check" aria-hidden="true">' + iconHTML('check') + '</span>'
    + '<span class="choice-title">Custom</span>'
    + '<span class="choice-speed"><strong>₱</strong> any price</span>'
    + '<span class="choice-price">Special offer<span> · staff only</span></span>'
    + '</label></div>';
}

/**
 * compactChoice - radio card na isang linya lang (reasons, time slots, subscribers).
 * Pag `disabled`, naka-gray siya (halimbawa "Already billed").
 */
function compactChoice(groupName, id, value, title, text, checked, disabled) {
  return '<div class="choice">'
    + '<input class="choice-input" type="radio" name="' + groupName + '" id="' + escapeHTML(id) + '" value="' + escapeHTML(value) + '"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '>'
    + '<label class="choice-card choice-card-compact" for="' + escapeHTML(id) + '">'
    + '<span class="choice-check" aria-hidden="true">' + iconHTML('check') + '</span>'
    + '<span class="choice-title">' + escapeHTML(title) + '</span>'
    + (text ? '<span class="choice-text">' + escapeHTML(text) + '</span>' : '')
    + '</label></div>';
}

/** tonePill - maliit na pill na may kulay para sa kahit anong text (halimbawa "3 days overdue"). */
function tonePill(text, tone) {
  return '<span class="pill pill-' + tone + '">' + escapeHTML(text) + '</span>';
}

/** countBadge - yung maliit na number sa tabi ng sidebar item o segment. */
function countBadge(count) {
  return count > 0 ? '<span class="count-badge">' + formatNumber(count) + '</span>' : '';
}

/** renderSegmentCounts - ilagay yung "(n)" na bilang sa mga segmented button [data-count-for]. */
function renderSegmentCounts(container, counts) {
  if (!container) {
    return;
  }
  const slots = qsa('[data-count-for]', container);
  for (let i = 0; i < slots.length; i++) {
    const key = slots[i].getAttribute('data-count-for');
    slots[i].textContent = counts[key] === undefined ? '' : formatNumber(counts[key]);
  }
}

/** markSegment - i-press yung isang segment ng segmented control, i-release yung iba. O(n) */
function markSegment(container, value) {
  if (!container) {
    return;
  }
  const buttons = qsa('[data-value]', container);
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].setAttribute('aria-pressed', buttons[i].getAttribute('data-value') === value ? 'true' : 'false');
  }
}

/**
 * checkListHTML - list ng mga check na may ✓ / ✗, ginagamit sa payment validation
 * at sa pag-review ng staff requests. checks: [{ label, ok, text }]
 */
function checkListHTML(checks) {
  let html = '<ol class="check-list">';
  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    html += '<li class="check-item ' + (check.ok ? 'is-pass' : 'is-fail') + '">'
      + '<span class="check-icon" aria-hidden="true">' + iconHTML(check.ok ? 'check' : 'xmark') + '</span>'
      + '<div class="min-w-0"><p class="check-title">' + escapeHTML(check.label) + '<span class="visually-hidden"> — ' + (check.ok ? 'passed' : 'failed') + '</span></p>'
      + '<p class="check-text">' + escapeHTML(check.text) + '</p></div></li>';
  }
  return html + '</ol>';
}

/** timelineHTML - patayong list ng steps, may dot para sa done / current / upcoming / failed. */
function timelineHTML(steps) {
  let html = '<ol class="timeline">';
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const iconName = step.state === 'done' ? 'check' : (step.state === 'failed' ? 'xmark' : '');
    html += '<li class="timeline-step is-' + step.state + '">'
      + '<span class="timeline-dot" aria-hidden="true">' + (iconName ? iconHTML(iconName) : '') + '</span>'
      + '<div class="timeline-body">'
      + '<p class="timeline-title">' + escapeHTML(step.title) + '<span class="visually-hidden"> — ' + escapeHTML(step.state) + '</span></p>'
      + (step.at ? '<p class="timeline-time">' + escapeHTML(formatDateTime(step.at)) + '</p>' : '')
      + (step.note ? '<p class="timeline-note">' + escapeHTML(step.note) + '</p>' : '')
      + '</div></li>';
  }
  return html + '</ol>';
}
