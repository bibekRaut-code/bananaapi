'use strict';
/**
 * One puzzle handed to a player. The `solution` copied from the Banana API is kept HERE, on
 * the server, and is only revealed to the browser after the round is resolved.
 */
const mongoose = require('mongoose');

const roundSchema = new mongoose.Schema({
  game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, index: true },
  imageUrl: { type: String, required: true },
  solution: { type: Number, required: true, min: 0, max: 9 },
  chain: { type: Number, required: true },       // position of this puzzle in the chain (1, 2, 3...)
  gold: { type: Boolean, default: false },
  timeLimitMs: { type: Number, required: true },
  issuedAt: { type: Date, default: Date.now },
  answeredAt: { type: Date, default: null },
  resolved: { type: Boolean, default: false }
});

module.exports = mongoose.model('Round', roundSchema);
