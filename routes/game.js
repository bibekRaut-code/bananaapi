'use strict';
/**
 * Game API. The server is the banker AND the referee: it fetches the puzzle, keeps the answer
 * secret, judges the reply with its own clock, and owns the pot / bank totals.
 *
 *   POST /api/game/start     begin a run, returns first puzzle
 *   POST /api/game/answer    submit a digit (or null on timeout)
 *   POST /api/game/cashout   bank the pot (resets the chain), returns a fresh puzzle
 *   POST /api/game/next      (re)issue a puzzle if the previous fetch failed
 *   POST /api/game/quit      leave the vault, banking whatever is in the pot
 */
const express = require('express');
const config = require('../config');
const Game = require('../models/Game');
const Round = require('../models/Round');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { fetchPuzzle } = require('../services/bananaClient');
const engine = require('../services/gameEngine');
const { bus, EVENTS } = require('../events/bus');
const { HttpError, wrap } = require('../utils/http');

const router = express.Router();
router.use(requireAuth);

// ---- helpers -------------------------------------------------------------------------

const publicGame = (g) => ({
  id: String(g._id),
  banked: g.banked,
  pot: g.pot,
  chain: g.chain,
  multiplier: engine.multiplierFor(g.chain + 1), // what the NEXT solve will be multiplied by
  strikes: g.strikes,
  maxStrikes: config.game.strikes,
  shields: g.shields,
  bestChain: g.bestChain,
  solved: g.solved
});

// Note: the solution is deliberately NOT included here.
const publicRound = (r) => ({
  id: String(r._id),
  imageUrl: r.imageUrl,
  chain: r.chain,
  gold: r.gold,
  timeLimitMs: r.timeLimitMs,
  maxPoints: engine.pointsFor({ chain: r.chain, remainingMs: r.timeLimitMs, limitMs: r.timeLimitMs, gold: r.gold })
});

async function issueRound(game) {
  const puzzle = await fetchPuzzle();                      // <-- interoperability with Banana API
  const chain = game.chain + 1;
  const round = await Round.create({
    game: game._id,
    imageUrl: puzzle.imageUrl,
    solution: puzzle.solution,
    chain,
    gold: engine.isGold(chain),
    timeLimitMs: engine.timeLimitFor(game.chain)
  });
  game.currentRound = round._id;
  await game.save();
  return publicRound(round);
}

async function findActiveGame(req) {
  const game = await Game.findOne({ _id: req.body.gameId, user: req.user._id, status: 'active' });
  if (!game) throw new HttpError(404, 'No active game found. Start a new run.');
  return game;
}

/** Atomically mark a round resolved. Returns null if it was already resolved (double submit). */
const resolveRound = (roundId, gameId) =>
  Round.findOneAndUpdate(
    { _id: roundId, game: gameId, resolved: false },
    { resolved: true, answeredAt: new Date() },
    { new: true }
  );

async function finishGame(game, user, { bankPot = true } = {}) {
  if (bankPot && game.pot > 0) { game.banked += game.pot; game.pot = 0; }
  game.status = 'over';
  game.endedAt = new Date();
  game.currentRound = null;
  await game.save();

  const newHighScore = game.banked > user.bestScore;
  await User.updateOne({ _id: user._id }, { $inc: { gamesPlayed: 1 }, $max: { bestScore: game.banked } });
  const summary = {
    score: game.banked,
    bestChain: game.bestChain,
    solved: game.solved,
    bestCashout: game.bestCashout,
    strikes: game.strikes,
    newHighScore,
    bestScore: Math.max(user.bestScore, game.banked)
  };
  bus.emit(EVENTS.GAME_OVER, { username: user.username, avatar: user.avatar, ...summary });
  return summary;
}

/** Store newly earned badges (plus any counters in `update`) and announce them. */
async function award(user, candidates, update = {}) {
  const fresh = candidates.filter((id) => !user.achievements.includes(id));
  if (fresh.length) update.$addToSet = { achievements: { $each: fresh } };
  if (Object.keys(update).length) await User.updateOne({ _id: user._id }, update);
  user.achievements.push(...fresh);
  const badges = fresh.map((id) => ({ id, ...config.achievements[id] }));
  for (const achievement of badges) {
    bus.emit(EVENTS.ACHIEVEMENT, { username: user.username, avatar: user.avatar, achievement });
  }
  return badges;
}

// ---- routes --------------------------------------------------------------------------

router.post('/start', wrap(async (req, res) => {
  const old = await Game.findOne({ user: req.user._id, status: 'active' });
  if (old) await finishGame(old, req.user); // only one live run per player (an abandoned pot is banked)

  const game = await Game.create({ user: req.user._id, shields: config.game.shields });
  let round;
  try {
    round = await issueRound(game);
  } catch (err) {
    await game.deleteOne();
    throw err;
  }
  bus.emit(EVENTS.GAME_STARTED, { username: req.user.username, avatar: req.user.avatar });
  res.json({ game: publicGame(game), round });
}));

