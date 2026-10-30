'use strict';
/**
 * Subscribers to the server-side event bus. Each handler reacts to ONE kind of event and
 * pushes a human-readable message to every connected browser through SSE.
 * Big wins and big losses are announced to everyone: public drama keeps players hooked.
 */
const { bus, EVENTS } = require('./bus');
const sse = require('../services/sse');

const fmt = (n) => Number(n).toLocaleString('en-GB');

function registerListeners() {
  bus.on(EVENTS.GAME_STARTED, ({ username, avatar }) => {
    sse.broadcast('feed', { kind: 'start', text: `${avatar} ${username} entered the vault` });
  });

  bus.on(EVENTS.CASHED_OUT, ({ username, avatar, cashed }) => {
    if (cashed >= 500) sse.broadcast('feed', { kind: 'cash', text: `${avatar} ${username} cashed out ${fmt(cashed)}` });
  });

  bus.on(EVENTS.STRIKE, ({ username, avatar, lostPot }) => {
    if (lostPot >= 300) sse.broadcast('feed', { kind: 'loss', text: `${avatar} ${username} busted a pot of ${fmt(lostPot)}` });
  });

  bus.on(EVENTS.ACHIEVEMENT, ({ username, avatar, achievement }) => {
    sse.broadcast('feed', { kind: 'badge', text: `${avatar} ${username} unlocked ${achievement.icon} ${achievement.name}` });
  });

  bus.on(EVENTS.GAME_OVER, ({ username, avatar, score, newHighScore }) => {
    if (score <= 0) return;
    const suffix = newHighScore ? ' (new personal best!)' : '';
    sse.broadcast('feed', { kind: 'over', text: `${avatar} ${username} left with ${fmt(score)} banked${suffix}` });
    sse.broadcast('leaderboard'); // tell clients the table is stale so they re-fetch it
  });

  bus.on(EVENTS.ROUND_RESOLVED, ({ username, outcome, points }) => {
    if (process.env.DEBUG_EVENTS) console.log(`[event] ${username} ${outcome} ${points}`);
  });
}

module.exports = { registerListeners };
