'use strict';
/**
 * Pure game rules: no database, no HTTP. Because these are plain functions they are
 * easy to unit test (see tests/gameEngine.test.js) and easy to explain.
 *
 * The core loop is PUSH YOUR LUCK: every correct answer grows the POT (unsafe). You may CASH OUT
 * to move the pot into the bank (safe) but that resets your chain and multiplier. A wrong answer
 * or time-out destroys the pot and costs a strike.
 */
const { game: g } = require('../config');

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Chain multiplier for the n-th solve in a row: x1.0, x1.5, x2.0 ... capped. */
function multiplierFor(chain) {
  if (chain <= 0) return 1;
  return 1 + 0.5 * (Math.min(chain, g.maxChainForBonus) - 1);
}

/** Time allowed shrinks as the chain grows: the longer you push, the harder it gets. */
function timeLimitFor(chain) {
  return Math.max(g.minTimeMs, g.baseTimeMs - chain * g.stepMs);
}

/** Every 5th puzzle in a chain is a Gold Banana worth triple. */
function isGold(chain) {
  return chain > 0 && chain % g.goldEvery === 0;
}

/** Points for one correct answer. `chain` is the position of THIS puzzle in the chain (1, 2, 3...). */
function pointsFor({ chain, remainingMs, limitMs, gold }) {
  const ratio = clamp(remainingMs / limitMs, 0, 1);
  const raw = g.basePoints + Math.round(g.speedPoints * ratio);
  return Math.round(raw * multiplierFor(chain) * (gold ? g.goldMultiplier : 1));
}

/**
 * Judge an answer using the SERVER clock.
 * The solution never leaves the server until the round is resolved, and the timer the
 * player sees is only cosmetic, so neither can be tampered with from the browser.
 * @returns {{outcome: 'correct'|'wrong'|'timeout', remainingMs: number}}
 */
function evaluate({ answer, solution, issuedAt, now, limitMs }) {
  const elapsed = now - issuedAt;
  if (answer === null || answer === undefined || elapsed > limitMs + g.graceMs) {
    return { outcome: 'timeout', remainingMs: 0 };
  }
  const remainingMs = Math.max(0, limitMs - elapsed);
  return { outcome: answer === solution ? 'correct' : 'wrong', remainingMs };
}

module.exports = { multiplierFor, timeLimitFor, isGold, pointsFor, evaluate };
