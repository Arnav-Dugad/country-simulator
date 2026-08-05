/**
 * Multi-seed survival probe.
 *
 * A single-seed comparison between two builds is worthless once the RNG stream
 * shifts — adding any new call reshuffles every later draw, so two runs differ
 * for reasons that have nothing to do with balance. This runs many seeds per
 * country and reports the distribution, which is the only honest way to tell
 * whether a change made the game harder or merely different.
 *
 *   node scripts/survival-probe.mjs [seeds] [months]
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-loader.mjs', pathToFileURL('./scripts/'));

const { createGame, defaultSetup } = await import('../src/game/engine/createGame.ts');
const { tick } = await import('../src/game/engine/tick.ts');
const { resolveEvent } = await import('../src/game/engine/events.ts');
const { EVENT_INDEX } = await import('../src/game/data/events.ts');
const { getCountry } = await import('../src/game/data/countries.ts');

const SEEDS = Number(process.argv[2] ?? 12);
const MONTHS = Number(process.argv[3] ?? 600);

const COUNTRIES = [
  'usa', 'china', 'india', 'germany', 'brazil', 'nigeria', 'norway', 'singapore',
  'venezuela', 'fiji', 'south-korea', 'lebanon', 'japan', 'egypt', 'drc',
];

function play(countryId, seed) {
  const country = getCountry(countryId);
  const s = createGame(
    {
      ...defaultSetup(),
      mode: 'real',
      countryId,
      nationName: country.name,
      adjective: country.name,
      capital: country.capital,
      region: country.region,
      iso2: country.iso2,
      currencyCode: country.currency,
      government: country.government,
      leaderName: 'Probe',
    },
    seed,
  );

  for (let i = 0; i < MONTHS && !s.gameOver; i++) {
    let guard = 0;
    while (s.eventQueue.length > 0 && guard++ < 10) {
      const def = EVENT_INDEX[s.eventQueue[0].defId];
      resolveEvent(s, def.choices[0].id);
    }
    tick(s);
  }
  return s;
}

const rows = [];
let totalRuns = 0;
let totalSurvived = 0;
const failureReasons = new Map();

for (const countryId of COUNTRIES) {
  let survived = 0;
  let months = 0;
  let score = 0;
  for (let i = 0; i < SEEDS; i++) {
    const s = play(countryId, 1000 + i * 977);
    totalRuns += 1;
    months += s.turn;
    score += s.score;
    if (!s.gameOver || s.gameOver.victory) {
      survived += 1;
      totalSurvived += 1;
    } else {
      failureReasons.set(s.gameOver.title, (failureReasons.get(s.gameOver.title) ?? 0) + 1);
    }
  }
  rows.push({
    country: getCountry(countryId).name,
    survived: `${survived}/${SEEDS}`,
    'survival%': ((survived / SEEDS) * 100).toFixed(0),
    'avg months': Math.round(months / SEEDS),
    'avg score': Math.round(score / SEEDS),
  });
}

console.log(`\nHands-off survival over ${MONTHS} months, ${SEEDS} seeds per country\n`);
console.table(rows);
console.log(`Overall: ${totalSurvived}/${totalRuns} (${((totalSurvived / totalRuns) * 100).toFixed(1)}%)`);
if (failureReasons.size > 0) {
  console.log('Failure modes:', Object.fromEntries([...failureReasons.entries()].sort((a, b) => b[1] - a[1])));
}
