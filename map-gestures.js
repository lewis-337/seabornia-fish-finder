/* Shared, dependency-free camera math for the map and photograph viewer. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SeaborniaGestures = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  class Camera {
    constructor(width, height, world = { width: 1050, height: 950 }) {
      this.world = world;
      this.resize(width, height);
      this.reset();
    }
    resize(width, height) {
      const center = this.scale
        ? this.point(this.width / 2, this.height / 2)
        : null;
      this.width = Math.max(1, width);
      this.height = Math.max(1, height);
      this.maxScale = Math.max(
        this.world.width / this.width,
        this.world.height / this.height,
      );
      this.minScale = this.maxScale / 12;
      if (center) {
        this.x = center.x - (this.width * this.scale) / 2;
        this.y = center.y - (this.height * this.scale) / 2;
        this.constrain();
      }
    }
    reset() {
      this.scale = this.maxScale;
      this.x = (this.world.width - this.width * this.scale) / 2;
      this.y = (this.world.height - this.height * this.scale) / 2;
      this.constrain();
    }
    point(x, y) {
      return { x: this.x + x * this.scale, y: this.y + y * this.scale };
    }
    snapshot() {
      return { x: this.x, y: this.y, scale: this.scale };
    }
    restore(v) {
      Object.assign(this, v);
    }
    constrain() {
      this.scale = clamp(this.scale, this.minScale, this.maxScale);
      const w = this.width * this.scale,
        h = this.height * this.scale;
      this.x =
        w >= this.world.width
          ? (this.world.width - w) / 2
          : clamp(this.x, 0, this.world.width - w);
      this.y =
        h >= this.world.height
          ? (this.world.height - h) / 2
          : clamp(this.y, 0, this.world.height - h);
    }
    zoom(factor, x = this.width / 2, y = this.height / 2) {
      const anchor = this.point(x, y);
      this.scale = clamp(this.scale * factor, this.minScale, this.maxScale);
      this.x = anchor.x - x * this.scale;
      this.y = anchor.y - y * this.scale;
      this.constrain();
    }
    pan(dx, dy) {
      this.x -= dx * this.scale;
      this.y -= dy * this.scale;
      this.constrain();
    }
    fit(points, padding = { top: 80, right: 70, bottom: 120, left: 40 }) {
      const xs = points.map((p) => p.x),
        ys = points.map((p) => p.y);
      const l = Math.min(...xs),
        r = Math.max(...xs),
        t = Math.min(...ys),
        b = Math.max(...ys);
      const aw = Math.max(60, this.width - padding.left - padding.right),
        ah = Math.max(60, this.height - padding.top - padding.bottom);
      this.scale = clamp(
        Math.max((r - l) / aw, (b - t) / ah),
        this.minScale,
        this.maxScale,
      );
      this.x = (l + r) / 2 - (padding.left + aw / 2) * this.scale;
      this.y = (t + b) / 2 - (padding.top + ah / 2) * this.scale;
      this.constrain();
    }
    viewBox() {
      return [
        this.x,
        this.y,
        this.width * this.scale,
        this.height * this.scale,
      ];
    }
  }
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  class Gesture {
    constructor(camera) {
      this.camera = camera;
      this.points = new Map();
      this.moved = false;
      this.maxPointers = 0;
    }
    rebase() {
      this.base = this.camera.snapshot();
      this.start = [...this.points.values()].slice(0, 2).map((p) => ({ ...p }));
    }
    down(id, p) {
      if (!this.points.size) {
        this.moved = false;
        this.maxPointers = 0;
      }
      this.points.set(id, p);
      this.maxPointers = Math.max(this.maxPointers, this.points.size);
      if (this.points.size > 1) this.moved = true;
      this.rebase();
    }
    move(id, p) {
      if (!this.points.has(id)) return;
      this.points.set(id, p);
      const now = [...this.points.values()].slice(0, 2);
      if (!this.moved && distance(now[0], this.start[0]) < 7) return;
      this.moved = true;
      this.camera.restore(this.base);
      if (now.length === 1)
        this.camera.pan(now[0].x - this.start[0].x, now[0].y - this.start[0].y);
      else {
        const a = midpoint(...this.start),
          b = midpoint(...now),
          d = distance(...this.start);
        this.camera.zoom(d / Math.max(1, distance(...now)), a.x, a.y);
        this.camera.pan(b.x - a.x, b.y - a.y);
      }
    }
    up(id, cancelled = false) {
      const tap =
        !cancelled &&
        !this.moved &&
        this.maxPointers === 1 &&
        this.points.size === 1;
      this.points.delete(id);
      this.rebase();
      return tap;
    }
  }
  function bind(
    element,
    camera,
    { render, tap = () => {}, doubleTap = () => {}, onStart = () => {} },
  ) {
    const gesture = new Gesture(camera);
    let firstTarget,
      lastTap = null;
    const local = (e) => {
      const r = element.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!gesture.points.size) firstTarget = e.target;
      onStart();
      gesture.down(e.pointerId, local(e));
      element.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      gesture.move(e.pointerId, local(e));
      if (gesture.points.has(e.pointerId)) render();
    };
    const up = (e) => {
      const p = local(e),
        isTap = gesture.up(e.pointerId, e.type !== "pointerup");
      if (element.hasPointerCapture(e.pointerId))
        element.releasePointerCapture(e.pointerId);
      if (isTap) {
        const time = Date.now();
        if (
          lastTap &&
          time - lastTap.time < 320 &&
          distance(lastTap.p, p) < 24 &&
          !firstTarget.closest("[role=button]")
        ) {
          doubleTap(p);
          lastTap = null;
        } else {
          tap(p, firstTarget);
          lastTap = { time, p };
        }
      } else if (gesture.moved) lastTap = null;
    };
    const wheel = (e) => {
      e.preventDefault();
      const p = local(e);
      camera.zoom(Math.exp(clamp(e.deltaY, -200, 200) * 0.003), p.x, p.y);
      render();
    };
    const click = (e) => {
      if (e.detail !== 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const cancel = () => {
      for (const id of [...gesture.points.keys()]) gesture.up(id, true);
      lastTap = null;
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      element.addEventListener(name, up);
    element.addEventListener("wheel", wheel, { passive: false });
    element.addEventListener("click", click, true);
    window.addEventListener("blur", cancel);
    return {
      gesture,
      destroy() {
        cancel();
        element.removeEventListener("pointerdown", down);
        element.removeEventListener("pointermove", move);
        for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
          element.removeEventListener(name, up);
        element.removeEventListener("wheel", wheel);
        element.removeEventListener("click", click, true);
        window.removeEventListener("blur", cancel);
      },
    };
  }
  return { Camera, Gesture, bind };
});
