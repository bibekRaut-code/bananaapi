'use strict';
/** One run (3 strikes). `pot` is at risk, `banked` is safe. All maths is done on the server. */
const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['active', 'over'], default: 'active' },
  banked: { type: Number, default: 0 },
  pot: { type: Number, default: 0 },
  chain: { type: Number, default: 0 },
  bestChain: { type: Number, default: 0 },
  solved: { type: Number, default: 0 },
  bestCashout: { type: Number, default: 0 },
  strikes: { type: Number, default: 0 },
  shields: { type: Number, required: true },
  currentRound: { type: mongoose.Schema.Types.ObjectId, ref: 'Round', default: null },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null }
});

module.exports = mongoose.model('Game', gameSchema);
