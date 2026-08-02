/** Prints the size of every content set, so documentation can't drift from the data. */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./ts-loader.mjs', pathToFileURL('./scripts/'));

const { COUNTRIES } = await import('../src/game/data/countries.ts');
const { CURRENCY_LIST } = await import('../src/game/data/currencies.ts');
const { POLICIES, POLICY_CATEGORIES } = await import('../src/game/data/policies.ts');
const { TECHNOLOGIES, TECH_BRANCHES } = await import('../src/game/data/technologies.ts');
const { BUILDINGS } = await import('../src/game/data/buildings.ts');
const { EVENTS } = await import('../src/game/data/events.ts');
const { ACHIEVEMENTS } = await import('../src/game/data/achievements.ts');
const { ADVISORS, ORGS } = await import('../src/game/data/institutions.ts');
const { GOVERNMENTS, IDEOLOGIES, TRAITS, DIFFICULTIES, ERAS, VICTORY_GOALS, RESOURCES } =
  await import('../src/game/data/definitions.ts');

const { createGame, defaultSetup } = await import('../src/game/engine/createGame.ts');
const sample = createGame(
  { ...defaultSetup(), mode: 'real', countryId: 'usa', nationName: 'US', capital: 'DC', leaderName: 'X' },
  1,
);

const rows = [
  ['Countries', COUNTRIES.length],
  ['Simulated foreign nations', sample.nations.length],
  ['Currencies', CURRENCY_LIST.length],
  ['Policies', POLICIES.length],
  ['Policy categories', POLICY_CATEGORIES.length],
  ['Technologies', TECHNOLOGIES.length],
  ['Tech branches', TECH_BRANCHES.length],
  ['Buildings', BUILDINGS.length],
  ['Wonders', BUILDINGS.filter((b) => b.category === 'wonder').length],
  ['Events', EVENTS.length],
  ['Event choices', EVENTS.reduce((s, e) => s + e.choices.length, 0)],
  ['Achievements', ACHIEVEMENTS.length],
  ['Advisors', ADVISORS.length],
  ['Organisations', ORGS.length],
  ['Governments', GOVERNMENTS.length],
  ['Ideologies', IDEOLOGIES.length],
  ['Traits', TRAITS.length],
  ['Difficulties', DIFFICULTIES.length],
  ['Eras', ERAS.length],
  ['Victory goals', VICTORY_GOALS.length],
  ['Resources', RESOURCES.length],
];

console.table(rows.map(([name, count]) => ({ content: name, count })));
