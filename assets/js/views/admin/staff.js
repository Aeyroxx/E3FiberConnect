/* ==========================================================================
   E3 Fiber Connect - views/admin/staff.js
   Staff accounts: list, add (may one-time na temporary password), suspend,
   reactivate, reset password, archive at restore. Owners at Admins lang.
   Hindi talaga nade-delete yung account - pag na-archive, nandun pa rin yung record at pwedeng i-undo.
   Module sa defense: Admin/Staff Creation & Management - si Dela Cruz Riceerich ang mag-eexplain.
   ========================================================================== */

'use strict';

const staffViewState = { status: 'all', query: '', sort: 'roleRank-asc', algorithm: 'insertion', credential: '' };
const ADD_STAFF_FIELDS = { fullName: 'addStaffName', email: 'addStaffEmail', role: 'addStaffRole', startDate: 'addStaffStart' };

function staffRowActions(actor, member) {
  if (actor.id === member.id) {
    return tonePill('You', 'blue');
  }
  if (!canManageMember(actor, member)) {
    return '';
  }
  const id = escapeHTML(member.id);
  const name = escapeHTML(member.fullName);
  if (member.status === 'Archived') {
    return '<button class="btn btn-tinted btn-xs" type="button" data-action="restore" data-staff="' + id + '" aria-label="Restore ' + name + '">Restore</button>';
  }
  let html = '';
  if (member.status === 'Active') {
    html += '<button class="btn btn-gray btn-xs" type="button" data-action="suspend" data-staff="' + id + '" aria-label="Suspend ' + name + '">Suspend</button>'
      + '<button class="btn btn-gray btn-xs" type="button" data-action="reset" data-staff="' + id + '" aria-label="Reset the password of ' + name + '">Reset password</button>';
  } else if (member.status === 'Suspended') {
    html += '<button class="btn btn-tinted btn-xs" type="button" data-action="reactivate" data-staff="' + id + '" aria-label="Reactivate ' + name + '">Reactivate</button>';
  }
  if (member.totpEnabled && (member.role === 'Support' || actor.role === 'Owner')) {
    html += '<button class="btn btn-gray btn-xs" type="button" data-action="reset-2fa" data-staff="' + id + '" aria-label="Reset the Google Authenticator of ' + name + '">Reset authenticator</button>';
  }
  html += '<button class="btn btn-gray btn-xs" type="button" data-action="archive" data-staff="' + id + '" aria-label="Archive ' + name + '">Archive</button>';
  return html;
}

function staffRowHTML(row, actor) {
  const member = row.record;
  return '<tr>'
    + '<td class="cell-main"><div class="cell-person">' + avatar(member.fullName, 'sm') + '<div class="min-w-0">'
    + '<span class="cell-primary">' + escapeHTML(member.fullName) + '</span>'
    + '<span class="cell-secondary text-truncate cell-truncate" title="' + escapeHTML(member.email) + '">' + escapeHTML(member.email) + '</span></div></div></td>'
    + '<td data-label="Role"><span class="cell-primary fw-normal">' + escapeHTML(member.role) + '</span>'
    + '<span class="cell-secondary text-nowrap">' + (member.mustChangePassword ? '<span class="text-orange">Temporary password</span>' : 'Since ' + escapeHTML(formatDate(member.startDate))) + '</span></td>'
    + '<td data-label="Last sign-in" class="text-nowrap">' + escapeHTML(member.lastSignIn ? formatTimeAgo(member.lastSignIn) : 'Never') + '</td>'
    + '<td data-label="Status">' + statusBadge(member.status) + '</td>'
    + '<td class="actions-cell"><div class="cell-actions">' + staffRowActions(actor, member) + '</div></td></tr>';
}

