/* ==========================================================================
   E3 Fiber Connect · ui/codeboxes.js
   The six one-digit boxes for a verification code — used by the Google
   Authenticator sheet and by "Forgot password". A group is any element that
   holds six <input class="otp-digit" data-index="0…5">.

   Apple-style behaviour: every key press moves on to the next box, Backspace
   goes back, the arrows move, and a pasted or auto-filled code fills all six
   at once. The sixth digit submits by itself.
   ========================================================================== */

'use strict';

const CODE_LENGTH = 6;

/** codeBoxes — the six boxes of a group. O(1) */
function codeBoxes(group) {
  return group.querySelectorAll('.otp-digit');
}

/** codeBoxesValue — the digits typed so far. O(n) */
function codeBoxesValue(group) {
  const boxes = codeBoxes(group);
  let code = '';
  for (let i = 0; i < boxes.length; i++) {
    code += boxes[i].value;
  }
  return code;
}

/** clearCodeBoxes — empty every box. O(n) */
function clearCodeBoxes(group) {
  const boxes = codeBoxes(group);
  for (let i = 0; i < boxes.length; i++) {
    boxes[i].value = '';
    boxes[i].classList.remove('is-filled');
  }
}

/** fillCodeBoxes — put the digits of `text` into the boxes from `index` on; returns the next empty box. O(n) */
function fillCodeBoxes(group, index, text) {
  const boxes = codeBoxes(group);
  let at = index;
  for (let i = 0; i < text.length && at < boxes.length; i++) {
    if (isDigitChar(text[i])) {
      boxes[at].value = text[i];
      boxes[at].classList.add('is-filled');
      at++;
    }
  }
  return at;
}

/** focusCodeBox — focus (and select) one box; past the end means the last one. O(1) */
function focusCodeBox(group, index) {
  const boxes = codeBoxes(group);
  const box = boxes[index < boxes.length ? index : boxes.length - 1];
  box.focus({ preventScroll: true });
  box.select();
}

/** setCodeBoxesState — '' | 'error' (a short damped shake) | 'success' (green). O(1) */
function setCodeBoxesState(group, state) {
  group.classList.remove('is-error');
  group.classList.remove('is-success');
  if (state === 'error') {
    void group.offsetWidth;                 // restart the shake if it is already running
    group.classList.add('is-error');
  } else if (state === 'success') {
    group.classList.add('is-success');
  }
}

/**
 * wireCodeBoxes — keyboard, paste and auto-fill for a group.
 * onComplete() runs when all six digits are in; onEdit() runs when a digit is
 * typed while the boxes show an error (to clear the message).
 */
function wireCodeBoxes(group, onComplete, onEdit) {
  group.addEventListener('input', function (event) {
    const box = event.target;
    const index = Number(box.getAttribute('data-index'));
    const typed = box.value;
    box.value = '';
    box.classList.remove('is-filled');
    if (group.classList.contains('is-error') && onEdit) {
      onEdit();
    }
    const next = fillCodeBoxes(group, index, typed);     // one digit, or a whole code from auto-fill
    if (codeBoxesValue(group).length === CODE_LENGTH) {
      onComplete();
    } else if (next > index) {
      focusCodeBox(group, next);
    }
  });
  group.addEventListener('keydown', function (event) {
    const index = Number(event.target.getAttribute('data-index'));
    if (event.key === 'Backspace' && event.target.value === '' && index > 0) {
      event.preventDefault();
      const boxes = codeBoxes(group);
      boxes[index - 1].value = '';
      boxes[index - 1].classList.remove('is-filled');
      focusCodeBox(group, index - 1);
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusCodeBox(group, index - 1);
    } else if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      event.preventDefault();
      focusCodeBox(group, index + 1);
    }
  });
  group.addEventListener('paste', function (event) {
    const text = event.clipboardData ? event.clipboardData.getData('text') : '';
    event.preventDefault();
    clearCodeBoxes(group);
    const next = fillCodeBoxes(group, 0, text);
    if (codeBoxesValue(group).length === CODE_LENGTH) {
      onComplete();
    } else {
      focusCodeBox(group, next);
    }
  });
  group.addEventListener('focusin', function (event) {
    if (event.target.select) {
      event.target.select();
    }
  });
}
