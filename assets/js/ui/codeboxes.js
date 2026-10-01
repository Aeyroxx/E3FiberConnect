/* ==========================================================================
   E3 Fiber Connect - ui/codeboxes.js
   Yung anim na box (tig-isang digit) para sa verification code - gamit ito ng
   Google Authenticator sheet at ng "Forgot password". Ang group ay kahit anong
   element na may anim na <input class="otp-digit" data-index="0...5">.

   Parang sa Apple yung behavior: bawat pindot lilipat sa susunod na box, pag
   Backspace babalik, gumagana yung arrows, at pag nag-paste o nag-auto-fill ng
   code, sabay-sabay na mapupuno yung anim. Pag na-type na yung pang-anim na
   digit, kusa na siyang mag-susubmit.
   ========================================================================== */

'use strict';

const CODE_LENGTH = 6;

/** codeBoxes - yung anim na box ng isang group. O(1) */
function codeBoxes(group) {
  return group.querySelectorAll('.otp-digit');
}

/** codeBoxesValue - yung mga digit na na-type na so far. O(n) */
function codeBoxesValue(group) {
  const boxes = codeBoxes(group);
  let code = '';
  for (let i = 0; i < boxes.length; i++) {
    code += boxes[i].value;
  }
  return code;
}

/** clearCodeBoxes - burahin yung laman ng bawat box. O(n) */
function clearCodeBoxes(group) {
  const boxes = codeBoxes(group);
  for (let i = 0; i < boxes.length; i++) {
    boxes[i].value = '';
    boxes[i].classList.remove('is-filled');
  }
}

/** fillCodeBoxes - ilagay yung mga digit ng `text` sa boxes simula sa `index`; binabalik yung susunod na bakanteng box. O(n) */
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

/** focusCodeBox - i-focus (at i-select) yung isang box; pag lumampas, yung huling box na lang. O(1) */
function focusCodeBox(group, index) {
  const boxes = codeBoxes(group);
  const box = boxes[index < boxes.length ? index : boxes.length - 1];
  box.focus({ preventScroll: true });
  box.select();
}

/** setCodeBoxesState - '' | 'error' (maikling yanig na humihina agad) | 'success' (green). O(1) */
function setCodeBoxesState(group, state) {
  group.classList.remove('is-error');
  group.classList.remove('is-success');
  if (state === 'error') {
    void group.offsetWidth;                 // ulitin yung shake kung tumatakbo pa
    group.classList.add('is-error');
  } else if (state === 'success') {
    group.classList.add('is-success');
  }
}

/**
 * wireCodeBoxes - keyboard, paste at auto-fill para sa isang group.
 * Tatakbo yung onComplete() pag kumpleto na yung anim na digit; yung onEdit() naman
 * pag may na-type habang naka-error yung boxes (para mawala na yung message).
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
    const next = fillCodeBoxes(group, index, typed);     // isang digit, o buong code galing sa auto-fill
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