router.post('/answer', wrap(async (req, res) => {
  let { answer } = req.body;
  if (answer !== null && answer !== undefined) {
    answer = Number(answer);
    if (!Number.isInteger(answer) || answer < 0 || answer > 9) throw new HttpError(400, 'Answer must be a digit from 0 to 9');
  }
  const game = await findActiveGame(req);
  const round = await resolveRound(req.body.roundId, game._id);
  if (!round) throw new HttpError(409, 'That puzzle has already been answered');

  const { outcome, remainingMs } = engine.evaluate({
    answer,
    solution: round.solution,
    issuedAt: round.issuedAt.getTime(),
    now: Date.now(),
    limitMs: round.timeLimitMs
  });

  const body = {
    outcome, solution: round.solution, gold: round.gold,
    points: 0, lostPot: 0, shielded: false, achievements: [],
    next: null, needsNext: false, gameOver: false, summary: null
  };

  if (outcome === 'correct') {
    game.chain = round.chain;
    game.bestChain = Math.max(game.bestChain, game.chain);
    game.solved += 1;
    body.points = engine.pointsFor({ chain: round.chain, remainingMs, limitMs: round.timeLimitMs, gold: round.gold });
    game.pot += body.points;

    const earned = [];
    if (round.gold) earned.push('gold_digger');
    if (game.chain >= 10) earned.push('nerves_of_steel');
    body.achievements = await award(req.user, earned, { $inc: { totalSolved: 1 }, $max: { longestChain: game.bestChain } });
  } else if (game.shields > 0 && game.pot > 0) {
    // The shield eats the mistake: pot is kept, no strike, but the chain is broken.
    game.shields -= 1;
    game.chain = 0;
    body.shielded = true;
  } else {
    body.lostPot = game.pot;
    game.pot = 0;
    game.chain = 0;
    game.strikes += 1;
    bus.emit(EVENTS.STRIKE, { username: req.user.username, avatar: req.user.avatar, lostPot: body.lostPot });
  }

  bus.emit(EVENTS.ROUND_RESOLVED, { username: req.user.username, outcome, points: body.points });

  if (game.strikes >= config.game.strikes) {
    body.gameOver = true;
    body.summary = await finishGame(game, req.user, { bankPot: false });
  } else {
    await game.save();
    try {
      body.next = await issueRound(game);
    } catch {
      body.needsNext = true; // Banana API hiccup: the client will call /next to retry
    }
  }
  body.game = publicGame(game);
  res.json(body);
}));

router.post('/cashout', wrap(async (req, res) => {
  const game = await findActiveGame(req);
  if (game.pot <= 0) throw new HttpError(400, 'The pot is empty. Solve a puzzle first.');
  if (!game.currentRound) throw new HttpError(409, 'Wait for the next puzzle, then try again.');
  const round = await resolveRound(game.currentRound, game._id); // abandons the puzzle on screen
  if (!round) throw new HttpError(409, 'That puzzle has already been answered');

  const cashed = game.pot;
  game.banked += cashed;
  game.pot = 0;
  game.chain = 0; // banking resets the chain and its multiplier: that is the price of safety
  game.bestCashout = Math.max(game.bestCashout, cashed);

  const earned = [];
  if (req.user.totalCashouts === 0) earned.push('first_deposit');
  if (cashed >= 1500) earned.push('big_pot');
  if (game.banked >= 5000) earned.push('tycoon');
  const achievements = await award(req.user, earned, { $inc: { totalCashouts: 1 }, $max: { biggestCashout: cashed } });
  req.user.totalCashouts += 1;

  bus.emit(EVENTS.CASHED_OUT, { username: req.user.username, avatar: req.user.avatar, cashed });
  await game.save();

  const body = { cashed, achievements, next: null, needsNext: false };
  try {
    body.next = await issueRound(game);
  } catch {
    body.needsNext = true;
  }
  body.game = publicGame(game);
  res.json(body);
}));

router.post('/next', wrap(async (req, res) => {
  const game = await findActiveGame(req);
  const current = game.currentRound ? await Round.findById(game.currentRound) : null;
  const round = current && !current.resolved ? publicRound(current) : await issueRound(game);
  res.json({ game: publicGame(game), round });
}));

router.post('/quit', wrap(async (req, res) => {
  const game = await findActiveGame(req);
  const summary = await finishGame(game, req.user); // whatever is in the pot gets banked
  res.json({ summary, game: publicGame(game) });
}));

module.exports = router;
