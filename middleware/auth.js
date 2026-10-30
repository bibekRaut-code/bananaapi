'use strict';
/**
 * VIRTUAL IDENTITY: session handling.
 * After login the server signs a JSON Web Token (JWT) and stores it in an httpOnly cookie.
 * httpOnly means JavaScript in the page cannot read it, which limits the damage of an XSS bug.
 * On every request this middleware verifies the signature and loads the user.
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const { HttpError, wrap } = require('../utils/http');

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',          // blocks the cookie on cross-site POSTs (basic CSRF defence)
  secure: config.isProd,    // HTTPS only in production
  maxAge: config.sessionDays * 24 * 60 * 60 * 1000
};

function startSession(res, user) {
  const token = jwt.sign({ sub: String(user._id) }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  res.cookie(config.cookieName, token, cookieOptions);
}

function endSession(res) {
  const { maxAge, ...opts } = cookieOptions; // eslint-disable-line no-unused-vars
  res.clearCookie(config.cookieName, opts);
}

async function loadUser(req) {
  const token = req.cookies && req.cookies[config.cookieName];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return await User.findById(payload.sub).select('-passwordHash').lean();
  } catch {
    return null; // expired or tampered token
  }
}

/** Routes behind this need a logged-in player. */
const requireAuth = wrap(async (req, res, next) => {
  const user = await loadUser(req);
  if (!user) throw new HttpError(401, 'Please log in to play');
  req.user = user;
  next();
});

module.exports = { startSession, endSession, loadUser, requireAuth };
