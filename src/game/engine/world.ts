import type {
  BlocId,
  DiplomaticOffer,
  ForeignNation,
  ForeignWar,
  GameState,
  LogEntry,
  NationAgenda,
  ResourceId,
} from '../types';
import { RESOURCE_IDS, RESOURCE_INDEX } from '../data/definitions';
import { averageRelations, clamp, costScale } from '../selectors';
import { nextRandom, noise, pick, randRange, weightedPick } from './rng';
import { addTreasury } from './treasury';

/**
 * The world outside your borders.
 *
 * Before this, foreign nations grew their GDP and did nothing else — which
 * meant a fifty-year campaign ended with the player facing the same rivals
 * they started with, only poorer. Now the world has its own arc: economies
 * cycle, militaries modernise, blocs form, wars break out between third
 * parties, and governments come to you with proposals you did not ask for.
 */

type Logger = (entry: Omit<LogEntry, 'id' | 'turn' | 'year' | 'month'>) => void;

const OPEN_GOVERNMENTS = [
  'democracy',
  'republic',
  'federal-republic',
  'constitutional-monarchy',
  'direct-democracy',
];

const AGENDAS: NationAgenda[] = [
  'expansion',
  'trade',
  'isolation',
  'rearmament',
  'influence',
  'development',
];

/** Bloc a nation naturally belongs to, given how it is governed and where. */
export function naturalBloc(nation: { government: string; region: string; gdp: number }): BlocId {
  const open = OPEN_GOVERNMENTS.includes(nation.government);
  if (open && ['europe', 'north-america', 'oceania'].includes(nation.region)) return 'western';
  if (!open && ['east-asia', 'central-asia', 'europe'].includes(nation.region)) return 'eastern';
  if (['africa', 'south-america', 'south-asia', 'southeast-asia'].includes(nation.region)) {
    return nation.gdp > 900 ? 'non-aligned' : 'southern';
  }
  return 'non-aligned';
}

export const BLOC_LABELS: Record<BlocId, string> = {
  western: 'Atlantic Bloc',
  eastern: 'Continental Bloc',
  'non-aligned': 'Non-Aligned',
  southern: 'Global South',
};

export const AGENDA_LABELS: Record<NationAgenda, string> = {
  expansion: 'Territorial expansion',
  trade: 'Commercial expansion',
  isolation: 'Strategic isolation',
  rearmament: 'Rearmament',
  influence: 'Regional influence',
  development: 'Domestic development',
};

/* ------------------------------------------------------------------ */
/* World cycle                                                         */
/* ------------------------------------------------------------------ */

/**
 * The global business cycle.
 *
 * A real phase machine rather than noise, because the player should be able to
 * *see* a downturn coming and position for it — that is the whole reason to
 * bother modelling it separately from the domestic economy.
 */
function updateCycle(s: GameState, log: Logger): void {
  const w = s.world;
  w.monthsToPhaseShift -= 1;

  if (w.monthsToPhaseShift <= 0) {
    const next: Record<typeof w.cyclePhase, typeof w.cyclePhase> = {
      expansion: 'peak',
      peak: 'contraction',
      contraction: 'trough',
      trough: 'expansion',
    };
    w.cyclePhase = next[w.cyclePhase];
    w.monthsToPhaseShift = Math.round(
      w.cyclePhase === 'expansion'
        ? randRange(s, 30, 66)
        : w.cyclePhase === 'contraction'
          ? randRange(s, 10, 24)
          : randRange(s, 6, 16),
    );
    const headline: Record<typeof w.cyclePhase, { text: string; tone: LogEntry['tone']; icon: string }> = {
      expansion: { text: 'The world economy has turned. A new expansion is under way.', tone: 'good', icon: '🌍' },
      peak: { text: 'World growth has plateaued. Analysts are calling the top of the cycle.', tone: 'neutral', icon: '🌍' },
      contraction: { text: 'The world economy has entered a downturn. External demand is falling.', tone: 'bad', icon: '🌍' },
      trough: { text: 'The global downturn has bottomed out. Recovery is not yet visible.', tone: 'neutral', icon: '🌍' },
    };
    log({ ...headline[w.cyclePhase], category: 'world' });
  }

  const cycleTarget: Record<typeof w.cyclePhase, number> = {
    expansion: 0.55,
    peak: 0.85,
    contraction: -0.6,
    trough: -0.85,
  };
  w.cycle = clamp(w.cycle + (cycleTarget[w.cyclePhase] - w.cycle) * 0.12 + noise(s) * 0.03, -1, 1);
  w.globalGrowth = clamp(2.6 + w.cycle * 2.6 - s.world.tension / 90 + noise(s) * 0.3, -5, 7);
}

