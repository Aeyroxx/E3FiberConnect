/* ==========================================================================
   E3 Fiber Connect · ui/forms.js
   Reading form fields and showing validation messages next to each field
   (inline, as the user fixes them — not only after pressing Submit).

   Markup convention for a field:
     <div class="field">
       <label class="form-label" for="applyEmail">E-mail</label>
       <input class="form-control" id="applyEmail" aria-describedby="applyEmail-error">
       <p class="field-error" id="applyEmail-error"></p>
     </div>
   ========================================================================== */

'use strict';

/** fieldValue — the value of an input / select / textarea by id ("" if missing). */
function fieldValue(id) {
  const element = byId(id);
  return element ? element.value : '';
}

/** setFieldValue — write a value into an input by id. */
function setFieldValue(id, value) {
  const element = byId(id);
  if (element) {
    element.value = textOf(value);
  }
}

/** isChecked — a checkbox's state by id. */
function isChecked(id) {
  const element = byId(id);
  return element ? element.checked : false;
}

/** checkedValue — the value of the checked radio in a group, or "". O(n) */
function checkedValue(name, root) {
  const radios = qsa('input[name="' + name + '"]', root);
  for (let i = 0; i < radios.length; i++) {
    if (radios[i].checked) {
      return radios[i].value;
    }
  }
  return '';
}

/** setCheckedValue — check the radio with this value in a group. O(n) */
function setCheckedValue(name, value, root) {
  const radios = qsa('input[name="' + name + '"]', root);
  for (let i = 0; i < radios.length; i++) {
    radios[i].checked = radios[i].value === value;
  }
}

/** setFieldError — show a message under a field and mark it invalid. */
function setFieldError(inputId, message) {
  const input = byId(inputId);
  const error = byId(inputId + '-error');
  if (!input) {
    return;
  }
  const field = findAncestorWithClass(input, 'field', null);
  if (message) {
    input.setAttribute('aria-invalid', 'true');
    if (field) {
      field.classList.add('is-invalid');
    }
    if (error) {
      error.innerHTML = iconHTML('exclamation', 'field-error-icon') + '<span>' + escapeHTML(message) + '</span>';
    }
  } else {
    input.removeAttribute('aria-invalid');
    if (field) {
      field.classList.remove('is-invalid');
    }
    if (error) {
      error.textContent = '';
    }
  }
}

/**
 * applyFieldErrors — show every error from a service result.
 * fieldMap: { errorKey: inputId } — only the listed fields are updated.
 * Returns the first invalid input (to move focus there), or null.
 * Time O(f)
 */
function applyFieldErrors(fieldMap, errors) {
  let first = null;
  for (const key in fieldMap) {
    const message = errors[key] || '';
    setFieldError(fieldMap[key], message);
    if (message && !first) {
      first = byId(fieldMap[key]);
    }
  }
  return first;
}

/** clearFieldErrors — remove every message in a form. O(f) */
function clearFieldErrors(fieldMap) {
  for (const key in fieldMap) {
    setFieldError(fieldMap[key], '');
  }
}

/** focusInvalid — scroll the first invalid field into view and focus it. */
function focusInvalid(input) {
  if (input) {
    input.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    focusElement(input);
  }
}

/** setFormAlert — a message box above or below a form (tone: error | success | info). */
function setFormAlert(id, message, tone) {
  const box = byId(id);
  if (!box) {
    return;
  }
  if (!message) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.className = 'form-alert form-alert-' + (tone || 'error');
  box.innerHTML = iconHTML(tone === 'success' ? 'check-circle' : (tone === 'info' ? 'info' : 'exclamation'), 'form-alert-icon') + '<span>' + escapeHTML(message) + '</span>';
  box.hidden = false;
}

/**
 * liveValidate — re-check one field as soon as the user leaves it (and while
 * they fix an error), using a function that returns the message or "".
 */
function liveValidate(inputId, check) {
  const input = byId(inputId);
  if (!input) {
    return;
  }
  input.addEventListener('blur', function () {
    if (input.value !== '') {
      setFieldError(inputId, check());
    }
  });
  input.addEventListener('input', function () {
    if (input.getAttribute('aria-invalid') === 'true') {
      setFieldError(inputId, check());
    }
  });
}

/** fillSelect — replace a <select>'s options (first option optional placeholder). O(n) */
function fillSelect(id, values, placeholder) {
  let html = placeholder ? '<option value="">' + escapeHTML(placeholder) + '</option>' : '';
  for (let i = 0; i < values.length; i++) {
    html += '<option value="' + escapeHTML(values[i]) + '">' + escapeHTML(values[i]) + '</option>';
  }
  setHTML(id, html);
}
