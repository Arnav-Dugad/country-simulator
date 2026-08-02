/**
 * Military probe: shows where each country's military strength settles at
 * default funding, against the value it starts with. A large gap in either
 * direction means the calibration is wrong.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-loader.mjs', pathToFileURL('./scripts/'));

const { getCountry } = await import('../src/game/data/countries.ts');
const { createGame, defaultSetup } = await import('../src/game/engine/createGame.ts');
const { tick } = await import('../src/game/engine/tick.ts');
const { resolveEvent } = await import('../src/game/engine/events.ts');
const { EVENT_INDEX } = await import('../src/game/data/events.ts');
const { baselineDeptSpend } = await import('../src/game/selectors.ts');

function setupFor(id, overrides = {}) {
  const c = getCountry(id);
  return {
    ...defaultSetup(), mode: 'real', countryId: id, nationName: c.name, adjective: c.name,
    capital: c.capital, region: c.region, iso2: c.iso2, currencyCode: c.currency,
    government: c.government, leaderName: 'Probe', traits: [], victoryGoal: 'survival',
    neverEndGame: true, ...overrides,
  };
}

const sample = ['usa', 'china', 'russia', 'india', 'uk', 'france', 'germany', 'japan',
  'south-korea', 'israel', 'brazil', 'nigeria', 'norway', 'singapore', 'fiji', 'drc'];

const rows = [];
for (const id of sample) {
  const country = getCountry(id);
  const s = createGame(setupFor(id), 4242);
  const start = s.military.strength;
  const defenceAnnual = baselineDeptSpend(s).military * s.budget.military.level * 12;

  for (let i = 0; i < 240; i++) {
    while (s.eventQueue.length > 0) resolveEvent(s, EVENT_INDEX[s.eventQueue[0].defId].choices[0].id);
    tick(s);
  }

  // And again at maximum defence funding, to check the lever has bite.
  const maxed = createGame(setupFor(id), 4242);
  maxed.budget.military.level = 2;
  for (let i = 0; i < 240; i++) {
    while (maxed.eventQueue.length > 0) resolveEvent(maxed, EVENT_INDEX[maxed.eventQueue[0].defId].choices[0].id);
    tick(maxed);
  }

  rows.push({
    country: country.name.slice(0, 14),
    'real (data)': country.militaryStrength,
    start: start.toFixed(0),
    'after 20y @100%': s.military.strength.toFixed(0),
    'after 20y @200%': maxed.military.strength.toFixed(0),
    'defence $bn/yr': (defenceAnnual / 1000).toFixed(1),
  });
}

console.table(rows);
