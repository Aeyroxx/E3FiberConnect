/* ==========================================================================
   E3 Fiber Connect - ui/spring.js
   Maliit na spring animator para sa galaw na sumusunod sa daliri (yung mga
   bottom sheet sa phone).

   Kinuha namin sa "Designing Fluid Interfaces" ng Apple: dalawang value lang
   ang kailangan para i-describe yung spring
     response      gaano kabilis siya umaabot sa target, in seconds (hindi ito duration)
     dampingRatio  1 = hindi lalampas sa target; pag mas mababa sa 1 = may konting talbog
   Nagsisimula siya sa KASALUKUYANG position ng element at sa bilis ng daliri,
   kaya tuloy-tuloy lang yung galaw pag pinitik, at pwede rin siyang putulin sa gitna.
   ========================================================================== */

'use strict';

/**
 * springAnimate - igagalaw yung value mula `from` papuntang `to` gamit spring physics.
 * options: { from, to, velocity (units/s), response, dampingRatio, onUpdate(value), onComplete() }
 * Record yung binabalik; gawing true yung `cancelled` field nito para itigil (i-interrupt).
 */
function springAnimate(options) {
  const response = options.response || 0.35;
  const dampingRatio = options.dampingRatio === undefined ? 1 : options.dampingRatio;
  const stiffness = Math.pow((2 * Math.PI) / response, 2);
  const damping = (4 * Math.PI * dampingRatio) / response;
  const control = { cancelled: false };
  let position = options.from;
  let velocity = options.velocity || 0;
  let last = performance.now();

  function step(now) {
    if (control.cancelled) {
      return;
    }
    const elapsed = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const substeps = 4;
    const h = elapsed / substeps;
    for (let i = 0; i < substeps; i++) {
      const force = -stiffness * (position - options.to) - damping * velocity;
      velocity += force * h;
      position += velocity * h;
    }
    const settled = Math.abs(position - options.to) < 0.5 && Math.abs(velocity) < 8;
    options.onUpdate(settled ? options.to : position);
    if (settled) {
      if (options.onComplete) {
        options.onComplete();
      }
      return;
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  return control;
}

/**
 * projectMomentum - kung saan titigil yung pinitik na sheet (yung projection ng Apple):
 * distance = (v / 1000) * d / (1 - d), kung saan yung deceleration rate d ay mga 0.998.
 */
function projectMomentum(velocity, decelerationRate) {
  const rate = decelerationRate || 0.998;
  return ((velocity / 1000) * rate) / (1 - rate);
}

/**
 * rubberband - pigil pag lumampas na sa dulo: habang palayo yung hila mo, lalong
 * kumokonti yung sinusundan ng element, parang yung scroll views sa iOS.
 */
function rubberband(overshoot, dimension, constant) {
  const c = constant || 0.55;
  return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
}

/**
 * releaseVelocity - px/s galing sa huling ilang pointer sample [{ y, t }].
 * Time: O(1) (yung una at huling sample lang yung ginagamit)
 */
function releaseVelocity(samples) {
  if (samples.length < 2) {
    return 0;
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  const seconds = (last.t - first.t) / 1000;
  return seconds > 0 ? (last.y - first.y) / seconds : 0;
}
