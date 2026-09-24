/* ==========================================================================
   E3 Fiber Connect · views/admin/account.js
   The signed-in staff member's profile and password. Staff who signed in with
   a temporary password are sent here until they choose their own.
   ========================================================================== */

'use strict';

const PASSWORD_FIELDS = { currentPassword: 'currentPassword', newPassword: 'newPassword', confirmPassword: 'confirmPassword' };

function renderAccountView() {
  renderAdminChrome();
  const staff = currentStaff();
  toggleElement(byId('accountMustChange'), staff.mustChangePassword);
  setHTML('accountProfile',
    '<div class="d-flex align-items-center gap-3 pb-3">' + avatar(staff.fullName, 'lg') + '<div><p class="headline-3">' + escapeHTML(staff.fullName) + '</p><p class="caption-text">' + escapeHTML(staff.role) + '</p></div></div>'
    + kvRow('E-mail', escapeHTML(staff.email))
    + kvRow('Staff ID', '<span class="mono">' + escapeHTML(staff.id) + '</span>')
    + kvRow('Started', escapeHTML(formatDate(staff.startDate)))
    + kvRow('Last sign-in', escapeHTML(staff.lastSignIn ? formatDateTime(staff.lastSignIn) : 'Now'))
    + kvRow('Can manage staff', canManageStaff(staff) ? 'Yes' : 'No'));
  setFormAlert('passwordAlert', '');
}

function initAccountView() {
  byId('passwordForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const staff = currentStaff();
    const wasTemporary = staff.mustChangePassword;
    const result = changeOwnPassword(staff, fieldValue('currentPassword'), fieldValue('newPassword'), fieldValue('confirmPassword'));
    if (!result.ok) {
      focusInvalid(applyFieldErrors(PASSWORD_FIELDS, result.errors));
      return;
    }
    clearFieldErrors(PASSWORD_FIELDS);
    byId('passwordForm').reset();
    showToast('Password updated');
    if (wasTemporary) {
      navigate('/admin');
    } else {
      renderAccountView();
    }
  });
  onClick('accountSignOut', function () {
    signOut();
    showToast('Signed out', { tone: 'info' });
    navigate('/admin/login');
  });
}
