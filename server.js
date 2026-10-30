'use strict';
/**
 * Banana Bank: entry point.
 * Express serves the static front end from /public and the JSON API from /api/*.
 *
 * AI-ASSISTANCE NOTE: scaffolded with an LLM (Claude, Anthropic). Replace with your own
 * reference text, and mark clearly any section you rewrote yourself.
 */
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const config = require('./config');
const { registerListeners } = require('./events/listeners');
const { errorHandler } = require('./utils/http');

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  registerListeners();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    next();
  });

  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/game', require('./routes/game'));
  app.use('/api', require('./routes/live'));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);

  app.listen(config.port, () => console.log(`Banana Bank running at http://localhost:${config.port}`));
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