/* ------------------------------------------------------------------ */
/* Nation development                                                  */
/* ------------------------------------------------------------------ */

/** Advances one foreign nation's economy, forces and internal condition. */
function developNation(s: GameState, n: ForeignNation): void {
  const perCapita = (n.gdp * 1e9) / Math.max(1, n.population);
  // Convergence, same shape as the player's, so rivals face the same physics.
  const convergence = clamp(4.6 - Math.log10(Math.max(500, perCapita)) * 0.82, 0.1, 6.4);
  const agendaBoost = n.agenda === 'development' ? 0.9 : n.agenda === 'trade' ? 0.6 : 0;
  const warDrag = n.atWarWithPlayer || n.warsWith.length > 0 ? 1.6 : 0;
  const sanctionDrag = n.sanctioned ? 1.4 : 0;

  const growth = clamp(
    convergence + agendaBoost + s.world.cycle * 1.5 - warDrag - sanctionDrag,
    -6,
    9,
  );
  n.gdp = Math.max(1, n.gdp * (1 + growth / 100 / 12));
  n.population = Math.max(
    10_000,
    Math.round(n.population * (1 + (n.gdp > 800 ? 0.0004 : 0.0011) / 12)),
  );

  // Technology creeps up with income; military follows technology and agenda.
  const techTarget = clamp(24 + Math.log10(Math.max(500, perCapita)) * 15, 5, 99);
  n.techLevel = clamp(n.techLevel + (techTarget - n.techLevel) * 0.006, 0, 100);

  const militaryTarget = clamp(
    12 +
      Math.log10(Math.max(1, n.gdp)) * 13 +
      n.techLevel * 0.2 +
      (n.agenda === 'rearmament' ? 16 : n.agenda === 'expansion' ? 10 : n.agenda === 'isolation' ? -6 : 0) +
      n.threatPerception * 0.12,
    1,
    100,
  );
  n.militaryStrength = clamp(n.militaryStrength + (militaryTarget - n.militaryStrength) * 0.012, 0, 100);

  const stabilityTarget = clamp(
    46 + Math.log10(Math.max(500, perCapita)) * 8 - (n.warsWith.length + (n.atWarWithPlayer ? 1 : 0)) * 9,
    5,
    96,
  );
  n.stability = clamp(n.stability + (stabilityTarget - n.stability) * 0.02, 0, 100);

  // Agendas shift occasionally, and never mid-war.
  if (!n.atWarWithPlayer && n.warsWith.length === 0 && nextRandom(s) < 0.004) {
    n.agenda = pick(s, AGENDAS);
  }

  // How threatened they feel by you.
  const threatTarget = clamp(
    (s.military.strength - n.militaryStrength) * 0.55 +
      (n.relations < 0 ? -n.relations * 0.4 : -n.relations * 0.15) +
      s.wars.filter((w) => !w.resolved).length * 12 +
      (n.region === s.identity.region ? 12 : 0),
    0,
    100,
  );
  n.threatPerception = clamp(n.threatPerception + (threatTarget - n.threatPerception) * 0.04, 0, 100);
}

/* ------------------------------------------------------------------ */
/* Foreign wars                                                        */
/* ------------------------------------------------------------------ */

