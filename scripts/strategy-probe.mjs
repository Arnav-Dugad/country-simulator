import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('./ts-loader.mjs', pathToFileURL('./scripts/'));

const { createGame, defaultSetup } = await import('../src/game/engine/createGame.ts');
const { tick } = await import('../src/game/engine/tick.ts');
const { resolveEvent, choiceAvailable } = await import('../src/game/engine/events.ts');
const { EVENT_INDEX, EVENTS } = await import('../src/game/data/events.ts');
const { getCountry } = await import('../src/game/data/countries.ts');
const { recommendChoice } = await import('../src/game/engine/delegation.ts');

// How the content is authored: is choices[0] systematically the cheap one?
let firstCost = 0, otherCost = 0, firstN = 0, otherN = 0;
for (const def of EVENTS) {
  def.choices.forEach((c, i) => {
    if (i === 0) { firstCost += c.cost ?? 0; firstN++; } else { otherCost += c.cost ?? 0; otherN++; }
  });
}
console.log(`mean cost of choices[0]: ${Math.round(firstCost/firstN)}   of the rest: ${Math.round(otherCost/otherN)}`);

const COUNTRIES = ['usa','india','japan','brazil','nigeria','germany','fiji','venezuela'];
const SEEDS = [101,202,303,404,505];
const MONTHS = 480;

function setupFor(id){ const c=getCountry(id); return { ...defaultSetup(), mode:'real', countryId:id,
  nationName:c.name, adjective:c.name, capital:c.capital, region:c.region, iso2:c.iso2,
  currencyCode:c.currency, government:c.government, leaderName:'P' }; }

const STRATEGIES = {
  first:   (s, def) => def.choices[0].id,
  last:    (s, def) => def.choices[def.choices.length-1].id,
  cheapest:(s, def) => [...def.choices].sort((a,b)=>(a.cost??0)-(b.cost??0))[0].id,
  affordableCheapest: (s, def) => {
    const ok = def.choices.filter((c)=>choiceAvailable(s,c).enabled);
    return ([...(ok.length?ok:def.choices)].sort((a,b)=>(a.cost??0)-(b.cost??0))[0]).id;
  },
  cabinet: (s, def) => recommendChoice(s, def.id).id,
  random:  (s, def) => def.choices[Math.floor(Math.random()*def.choices.length)].id,
  second:  (s, def) => def.choices[Math.min(1, def.choices.length-1)].id,
};

const out = [];
for (const [name, pick] of Object.entries(STRATEGIES)) {
  let surv=0, score=0, n=0;
  for (const id of COUNTRIES) for (const seed of SEEDS) {
    const s = createGame(setupFor(id), seed);
    for (let i=0;i<MONTHS && !s.gameOver;i++){
      let g=0;
      while (s.eventQueue.length && g++<10) resolveEvent(s, pick(s, EVENT_INDEX[s.eventQueue[0].defId]));
      tick(s);
    }
    n++; score += s.score;
    if (!s.gameOver || s.gameOver.victory) surv++;
  }
  out.push({ strategy:name, survived:`${surv}/${n}`, pct:Math.round(surv/n*100), meanScore: Math.round(score/n) });
}
console.table(out);
