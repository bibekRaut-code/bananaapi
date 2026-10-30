'use strict';
// Run with:  npm test      (uses Node's built-in test runner, no extra packages)
const test = require('node:test');
const assert = require('node:assert/strict');
const e = require('../services/gameEngine');

test('chain multiplier grows by 0.5 per solve and is capped', () => {
  assert.equal(e.multiplierFor(0), 1);
  assert.equal(e.multiplierFor(1), 1);
  assert.equal(e.multiplierFor(3), 2);
  assert.equal(e.multiplierFor(20), 10.5);
  assert.equal(e.multiplierFor(99), 10.5);
});

test('time limit shrinks with the chain but has a floor', () => {
  assert.equal(e.timeLimitFor(0), 15000);
  assert.equal(e.timeLimitFor(5), 13000);
  assert.equal(e.timeLimitFor(100), 6000);
});

test('every 5th puzzle is gold', () => {
  assert.equal(e.isGold(1), false);
  assert.equal(e.isGold(5), true);
  assert.equal(e.isGold(10), true);
  assert.equal(e.isGold(0), false);
});

test('points reward speed, chain length and gold', () => {
  const full = { remainingMs: 10000, limitMs: 10000 };
  const none = { remainingMs: 0, limitMs: 10000 };
  assert.equal(e.pointsFor({ chain: 1, gold: false, ...full }), 100);
  assert.equal(e.pointsFor({ chain: 1, gold: false, ...none }), 50);
  assert.equal(e.pointsFor({ chain: 3, gold: false, ...full }), 200);
  assert.equal(e.pointsFor({ chain: 5, gold: true, ...full }), 900); // 100 * 3.0 * 3
});

test('evaluate: correct, wrong, timeout and late answers', () => {
  const base = { solution: 7, issuedAt: 0, limitMs: 10000 };
  assert.equal(e.evaluate({ ...base, answer: 7, now: 3000 }).outcome, 'correct');
  assert.equal(e.evaluate({ ...base, answer: 7, now: 3000 }).remainingMs, 7000);
  assert.equal(e.evaluate({ ...base, answer: 2, now: 3000 }).outcome, 'wrong');
  assert.equal(e.evaluate({ ...base, answer: null, now: 3000 }).outcome, 'timeout');
  assert.equal(e.evaluate({ ...base, answer: 7, now: 10500 }).outcome, 'correct'); // inside grace window
  assert.equal(e.evaluate({ ...base, answer: 7, now: 20000 }).outcome, 'timeout'); // far too late
});
