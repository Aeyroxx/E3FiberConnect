/* ==========================================================================
   E3 Fiber Connect · views/public/coverage.js
   Coverage check: suggestions while typing (linear search + naive string
   matching) and the exact answer with BINARY SEARCH on the sorted barangays.
   ========================================================================== */

'use strict';

const coverageViewState = { filter: 'all', suggestions: [], activeIndex: -1 };

/** highlightMatch — wrap the part of `name` that matches the query in <mark>. O(n · m) */
function highlightMatch(name, query) {
  const needle = normalizeBarangayName(query);
  const at = needle === '' ? -1 : textFind(toLowerText(name), needle);
  if (at === -1) {
    return escapeHTML(name);
  }
  return escapeHTML(textSlice(name, 0, at))
    + '<mark>' + escapeHTML(textSlice(name, at, at + needle.length)) + '</mark>'
    + escapeHTML(textSlice(name, at + needle.length));
}

function closeCoverageSuggestions() {
  coverageViewState.suggestions = [];
  coverageViewState.activeIndex = -1;
  const list = byId('coverageSuggestions');
  list.hidden = true;
  list.innerHTML = '';
  const input = byId('coverageInput');
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
}

function renderCoverageSuggestions() {
  const query = fieldValue('coverageInput');
  if (trimText(query) === '') {
    closeCoverageSuggestions();
    return;
  }
  const found = suggestBarangays(query, 8);
  coverageViewState.suggestions = found;
  coverageViewState.activeIndex = -1;
  const list = byId('coverageSuggestions');
  if (found.length === 0) {
    list.innerHTML = '<li class="px-3 py-2 caption-text">No barangay matches “' + escapeHTML(trimText(query)) + '”.</li>';
  } else {
    let html = '';
    for (let i = 0; i < found.length; i++) {
      html += '<li role="presentation"><button type="button" role="option" id="coverage-option-' + i + '" aria-selected="false" data-name="' + escapeHTML(found[i].name) + '">'
        + '<span>' + highlightMatch(found[i].name, query) + '</span>' + statusBadge(found[i].status) + '</button></li>';
    }
    list.innerHTML = html;
  }
  list.hidden = false;
  byId('coverageInput').setAttribute('aria-expanded', 'true');
}

function moveCoverageHighlight(step) {
  const count = coverageViewState.suggestions.length;
  if (count === 0) {
    return;
  }
  let next = coverageViewState.activeIndex + step;
  if (next < 0) {
    next = count - 1;
  }
  if (next >= count) {
    next = 0;
  }
  coverageViewState.activeIndex = next;
  const options = qsa('[role="option"]', byId('coverageSuggestions'));
  for (let i = 0; i < options.length; i++) {
    const active = i === next;
    options[i].setAttribute('aria-selected', active ? 'true' : 'false');
    options[i].classList.toggle('is-active', active);
  }
  byId('coverageInput').setAttribute('aria-activedescendant', 'coverage-option-' + next);
}

/** showCoverageResult — binary search for the exact barangay and explain the answer. */
function showCoverageResult(name) {
  closeCoverageSuggestions();
  const typed = trimText(name);
  if (typed === '') {
    setHTML('coverageResult', '');
    return;
  }
  const started = stopwatchStart();
  const record = findBarangay(typed);
  const comparisons = dsaLastRun.comparisons;
  logOperation('Binary search', 'Coverage check', BARANGAYS.length, comparisons, 0, stopwatchMs(started));
  const note = '<p class="algo-note">Checked with binary search: ' + pluralize(comparisons, 'comparison') + ' across ' + BARANGAYS.length + ' barangays sorted A–Z.</p>';
  let html = '';
  if (!record) {
    html = '<div class="result-card">'
      + '<span class="icon-bubble tone-gray">' + iconHTML('question') + '</span>'
      + '<div><p class="result-title">We couldn’t find “' + escapeHTML(typed) + '”.</p>'
      + '<p class="result-text">Check the spelling, or choose from the list of Santa Maria barangays below.</p>' + note + '</div></div>';
  } else if (record.status === 'available') {
    setFieldValue('coverageInput', record.name);
    html = '<div class="result-card">'
      + '<span class="icon-bubble tone-green">' + iconHTML('check') + '</span>'
      + '<div><p class="result-title">Good news — fiber is available in Brgy. ' + escapeHTML(record.name) + '.</p>'
      + '<p class="result-text">There are ' + pluralize(record.accessPoints, 'fiber access point') + ' in the barangay, so most homes can be connected within days.</p>'
      + '<div class="result-actions"><a class="btn btn-accent btn-sm" href="#/apply">Apply now</a><a class="link-chevron" href="#/plans">See plans' + iconHTML('chevron-right') + '</a></div>'
      + note + '</div></div>';
  } else {
    setFieldValue('coverageInput', record.name);
    html = '<div class="result-card">'
      + '<span class="icon-bubble tone-orange">' + iconHTML('clock') + '</span>'
      + '<div><p class="result-title">Coming soon to Brgy. ' + escapeHTML(record.name) + '.</p>'
      + '<p class="result-text">We’re surveying the area now. You can still apply — we’ll keep you on the waitlist and call you when the line arrives.</p>'
      + '<div class="result-actions"><a class="btn btn-accent btn-sm" href="#/apply">Join the waitlist</a><a class="link-chevron" href="#/support">Ask us' + iconHTML('chevron-right') + '</a></div>'
      + note + '</div></div>';
  }
  setHTML('coverageResult', html);
}

function renderBarangayGrid() {
  const list = listBarangays(coverageViewState.filter);
  let html = '';
  for (let i = 0; i < list.length; i++) {
    html += '<li class="barangay-item"><span>' + escapeHTML(list[i].name) + '</span>' + statusBadge(list[i].status) + '</li>';
  }
  setHTML('barangayGrid', html);
}

function renderCoverageView() {
  const summary = coverageSummary();
  setText('coverageLead', 'E3 Fiber now reaches ' + summary.available + ' of Santa Maria’s ' + summary.total + ' barangays — and we’re building more.');
  renderSegmentCounts(byId('coverageFilter'), { all: summary.total, available: summary.available, 'coming-soon': summary.comingSoon });
  markSegment(byId('coverageFilter'), coverageViewState.filter);
  renderBarangayGrid();
}

function initCoverageView() {
  const input = byId('coverageInput');
  input.addEventListener('input', renderCoverageSuggestions);
  input.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (byId('coverageSuggestions').hidden) {
        renderCoverageSuggestions();
      }
      moveCoverageHighlight(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveCoverageHighlight(-1);
    } else if (event.key === 'Escape') {
      closeCoverageSuggestions();
    } else if (event.key === 'Enter' && coverageViewState.activeIndex !== -1) {
      event.preventDefault();
      showCoverageResult(coverageViewState.suggestions[coverageViewState.activeIndex].name);
    }
  });
  byId('coverageSuggestions').addEventListener('click', function (event) {
    const option = findAncestorWith(event.target, 'data-name', byId('coverageSuggestions'));
    if (option) {
      showCoverageResult(option.getAttribute('data-name'));
      focusElement(input);
    }
  });
  byId('coverageForm').addEventListener('submit', function (event) {
    event.preventDefault();
    showCoverageResult(input.value);
  });
  document.addEventListener('click', function (event) {
    if (!byId('coverageForm').contains(event.target)) {
      closeCoverageSuggestions();
    }
  });
  onSegmentChange(byId('coverageFilter'), function (value) {
    coverageViewState.filter = value;
    renderBarangayGrid();
  });
}
