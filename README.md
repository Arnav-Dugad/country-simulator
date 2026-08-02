# Sovereign — Country Simulator

A deep, systemic country simulator for the browser. Take command of one of **94 real
nations** — with their actual populations, economies, currencies, resource endowments,
governments and flags — or found your own country and design its flag from scratch.
Then run it for up to a hundred years.

Everything in the game is produced by something else in the game. Cut the education
budget and, a decade later, productivity falls, growth slows, crime rises, and your
approval rating goes with it.

---

## Contents

- [What's in it](#whats-in-it)
- [How the simulation works](#how-the-simulation-works)
- [Running it locally](#running-it-locally)
- [Firebase setup](#firebase-setup)
- [Deploying to Vercel](#deploying-to-vercel)
- [Testing and QA](#testing-and-qa)
- [Project layout](#project-layout)

---

## What's in it

### Setup
A twelve-step wizard runs before every campaign — nothing is assumed:

| Step | What you choose |
| --- | --- |
| Start | Play a real nation, or found a new one |
| Nation | 94 real countries (searchable by name, capital or currency) or a custom name, capital, motto, region and currency |
| Identity | Flag designer: 8 layouts, 3 colour slots with a full colour picker, 19 emblems |
| Government | 12 systems, from parliamentary democracy to technocracy to syndicalist federation |
| Leader | Name, title, age, portrait and one of 10 ideologies |
| Traits | Up to 3 of 12 permanent leader traits |
| Doctrine | Five founding priorities on sliders, plus a military doctrine |
| Era | Cold War (1975), Unipolar Moment (1992), Present Day (2025), Long 2040s (2040) |
| Difficulty | Five levels, from Sandbox to Doomsday Clock |
| Objective | Seven victory paths |
| Rules | Event frequency, wars on/off, disasters on/off, ironman |
| Review | Full summary before you take office |

### Systems

- **Economy** — GDP, real growth, inflation (Phillips curve), unemployment (Okun's law),
  a Taylor-rule central bank, productivity, business confidence, credit rating, exchange
  rate, seven sectors that rotate as the country develops, and a productivity frontier
  that growth converges toward.
- **Treasury** — 8 taxes, 10 departments on 0–200% sliders, sovereign bond issuance and
  repayment, debt interest that scales with your credit rating, and a full itemised
  revenue-and-spending breakdown that the engine and the UI share.
- **Legislation** — 62 policies across 12 categories, each with real trade-offs,
  prerequisites, conflicts and ideological appeal.
- **Research** — 48 technologies across 6 branches and 5 tiers.
- **Construction** — 48 projects and wonders, each taking real months to deliver.
- **Society** — Population, birth/death/migration rates, age pyramid, life expectancy,
  literacy, urbanisation, happiness, health, education, crime, civil liberties, soft power.
- **Environment & energy** — 8 generation sources, grid balance (a shortfall directly
  suppresses growth), emissions, pollution, forest cover, biodiversity, water stress,
  and a global temperature that raises disaster risk every year.
- **Politics** — Parties with shifting support, a seat-by-seat parliament, coalition
  relations, elections you can lose, corruption, and provinces with their own
  development, loyalty, unrest and autonomy.
- **Diplomacy** — 61 simulated nations with independent economies, personalities and
  memory; 6 treaty types, foreign aid, sanctions, embassies and 10 international
  organisations with real accession requirements.
- **Military & intelligence** — Five branches, five doctrines, war with a live war
  score, casualties and peace negotiation; six covert operation types.
- **Events** — 44 branching situations with 2–3 choices each. Risky options can
  backfire, and a stable, low-corruption state with good intelligence gambles better.
- **Scoring** — Eight capped pillars, 34 achievements across four tiers, seven victory
  conditions (all requiring at least ten years in office), and a global leaderboard.

---

## How the simulation works

The engine is a pure function of `GameState`. `tick(state)` advances one month and
touches nothing outside its argument — no React, no Firebase, no `Date.now()` in the
maths. That is what makes the whole thing testable in plain Node.

Three design decisions are worth calling out, because they were arrived at by
measurement rather than guesswork (see `scripts/`):

**1. Growth is convergence toward a frontier, not a free-standing rate.**
`frontierLog()` computes the GDP per capita a country could sustain given its
technology, education, infrastructure, corruption, stability and policy mix. Growth is
then proportional to the gap between where you are and where you could be. Poor,
well-governed countries grow fast; rich ones stall unless you raise the ceiling. Without
this, stacking growth modifiers compounded a fifty-year campaign to absurdity — an
early probe produced $7.7M GDP per capita.

**2. Level 1.0 department funding *sustains* a country; it does not improve it.**
Every service index target is calibrated so a country funded at 100% holds roughly
steady. Anything below is a real cut, anything above a real improvement. An earlier
calibration quietly decayed every nation on earth regardless of how well it was played.

**3. A new government inherits a roughly balanced budget.**
`balanceInheritedBudget()` sets starting department levels to what the country can
actually pay for. Rich, clean states inherit well-funded services; poor or corrupt ones
inherit threadbare ones — which is both truer to life and removes a universal debt
spiral that used to bankrupt every country within six years.

Costs in the content files are written for a $1.5T economy and scaled by `costScale()`,
so a stimulus package is the same share of GDP whether you run Fiji or the United States.

The result, measured across 15 sample countries over 600 months:

| Play style | Outcome |
| --- | --- |
| Never touch anything, always take the first option | 13/15 survive; stagnant economies, mediocre scores (6.3k–10.3k) |
| Keep the budget near balance, keep researching, enact affordable policies | 15/15 survive or win; $20k–$284k GDP per capita, scores 9.7k–13.9k |

---

## Running it locally

Requires Node 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

```bash
npm run build        # typecheck + production build to dist/
npm run preview      # serve the production build
npm test             # 74 tests: engine, data integrity and UI
npm run test:watch   # watch mode
```

Balance probes (they print tables, they are not tests):

```bash
node scripts/balance-probe.mjs        # hands-off campaigns across sample countries
node scripts/competent-probe.mjs      # the same countries played sensibly
node scripts/budget-probe.mjs usa     # budget composition over time
node scripts/trajectory-probe.mjs usa # month-by-month index trajectory
```

**The game runs fine with no configuration at all.** Without Firebase it falls back to
offline play: campaigns save to `localStorage`, and sign-in, cloud saves and the
leaderboard are hidden rather than broken.

---

## Firebase setup

Optional — it adds accounts, cross-device cloud saves and the global leaderboard.

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication → Sign-in method**: enable **Email/Password** and **Google**.
3. **Firestore Database**: create a database (production mode is correct — the rules
   below open exactly what is needed).
4. **Project settings → General → Your apps**: add a Web app and copy the config values.
5. Create `.env` from the template and fill it in:

   ```bash
   cp .env.example .env
   ```

6. Publish the security rules and the composite index:

   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

   Or paste `firestore.rules` into **Firestore → Rules** in the console, and create the
   index described in `firestore.indexes.json` when Firestore prompts you for it.

7. **Authentication → Settings → Authorized domains**: add your Vercel domain, or Google
   sign-in will fail in production with `auth/unauthorized-domain`.

The `VITE_FIREBASE_*` values are public client keys. Firebase is designed for them to
ship in the browser bundle — access is controlled by the security rules, not by hiding
the key. Never put a server secret in a `VITE_` variable.

### Data model

```
users/{uid}/saves/{gameId}   { payload: <JSON string>, meta: {...}, updatedAt }
leaderboard/{uid}_{gameId}   { uid, displayName, nationName, score, turn, ... }
```

Saves are stored as a single JSON string with the history thinned to 400 points and the
log to 120 entries, which keeps a fifty-year campaign well inside Firestore's 1 MiB
document limit.

---

## Deploying to Vercel

1. Push this repository to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new). Vercel detects Vite and
   `vercel.json` supplies the SPA rewrite, cache headers and security headers.
3. Add the six `VITE_FIREBASE_*` variables under **Settings → Environment Variables**
   (Production, Preview and Development), then redeploy.
4. Add the deployed domain to Firebase's authorised domains list.

Skip step 3 and the deployment still works — it just runs in offline mode.

---

## Testing and QA

74 tests, all passing, in three suites:

**`src/game/__tests__/data-integrity.test.ts`** (18) — ids are unique; every tech
prerequisite resolves and sits at a lower tier; the tech tree has no cycles and is fully
reachable; policy conflicts are declared symmetrically; every unlock, chain and
requirement points at something real; every modifier key is one the engine implements;
wonders are unique; zero-weight events are reachable through a chain.

**`src/game/__tests__/simulation.test.ts`** (25) — a valid state for all 94 countries;
determinism for a given seed; 600-month runs across eight countries and all five
difficulties asserting *every numeric leaf of the state stays finite* and every index
stays in range; sector shares and party support always sum correctly; time cannot
advance while an event is pending; the whole tech tree completes; every policy and
building is reachable; taxes, bonds, treaties, orgs, covert ops and war all resolve.

**`src/test/ui-smoke.test.tsx`** (31) — mounts the real React tree in jsdom: every one of
the 17 panels against a mature campaign, a brand-new campaign and a custom nation; every
one of the 44 events in the event modal; the victory and defeat screens; the full
wizard flow end-to-end producing a config that actually creates a playable game; and all
three standalone pages. Any React error logged during a render fails the test.

---

## Project layout

```
src/
  game/
    types.ts              Every type in the simulation
    selectors.ts          Derived values, the budget, formatting
    storage.ts            localStorage saves and migration
    data/                 Countries, currencies, policies, technologies,
                          buildings, events, achievements, institutions
    engine/
      createGame.ts       Builds a GameState from a SetupConfig
      tick.ts             The monthly simulation step
      actions.ts          Every player action
      events.ts           Event selection and resolution
      scoring.ts          Score, victory conditions
      treasury.ts         The single spend path (borrows rather than going negative)
      rng.ts              Deterministic, seeded RNG
  firebase/               Config, auth, cloud saves, leaderboard
  store/                  Zustand stores: game, auth, UI
  components/
    ui/                   Design primitives, flags, backdrop, toasts
    layout/               Shell, top bar, navigation
    setup/                The setup wizard
    panels/               The 17 game panels
    game/                 Event modal, game-over screen
  pages/                  Landing, auth, setup, game, leaderboard
scripts/                  Balance probes
```

---

## Credits and caveats

Flag images are served by [flagcdn.com](https://flagcdn.com). Country statistics are
approximate mid-2020s figures chosen to make the simulation feel right — they are for
play, not reference. The 0–100 indices (stability, technology, corruption) are the
designer's calibration, not official statistics.

Built with React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Recharts, Zustand
and Firebase.
