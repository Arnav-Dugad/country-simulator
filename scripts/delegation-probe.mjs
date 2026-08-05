import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-loader.mjs', pathToFileURL('./scripts/'));

const { createGame, defaultSetup } = await import('../src/game/engine/createGame.ts');
const { tick } = await import('../src/game/engine/tick.ts');
const { resolveEvent } = await import('../src/game/engine/events.ts');
const { EVENT_INDEX } = await import('../src/game/data/events.ts');
const { getCountry } = await import('../src/game/data/countries.ts');
const { delegateQueuedDecisions } = await import('../src/game/engine/delegation.ts');

const COUNTRIES = ['usa', 'india', 'japan', 'brazil', 'nigeria', 'germany', 'fiji', 'venezuela'];
const SEEDS = [101, 202, 303, 404, 505];
const MONTHS = 480;

function setupFor(id) {
  const c = getCountry(id);
  return {
    ...defaultSetup(), mode: 'real', countryId: id, nationName: c.name,
    adjective: c.name, capital: c.capital, region: c.region, iso2: c.iso2,
    currencyCode: c.currency, government: c.government, leaderName: 'Probe',
  };
}

function runDelegated(id, seed) {
  const s = createGame(setupFor(id), seed);
  for (let i = 0; i < MONTHS && !s.gameOver; i++) {
    delegateQueuedDecisions(s, 'delegate-all');
    tick(s);
  }
  delegateQueuedDecisions(s, 'delegate-all');
  return s;
}

function runNaive(id, seed) {
  const s = createGame(setupFor(id), seed);
  for (let i = 0; i < MONTHS && !s.gameOver; i++) {
    let g = 0;
    while (s.eventQueue.length > 0 && g++ < 10) {
      resolveEvent(s, EVENT_INDEX[s.eventQueue[0].defId].choices[0].id);
    }
    tick(s);
  }
  return s;
}

const rows = [];
let dSurv = 0, nSurv = 0, dScore = 0, nScore = 0, dWins = 0, pairs = 0;

for (const id of COUNTRIES) {
  for (const seed of SEEDS) {
    const d = runDelegated(id, seed);
    const n = runNaive(id, seed);
    pairs += 1;
    const dAlive = !d.gameOver || d.gameOver.victory;
    const nAlive = !n.gameOver || n.gameOver.victory;
    if (dAlive) dSurv += 1;
    if (nAlive) nSurv += 1;
    dScore += d.score;
    nScore += n.score;
    if (d.score >= n.score) dWins += 1;
    rows.push({
      country: id, seed,
      delegated: d.gameOver ? d.gameOver.title : 'alive',
      dTurn: d.turn, dScore: Math.round(d.score),
      naive: n.gameOver ? n.gameOver.title : 'alive',
      nTurn: n.turn, nScore: Math.round(n.score),
    });
  }
}

console.table(rows);
console.log(`\npairs ${pairs}`);
console.log(`delegated survived ${dSurv}/${pairs} (${((dSurv / pairs) * 100).toFixed(0)}%), mean score ${Math.round(dScore / pairs)}`);
console.log(`naive     survived ${nSurv}/${pairs} (${((nSurv / pairs) * 100).toFixed(0)}%), mean score ${Math.round(nScore / pairs)}`);
console.log(`delegated score >= naive in ${dWins}/${pairs} pairs`);
