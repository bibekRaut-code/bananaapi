'use strict';
/**
 * VIRTUAL IDENTITY: the persistent account. Note that only a bcrypt HASH of the password is
 * stored, never the password itself.
 */
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  avatar: { type: String, default: '🐵' },
  bestScore: { type: Number, default: 0, index: -1 },   // best amount banked in one run
  gamesPlayed: { type: Number, default: 0 },
  totalSolved: { type: Number, default: 0 },
  totalCashouts: { type: Number, default: 0 },
  biggestCashout: { type: Number, default: 0 },
  longestChain: { type: Number, default: 0 },
  achievements: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
});

/** What the browser is allowed to know about a user (never the hash). */
userSchema.statics.toPublic = function toPublic(u) {
  return {
    id: String(u._id),
    username: u.username,
    avatar: u.avatar,
    bestScore: u.bestScore,
    gamesPlayed: u.gamesPlayed,
    totalSolved: u.totalSolved,
    totalCashouts: u.totalCashouts,
    biggestCashout: u.biggestCashout,
    longestChain: u.longestChain,
    achievements: u.achievements
  };
};

module.exports = mongoose.model('User', userSchema);
