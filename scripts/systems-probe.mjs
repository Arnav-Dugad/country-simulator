/**
 * Diagnostic probe for the schema-5 systems.
 *
 * Runs a hands-off campaign and prints, every twelve months, the state of the
 * new subsystems alongside the headline indices — so a balance regression can
 * be attributed to a specific system rather than guessed at.
 *
 *   node scripts/systems-probe.mjs [countryId] [months]
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-loader.mjs', pathToFileURL('./scripts/'));

const { createGame, defaultSetup } = await import('../src/game/engine/createGame.ts');
const { tick } = await import('../src/game/engine/tick.ts');
const { resolveEvent } = await import('../src/game/engine/events.ts');
const { EVENT_INDEX } = await import('../src/game/data/events.ts');
const { getCountry } = await import('../src/game/data/countries.ts');
const { CRISIS_INDEX } = await import('../src/game/data/crises.ts');
const { computeBudget, factionModifiers, crisisModifiers } = await import('../src/game/selectors.ts');

const countryId = process.argv[2] ?? 'usa';
const months = Number(process.argv[3] ?? 240);

const country = getCountry(countryId);
if (!country) {
  console.error(`Unknown country: ${countryId}`);
  process.exit(1);
}

const config = {
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
};

const s = createGame(config, 4242);
const rows = [];
const crisisLog = [];
let seenCrises = new Set();

for (let i = 0; i < months && !s.gameOver; i++) {
  let guard = 0;
  while (s.eventQueue.length > 0 && guard++ < 10) {
    const def = EVENT_INDEX[s.eventQueue[0].defId];
    resolveEvent(s, def.choices[0].id);
  }
  tick(s);

  for (const crisis of s.crises) {
    if (!seenCrises.has(crisis.id)) {
      seenCrises.add(crisis.id);
      crisisLog.push(`  m${s.turn}: OPEN  ${CRISIS_INDEX[crisis.defId]?.name}`);
    }
  }

  if (s.turn % 12 === 0) {
    const budget = computeBudget(s);
    const gdpMonthly = (s.economy.gdp * 1000) / 12;
    const fm = factionModifiers(s);
    const cm = crisisModifiers(s);
    rows.push({
      m: s.turn,
      appr: s.approval.toFixed(0),
      stab: s.stability.toFixed(0),
      mand: s.governance.mandate.toFixed(0),
      cap: s.governance.capital.toFixed(0),
      'bal%': ((budget.net / gdpMonthly) * 100).toFixed(1),
      growth: s.economy.growth.toFixed(2),
      infl: s.economy.inflation.toFixed(1),
      unemp: s.economy.unemployment.toFixed(1),
      happy: s.society.happiness.toFixed(0),
      'res.imp%': ((budget.expenditure.resourceImports / gdpMonthly) * 100).toFixed(2),
      'trs/mo': (s.economy.treasury / gdpMonthly).toFixed(2),
      'debt%': ((s.economy.debt / Math.max(1, s.economy.gdp)) * 100).toFixed(0),
      crises: s.crises.length,
      'fac.stab': (fm.stability ?? 0).toFixed(1),
      'fac.appr': (fm.approval ?? 0).toFixed(1),
      'cri.stab': (cm.stability ?? 0).toFixed(1),
      'cri.appr': (cm.approval ?? 0).toFixed(1),
      'cri.tax': (cm.taxEfficiency ?? 0).toFixed(1),
      cycle: s.world.cycle.toFixed(2),
      tens: s.world.tension.toFixed(0),
      sanc: s.nations.filter((n) => n.sanctioningPlayer).length,
    });
  }
}

console.log(`\n${country.name} — hands-off, ${s.turn} months, ${s.gameOver ? `${s.gameOver.title}: ${s.gameOver.reason}` : 'ongoing'}\n`);
console.table(rows);
if (crisisLog.length > 0) {
  console.log('Crisis timeline:');
  for (const line of crisisLog) console.log(line);
}
