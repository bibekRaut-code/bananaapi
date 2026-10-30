'use strict';
/** Public read-only endpoints: leaderboard (REST) and the live event stream (SSE). */
const express = require('express');
const User = require('../models/User');
const sse = require('../services/sse');
const { wrap } = require('../utils/http');

const router = express.Router();

router.get('/leaderboard', wrap(async (req, res) => {
  const rows = await User.find({ bestScore: { $gt: 0 } })
    .sort({ bestScore: -1 })
    .limit(10)
    .select('username avatar bestScore biggestCashout')
    .lean();
  res.json({
    leaderboard: rows.map((r, i) => ({
      rank: i + 1,
      username: r.username,
      avatar: r.avatar,
      bestScore: r.bestScore,
      biggestCashout: r.biggestCashout
    }))
  });
}));

router.get('/events', (req, res) => sse.addClient(req, res));

module.exports = router;
