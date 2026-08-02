/**
 * Balance probe: runs a hands-off 600-month campaign for a sample of countries
 * and prints how each one ends. Run with `node scripts/balance-probe.mjs`.
 *
 * "Hands off" means the player enacts nothing and always takes the first
 * choice on every event, so this is the pessimistic floor of the balance.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-loader.mjs', pathToFileURL('./scripts/'));

const { COUNTRIES, getCountry } = await import('../src/game/data/countries.ts');
const { createGame, defaultSetup } = await import('../src/game/engine/createGame.ts');
const { tick } = await import('../src/game/engine/tick.ts');
const { resolveEvent } = await import('../src/game/engine/events.ts');
const { EVENT_INDEX } = await import('../src/game/data/events.ts');
const { gdpPerCapita, debtToGdp } = await import('../src/game/selectors.ts');

function setupFor(id, overrides = {}) {
  const c = getCountry(id);
  return {
    ...defaultSetup(),
    mode: 'real',
    countryId: id,
    nationName: c.name,
    adjective: c.name,
    capital: c.capital,
    region: c.region,
    iso2: c.iso2,
    currencyCode: c.currency,
    government: c.government,
    leaderName: 'Probe',
    traits: [],
    victoryGoal: 'survival',
    ...overrides,
  };
}

const sample = process.argv[2] === 'all'
  ? COUNTRIES.map((c) => c.id)
  : ['usa', 'china', 'india', 'germany', 'brazil', 'nigeria', 'norway', 'singapore',
     'venezuela', 'fiji', 'south-korea', 'lebanon', 'japan', 'egypt', 'drc'];

const rows = [];
for (const id of sample) {
  const s = createGame(setupFor(id), 4242);
  let events = 0;
  for (let i = 0; i < 600 && !s.gameOver; i++) {
    while (s.eventQueue.length > 0) {
      const def = EVENT_INDEX[s.eventQueue[0].defId];
      resolveEvent(s, def.choices[0].id);
      events++;
    }
    tick(s);
  }
  rows.push({
    country: getCountry(id).name.slice(0, 18),
    months: s.turn,
    end: s.gameOver ? `${s.gameOver.victory ? 'WIN ' : 'LOSS'} ${s.gameOver.title}` : 'ongoing',
    appr: s.approval.toFixed(0),
    stab: s.stability.toFixed(0),
    gdp: `${(s.economy.gdp / 1000).toFixed(2)}T`,
    pc: Math.round(gdpPerCapita(s)).toLocaleString(),
    'debt%': debtToGdp(s).toFixed(0),
    infl: s.economy.inflation.toFixed(1),
    unemp: s.economy.unemployment.toFixed(1),
    happy: s.society.happiness.toFixed(0),
    tech: s.research.completed.length,
    events,
    score: s.score,
  });
}

console.table(rows);
