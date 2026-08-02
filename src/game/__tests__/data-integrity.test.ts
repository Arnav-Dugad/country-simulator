import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../data/countries';
import { CURRENCIES } from '../data/currencies';
import { POLICIES, POLICY_INDEX } from '../data/policies';
import { TECHNOLOGIES, TECH_INDEX } from '../data/technologies';
import { BUILDINGS, BUILDING_INDEX } from '../data/buildings';
import { EVENTS, EVENT_INDEX } from '../data/events';
import { ACHIEVEMENTS } from '../data/achievements';
import { ADVISORS, ORGS } from '../data/institutions';
import { GOVERNMENTS, IDEOLOGIES, RESOURCES, TRAITS } from '../data/definitions';
import { MODIFIER_LABELS } from '../types';

const MODIFIER_KEYS = new Set(Object.keys(MODIFIER_LABELS));

function expectUniqueIds(items: { id: string }[], label: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    expect(seen.has(item.id), `${label} has duplicate id "${item.id}"`).toBe(false);
    seen.add(item.id);
  }
}

describe('reference data', () => {
  it('has unique ids everywhere', () => {
    expectUniqueIds(COUNTRIES, 'countries');
    expectUniqueIds(POLICIES, 'policies');
    expectUniqueIds(TECHNOLOGIES, 'technologies');
    expectUniqueIds(BUILDINGS, 'buildings');
    expectUniqueIds(EVENTS, 'events');
    expectUniqueIds(ACHIEVEMENTS, 'achievements');
    expectUniqueIds(ADVISORS, 'advisors');
    expectUniqueIds(ORGS, 'orgs');
    expectUniqueIds(GOVERNMENTS, 'governments');
    expectUniqueIds(IDEOLOGIES, 'ideologies');
    expectUniqueIds(TRAITS, 'traits');
    expectUniqueIds(RESOURCES, 'resources');
  });

  it('gives every country a known currency and a two-letter flag code', () => {
    for (const c of COUNTRIES) {
      expect(CURRENCIES[c.currency], `${c.name} uses unknown currency ${c.currency}`).toBeDefined();
      expect(c.iso2, `${c.name} has a malformed ISO code`).toMatch(/^[a-z]{2}$/);
      expect(c.population).toBeGreaterThan(0);
      expect(c.gdp).toBeGreaterThan(0);
      expect(c.area).toBeGreaterThan(0);
    }
  });

  it('keeps every country index inside 0–100', () => {
    for (const c of COUNTRIES) {
      for (const key of ['stability', 'militaryStrength', 'techLevel', 'corruption', 'hdi'] as const) {
        expect(c[key], `${c.name}.${key}`).toBeGreaterThanOrEqual(0);
        expect(c[key], `${c.name}.${key}`).toBeLessThanOrEqual(100);
      }
      for (const [res, value] of Object.entries(c.resources)) {
        expect(value, `${c.name}.${res}`).toBeGreaterThanOrEqual(0);
        expect(value, `${c.name}.${res}`).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('technology tree', () => {
  it('resolves every prerequisite', () => {
    for (const t of TECHNOLOGIES) {
      for (const r of t.requires) {
        expect(TECH_INDEX[r], `${t.id} requires unknown tech ${r}`).toBeDefined();
      }
    }
  });

  it('never places a tech below its own prerequisite tier', () => {
    for (const t of TECHNOLOGIES) {
      for (const r of t.requires) {
        expect(TECH_INDEX[r].tier, `${t.id} (tier ${t.tier}) requires ${r} (tier ${TECH_INDEX[r].tier})`)
          .toBeLessThan(t.tier);
      }
    }
  });

  it('has no dependency cycles and is fully reachable from the roots', () => {
    const done = new Set<string>();
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const t of TECHNOLOGIES) {
        if (done.has(t.id)) continue;
        if (t.requires.every((r) => done.has(r))) {
          done.add(t.id);
          progressed = true;
        }
      }
    }
    const unreachable = TECHNOLOGIES.filter((t) => !done.has(t.id)).map((t) => t.id);
    expect(unreachable, `unreachable technologies: ${unreachable.join(', ')}`).toHaveLength(0);
  });

  it('unlocks only real policies and buildings', () => {
    for (const t of TECHNOLOGIES) {
      for (const p of t.unlocksPolicies ?? []) {
        expect(POLICY_INDEX[p], `${t.id} unlocks unknown policy ${p}`).toBeDefined();
      }
      for (const b of t.unlocksBuildings ?? []) {
        expect(BUILDING_INDEX[b], `${t.id} unlocks unknown building ${b}`).toBeDefined();
      }
    }
  });
});

describe('policies', () => {
  it('references only real prerequisites and conflicts', () => {
    for (const p of POLICIES) {
      for (const t of p.requires?.tech ?? []) {
        expect(TECH_INDEX[t], `${p.id} requires unknown tech ${t}`).toBeDefined();
      }
      for (const r of p.requires?.policies ?? []) {
        expect(POLICY_INDEX[r], `${p.id} requires unknown policy ${r}`).toBeDefined();
      }
      for (const c of p.conflicts ?? []) {
        expect(POLICY_INDEX[c], `${p.id} conflicts with unknown policy ${c}`).toBeDefined();
      }
    }
  });

  it('declares conflicts symmetrically', () => {
    for (const p of POLICIES) {
      for (const c of p.conflicts ?? []) {
        const other = POLICY_INDEX[c];
        expect(other.conflicts ?? [], `${c} does not list ${p.id} as a conflict`).toContain(p.id);
      }
    }
  });

  it('uses only known modifier and ideology keys', () => {
    const ideologyIds = new Set(IDEOLOGIES.map((i) => i.id));
    for (const p of POLICIES) {
      for (const key of Object.keys(p.modifiers)) {
        expect(MODIFIER_KEYS.has(key), `${p.id} uses unknown modifier "${key}"`).toBe(true);
      }
      for (const key of Object.keys(p.ideologyAppeal ?? {})) {
        expect(ideologyIds.has(key as never), `${p.id} appeals to unknown ideology "${key}"`).toBe(true);
      }
    }
  });
});

describe('buildings', () => {
  it('references only real prerequisites', () => {
    for (const b of BUILDINGS) {
      for (const t of b.requires?.tech ?? []) {
        expect(TECH_INDEX[t], `${b.id} requires unknown tech ${t}`).toBeDefined();
      }
      for (const r of b.requires?.buildings ?? []) {
        expect(BUILDING_INDEX[r], `${b.id} requires unknown building ${r}`).toBeDefined();
      }
      expect(b.maxCount, `${b.id} must allow at least one copy`).toBeGreaterThan(0);
      expect(b.buildTime, `${b.id} must take at least one month`).toBeGreaterThan(0);
      expect(b.cost, `${b.id} must cost something`).toBeGreaterThan(0);
    }
  });

  it('makes wonders unique', () => {
    for (const b of BUILDINGS.filter((x) => x.category === 'wonder')) {
      expect(b.maxCount, `${b.id} is a wonder but is not unique`).toBe(1);
    }
  });
});

describe('events', () => {
  it('gives every event at least two choices with distinct ids', () => {
    for (const e of EVENTS) {
      expect(e.choices.length, `${e.id} needs at least two choices`).toBeGreaterThanOrEqual(2);
      const ids = new Set(e.choices.map((c) => c.id));
      expect(ids.size, `${e.id} has duplicate choice ids`).toBe(e.choices.length);
    }
  });

  it('always pairs riskChance with failureEffects', () => {
    for (const e of EVENTS) {
      for (const c of e.choices) {
        if (c.riskChance !== undefined) {
          expect(c.failureEffects, `${e.id}/${c.id} has riskChance but no failureEffects`).toBeDefined();
          expect(c.riskChance).toBeGreaterThan(0);
          expect(c.riskChance).toBeLessThan(1);
        }
      }
    }
  });

  it('chains only to real events', () => {
    for (const e of EVENTS) {
      for (const c of e.chains ?? []) {
        expect(EVENT_INDEX[c], `${e.id} chains to unknown event ${c}`).toBeDefined();
      }
      for (const t of e.conditions?.requiresTech ?? []) {
        expect(TECH_INDEX[t], `${e.id} requires unknown tech ${t}`).toBeDefined();
      }
    }
  });

  it('makes every zero-weight event reachable through a chain', () => {
    const chained = new Set(EVENTS.flatMap((e) => e.chains ?? []));
    for (const e of EVENTS.filter((x) => x.weight <= 0)) {
      expect(chained.has(e.id), `${e.id} has zero weight and is never chained to`).toBe(true);
    }
  });

  it('uses only known modifier keys in temporary modifiers', () => {
    for (const e of EVENTS) {
      for (const c of e.choices) {
        for (const key of Object.keys(c.temporaryModifiers?.modifiers ?? {})) {
          expect(MODIFIER_KEYS.has(key), `${e.id}/${c.id} uses unknown modifier "${key}"`).toBe(true);
        }
      }
    }
  });
});

describe('definitions', () => {
  it('uses only known modifier keys across governments, ideologies and traits', () => {
    for (const group of [GOVERNMENTS, IDEOLOGIES, TRAITS, ADVISORS, ORGS]) {
      for (const item of group) {
        for (const key of Object.keys(item.modifiers)) {
          expect(MODIFIER_KEYS.has(key), `${item.id} uses unknown modifier "${key}"`).toBe(true);
        }
      }
    }
  });
});
