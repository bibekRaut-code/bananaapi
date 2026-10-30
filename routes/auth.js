'use strict';
/** VIRTUAL IDENTITY: register, log in, log out, "who am I". */
const express = require('express');
const bcrypt = require('bcryptjs');
const config = require('../config');
const User = require('../models/User');
const { startSession, endSession, loadUser } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { HttpError, wrap } = require('../utils/http');

const router = express.Router();
const USERNAME_RE = /^[a-z0-9_]{3,16}$/;
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// Compared against when the username does not exist, so a miss takes as long as a hit
// (stops attackers discovering valid usernames by timing).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function readCredentials(body) {
  const username = String(body.username || '').trim().toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  return { username, password };
}

router.post('/register', authLimiter, wrap(async (req, res) => {
  const { username, password } = readCredentials(req.body);
  if (!USERNAME_RE.test(username)) throw new HttpError(400, 'Username must be 3-16 letters, numbers or underscores');
  if (password.length < 6 || password.length > 72) throw new HttpError(400, 'Password must be 6-72 characters');
  const avatar = config.avatars.includes(req.body.avatar) ? req.body.avatar : config.avatars[0];

  if (await User.exists({ username })) throw new HttpError(409, 'That username is already taken');

  const passwordHash = await bcrypt.hash(password, 12); // salted + slow on purpose
  const user = await User.create({ username, passwordHash, avatar });
  startSession(res, user);
  res.status(201).json({ user: User.toPublic(user), achievements: config.achievements });
}));

router.post('/login', authLimiter, wrap(async (req, res) => {
  const { username, password } = readCredentials(req.body);
  const user = await User.findOne({ username });
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Wrong username or password'); // same message for both cases
  startSession(res, user);
  res.json({ user: User.toPublic(user), achievements: config.achievements });
}));

router.post('/logout', (req, res) => {
  endSession(res);
  res.json({ ok: true });
});

router.get('/me', wrap(async (req, res) => {
  const user = await loadUser(req);
  if (!user) throw new HttpError(401, 'Not logged in');
  res.json({ user: User.toPublic(user), achievements: config.achievements, avatars: config.avatars });
}));

router.get('/avatars', (req, res) => res.json({ avatars: config.avatars }));

module.exports = router;