/** Wars between third parties, which the player can watch, exploit or join. */
function updateForeignWars(s: GameState, log: Logger): void {
  if (!s.settings.enableWars) {
    s.foreignWars = [];
    return;
  }

  const surviving: ForeignWar[] = [];
  for (const war of s.foreignWars) {
    const a = s.nations.find((n) => n.id === war.aId);
    const b = s.nations.find((n) => n.id === war.bId);
    if (!a || !b) continue;

    const swing = (a.militaryStrength - b.militaryStrength) * 0.2 + noise(s) * 4;
    war.score = clamp(war.score + swing, -120, 120);

    // Both sides pay for it every month.
    a.gdp = Math.max(1, a.gdp * 0.9985);
    b.gdp = Math.max(1, b.gdp * 0.9985);

    if (Math.abs(war.score) >= 100 || s.turn - war.startTurn > 54) {
      const winner = war.score > 40 ? a : war.score < -40 ? b : null;
      a.warsWith = a.warsWith.filter((id) => id !== b.id);
      b.warsWith = b.warsWith.filter((id) => id !== a.id);
      if (winner) {
        const loser = winner === a ? b : a;
        winner.gdp *= 1.02;
        loser.gdp *= 0.9;
        loser.stability = clamp(loser.stability - 12, 0, 100);
        log({
          text: `${winner.name} has defeated ${loser.name}. The settlement redraws the regional balance.`,
          category: 'world',
          tone: 'neutral',
          icon: '⚔️',
        });
      } else {
        log({
          text: `${a.name} and ${b.name} have agreed an armistice.`,
          category: 'world',
          tone: 'neutral',
          icon: '🏳️',
        });
      }
      s.world.tension = clamp(s.world.tension - 9, 0, 100);
      continue;
    }
    surviving.push(war);
  }
  s.foreignWars = surviving;

  /* --- New foreign wars --------------------------------------------------- */
  if (s.foreignWars.length >= 3) return;
  const chance = 0.008 * (1 + s.world.tension / 60);
  if (nextRandom(s) > chance) return;

  const aggressors = s.nations.filter(
    (n) => (n.agenda === 'expansion' || n.agenda === 'rearmament') && n.warsWith.length === 0 && !n.atWarWithPlayer,
  );
  const attacker = weightedPick(s, aggressors, (n) => n.militaryStrength);
  if (!attacker) return;

  const targets = s.nations.filter(
    (n) =>
      n.id !== attacker.id &&
      n.warsWith.length === 0 &&
      !n.atWarWithPlayer &&
      n.region === attacker.region &&
      n.militaryStrength < attacker.militaryStrength * 0.92,
  );
  const defender = weightedPick(s, targets, (n) => 100 - n.militaryStrength);
  if (!defender) return;

  attacker.warsWith.push(defender.id);
  defender.warsWith.push(attacker.id);
  s.foreignWars.push({
    id: `fwar-${attacker.id}-${defender.id}-${s.turn}`,
    aId: attacker.id,
    bId: defender.id,
    startTurn: s.turn,
    score: 0,
  });
  s.world.tension = clamp(s.world.tension + 14, 0, 100);
  log({
    text: `${attacker.name} has invaded ${defender.name}. The region is at war.`,
    category: 'world',
    tone: 'critical',
    icon: '⚔️',
  });
}

/* ------------------------------------------------------------------ */
/* AI aggression toward the player                                     */
/* ------------------------------------------------------------------ */

/**
 * Whether anyone decides to attack the player this month.
 *
 * Deliberately conservative: an unprovoked war is one of the few things that
 * can end a campaign the player did not choose to risk, so it requires genuine
 * hostility, a real capability gap, and a world already tense enough for it.
 */
function considerAggression(s: GameState, log: Logger): void {
  if (!s.settings.enableWars) return;
  if (s.wars.filter((w) => !w.resolved).length >= 2) return;
  if (s.turn < 24) return; // a grace period, so a new player is not ambushed

  const candidates = s.nations.filter(
    (n) =>
      !n.atWarWithPlayer &&
      n.relations < -45 &&
      n.warsWith.length === 0 &&
      n.militaryStrength > s.military.strength * 1.12 &&
      (n.agenda === 'expansion' || n.agenda === 'rearmament') &&
      !s.treaties.some((t) => t.countryId === n.id && (t.type === 'defense' || t.type === 'alliance' || t.type === 'non-aggression')),
  );
  if (candidates.length === 0) return;

  const attacker = weightedPick(s, candidates, (n) => -n.relations * (n.militaryStrength / 50));
  if (!attacker) return;

  const base = 0.0035 * (1 + s.world.tension / 55);
  const weakness = clamp((attacker.militaryStrength - s.military.strength) / 60, 0, 1);
  const allies = s.treaties.filter((t) => t.type === 'defense' || t.type === 'alliance').length;
  const deterrence = clamp(1 - allies * 0.16 - (s.military.nuclearWarheads > 0 ? 0.55 : 0), 0.1, 1);

  if (nextRandom(s) > base * (0.5 + weakness) * deterrence) return;

  attacker.atWarWithPlayer = true;
  attacker.relations = -100;
  attacker.trust = 0;
  s.wars.push({
    id: `war-${attacker.id}-${s.turn}`,
    attackerId: attacker.id,
    defenderId: 'player',
    startTurn: s.turn,
    goal: attacker.agenda === 'expansion' ? 'conquest' : 'punitive',
    warScore: 0,
    playerCasualties: 0,
    enemyCasualties: 0,
    monthlyCost: ((s.economy.gdp * 1000) / 12) * 0.04,
  });
  s.world.tension = clamp(s.world.tension + 18, 0, 100);
  s.approval = clamp(s.approval + 6, 0, 100); // rally round the flag
  log({
    text: `${attacker.name} has declared war. Their forces crossed the border this morning.`,
    category: 'military',
    tone: 'critical',
    icon: '🚨',
  });

  // Defence pacts drag your allies in.
  for (const treaty of s.treaties) {
    if (treaty.type !== 'defense' && treaty.type !== 'alliance') continue;
    const ally = s.nations.find((n) => n.id === treaty.countryId);
    if (!ally || ally.id === attacker.id) continue;
    ally.relations = clamp(ally.relations + 6, -100, 100);
  }
}

