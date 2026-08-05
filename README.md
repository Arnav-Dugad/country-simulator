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
| Rules | Event frequency, wars on/off, disasters on/off, **eternal mode**, ironman |
| Review | Full summary before you take office |

### Eternal mode

Switch it on in the setup wizard and **nothing can end the campaign**. Bankruptcy, state
collapse, depopulation, losing an election and the hundred-year limit all stop being
fatal. Losing an election leaves you in office as a caretaker with a badly damaged
mandate rather than removing you — the defeat is real, it just isn't terminal.

Victory objectives still register when you reach them: they are recorded, announced and
kept, and then you carry on. Eternal campaigns can also **switch objective mid-run**, so
one country can chase Superpower, then Carbon Negative, then Utopia in a single save.

### Systems

- **Economy** — GDP, real growth, inflation (Phillips curve), unemployment (Okun's law),
  a Taylor-rule central bank, productivity, business confidence, credit rating, exchange
  rate, seven sectors that rotate as the country develops, and a productivity frontier
  that growth converges toward.
- **Treasury** — 8 taxes, 10 departments on funding sliders (defence gets a wider range
  than the rest, because the real spread between countries is wider), sovereign bond
  issuance and repayment, debt interest that scales with your credit rating, and a full
  itemised revenue-and-spending breakdown that the engine and the UI share.
- **Legislation** — 65 policies across 12 categories, each with real trade-offs,
  prerequisites, conflicts and ideological appeal.
- **Executive actions** — 18 direct levers you can pull between budget cycles: address
  the nation, purge the civil service, mobilise the reserves, freeze prices, declare a
  state of emergency, restructure sovereign debt. Each has a cooldown and a genuine cost
  in money, approval, civil liberties or credibility — the data-integrity suite fails
  the build if any of them is a free win.
- **Research** — 55 technologies across 6 branches and 5 tiers, with **parallel
  research**. A campaign starts with one laboratory. Concurrent slots are *unlocked*,
  not given: Research Consortia, the National Laboratory Network, the Open Science
  Mandate and the National Academy of Sciences each grant one more, to a maximum of
  five. Output is divided between active projects by a per-project priority weight
  rather than multiplied — running three programmes does not make research faster, it
  keeps three branches of the tree moving at once and stops output being stranded
  whenever a project finishes mid-month. Anything you cannot start yet goes into a
  **queue** that fills free slots automatically as prerequisites complete. Idle output
  banks, and the bank is spent the instant a new project begins, or used to **rush** one
  to completion at a premium.
- **Construction** — 51 projects and wonders, each taking real months to deliver.
  Buildings that consume power now genuinely draw on the grid.
- **Society** — Population, birth/death/migration rates, age pyramid, life expectancy,
  literacy, urbanisation, happiness, health, education, crime, civil liberties, soft power.
- **Environment & energy** — 8 generation sources, grid balance (a shortfall directly
  suppresses growth), emissions, pollution, forest cover, biodiversity, water stress,
  and a global temperature that raises disaster risk every year.
- **Political capital** — The second currency. Money buys things; capital buys
  permission. It accrues from approval, mandate, legislative goodwill, stability and
  momentum, and it is spent on legislation, executive actions, crisis responses,
  devolution, martial law and declaring a national plan. The price of a bill rises as
  legislative support falls, so a popular leader with a hostile parliament still cannot
  govern — and a government that has run its authority down still exists but cannot do
  anything with it.
- **Interest groups** — Six factions (business, labour, the armed forces, traditional
  institutions, universities and press, the provinces) with independent satisfaction and
  a share of national influence that shifts as the economy and the state change. Their
  mood is a live modifier on the whole simulation, and an alienated, influential military
  facing a government with no mandate is the precondition for a **coup**.
- **Politics** — Parties with shifting support, a seat-by-seat parliament, coalition
  relations, elections you can lose, corruption, and provinces with their own
  development, loyalty, unrest, autonomy, **separatism**, and the option of **martial
  law** or a standing development budget.
- **Crises** — Eleven persistent, multi-stage situations that are conditions rather than
  events: banking collapse, inflation spiral, sovereign debt crisis, legitimacy crisis,
  corruption scandal, secession movement, epidemic, water crisis, energy emergency,
  armed insurgency, brain drain. Each opens because the state genuinely reached the
  condition described, applies a monthly drag scaled by severity, escalates on a timer,
  and ends either in resolution or in permanent damage. Three at most run at once.
- **National agendas** — Ten five-year plans. Declare a public target, accept a real
  handicap for the whole term, and either deliver it for a permanent modifier and a
  capital reward, or be seen to fail. The handicap is the point: a plan with only upside
  would be a free bonus and everyone would run one permanently.
- **The living world** — A global business cycle that moves through expansion, peak,
  contraction and trough on its own; a geopolitical tension index; four blocs; foreign
  economies and militaries that develop independently; **wars between third parties**;
  AI governments that arm against you, sanction you and occasionally **declare war**; and
  an inbox of unsolicited **diplomatic proposals** — treaties, contracts, aid requests,
  demands and ultimatums — that expire whether or not you answer them.
- **Sovereign finance** — A wealth fund that compounds against the *world* cycle rather
  than yours, so it is worth most exactly when the domestic economy is worst; a central
  bank you can leave independent or take direct control of at a permanent price in credit
  rating, confidence and bond spread; a bond yield modelled separately from the policy
  rate; and an opt-out on the automatic surplus-to-debt sweep.
- **Diplomacy** — 61 simulated nations with independent economies, personalities and
  memory; 6 treaty types, foreign aid, sanctions, embassies and 10 international
  organisations with real accession requirements. An **interactive world map** colours
  every nation by relations, trade volume or military strength, sizes markers by
  economy, draws your live trade lanes, and opens a nation's file on click.
- **Commodity trade** — Standing per-commodity agreements with named nations. A contract
  locks its price for the whole term, taking that volume out of the spot market
  entirely: protection when the market spikes, a cost when it falls. Longer locks are
  priced worse, because that is what the certainty costs. Contracts are exposed to the
  counterparty — war and sanctions suspend delivery without tearing up the agreement,
  and it resumes if relations recover before the term expires. Walking away early costs
  relations and trust.
- **Cabinet advice** — Your ministers read the state every month and raise the two or
  three things that most need attention, each naming the number behind it and offering a
  concrete fix: *"We are borrowing 4.2% of monthly output with debt at 137% of GDP.
  Raising income tax to 29% would close most of the gap."* Most come with a one-click
  action, and a test asserts every action the board offers actually succeeds when taken.

  The board is now **contractually never silent**. A persistent **next-move strip** sits
  under the top bar carrying the single highest-value thing to do right now — its
  severity, the advisor's reasoning and the action itself — and when nothing is wrong it
  falls through to the best available opportunity, because in a country there always is
  a next thing. Expand it for the two runners-up.
- **Military & intelligence** — Five branches with independent **funding emphasis**
  (weights on the same budget, so favouring one arm starves the others), five doctrines,
  an indigenous **nuclear weapons programme** that costs money every month it runs and
  relations with everyone when it succeeds, war with a live war score, casualties and
  peace negotiation; six covert operation types, and **per-nation intelligence dossiers**
  that decide whether you see a rival's real strength or a stable — possibly wrong —
  estimate.
- **Events** — 56 branching situations with 2–3 choices each. Risky options can
  backfire, and a stable, low-corruption state with good intelligence gambles better.
- **Quality of life** — A **command palette** (`Ctrl`/`Cmd`+`K`) that searches every
  ministry and every technology, policy, building and executive action, and runs it;
  **keyboard shortcuts** for time, navigation and rewind (`?` for the sheet);
  **pinnable panels**; a **one-month rewind** holding the last twelve months in memory
  (disabled under ironman, never written to a save); filters and search on every long
  list; affordability and political cost shown before you commit; and a preferences
  panel for motion, confirmations and which advice surfaces are shown.
- **Scoring** — Eight capped pillars — governance now weighs mandate, coalition health
  and whether you govern by consent or by martial law; longevity credits plans delivered
  and crises contained — 60 achievements across four tiers, seven victory conditions (all
  requiring at least ten years in office), and a global leaderboard.
- **Career profile** — Aggregate statistics across every campaign: rank and career
  points, win rate, records, most-played nation, objectives completed, a campaign
  browser and preferences. Derived entirely from save summaries, so there is one source
  of truth and nothing can drift out of sync.

---

## How the simulation works

The engine is a pure function of `GameState`. `tick(state)` advances one month and
touches nothing outside its argument — no React, no Firebase, no `Date.now()` in the
maths. That is what makes the whole thing testable in plain Node.

Five design decisions are worth calling out, because they were arrived at by
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

**4. Military power tracks absolute defence spending, not the budget slider.**
A superpower spending 1% of a $27T economy fields something Fiji cannot match at 100%
of its own, so strength is driven by the log of actual defence spend. The original model
used the funding *ratio*, which quietly converged every country on earth — Fiji and the
United States alike — to the same military strength. Starting defence budgets are then
set from each country's real posture, capped so an over-militarised, low-revenue state
does not begin with defence crowding out every civil department.

**5. Difficulty has to change something the player can feel.**
`crisisMultiplier` was displayed in the setup wizard and read by nothing — the game
promised "Crises ×2.2" and ignored it. `economyMultiplier` was wired, but only to the
convergence term, which is already near zero for a developed economy, so it barely
touched the countries where it mattered. Difficulty now drives event frequency, the mix
of severities, gamble odds, tax collection *and* the productivity frontier itself.

Costs in the content files are written for a $1.5T economy and scaled by `costScale()`,
so a stimulus package is the same share of GDP whether you run Fiji or the United States.

**6. A crisis has to be able to end on its own.**
Crisis severity climbs while the situation that caused it still holds and falls
once it has passed, whether or not the player responded. The first cut only let
severity fall through responses, which meant a transient dip could open a crisis
that then became unresolvable — and every campaign spiralled into permanent
emergency. That single change took hands-off survival from 37% back to 80%.

**7. Interest-group baselines are calibrated to an averagely governed country.**
Each faction's satisfaction target is set so a state with departments near 1.0,
default tax rates and middling corruption lands its factions around 52–58, with
a dead band either side of neutral. Keyed too low, the system had every country
on earth quietly alienating half its establishment before the player had done
anything at all.

The result, measured across 15 sample countries over 600 months (`survival-probe`
runs 8 seeds each, because a single-seed comparison is meaningless once a change
shifts the RNG stream):

| Play style | Outcome |
| --- | --- |
| Never touch anything, always take the first option | 88% survive across 120 runs; stagnant economies, scores 6k–11k |
| Take the top cabinet recommendation every month and fill the cabinet | No losses. Several countries reach their victory objective the month it becomes eligible — the United States wins at month 120 on 90% approval, 100 stability and zero debt |
| Keep the budget near balance, keep researching, enact affordable policies | 15/15 survive or win; $16k–$415k GDP per capita, scores 11.7k–15.0k |

The middle row is the one that matters: following the game's own advice is a
winning strategy, and a test asserts it. If the advice were not survivable the
advice would be wrong.

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
npm test             # engine, systems, data-integrity and UI suites
npm run test:watch   # watch mode
```

Balance probes (they print tables, they are not tests):

```bash
node scripts/balance-probe.mjs        # hands-off campaigns across sample countries
node scripts/competent-probe.mjs      # the same countries played sensibly
node scripts/budget-probe.mjs usa     # budget composition over time
node scripts/trajectory-probe.mjs usa # month-by-month index trajectory
node scripts/difficulty-probe.mjs     # does the difficulty setting actually bite?
node scripts/military-probe.mjs       # military calibration against real countries
node scripts/content-count.mjs        # size of every content set
node scripts/survival-probe.mjs       # hands-off survival across many seeds
node scripts/systems-probe.mjs usa    # schema-5 subsystems month by month
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

123 tests, all passing, in three suites:

**`src/game/__tests__/data-integrity.test.ts`** (28) — ids are unique; every tech
prerequisite resolves and sits at a lower tier; the tech tree has no cycles and is fully
reachable; policy conflicts are declared symmetrically; every unlock, chain and
requirement points at something real; every modifier key is one the engine implements;
wonders are unique; zero-weight events are reachable through a chain.

**`src/game/__tests__/simulation.test.ts`** (51) — a valid state for all 94 countries;
determinism for a given seed; 600-month runs across eight countries and all five
difficulties asserting *every numeric leaf of the state stays finite* and every index
stays in range; sector shares and party support always sum correctly; time cannot
advance while an event is pending; the whole tech tree completes; every policy and
building is reachable; taxes, bonds, treaties, orgs, covert ops and war all resolve.

**`src/test/ui-smoke.test.tsx`** (44) — mounts the real React tree in jsdom: every one of
the 19 panels against a mature campaign, a brand-new campaign and a custom nation; every
one of the 56 events in the event modal; the victory and defeat screens; the full
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
      advisory.ts         Cabinet recommendations read from the live state
      trade.ts            Commodity agreements, pricing and capacity
      career.ts           Career statistics aggregated across campaigns
      treasury.ts         The single spend path (borrows rather than going negative)
      rng.ts              Deterministic, seeded RNG
  firebase/               Config, auth, cloud saves, leaderboard
  store/                  Zustand stores: game, auth, UI
  components/
    ui/                   Design primitives, flags, backdrop, toasts
    layout/               Shell, top bar, navigation
    setup/                The setup wizard
    panels/               The 19 game panels
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
