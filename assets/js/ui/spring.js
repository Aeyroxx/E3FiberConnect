/* ==========================================================================
   E3 Fiber Connect · ui/spring.js
   A tiny spring animator for gesture-driven motion (the phone bottom sheets).

   From Apple's "Designing Fluid Interfaces": describe a spring with
     response      how fast it reaches the target, in seconds (not a duration)
     dampingRatio  1 = no overshoot; below 1 = a little bounce
   It starts from the element's CURRENT position and the finger's velocity, so
   a flick continues without a seam and the motion can be interrupted.
   ========================================================================== */

'use strict';

/**
 * springAnimate — move a value from `from` to `to` with spring physics.
 * options: { from, to, velocity (units/s), response, dampingRatio, onUpdate(value), onComplete() }
 * Returns a record; set its `cancelled` field to true to stop (interrupt) it.
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
 * projectMomentum — where a flick would come to rest (Apple's projection):
 * distance = (v / 1000) · d / (1 − d), with deceleration rate d ≈ 0.998.
 */
function projectMomentum(velocity, decelerationRate) {
  const rate = decelerationRate || 0.998;
  return ((velocity / 1000) * rate) / (1 - rate);
}

/**
 * rubberband — resistance past an edge: the further you pull, the less the
 * element follows, like iOS scroll views.
 */
function rubberband(overshoot, dimension, constant) {
  const c = constant || 0.55;
  return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
}

/**
 * releaseVelocity — px/s from the last few pointer samples [{ y, t }].
 * Time O(1) (uses the first and last sample)
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
