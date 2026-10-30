/**
 * Client-side run controller. It owns the timer and talks to our API, and it ANNOUNCES what
 * happens through the event bus. It never touches the DOM, which keeps it easy to explain
 * and to test.
 *
 * The countdown here is cosmetic: the server judges time with its own clock.
 */
import { api } from './api.js';
import { events } from './events.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Run {
  constructor() {
    this.game = null;
    this.round = null;
    this.deadline = 0;     // performance.now() value at which the countdown hits zero
    this.raf = 0;
    this.busy = true;      // true while loading, submitting or showing feedback
    this.finished = false;
    this.token = 0;        // guards against late image loads from an older round
    this.tick = this.tick.bind(this);
  }

  async start() {
    const { game, round } = await api.startGame();
    this.game = game;
    events.emit('game:started', { game });
    this.present(round);
  }

  present(round) {
    this.round = round;
    this.busy = true;
    this.deadline = 0;
    const token = ++this.token;
    events.emit('round:loading', { game: this.game, round });

    this.preload(round.imageUrl, 3).then((ok) => {
      if (token !== this.token || this.finished) return;
      this.busy = false;
      if (!ok) { events.emit('round:failed', { game: this.game }); return; }
      this.deadline = performance.now() + round.timeLimitMs; // the clock starts when the image is visible
      events.emit('round:ready', { game: this.game, round });
      this.tick();
    });
  }

  preload(url, tries) {
    return new Promise((resolve) => {
      const attempt = (n) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => (n > 1 ? setTimeout(() => attempt(n - 1), 500) : resolve(false));
        img.src = url;
      };
      attempt(tries);
    });
  }

  tick() {
    const remaining = Math.max(0, this.deadline - performance.now());
    events.emit('timer:tick', { remaining, limit: this.round.timeLimitMs });
    if (remaining <= 0) { this.submit(null); return; } // time-out is just another event
    this.raf = requestAnimationFrame(this.tick);
  }

  freeze() {
    this.busy = true;
    cancelAnimationFrame(this.raf);
    this.deadline = 0;
  }

  async submit(answer) {
    if (this.busy || this.finished || !this.deadline) return;
    this.freeze();
    events.emit('round:submitted', { answer });
    try {
      const res = await api.answer({ gameId: this.game.id, roundId: this.round.id, answer });
      await this.handle(res, 'round:result');
    } catch (err) {
      events.emit('run:error', { message: err.message });
      await this.recover();
    }
  }

  /** Bank the pot. Allowed any time a puzzle is on screen and the pot is not empty. */
  async cashOut() {
    if (this.busy || this.finished || this.game.pot <= 0) return;
    this.freeze();
    events.emit('round:submitted', { answer: null });
    try {
      const res = await api.cashout({ gameId: this.game.id });
      await this.handle(res, 'pot:cashedOut');
    } catch (err) {
      events.emit('run:error', { message: err.message });
      await this.recover();
    }
  }

  async quit() {
    if (this.finished) return;
    this.finished = true;
    this.token++;
    cancelAnimationFrame(this.raf);
    try {
      const r = await api.quit({ gameId: this.game.id });
      events.emit('game:over', { summary: r.summary, game: r.game, quit: true });
    } catch (err) {
      events.emit('run:error', { message: err.message });
      events.emit('run:lost');
    }
  }

  async handle(res, eventName) {
    this.game = res.game;
    if (res.next) new Image().src = res.next.imageUrl; // prefetch while feedback is on screen
    events.emit(eventName, res);
    for (const badge of res.achievements || []) events.emit('achievement', badge);

    if (res.gameOver) {
      this.finished = true;
      await sleep(1500);
      events.emit('game:over', { summary: res.summary, game: res.game, quit: false });
      return;
    }
    await sleep(eventName === 'round:result' && res.outcome === 'correct' ? 750 : 1200);
    if (this.finished) return;
    if (res.next) this.present(res.next);
    else if (res.needsNext) await this.recover();
  }

  /** Ask the server for the current (or a fresh) puzzle, e.g. after a network blip. */
  async recover(retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const r = await api.next({ gameId: this.game.id });
        this.game = r.game;
        this.present(r.round);
        return;
      } catch (err) {
        if (err.status === 404) { this.finished = true; events.emit('run:lost'); return; }
        await sleep(1500);
      }
    }
    this.busy = false;
    events.emit('run:error', { message: 'Cannot reach the puzzle service. End the run or try again.' });
  }
}
