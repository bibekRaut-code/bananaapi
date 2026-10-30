# Banana Bank

A push-your-luck puzzle game built on the [Banana API](https://marcconrad.com/uob/banana/doc.php).
Solve banana puzzles to grow your **pot**. Cash out to move it into the **bank** (safe), or push on for a
bigger multiplier. One wrong answer or time-out destroys the pot and costs a strike. Three strikes lock the vault.

**Stack:** Node.js + Express, MongoDB (Mongoose), vanilla JavaScript front end (ES modules), Server-Sent Events.

## Why it is addictive (and what to say about it)

- **Risk vs reward every single puzzle:** the pot is at risk, the bank is safe. Cashing out resets your chain and multiplier,
  so safety has a real price.
- **Escalation:** multiplier +0.5 per solve, every 5th puzzle is a Gold Banana worth x3, but the clock shrinks as the chain grows.
- **Near-miss and loss drama:** the pot glows from gold to red as the chain climbs; big busts and big cash-outs are announced
  live to every player's "Vault gossip" feed.
- **One-more-go loop:** instant restart, personal best tracking, badges, a shared leaderboard.

## Run it

1. Install Node.js 18+ and MongoDB (local) or create a free MongoDB Atlas cluster.
2. In this folder:
   ```bash
   npm install
   cp .env.example .env      # then edit JWT_SECRET (and MONGODB_URI if using Atlas)
   npm start                 # http://localhost:3000
   npm test                  # unit tests for the scoring rules
   ```
3. Open two browser windows with two accounts to watch the live feed and leaderboard update in real time.

## Rules (all tunable in `config.js`)

| Rule | Value |
|------|-------|
| Points per solve | (50 + up to 50 speed bonus) x chain multiplier |
| Chain multiplier | x1.0, x1.5, x2.0 ... capped at x10.5 |
| Gold Banana | every 5th puzzle in a chain, x3 |
| Time per puzzle | 15 s, minus 0.4 s per chain step, floor 6 s |
| Strikes | 3 (wrong answer or time-out with an empty pot) |
| Shield | 1 per run: saves a pot once (chain resets, no strike) |
| Cash out | pot moves to bank, chain resets to 0 |
| Final score | amount banked (leaving the vault banks the pot) |

## Folder map

```
server.js              entry point: Express, MongoDB connection, routes
config.js              game balance, cookie/JWT settings, badge catalogue
models/                User, Game, Round (Mongoose schemas)
routes/auth.js         register / login / logout / me
routes/game.js         start / answer / cashout / next / quit  (banker + referee)
routes/live.js         leaderboard + SSE stream
middleware/            auth (JWT cookie), rateLimit
services/bananaClient.js   INTEROPERABILITY: calls the Banana API
services/gameEngine.js     pure scoring/chain rules (unit tested)
services/sse.js            server-push hub
events/bus.js, listeners.js    server-side event bus (EventEmitter)
public/                index.html, css/style.css, js/ (api, events, game, audio, main)
tests/                 node:test unit tests
```

## The four themes, mapped to this code

Use this as a checklist for your video. The marking criteria reward *your own* understanding, so read the files
named here and be ready to explain **why** things are done this way.

### 1. Version control
- Modular layout: models, routes, services, middleware and front-end modules are separate files, so changes are small
  and merge conflicts rare. `services/gameEngine.js` contains no database or HTTP code, which is why it could be unit tested alone.
- Workflow (see "Git workflow"): feature branches, small commits, tags for releases. `.gitignore` keeps `node_modules` and
  `.env` (secrets) out of history; `package.json` pins dependencies.
- Higher marks: compare alternatives (trunk-based vs feature branches, one repo vs separate front/back repos), pull-request
  reviews, and tagging `v1.0.0` for the submission.

### 2. Event-driven programming
- **Browser:** DOM events (`click`, `keydown`, `submit`), a custom pub/sub bus (`public/js/events.js`), and timer events
  (`requestAnimationFrame` emits `timer:tick`; a time-out is just another event). `game.js` only *announces*
  (`round:result`, `pot:cashedOut`); `main.js` has separate listeners for the HUD, sound, shake, toasts and the heat glow.
- **Server:** a Node `EventEmitter` (`events/bus.js`). Routes emit `pot:cashedOut`, `pot:busted`, `game:over`, etc.;
  `events/listeners.js` reacts by pushing messages to every browser via Server-Sent Events (`services/sse.js`).
- Justify: decoupling (a new feature = a new listener), non-blocking I/O, and SSE rather than polling or WebSockets
  (we only need one-way push).

### 3. Interoperability
- `services/bananaClient.js` calls the third-party Banana web service over HTTPS (REST-style GET, JSON reply
  `{question: <image url>, solution: <digit>}`). Only the protocol and data format are shared with that system.
- The **browser never calls the Banana API**. Our server does, keeps the solution in MongoDB and only reveals it after the
  round is resolved. This stops cheating (the stakes here are the pot), avoids CORS problems, lets us validate untrusted
  data, and lets us time out (6 s) and return a clean 502 if the service is down.
- Also interoperating: browser <-> server (JSON REST + SSE), server <-> MongoDB (driver protocol).
- Higher marks: alternatives (calling the API from the browser, `base64=yes`, CSV output, caching puzzles) and risks
  (service may be discontinued, "not for commercial use").

### 4. Virtual identity
- Accounts: `routes/auth.js`, `models/User.js`. Passwords are hashed with **bcrypt** (salted, 12 rounds); plain passwords are
  never stored. Login failures use one message for "no such user" and "wrong password" and run a dummy hash compare so timing
  doesn't reveal valid usernames. Login/register are rate-limited.
- Session: a signed **JWT in an httpOnly, SameSite=Lax cookie** (`bb_token`, `middleware/auth.js`). JavaScript can't read it
  (limits XSS damage); SameSite blocks cross-site requests (basic CSRF defence); `secure` is on in production.
- A second, non-sensitive cookie `bb_prefs` (sound on/off) *is* readable by JavaScript (`public/js/audio.js`). Contrast them:
  different data, different protection.
- Identity drives gameplay: every Game belongs to a user; banked scores, biggest cash-out, chain records and badges persist;
  the leaderboard shows avatars and usernames; the live feed names players.
- Higher marks: compare server-side sessions, OAuth/social login, passkeys, 2FA; JWTs can't be revoked easily before expiry.

## Git workflow (suggested)

```bash
git init
git add .gitignore package.json README.md
git commit -m "chore: project skeleton"
git checkout -b feature/banana-client
git add services/bananaClient.js config.js
git commit -m "feat: fetch puzzles from Banana API with timeout and validation"
git checkout main && git merge --no-ff feature/banana-client
# repeat per feature: feature/auth, feature/pot-and-cashout, feature/live-feed, feature/ui
git tag -a v1.0.0 -m "Submission version"
git remote add origin <your GitHub URL> && git push -u origin main --tags
```

Make small, meaningful commits as you go. Screenshots of `git log --oneline --graph` and your GitHub history are good
evidence for the "supporting evidence of your work on the code" requirement.

## Referencing and AI use (required by the brief)

- Puzzle service: Banana API by Marc Conrad, https://marcconrad.com/uob/banana/doc.php (not for commercial use).
- Libraries: express, mongoose, bcryptjs, jsonwebtoken, cookie-parser, dotenv. Fonts: Lilita One and Outfit via Google Fonts.
- **This code was generated with the help of a large language model (Claude, Anthropic).** The brief allows this for code but
  requires it to be acknowledged. Replace the notes in `server.js` and `config.js` with your own reference line and mark what
  you wrote or changed yourself. The video must be your own voice and words.

## Video outline (max 10 minutes, unedited, your own voice)

| Time | What to cover |
|------|---------------|
| 0:00-1:00 | Live demo: register, build a chain, hit a Gold Banana, cash out, then bust a pot, game over, leaderboard |
| 1:00-3:00 | Version control: repo, branches, commits, tags, modular structure |
| 3:00-5:00 | Event-driven: `events.js`, listeners in `main.js`, server `bus.js`/SSE; two windows updating live |
| 5:00-7:30 | Interoperability: `bananaClient.js`, the JSON, why the server proxies it, failure handling |
| 7:30-9:30 | Virtual identity: bcrypt, JWT cookie (show httpOnly in dev tools), `bb_prefs` cookie |
| 9:30-10:00 | Compare the four themes and what you'd improve |

Present your working code to your tutor in **Week 8 or earlier** and keep evidence of it.

## Known limitations / ideas

- A page refresh during a run abandons it (the pot is banked when you start the next run).
- In-memory rate limiter is per-process; use Redis for several servers.
- Use HTTPS and `NODE_ENV=production` when deploying so the cookie is `secure`.
- Ideas: daily challenge with a fixed seed, "double or nothing" on Gold puzzles, power-ups, head-to-head pot duels.
