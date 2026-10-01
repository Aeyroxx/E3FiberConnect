/* ==========================================================================
   E3 Fiber Connect - ui/forms.js
   Dito binabasa yung mga form field at pinapakita yung validation message
   sa tabi mismo ng field (inline, habang inaayos ng user, hindi lang
   pagkatapos pindutin yung Submit).

   Ganito yung markup ng isang field:
     <div class="field">
       <label class="form-label" for="applyEmail">E-mail</label>
       <input class="form-control" id="applyEmail" aria-describedby="applyEmail-error">
       <p class="field-error" id="applyEmail-error"></p>
     </div>
   ========================================================================== */

'use strict';

/** fieldValue - kunin yung value ng input / select / textarea gamit yung id ("" pag wala). */
function fieldValue(id) {
  const element = byId(id);
  return element ? element.value : '';
}

/** setFieldValue - lagyan ng value yung input gamit yung id. */
function setFieldValue(id, value) {
  const element = byId(id);
  if (element) {
    element.value = textOf(value);
  }
}

/** isChecked - kung naka-check ba yung checkbox (by id). */
function isChecked(id) {
  const element = byId(id);
  return element ? element.checked : false;
}

/** checkedValue - value nung naka-check na radio sa group, o "" pag wala. O(n) */
function checkedValue(name, root) {
  const radios = qsa('input[name="' + name + '"]', root);
  for (let i = 0; i < radios.length; i++) {
    if (radios[i].checked) {
      return radios[i].value;
    }
  }
  return '';
}

/** setCheckedValue - i-check yung radio sa group na may ganitong value. O(n) */
function setCheckedValue(name, value, root) {
  const radios = qsa('input[name="' + name + '"]', root);
  for (let i = 0; i < radios.length; i++) {
    radios[i].checked = radios[i].value === value;
  }
}

/** setFieldError - maglagay ng message sa ilalim ng field tapos i-mark as invalid. */
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
 * applyFieldErrors - ipakita lahat ng error galing sa result ng service.
 * fieldMap: { errorKey: inputId } - yung mga nakalista lang ang ina-update.
 * Binabalik yung unang invalid na input (para dun ilipat yung focus), o null.
 * Time: O(n)
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

/** clearFieldErrors - burahin lahat ng error message sa form. O(n) */
function clearFieldErrors(fieldMap) {
  for (const key in fieldMap) {
    setFieldError(fieldMap[key], '');
  }
}

/** focusInvalid - i-scroll papunta sa unang invalid na field tapos i-focus. */
function focusInvalid(input) {
  if (input) {
    input.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    focusElement(input);
  }
}

/** setFormAlert - message box sa taas o baba ng form (tone: error | success | info). */
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
 * liveValidate - i-check ulit yung field pagka-alis ng user dito (at habang
 * inaayos niya yung error). Yung `check` ay function na nagbabalik ng message o "".
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

/** fillSelect - palitan yung options ng <select> (optional yung placeholder sa unang option). O(n) */
function fillSelect(id, values, placeholder) {
  let html = placeholder ? '<option value="">' + escapeHTML(placeholder) + '</option>' : '';
  for (let i = 0; i < values.length; i++) {
    html += '<option value="' + escapeHTML(values[i]) + '">' + escapeHTML(values[i]) + '</option>';
  }
  setHTML(id, html);
}
