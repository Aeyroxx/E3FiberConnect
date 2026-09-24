/* ==========================================================================
   E3 Fiber Connect · ui/components.js
   Small pieces of markup shared by many screens: status badges, avatars,
   empty states, label/value rows, plan choice cards and the "algorithm used"
   caption under every list. Every piece of user text goes through escapeHTML.
   ========================================================================== */

'use strict';

// status → colour tone and the words shown (linear search; ~20 entries)
const STATUS_STYLES = [
  { status: 'Pending', tone: 'orange', label: 'Pending' },
  { status: 'Approved', tone: 'blue', label: 'Approved' },
  { status: 'For Installation', tone: 'purple', label: 'Scheduled' },
  { status: 'Completed', tone: 'green', label: 'Installed' },
  { status: 'Rejected', tone: 'red', label: 'Rejected' },
  { status: 'Active', tone: 'green', label: 'Active' },
  { status: 'Suspended', tone: 'orange', label: 'Suspended' },
  { status: 'Terminated', tone: 'gray', label: 'Terminated' },
  { status: 'Deleted', tone: 'gray', label: 'Deleted' },
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

/** statusStyle — tone + label for a status (linear search). O(n) */
function statusStyle(status) {
  const index = linearSearch(STATUS_STYLES, 'status', status);
  return index === -1 ? { tone: 'gray', label: textOf(status) } : STATUS_STYLES[index];
}

/** statusBadge — a coloured pill with a dot: ● Pending. size "lg" makes it larger. */
function statusBadge(status, size) {
  const style = statusStyle(status);
  return '<span class="status status-' + style.tone + (size === 'lg' ? ' status-lg' : '') + '"><span class="status-dot" aria-hidden="true"></span>' + escapeHTML(style.label) + '</span>';
}

/**
 * onSegmentChange — handle clicks on a segmented control's buttons
 * ([data-value]); the pressed state moves to the clicked button.
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

/** avatar — initials in a circle; the colour comes from a hash of the name. */
function avatar(name, size) {
  const tone = hashText(name, 6);
  return '<span class="avatar avatar-' + (size || 'md') + ' avatar-tone-' + tone + '" aria-hidden="true">' + escapeHTML(initialsOf(name)) + '</span>';
}

/** emptyState — shown when a list has nothing to display. */
function emptyState(iconName, title, text) {
  return '<div class="empty-state">' + iconHTML(iconName, 'empty-state-icon')
    + '<p class="empty-state-title">' + escapeHTML(title) + '</p>'
    + (text ? '<p class="empty-state-text">' + escapeHTML(text) + '</p>' : '') + '</div>';
}

/** kvRow — one label / value line in a detail panel (value is already-safe HTML). */
function kvRow(label, valueHTML) {
  return '<div class="kv-row"><dt>' + escapeHTML(label) + '</dt><dd>' + valueHTML + '</dd></div>';
}

/** splitSortValue — a sort menu value "price-desc" → { field: "price", order: "desc" }. O(n) */
function splitSortValue(value) {
  const parts = splitText(value, '-');
  return { field: parts[0], order: parts.length > 1 ? parts[1] : 'asc' };
}

/** formatMs — 0.0421 → "0.04 ms". */
function formatMs(ms) {
  if (ms < 0.01) {
    return '< 0.01 ms';
  }
  return (Math.round(ms * 100) / 100) + ' ms';
}

/**
 * algorithmCaption — the line under each list, e.g.
 * "Showing 4 of 16 · Insertion sort · 9 comparisons · 3 moves · O(n²)"
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
 * planChoiceCard — a radio card for choosing a plan (apply form, walk-in form,
 * change-plan sheet). The <input> stays a real radio for keyboard users.
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

/** customPlanChoiceCard — the "Custom price" option next to the plan cards (staff forms). */
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
 * compactChoice — a one-line radio card (reasons, time slots, subscribers).
 * `disabled` greys it out (e.g. "Already billed").
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

/** tonePill — a small coloured pill for free text (e.g. "3 days overdue"). */
function tonePill(text, tone) {
  return '<span class="pill pill-' + tone + '">' + escapeHTML(text) + '</span>';
}

/** countBadge — the little number next to a sidebar item or segment. */
function countBadge(count) {
  return count > 0 ? '<span class="count-badge">' + formatNumber(count) + '</span>' : '';
}

/** renderSegmentCounts — write "(n)" counts into segmented buttons [data-count-for]. */
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

/** markSegment — press one segment of a segmented control, release the rest. O(n) */
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
 * checkListHTML — a ✓ / ✗ list of checks, used for payment validation and for
 * reviewing staff requests. checks: [{ label, ok, text }]
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

/** timelineHTML — a vertical list of steps with done / current / upcoming / failed dots. */
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
