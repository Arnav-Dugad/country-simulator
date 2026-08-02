/**
 * Budget probe: prints the monthly budget as a share of monthly GDP at several
 * points in a hands-off campaign, so fiscal drift can be traced to a line item.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-loader.mjs', pathToFileURL('./scripts/'));

const { getCountry } = await import('../src/game/data/countries.ts');
const { createGame, defaultSetup } = await import('../src/game/engine/createGame.ts');
const { tick } = await import('../src/game/engine/tick.ts');
const { resolveEvent } = await import('../src/game/engine/events.ts');
const { EVENT_INDEX } = await import('../src/game/data/events.ts');
const { computeBudget, debtToGdp } = await import('../src/game/selectors.ts');

function setupFor(id) {
  const c = getCountry(id);
  return {
    ...defaultSetup(), mode: 'real', countryId: id, nationName: c.name, adjective: c.name,
    capital: c.capital, region: c.region, iso2: c.iso2, currencyCode: c.currency,
    government: c.government, leaderName: 'Probe', traits: [], victoryGoal: 'survival',
  };
}

const id = process.argv[2] ?? 'usa';
const s = createGame(setupFor(id), 4242);
const rows = [];

function snapshot() {
  const b = computeBudget(s);
  const gdpMonthly = (s.economy.gdp * 1000) / 12;
  const pct = (v) => `${((v / gdpMonthly) * 100).toFixed(2)}%`;
  rows.push({
    month: s.turn,
    revenue: pct(b.revenue.total),
    tax: pct(b.revenue.income + b.revenue.corporate + b.revenue.vat + b.revenue.capitalGains +
      b.revenue.wealth + b.revenue.carbon + b.revenue.property),
    tariff: pct(b.revenue.tariff),
    resRev: pct(b.revenue.resources),
    trade: pct(b.revenue.trade),
    spend: pct(b.expenditure.total),
    depts: pct(b.expenditure.departmentTotal),
    interest: pct(b.expenditure.debtInterest),
    resImp: pct(b.expenditure.resourceImports),
    net: pct(b.net),
    'debt%GDP': debtToGdp(s).toFixed(0),
    rate: s.economy.interestRate.toFixed(1),
    infl: s.economy.inflation.toFixed(1),
  });
}

snapshot();
for (let i = 0; i < 240 && !s.gameOver; i++) {
  while (s.eventQueue.length > 0) {
    const def = EVENT_INDEX[s.eventQueue[0].defId];
    resolveEvent(s, def.choices[0].id);
  }
  tick(s);
  if (s.turn % 24 === 0) snapshot();
}

console.log(`\n=== ${getCountry(id).name} ===`);
console.table(rows);