/* ------------------------------------------------------------------ */
/* Diplomatic offers                                                   */
/* ------------------------------------------------------------------ */

/** Removes offers whose window has closed. */
function expireOffers(s: GameState, log: Logger): void {
  const surviving: DiplomaticOffer[] = [];
  for (const offer of s.offers) {
    if (s.turn < offer.expiresTurn) {
      surviving.push(offer);
      continue;
    }
    const nation = s.nations.find((n) => n.id === offer.countryId);
    if (nation) {
      // Ignoring a demand is not the same as refusing it. It costs something,
      // but only half of an outright refusal — otherwise a player who simply
      // is not watching the inbox is punished as hard as one who said no.
      const cost =
        offer.kind === 'ultimatum' || offer.kind === 'demand' ? offer.refuseRelations * 0.5 : -1;
      nation.relations = clamp(nation.relations + cost, -100, 100);
      nation.trust = clamp(nation.trust - 2, 0, 100);
    }
    log({
      text: `The proposal from ${nation?.name ?? offer.countryId} lapsed without an answer.`,
      category: 'diplomacy',
      tone: 'neutral',
      icon: '⌛',
    });
  }
  s.offers = surviving;
}

/** What a nation would credibly export to you right now. */
function sellableResource(s: GameState, n: ForeignNation): ResourceId | null {
  const options = RESOURCE_IDS.filter((id) => (n.resources[id] ?? 0) > 45);
  if (options.length === 0) return null;
  // Prefer something the player is actually short of — a real offer, not noise.
  const needed = options.filter((id) => {
    const holding = s.resources[id];
    return holding && holding.production < holding.consumption;
  });
  return pick(s, needed.length > 0 ? needed : options);
}

/** Generates unsolicited proposals from the world. */
function generateOffers(s: GameState, log: Logger): void {
  if (s.offers.length >= 4) return;

  // Offers arrive more often when you matter and when you are well connected.
  const prominence = clamp(Math.log10(Math.max(1, s.economy.gdp)) / 4.6, 0.1, 1);
  const chance = 0.075 * (0.5 + prominence) * (1 + s.society.softPower / 180);
  if (nextRandom(s) > chance) return;

  const pool = s.nations.filter((n) => !n.atWarWithPlayer && !s.offers.some((o) => o.countryId === n.id));
  const nation = weightedPick(s, pool, (n) => Math.max(1, n.gdp) * (0.4 + (n.relations + 100) / 200));
  if (!nation) return;

  const offer = composeOffer(s, nation);
  if (!offer) return;
  s.offers.push(offer);
  log({
    text: `${nation.name}: ${offer.title}`,
    category: 'diplomacy',
    tone: offer.kind === 'demand' || offer.kind === 'ultimatum' ? 'bad' : 'neutral',
    icon: offer.kind === 'ultimatum' ? '⚠️' : '✉️',
  });
}