function renderStaffView() {
  renderAdminChrome();
  const state = staffViewState;
  const actor = currentStaff();
  const manager = canManageStaff(actor);
  toggleElement(byId('staffAdd'), manager);
  toggleElement(byId('staffNotice'), !manager);
  const waitingRequests = countRegistrationsByStatus().Pending;
  toggleElement(byId('staffRequestsNotice'), manager && waitingRequests > 0);
  setText('staffRequestsTitle', pluralize(waitingRequests, 'staff request') + ' waiting for approval');
  const counts = countStaffByStatus();
  renderSegmentCounts(byId('staffFilter'), counts);
  markSegment(byId('staffFilter'), state.status);
  setText('staffSubtitle', pluralize(counts.Active, 'active account') + ' · e-mails indexed in a hash table for sign-in');
  byId('staffSort').value = state.sort;
  byId('staffAlgorithm').value = state.algorithm;
  byId('staffSearch').value = state.query;

  const sortChoice = splitSortValue(state.sort);
  const result = listStaff({ status: state.status, query: state.query, sortField: sortChoice.field, sortOrder: sortChoice.order, algorithm: state.algorithm });
  let html = '';
  for (let i = 0; i < result.rows.length; i++) {
    html += staffRowHTML(result.rows[i], actor);
  }
  setHTML('staffBody', html);
  const empty = byId('staffEmpty');
  empty.hidden = result.rows.length > 0;
  empty.innerHTML = result.rows.length > 0 ? '' : emptyState('user', 'No staff found', 'Try another name or filter.');
  setHTML('staffCaption', algorithmCaption(result.rows.length, result.total, 'staff account', result.stats, state.algorithm));
}

function showCredential(member, tempPassword, isNew) {
  staffViewState.credential = 'E-mail: ' + member.email + '\nTemporary password: ' + tempPassword;
  setText('credentialTitle', isNew ? 'Account created' : 'Password reset');
  setText('credentialText', (isNew ? member.fullName + ' can now sign in as ' + member.role + ' with this temporary password.' : 'The old password no longer works. Give ' + member.fullName + ' this temporary password.'));
  setText('credentialEmail', member.email);
  setText('credentialPassword', tempPassword);
  openSheet('sheetCredential', byId('staffAdd'));
}

function openAddStaffSheet() {
  const actor = currentStaff();
  const roles = actor.role === 'Owner' ? STAFF_ROLES : ['Admin', 'Support'];
  fillSelect('addStaffRole', roles, 'Choose a role');
  byId('addStaffForm').reset();
  setFieldValue('addStaffStart', todayISO());
  clearFieldErrors(ADD_STAFF_FIELDS);
  openSheet('sheetAddStaff', byId('staffAdd'));
}

function runStaffAction(action, id) {
  const actor = currentStaff();
  const member = findStaffById(id);
  if (!member) {
    return;
  }
  if (action === 'suspend' || action === 'reactivate') {
    requireStepUp((action === 'suspend' ? 'suspend ' : 'reactivate ') + member.fullName, function () {
      const result = setStaffStatus(id, action === 'suspend' ? 'Suspended' : 'Active', actor);
      if (!result.ok) {
        reportFailure(result);
      } else {
        announce((action === 'suspend' ? 'Suspended ' : 'Reactivated ') + member.fullName);
      }
      renderStaffView();
    });
  } else if (action === 'reset') {
    requireStepUp('reset the password of ' + member.fullName, function () {
      const result = resetStaffPassword(id, actor);
      if (!result.ok) {
        reportFailure(result);
        return;
      }
      showCredential(member, result.tempPassword, false);
      renderStaffView();
    });
  } else if (action === 'reset-2fa') {
    askToConfirm({
      title: 'Reset ' + member.fullName + '’s authenticator?',
      text: 'Their Google Authenticator code stops working. They’ll set it up again, with their password, the next time they change something. This can’t be undone.',
      confirmLabel: 'Reset authenticator',
      danger: true,
      onConfirm: function () {
        requireStepUp('reset the Google Authenticator of ' + member.fullName, function () {
          const result = resetStaffTwoFactor(id, currentStaff());
          if (!result.ok) {
            reportFailure(result);
          } else {
            showToast('Reset ' + member.fullName + '’s authenticator', { tone: 'success' });
          }
          renderStaffView();
        });
      },
    });
  } else if (action === 'archive') {
    askToConfirm({
      title: 'Archive ' + member.fullName + '?',
      text: 'They won’t be able to sign in. Their record, activity and e-mail are kept, and you can restore the account at any time.',
      confirmLabel: 'Archive account',
      danger: false,
      onConfirm: function () {
        requireStepUp('archive the account of ' + member.fullName, function () {
          const result = setStaffStatus(id, 'Archived', currentStaff());
          if (!result.ok) {
            reportFailure(result);
          } else {
            announce('Archived ' + member.fullName);
          }
          renderStaffView();
        });
      },
    });
  } else if (action === 'restore') {
    requireStepUp('restore the account of ' + member.fullName, function () {
      const result = setStaffStatus(id, 'Active', currentStaff());
      if (!result.ok) {
        reportFailure(result);
      } else {
        announce('Restored ' + member.fullName + ' — they can sign in again');
      }
      renderStaffView();
    });
  }
}

