/**
 * Competent-player probe: the other end of the difficulty curve.
 *
 * Plays a deliberately unsophisticated but sane strategy — keep the budget
 * near balance, keep researching, enact affordable policies — and reports how
 * each country ends up. A player doing this much should reliably survive.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-loader.mjs', pathToFileURL('./scripts/'));

const { COUNTRIES, getCountry } = await import('../src/game/data/countries.ts');
const { createGame, defaultSetup } = await import('../src/game/engine/createGame.ts');
const { tick } = await import('../src/game/engine/tick.ts');
const { resolveEvent, choiceAvailable } = await import('../src/game/engine/events.ts');
const { EVENT_INDEX } = await import('../src/game/data/events.ts');
const { TECHNOLOGIES } = await import('../src/game/data/technologies.ts');
const { POLICIES } = await import('../src/game/data/policies.ts');
const { startResearch, enactPolicy, policyAvailability, setTax, setBudget } =
  await import('../src/game/engine/actions.ts');
const { computeBudget, gdpPerCapita, debtToGdp, renewableShare } = await import('../src/game/selectors.ts');

function setupFor(id) {
  const c = getCountry(id);
  return {
    ...defaultSetup(), mode: 'real', countryId: id, nationName: c.name, adjective: c.name,
    capital: c.capital, region: c.region, iso2: c.iso2, currencyCode: c.currency,
    government: c.government, leaderName: 'Probe', traits: ['economist', 'reformer'],
    victoryGoal: 'survival',
  };
}

function govern(s) {
  // Keep the budget within a percent of balance using the income tax.
  const b = computeBudget(s);
  const gdpMonthly = (s.economy.gdp * 1000) / 12;
  const netPct = (b.net / gdpMonthly) * 100;
  if (netPct < -1) setTax(s, 'income', s.taxes.income + 0.5);
  else if (netPct > 3 && s.taxes.income > 18) setTax(s, 'income', s.taxes.income - 0.5);

  // Spend a surplus on services rather than hoarding it.
  if (netPct > 2) {
    for (const dept of ['healthcare', 'education', 'infrastructure', 'research']) {
      if (s.budget[dept].level < 1.3) setBudget(s, dept, s.budget[dept].level + 0.05);
    }
  } else if (netPct < -2) {
    for (const dept of ['military', 'culture', 'intelligence']) {
      if (s.budget[dept].level > 0.5) setBudget(s, dept, s.budget[dept].level - 0.05);
    }
  }

  // Always be researching something.
  if (!s.research.current) {
    const next = TECHNOLOGIES
      .filter((t) => !s.research.completed.includes(t.id) && t.requires.every((r) => s.research.completed.includes(r)))
      .sort((a, b) => a.cost - b.cost)[0];
    if (next) startResearch(s, next.id);
  }

  // Enact the cheapest affordable policy every couple of years.
  if (s.turn % 24 === 0) {
    const affordable = POLICIES
      .filter((p) => policyAvailability(s, p.id).enabled)
      .sort((a, b) => a.upfrontCost - b.upfrontCost)[0];
    if (affordable) enactPolicy(s, affordable.id);
  }
}

/** Picks the affordable choice with the best net effect on approval + stability. */
function bestChoice(s, def) {
  let best = def.choices[0];
  let bestScore = -Infinity;
  for (const c of def.choices) {
    if (!choiceAvailable(s, c).enabled) continue;
    const e = c.effects;
    const score = (e.approval ?? 0) + (e.stability ?? 0) + (e.happiness ?? 0) * 0.5 +
      (e.gdpShock ?? 0) * 3 - (c.riskChance ?? 0) * 12 - (c.cost ?? 0) / 20000;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

const sample = process.argv[2] === 'all'
  ? COUNTRIES.map((c) => c.id)
  : ['usa', 'china', 'india', 'germany', 'brazil', 'nigeria', 'norway', 'singapore',
     'venezuela', 'fiji', 'south-korea', 'lebanon', 'japan', 'egypt', 'drc'];

const rows = [];
let survived = 0;
for (const id of sample) {
  const s = createGame(setupFor(id), 909);
  for (let i = 0; i < 600 && !s.gameOver; i++) {
    while (s.eventQueue.length > 0) {
      const def = EVENT_INDEX[s.eventQueue[0].defId];
      resolveEvent(s, bestChoice(s, def).id);
    }
    govern(s);
    tick(s);
  }
  if (!s.gameOver || s.gameOver.victory) survived++;
  rows.push({
    country: getCountry(id).name.slice(0, 16),
    months: s.turn,
    end: s.gameOver ? `${s.gameOver.victory ? 'WIN ' : 'LOSS'} ${s.gameOver.title}` : 'survived 50y',
    appr: s.approval.toFixed(0),
    stab: s.stability.toFixed(0),
    pc: Math.round(gdpPerCapita(s)).toLocaleString(),
    'debt%': debtToGdp(s).toFixed(0),
    tax: s.taxes.income.toFixed(0),
    infl: s.economy.inflation.toFixed(1),
    happy: s.society.happiness.toFixed(0),
    'green%': renewableShare(s).toFixed(0),
    tech: s.research.completed.length,
    pol: s.activePolicies.length,
    ach: s.achievements.length,
    score: s.score,
  });
}

console.table(rows);
console.log(`Survived or won: ${survived}/${sample.length}`);
