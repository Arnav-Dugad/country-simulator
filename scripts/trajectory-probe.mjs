/**
 * Trajectory probe: prints the headline indices month by month for a hands-off
 * campaign, so a collapse can be traced to the index that moved first.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-loader.mjs', pathToFileURL('./scripts/'));

const { getCountry } = await import('../src/game/data/countries.ts');
const { createGame, defaultSetup } = await import('../src/game/engine/createGame.ts');
const { tick } = await import('../src/game/engine/tick.ts');
const { resolveEvent } = await import('../src/game/engine/events.ts');
const { EVENT_INDEX } = await import('../src/game/data/events.ts');

function setupFor(id) {
  const c = getCountry(id);
  return {
    ...defaultSetup(), mode: 'real', countryId: id, nationName: c.name, adjective: c.name,
    capital: c.capital, region: c.region, iso2: c.iso2, currencyCode: c.currency,
    government: c.government, leaderName: 'Probe', traits: [], victoryGoal: 'survival',
  };
}

const id = process.argv[2] ?? 'usa';
const every = Number(process.argv[3] ?? 6);
const s = createGame(setupFor(id), 4242);
const rows = [];
const eventLog = [];

const snap = () => rows.push({
  m: s.turn,
  appr: s.approval.toFixed(1),
  stab: s.stability.toFixed(1),
  happy: s.society.happiness.toFixed(1),
  health: s.society.health.toFixed(1),
  edu: s.society.education.toFixed(1),
  crime: s.society.crime.toFixed(1),
  corr: s.corruption.toFixed(1),
  unemp: s.economy.unemployment.toFixed(1),
  growth: s.economy.growth.toFixed(2),
  infl: s.economy.inflation.toFixed(1),
  budget: s.budget.healthcare.level.toFixed(2),
});

snap();
for (let i = 0; i < 240 && !s.gameOver; i++) {
  while (s.eventQueue.length > 0) {
    const def = EVENT_INDEX[s.eventQueue[0].defId];
    const before = s.approval;
    resolveEvent(s, def.choices[0].id);
    eventLog.push(`m${s.turn} ${def.title} -> "${def.choices[0].label}" approval ${before.toFixed(1)} -> ${s.approval.toFixed(1)}`);
  }
  tick(s);
  if (s.turn % every === 0) snap();
}
snap();

console.log(`\n=== ${getCountry(id).name} — ${s.gameOver ? s.gameOver.title + ': ' + s.gameOver.reason : 'ongoing'} ===`);
console.table(rows);
console.log('\nEvents:');
for (const line of eventLog) console.log('  ' + line);