function initStaffView() {
  onSegmentChange(byId('staffFilter'), function (value) {
    staffViewState.status = value;
    renderStaffView();
  });
  byId('staffSearch').addEventListener('input', function (event) {
    staffViewState.query = event.target.value;
    renderStaffView();
  });
  byId('staffSort').addEventListener('change', function (event) {
    staffViewState.sort = event.target.value;
    renderStaffView();
  });
  byId('staffAlgorithm').addEventListener('change', function (event) {
    staffViewState.algorithm = event.target.value;
    renderStaffView();
  });
  onAction(byId('staffBody'), function (action, element) {
    runStaffAction(action, element.getAttribute('data-staff'));
  });
  onClick('staffAdd', openAddStaffSheet);

  const live = [['addStaffName', 'fullName'], ['addStaffEmail', 'email'], ['addStaffStart', 'startDate']];
  for (let i = 0; i < live.length; i++) {
    const key = live[i][1];
    liveValidate(live[i][0], function () {
      return validateNewStaff({ fullName: fieldValue('addStaffName'), email: fieldValue('addStaffEmail'), role: fieldValue('addStaffRole'), startDate: fieldValue('addStaffStart') }, currentStaff())[key] || '';
    });
  }
  byId('addStaffForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const data = { fullName: fieldValue('addStaffName'), email: fieldValue('addStaffEmail'), role: fieldValue('addStaffRole'), startDate: fieldValue('addStaffStart') };
    const errors = validateNewStaff(data, currentStaff());    // ipakita muna yung mali sa fields bago humingi ng code
    if (hasAnyErrors(errors)) {
      focusInvalid(applyFieldErrors(ADD_STAFF_FIELDS, errors));
      return;
    }
    requireStepUp('add ' + collapseSpaces(data.fullName) + ' as ' + data.role, function () {
      const result = addStaff(data, currentStaff());
      if (!result.ok) {
        if (result.errors && hasAnyErrors(result.errors)) {
          focusInvalid(applyFieldErrors(ADD_STAFF_FIELDS, result.errors));
        } else {
          reportFailure(result);
        }
        return;
      }
      closeSheet('sheetAddStaff');
      renderStaffView();
      showCredential(result.staff, result.tempPassword, true);
      announce('Added ' + result.staff.fullName);
    });
  });
  onClick('credentialCopy', function () {
    copyToClipboard(staffViewState.credential, function (copied) {
      showToast(copied ? 'Sign-in details copied' : 'Couldn’t copy — please write them down', { tone: copied ? 'success' : 'error' });
    });
  });
  // ISANG beses lang pinapakita yung temporary password: kalimutan agad pagsara ng sheet
  // (pati pag nagpalit ng screen o may nag-sign out, kasi nagsasara lahat ng sheet nun).
  byId('sheetCredential').addEventListener('sheetclose', function () {
    staffViewState.credential = '';
    setText('credentialPassword', '—');
  });
}
