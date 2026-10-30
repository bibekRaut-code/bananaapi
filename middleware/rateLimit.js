'use strict';
/**
 * Tiny in-memory rate limiter (no extra dependency) used on login/register to slow down
 * password-guessing. In a multi-server deployment you would use a shared store such as Redis.
 */
function rateLimit({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, resetAt }

  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const entry = hits.get(req.ip) || { count: 0, resetAt: now + windowMs };
    entry.count += 1;
    hits.set(req.ip, entry);
    if (entry.count > max) {
      const wait = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(wait));
      return res.status(429).json({ error: message || `Too many attempts. Try again in ${wait}s.` });
    }
    next();
  };
}

module.exports = { rateLimit };
