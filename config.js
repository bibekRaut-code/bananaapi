'use strict';
/**
 * Central configuration. Game balance lives here so it can be tuned in one place
 * (and so the video can point at a single file when explaining the rules).
 *
 * AI-ASSISTANCE NOTE: This project was scaffolded with the help of an LLM (Claude, Anthropic).
 * Replace this note with your own reference text/date as your unit requires.
 */
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

module.exports = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/banana-bank',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-do-not-use-in-production',
  cookieName: 'bb_token',
  sessionDays: 7,

  // Third-party web service we interoperate with (INTEROPERABILITY theme).
  banana: {
    url: 'https://marcconrad.com/uob/banana/api.php',
    timeoutMs: 6000
  },

  game: {
    strikes: 3,            // 3 busted pots and the vault locks
    shields: 1,            // one free "save my pot" per run
    baseTimeMs: 15000,     // time for the first puzzle of a chain
    stepMs: 400,           // every solve in the chain trims 0.4 s...
    minTimeMs: 6000,       // ...down to this floor
    graceMs: 3000,         // network allowance when the server checks the clock
    goldEvery: 5,          // every 5th puzzle in a chain is a Gold Banana (x3 points)
    goldMultiplier: 3,
    maxChainForBonus: 20,
    basePoints: 50,        // 50 for solving + up to 50 for speed, then multiplied
    speedPoints: 50
  },

  achievements: {
    first_deposit:    { icon: '🏦', name: 'First Deposit',     desc: 'Cash out for the first time' },
    gold_digger:      { icon: '🥇', name: 'Gold Digger',       desc: 'Solve a Gold Banana puzzle' },
    nerves_of_steel:  { icon: '🧊', name: 'Nerves of Steel',   desc: 'Reach a chain of 10' },
    big_pot:          { icon: '💰', name: 'Big Pot',           desc: 'Cash out 1,500+ in one go' },
    tycoon:           { icon: '👑', name: 'Tycoon',            desc: 'Bank 5,000 in a single run' }
  },

  avatars: ['🐵', '🦍', '🦧', '🐒', '🦜', '🐘', '🐯', '🦥']
};