function composeOffer(s: GameState, n: ForeignNation): DiplomaticOffer | null {
  const id = `offer-${n.id}-${s.turn}-${Math.floor(nextRandom(s) * 1e5).toString(36)}`;
  const expiresTurn = s.turn + 6;
  const scale = costScale(s.economy.gdp);

  // Hostile and strong: a demand, or an ultimatum if they really do not like you.
  if (n.relations < -30 && n.militaryStrength > s.military.strength * 0.95) {
    const amount = Math.round(2400 * scale);
    const ultimatum = n.relations < -60 && n.threatPerception < 45;
    return {
      id,
      countryId: n.id,
      kind: ultimatum ? 'ultimatum' : 'demand',
      title: ultimatum
        ? `${n.name} has issued an ultimatum`
        : `${n.name} is demanding concessions`,
      body: ultimatum
        ? `${n.name} demands reparations and a formal apology for what they describe as sustained hostile conduct. Their note observes that their forces are at readiness. Refusing will not necessarily mean war — but it will mean they have said this and been ignored.`
        : `${n.name} is pressing for a settlement payment to resolve an outstanding dispute. It is a shakedown, and paying it will be noticed by everyone who might try the same.`,
      amount,
      acceptRelations: ultimatum ? 26 : 16,
      refuseRelations: ultimatum ? -22 : -12,
      expiresTurn,
    };
  }

  // Warm: a treaty offer.
  if (n.relations > 34 && nextRandom(s) < 0.45) {
    const type = n.relations > 66 ? 'defense' : n.relations > 50 ? 'research' : 'trade';
    const label = type === 'defense' ? 'a defence pact' : type === 'research' ? 'a research pact' : 'a trade agreement';
    return {
      id,
      countryId: n.id,
      kind: 'treaty',
      treatyType: type,
      title: `${n.name} proposes ${label}`,
      body: `${n.name} has approached us about ${label}. They came to us, which means the terms are better than we would have got by asking — and it means refusing will be read as a snub.`,
      acceptRelations: 12,
      refuseRelations: -8,
      expiresTurn,
    };
  }

  // Commercial: a commodity contract at a decent price.
  if (n.relations > -10 && nextRandom(s) < 0.6) {
    const resource = sellableResource(s, n);
    if (resource) {
      const quantity = Math.round(clamp(Math.pow(Math.max(1, n.gdp), 0.4) * 0.3, 0.5, 40) * 10) / 10;
      const price = clamp((s.worldPrices[resource] ?? 1) * (1.02 - (n.relations + 100) / 900), 0.3, 3);
      return {
        id,
        countryId: n.id,
        kind: 'trade',
        resource,
        direction: 'import',
        quantity,
        price: Math.round(price * 100) / 100,
        termMonths: 60,
        title: `${n.name} offers a five-year ${RESOURCE_INDEX[resource].name.toLowerCase()} contract`,
        body: `${n.name} is offering ${quantity} units of ${RESOURCE_INDEX[resource].name.toLowerCase()} a month for five years at ${price.toFixed(2)}× the base price. Locking supply at a fixed price is worth more the more volatile the market gets.`,
        acceptRelations: 8,
        refuseRelations: -3,
        expiresTurn,
      };
    }
  }

  // A poorer nation asking for help.
  if (n.gdp < s.economy.gdp * 0.3 && n.relations > -20) {
    const amount = Math.round(1400 * scale);
    return {
      id,
      countryId: n.id,
      kind: 'aid-request',
      title: `${n.name} has requested emergency assistance`,
      body: `${n.name} has asked us for support following a bad year. It is not a large sum against our budget, and gratitude at this level of desperation lasts a long time.`,
      amount,
      acceptRelations: 22,
      refuseRelations: -6,
      expiresTurn,
    };
  }

  // Someone at war wants you in it.
  const theirWar = s.foreignWars.find((w) => w.aId === n.id || w.bId === n.id);
  if (theirWar && n.relations > 40) {
    const enemyId = theirWar.aId === n.id ? theirWar.bId : theirWar.aId;
    const enemy = s.nations.find((x) => x.id === enemyId);
    if (enemy) {
      return {
        id,
        countryId: n.id,
        kind: 'join-war',
        targetId: enemyId,
        title: `${n.name} asks us to enter the war against ${enemy.name}`,
        body: `${n.name} has invoked our friendship and asked us to join them against ${enemy.name}. Entering means a real war with real casualties. Refusing means they will remember that we did.`,
        acceptRelations: 32,
        refuseRelations: -18,
        expiresTurn,
      };
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Blocs, tension and sanctions                                        */
/* ------------------------------------------------------------------ */

function updateTensionAndBlocs(s: GameState): void {
  const activeWars = s.wars.filter((w) => !w.resolved).length + s.foreignWars.length;
  const sanctionCount = s.nations.filter((n) => n.sanctioned || n.sanctioningPlayer).length;
  const target = clamp(
    18 +
      activeWars * 13 +
      sanctionCount * 2.2 +
      Math.max(0, 40 - averageRelations(s)) * 0.28 +
      s.nations.filter((n) => n.agenda === 'expansion' || n.agenda === 'rearmament').length * 0.7,
    0,
    100,
  );
  s.world.tension = clamp(s.world.tension + (target - s.world.tension) * 0.06, 0, 100);

  // Nations that feel genuinely threatened start sanctioning you on their own.
  for (const n of s.nations) {
    if (n.atWarWithPlayer) {
      n.sanctioningPlayer = true;
      continue;
    }
    const shouldSanction = n.relations < -55 && n.threatPerception > 55;
    if (shouldSanction !== n.sanctioningPlayer && nextRandom(s) < 0.08) {
      n.sanctioningPlayer = shouldSanction;
    }
  }

  // Bloc alignment follows relations: a nation warm to you drifts toward yours.
  const playerBloc = naturalBloc({
    government: s.identity.government,
    region: s.identity.region,
    gdp: s.economy.gdp,
  });
  for (const n of s.nations) {
    if (n.bloc === null) n.bloc = naturalBloc(n);
    if (nextRandom(s) < 0.004) {
      if (n.relations > 65 && n.bloc !== playerBloc) n.bloc = playerBloc;
      else if (n.relations < -55 && n.bloc === playerBloc) n.bloc = naturalBloc(n);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/** Advances the whole world by one month. Called from `tick`. */
export function updateWorld(s: GameState, log: Logger): void {
  updateCycle(s, log);

  let globalGdp = s.economy.gdp;
  for (const n of s.nations) {
    developNation(s, n);
    globalGdp += n.gdp;
  }
  s.world.globalGdp = globalGdp;

  updateForeignWars(s, log);
  considerAggression(s, log);
  updateTensionAndBlocs(s);
  expireOffers(s, log);
  generateOffers(s, log);
}

/* ------------------------------------------------------------------ */
/* Offer resolution                                                    */
/* ------------------------------------------------------------------ */

export interface OfferOutcome {
  ok: boolean;
  message: string;
}

/** Accepts an outstanding proposal, paying whatever it costs. */
export function acceptOffer(s: GameState, offerId: string, log: Logger): OfferOutcome {
  const offer = s.offers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, message: 'That proposal is no longer on the table' };
  const nation = s.nations.find((n) => n.id === offer.countryId);
  if (!nation) {
    s.offers = s.offers.filter((o) => o.id !== offerId);
    return { ok: false, message: 'The other party no longer exists' };
  }

  switch (offer.kind) {
    case 'treaty': {
      if (!offer.treatyType) break;
      if (s.treaties.some((t) => t.countryId === nation.id && t.type === offer.treatyType)) {
        return { ok: false, message: 'That treaty already exists' };
      }
      const monthlyValue =
        offer.treatyType === 'trade' ? 260 : offer.treatyType === 'research' ? -90 : -150;
      s.treaties.push({
        id: `treaty-${nation.id}-${offer.treatyType}-${s.turn}`,
        type: offer.treatyType,
        countryId: nation.id,
        signedTurn: s.turn,
        monthlyValue,
      });
      break;
    }
    case 'trade': {
      if (!offer.resource || !offer.quantity || !offer.price) break;
      s.tradeAgreements.push({
        id: `trade-${nation.id}-${offer.resource}-${s.turn}`,
        countryId: nation.id,
        resource: offer.resource,
        direction: offer.direction ?? 'import',
        quantity: offer.quantity,
        lockedPrice: offer.price,
        signedTurn: s.turn,
        termMonths: offer.termMonths ?? 60,
        suspended: false,
      });
      break;
    }
    case 'aid-request':
    case 'demand':
    case 'ultimatum': {
      const amount = offer.amount ?? 0;
      if (s.economy.treasury < amount) {
        return { ok: false, message: 'The treasury cannot cover it' };
      }
      s.economy.treasury -= amount;
      if (offer.kind === 'aid-request') {
        s.society.softPower = clamp(s.society.softPower + 2, 0, 100);
      } else {
        // Paying off a demand is noticed by everyone who might try it next.
        for (const other of s.nations) {
          if (other.id === nation.id) continue;
          other.threatPerception = clamp(other.threatPerception - 4, 0, 100);
        }
        s.approval = clamp(s.approval - 4, 0, 100);
        s.governance.momentum = clamp(s.governance.momentum - 10, -100, 100);
      }
      break;
    }
    case 'join-war': {
      if (!offer.targetId) break;
      const target = s.nations.find((n) => n.id === offer.targetId);
      if (!target) break;
      if (!s.settings.enableWars) return { ok: false, message: 'Warfare is disabled in this campaign' };
      target.atWarWithPlayer = true;
      target.relations = -100;
      s.wars.push({
        id: `war-${target.id}-${s.turn}`,
        attackerId: 'player',
        defenderId: target.id,
        startTurn: s.turn,
        goal: 'defensive',
        warScore: 0,
        playerCasualties: 0,
        enemyCasualties: 0,
        monthlyCost: ((s.economy.gdp * 1000) / 12) * 0.04,
      });
      s.approval = clamp(s.approval - 5, 0, 100);
      break;
    }
  }

  nation.relations = clamp(nation.relations + offer.acceptRelations, -100, 100);
  nation.trust = clamp(nation.trust + 8, 0, 100);
  s.offers = s.offers.filter((o) => o.id !== offerId);
  log({
    text: `Accepted: ${offer.title}.`,
    category: 'diplomacy',
    tone: 'good',
    icon: '🤝',
  });
  return { ok: true, message: `Agreement reached with ${nation.name}.` };
}

/** Declines an outstanding proposal. */
export function declineOffer(s: GameState, offerId: string, log: Logger): OfferOutcome {
  const offer = s.offers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, message: 'That proposal is no longer on the table' };
  const nation = s.nations.find((n) => n.id === offer.countryId);

  if (nation) {
    nation.relations = clamp(nation.relations + offer.refuseRelations, -100, 100);
    nation.trust = clamp(nation.trust - 6, 0, 100);
    // Standing up to a shakedown is popular at home and raises the temperature.
    if (offer.kind === 'demand' || offer.kind === 'ultimatum') {
      s.approval = clamp(s.approval + 3, 0, 100);
      nation.threatPerception = clamp(nation.threatPerception + 10, 0, 100);
      s.world.tension = clamp(s.world.tension + 4, 0, 100);
    }
  }

  s.offers = s.offers.filter((o) => o.id !== offerId);
  log({
    text: `Declined: ${offer.title}.`,
    category: 'diplomacy',
    tone: 'neutral',
    icon: '✋',
  });
  return { ok: true, message: `Proposal from ${nation?.name ?? 'abroad'} declined.` };
}

/* ------------------------------------------------------------------ */
/* Intelligence                                                        */
/* ------------------------------------------------------------------ */

/**
 * What the player believes a nation's military strength to be.
 *
 * Without coverage the estimate is wrong, and it is wrong in a direction they
 * cannot predict — which is the entire argument for funding intelligence.
 */
export function estimatedStrength(s: GameState, n: ForeignNation): { value: number; confident: boolean } {
  const coverage = s.intelligence.dossiers[n.id] ?? 0;
  if (coverage >= 70) return { value: n.militaryStrength, confident: true };
  // Deterministic per nation and coverage level, so the number does not jitter
  // every render — an estimate should feel like an assessment, not noise.
  const seed = [...n.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const bias = ((seed % 21) - 10) * (1 - coverage / 70);
  return { value: clamp(n.militaryStrength + bias, 0, 100), confident: false };
}

/** Advances intelligence coverage of every nation. */
export function updateDossiers(s: GameState): void {
  for (const n of s.nations) {
    const current = s.intelligence.dossiers[n.id] ?? 0;
    const target = clamp(
      s.intelligence.capability * 0.55 +
        (n.embassy ? 18 : 0) +
        (s.intelligence.networkCountries.includes(n.id) ? 22 : 0) -
        n.stability * 0.12,
      0,
      100,
    );
    s.intelligence.dossiers[n.id] = clamp(current + (target - current) * 0.05, 0, 100);
  }
}

/** Adds treasury income from a nation, used by offer resolution and events. */
export function payFrom(s: GameState, amountMillions: number): void {
  addTreasury(s, amountMillions);
}
