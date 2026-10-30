/**
 * EVENT-DRIVEN PROGRAMMING (browser side).
 * A tiny publish/subscribe bus built on the browser's own EventTarget + CustomEvent.
 * The game logic (game.js) only announces what happened ("round:result"); the UI, the sound
 * module and the toast system each subscribe independently in main.js. None of them know
 * about each other, so adding a feature (say, screen shake) means adding one listener.
 *
 * Event sources in this app:
 *   1. DOM events      click / keydown / submit            (user input)
 *   2. Custom events   round:ready, timer:tick, ...         (this bus)
 *   3. Server events   EventSource 'feed' / 'leaderboard'   (pushed by the server over SSE)
 *   4. Timers          requestAnimationFrame / setTimeout   (time as an event source)
 */
class Bus extends EventTarget {
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  on(type, handler) { this.addEventListener(type, (e) => handler(e.detail)); }
}

export const events = new Bus();
