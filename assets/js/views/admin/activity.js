/* ==========================================================================
   E3 Fiber Connect · views/admin/activity.js
   The activity log (read from the end of the array, newest first) and a
   picture of the undo STACK, top first.
   ========================================================================== */

'use strict';

const activityViewState = { limit: 30 };

function renderActivityView() {
  renderAdminChrome();
  const items = recentActivity(activityViewState.limit);
  let html = '';
  for (let i = 0; i < items.length; i++) {
    html += activityRowHTML(items[i]);
  }
  setHTML('actLog', html || '<li class="row-item"><p class="row-meta">Nothing yet.</p></li>');
  toggleElement(byId('actMore'), activityLog.length > activityViewState.limit);

  const entries = undoEntries();
  setText('actStackCount', entries.length + ' of ' + UNDO_LIMIT + ' · top = newest');
  let stack = '';
  for (let i = 0; i < entries.length; i++) {
    stack += '<li class="row-item"><span class="queue-pos">' + (i + 1) + '</span><div class="row-main">'
      + '<p class="row-title fw-normal">' + escapeHTML(entries[i].label) + (i === 0 ? ' ' + tonePill('Top', 'blue') : '') + '</p>'
      + '<p class="row-meta">' + escapeHTML(entries[i].actor) + ' · ' + escapeHTML(formatTimeAgo(entries[i].at)) + '</p></div></li>';
  }
  setHTML('actStack', stack || '<li class="row-item"><p class="row-meta">The stack is empty. Approve, settle or change something and it appears here.</p></li>');
  byId('actUndo').disabled = entries.length === 0;
}

function initActivityView() {
  onClick('actUndo', performUndo);
  onClick('actMore', function () {
    activityViewState.limit = activityViewState.limit + 30;
    renderActivityView();
  });
}
