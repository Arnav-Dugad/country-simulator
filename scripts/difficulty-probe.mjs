/**
 * Difficulty probe: hands-off campaigns across every difficulty, to confirm the
 * curve still has teeth after a balance change. A passive player should coast
 * on the easy settings and fail on the hard ones.
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-loader.mjs', pathToFileURL('./scripts/'));

const { getCountry } = await import('../src/game/data/countries.ts');
const { createGame, defaultSetup } = await import('../src/game/engine/createGame.ts');
const { tick } = await import('../src/game/engine/tick.ts');
const { resolveEvent } = await import('../src/game/engine/events.ts');
const { EVENT_INDEX } = await import('../src/game/data/events.ts');
const { DIFFICULTIES } = await import('../src/game/data/definitions.ts');

function setupFor(id, overrides = {}) {
  const c = getCountry(id);
  return {
    ...defaultSetup(), mode: 'real', countryId: id, nationName: c.name, adjective: c.name,
    capital: c.capital, region: c.region, iso2: c.iso2, currencyCode: c.currency,
    government: c.government, leaderName: 'Probe', traits: [], victoryGoal: 'survival',
    ...overrides,
  };
}

const sample = ['usa', 'germany', 'india', 'nigeria', 'brazil', 'venezuela', 'lebanon', 'egypt'];
const rows = [];

for (const difficulty of DIFFICULTIES) {
  let survived = 0;
  let totalScore = 0;
  let totalMonths = 0;
  const endings = [];

  for (const id of sample) {
    const s = createGame(setupFor(id, { difficulty: difficulty.id }), 4242);
    for (let i = 0; i < 600 && !s.gameOver; i++) {
      while (s.eventQueue.length > 0) {
        resolveEvent(s, EVENT_INDEX[s.eventQueue[0].defId].choices[0].id);
      }
      tick(s);
    }
    if (!s.gameOver || s.gameOver.victory) survived++;
    else endings.push(`${getCountry(id).name.slice(0, 8)}:${s.gameOver.title}`);
    totalScore += s.score;
    totalMonths += s.turn;
  }

  rows.push({
    difficulty: difficulty.name,
    'survived/won': `${survived}/${sample.length}`,
    'avg score': Math.round(totalScore / sample.length).toLocaleString(),
    'avg months': Math.round(totalMonths / sample.length),
    failures: endings.join(' ') || '—',
  });
}

console.log('\nHands-off play (never touch anything, always take the first option)\n');
console.table(rows);
