const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Camera, Gesture } = require("../map-gestures.js");
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function camera() {
  const c = new Camera(390, 640);
  c.zoom(0.3);
  return c;
}

test("zoom preserves the focal point and a uniform scale", () => {
  const c = camera(),
    p = c.point(140, 250);
  c.zoom(0.6, 140, 250);
  near(c.point(140, 250).x, p.x);
  near(c.point(140, 250).y, p.y);
  const v = c.viewBox();
  near(v[2] / v[3], 390 / 640);
});
test("pinch spread zooms in and pinch together zooms out", () => {
  const c = camera(),
    g = new Gesture(c),
    scale = c.scale;
  g.down(1, { x: 120, y: 300 });
  g.down(2, { x: 240, y: 300 });
  g.move(1, { x: 80, y: 300 });
  g.move(2, { x: 280, y: 300 });
  near(c.scale, (scale * 120) / 200);
  g.move(1, { x: 150, y: 300 });
  g.move(2, { x: 210, y: 300 });
  near(c.scale, scale * 2);
  assert.equal(g.up(1), false);
  assert.equal(g.up(2), false);
});
test("moving a pinch midpoint pans the anchored content", () => {
  const c = camera(),
    g = new Gesture(c),
    point = c.point(180, 300);
  g.down(1, { x: 120, y: 300 });
  g.down(2, { x: 240, y: 300 });
  g.move(1, { x: 130, y: 320 });
  g.move(2, { x: 250, y: 320 });
  near(c.point(190, 320).x, point.x);
  near(c.point(190, 320).y, point.y);
});
test("two fingers to one finger continues without a camera jump", () => {
  const c = camera(),
    g = new Gesture(c);
  g.down(1, { x: 100, y: 300 });
  g.down(2, { x: 240, y: 300 });
  g.move(2, { x: 280, y: 300 });
  g.up(2);
  const before = c.snapshot();
  g.move(1, { x: 100, y: 300 });
  near(c.x, before.x);
  near(c.y, before.y);
  near(c.scale, before.scale);
  g.move(1, { x: 110, y: 300 });
  near(c.x, before.x - 10 * before.scale);
  assert.equal(g.up(1), false);
});
test("tap slop, drags, cancellation, and a new independent gesture", () => {
  const c = camera(),
    g = new Gesture(c);
  g.down(1, { x: 100, y: 100 });
  g.move(1, { x: 103, y: 103 });
  assert.equal(g.up(1), true);
  g.down(1, { x: 100, y: 100 });
  g.move(1, { x: 120, y: 120 });
  assert.equal(g.up(1), false);
  g.down(1, { x: 100, y: 100 });
  assert.equal(g.up(1, true), false);
  g.down(2, { x: 100, y: 100 });
  assert.equal(g.up(2), true);
});
test("third finger does not corrupt the camera; all fingers can cancel", () => {
  const c = camera(),
    g = new Gesture(c);
  g.down(1, { x: 100, y: 200 });
  g.down(2, { x: 200, y: 200 });
  g.down(3, { x: 150, y: 300 });
  g.move(3, { x: 150, y: 400 });
  assert.ok(c.viewBox().every(Number.isFinite));
  for (const id of [1, 2, 3]) assert.equal(g.up(id, true), false);
  assert.equal(g.points.size, 0);
});
test("extreme zoom and pan stay finite, bounded, and proportional", () => {
  const c = camera();
  for (const f of [1e-12, 1e12, 0.4, 20]) {
    c.zoom(f, 190, 320);
    c.pan(1e6, -1e6);
    assert.ok(c.scale >= c.minScale && c.scale <= c.maxScale);
    const [x, y, w, h] = c.viewBox();
    near(w / h, 390 / 640);
    if (w < 1050) assert.ok(x >= 0 && x + w <= 1050 + 1e-8);
    if (h < 950) assert.ok(y >= 0 && y + h <= 950 + 1e-8);
  }
});
test("resize preserves the geographic center and uses new viewport proportions", () => {
  const c = camera(),
    center = c.point(195, 320);
  c.resize(640, 390);
  near(c.point(320, 195).x, center.x);
  near(c.point(320, 195).y, center.y);
  near(c.viewBox()[2] / c.viewBox()[3], 640 / 390);
});
test("fit keeps source points within padded camera viewport", () => {
  const c = new Camera(390, 640),
    points = [
      { x: 450, y: 200 },
      { x: 620, y: 700 },
    ];
  c.fit(points, { top: 80, right: 70, bottom: 100, left: 40 });
  for (const p of points) {
    const x = (p.x - c.x) / c.scale,
      y = (p.y - c.y) / c.scale;
    assert.ok(x >= 39 && x <= 321);
    assert.ok(y >= 79 && y <= 541);
  }
});
