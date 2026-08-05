import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Ban, Handshake, Ship, TrendingDown, X } from 'lucide-react';
import clsx from 'clsx';
import type { GameState, ResourceId, TradeAgreement } from '../../game/types';
import { RESOURCES, RESOURCE_INDEX } from '../../game/data/definitions';
import { REGION_LABELS } from '../../game/data/countries';
import { agreementFlow, formatMoney, tradeAgreementBalance } from '../../game/selectors';
import {
  TRADE_TERMS, availableQuantity, quotedPrice, tradeEligibility, type TradeTerm,
} from '../../game/engine/trade';
import {
  RETALIATION_THRESHOLD, TOLERATED_TARIFF, assessSettlement, averageForeignTariff,
  foreignTariffDrag, retaliatingNations, tradeExposure,
} from '../../game/engine/tradewar';
import { explainCompetitiveness, explainContext } from '../../game/engine/explain';
import { useGameStore } from '../../store/gameStore';
import {
  Badge, Button, Card, EmptyState, Meter, Modal, Reveal, Slider, Stat, Tabs, Tooltip, meterColor,
} from '../ui/primitives';
import { Flag } from '../ui/Flag';

export function TradePanel({ game }: { game: GameState }) {
  const [tab, setTab] = useState<'balance' | 'agreements' | 'partners' | 'disputes'>('balance');
  const [negotiating, setNegotiating] = useState<{ resource: ResourceId; direction: 'import' | 'export' } | null>(null);
  const symbol = game.identity.currency.symbol;

  const contracted = useMemo(() => tradeAgreementBalance(game), [game]);
  const live = game.tradeAgreements.filter((a) => !a.suspended).length;
  const suspended = game.tradeAgreements.filter((a) => a.suspended).length;
  const retaliators = useMemo(() => retaliatingNations(game), [game]);
  const foreignTariff = useMemo(() => averageForeignTariff(game), [game]);

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Agreements" value={game.tradeAgreements.length} hint={`${live} active`} accent="#3ddbd9" icon={<Handshake size={14} />} />
          <Stat
            label="Contracted flow"
            value={formatMoney(contracted, symbol)}
            hint="Per month, at locked prices"
            accent={contracted >= 0 ? '#7ee787' : '#ff5c6c'}
          />
          <Stat label="Suspended" value={suspended} hint={suspended > 0 ? 'War or sanctions' : 'None'} accent="#ffb648" />
          <Stat
            label="Tariffs against us"
            value={`${foreignTariff.toFixed(1)}%`}
            hint={retaliators.length > 0 ? `${retaliators.length} nation${retaliators.length === 1 ? '' : 's'} retaliating` : 'Nobody is retaliating'}
            accent={foreignTariff > 1 ? '#ff5c6c' : '#7ee787'}
          />
          <Stat label="Trade balance" value={formatMoney(game.economy.tradeBalance, symbol)} accent="#f5d073" />
        </div>
      </Reveal>

      {retaliators.length > 0 && (
        <Reveal delay={0.02}>
          <div className="rounded-xl border border-aurora-red/30 bg-aurora-red/[0.07] p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-aurora-red">
              <TrendingDown size={13} /> Trade war — {retaliators.length} nation
              {retaliators.length === 1 ? '' : 's'} tariffing our exports
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
              Our own rate is {game.taxes.tariff.toFixed(0)}%. The answer is an average {foreignTariff.toFixed(1)}% wall
              on the way out, which cuts our export competitiveness by{' '}
              <span className="num font-semibold text-aurora-red">
                {((1 - foreignTariffDrag(game)) * 100).toFixed(1)}%
              </span>{' '}
              and reduces the volume we do with the partners imposing it. Open the{' '}
              <span className="font-semibold text-white">Disputes</span> tab to see who and why.
            </p>
          </div>
        </Reveal>
      )}

      {suspended > 0 && (
        <Reveal delay={0.02}>
          <div className="rounded-xl border border-aurora-amber/30 bg-aurora-amber/[0.07] p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-aurora-amber">
              <Ban size={13} /> {suspended} agreement{suspended === 1 ? '' : 's'} suspended
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
              Deliveries have stopped because you are at war with or sanctioning the counterparty. The contracts
              are still live and will resume if relations recover before their term expires.
            </p>
          </div>
        </Reveal>
      )}

      <Reveal delay={0.04}>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'balance' as const, label: 'Commodity balance', count: RESOURCES.length },
            { id: 'agreements' as const, label: 'Agreements', count: game.tradeAgreements.length },
            { id: 'disputes' as const, label: 'Disputes', count: retaliators.length },
            { id: 'partners' as const, label: 'Partners', count: game.nations.length },
          ]}
        />
      </Reveal>

      {tab === 'balance' && <BalanceTab game={game} onNegotiate={setNegotiating} />}
      {tab === 'agreements' && <AgreementsTab game={game} />}
      {tab === 'disputes' && <DisputesTab game={game} />}
      {tab === 'partners' && <PartnersTab game={game} />}

      {negotiating && (
        <NegotiationModal
          game={game}
          resource={negotiating.resource}
          direction={negotiating.direction}
          onClose={() => setNegotiating(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Disputes                                                            */
/* ------------------------------------------------------------------ */

/**
 * Who is angry about our trade policy, how angry, and what can be done.
 *
 * The point of the tab is that the tariff slider is not a free revenue dial.
 * Every nation carries a grievance built from our rate weighted by how exposed
 * their exporters are to us, and past a threshold they answer in kind. There
 * are exactly two ways out and both are shown: cut the rate, which bleeds the
 * grievance away over a year or two, or buy a settlement, which lifts their
 * tariff at once and does nothing about the cause.
 */
function DisputesTab({ game }: { game: GameState }) {
  const { settleTrade, setTax } = useGameStore();
  const ctx = useMemo(() => explainContext(game), [game]);
  const competitiveness = useMemo(() => explainCompetitiveness(game, ctx), [game, ctx]);

  const ranked = useMemo(
    () =>
      [...game.nations]
        .filter((n) => (n.tradeGrievance ?? 0) > 6 || (n.tariffOnPlayer ?? 0) > 0)
        .sort(
          (a, b) =>
            (b.tariffOnPlayer ?? 0) * 100 + (b.tradeGrievance ?? 0) -
            ((a.tariffOnPlayer ?? 0) * 100 + (a.tradeGrievance ?? 0)),
        ),
    [game.nations],
  );

  return (
    <div className="space-y-4">
      <Card title="Export competitiveness" subtitle="Every factor, multiplied" icon="⚖️">
        <ul className="space-y-2">
          {competitiveness.map((t) => (
            <li key={t.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-xs text-slate-300">{t.label}</span>
                <span
                  className={clsx(
                    'num shrink-0 text-xs font-semibold',
                    t.value >= 1 ? 'text-aurora-lime' : 'text-aurora-red',
                  )}
                >
                  ×{t.value.toFixed(3)}
                </span>
              </div>
              {t.hint && <p className="mt-0.5 text-[10.5px] leading-relaxed text-slate-500">{t.hint}</p>}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-baseline justify-between border-t border-white/10 pt-2">
          <span className="text-xs font-semibold text-white">Product</span>
          <span className="num text-xs font-bold text-white">
            ×{competitiveness.reduce((acc, t) => acc * t.value, 1).toFixed(3)}
          </span>
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">
          Anything above 1.00 is a trade surplus and anything below it a deficit, scaled by total volume. Your own
          tariff appears twice: once directly, because it raises input costs for your exporters, and once through
          whatever it provokes.
        </p>

        {game.taxes.tariff > TOLERATED_TARIFF && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2.5">
            <span className="flex-1 text-[11px] leading-relaxed text-slate-400">
              Our tariff is <span className="num font-semibold text-white">{game.taxes.tariff.toFixed(0)}%</span>.
              Anything above {TOLERATED_TARIFF}% builds a grievance abroad.
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setTax('tariff', Math.max(0, game.taxes.tariff - 5))}
            >
              Cut to {Math.max(0, game.taxes.tariff - 5).toFixed(0)}%
            </Button>
          </div>
        )}
      </Card>

      {ranked.length === 0 ? (
        <EmptyState
          icon="🕊️"
          title="No trade disputes"
          body={`Nobody has a standing grievance about our trade policy. A tariff above ${TOLERATED_TARIFF}% starts building one, faster with the partners whose exporters depend on us most.`}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {ranked.map((nation) => {
            const settlement = assessSettlement(game, nation.id);
            const exposure = tradeExposure(nation) * 100;
            const retaliating = (nation.tariffOnPlayer ?? 0) > 0.5;
            return (
              <Card
                key={nation.id}
                className={retaliating ? 'border-aurora-red/30' : undefined}
                title={
                  <span className="flex items-center gap-2">
                    <Flag iso2={nation.iso2} width={40} className="h-4 w-6 shrink-0" />
                    {nation.name}
                  </span>
                }
                subtitle={REGION_LABELS[nation.region]}
                action={
                  retaliating ? (
                    <Badge tone="bad">{nation.tariffOnPlayer.toFixed(0)}% tariff</Badge>
                  ) : (
                    <Badge tone="warn">Building</Badge>
                  )
                }
              >
                <div className="space-y-2.5">
                  <div>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-[11px] text-slate-400">Grievance</span>
                      <span
                        className="num text-[11px] font-semibold"
                        style={{ color: meterColor(nation.tradeGrievance, true) }}
                      >
                        {nation.tradeGrievance.toFixed(0)} / {RETALIATION_THRESHOLD} to retaliate
                      </span>
                    </div>
                    <div className="relative">
                      <Meter value={nation.tradeGrievance} inverted height={4} />
                      <span
                        className="absolute inset-y-0 w-px bg-white/50"
                        style={{ left: `${RETALIATION_THRESHOLD}%` }}
                        aria-hidden
                      />
                    </div>
                  </div>

                  <p className="text-[10.5px] leading-relaxed text-slate-500">
                    Their exporters are <span className="num font-semibold text-slate-300">{exposure.toFixed(0)}%</span>{' '}
                    dependent on us, and they are{' '}
                    <span className="font-semibold text-slate-300">{nation.personality}</span> — which is why they react
                    the way they do.
                    {nation.sanctioned && ' Our sanctions on them are the largest single term here.'}
                  </p>

                  <Tooltip
                    label={
                      settlement.enabled
                        ? 'A settlement lifts their tariff at once and clears most of the grievance. It does nothing about the rate that caused it.'
                        : settlement.reason ?? ''
                    }
                  >
                    <Button
                      size="sm"
                      full
                      variant={settlement.enabled ? 'primary' : 'secondary'}
                      disabled={!settlement.enabled}
                      onClick={() => settleTrade(nation.id)}
                    >
                      {settlement.enabled ? `Settle for ${settlement.cost} capital` : settlement.reason}
                    </Button>
                  </Tooltip>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Commodity balance                                                   */
/* ------------------------------------------------------------------ */

function BalanceTab({
  game,
  onNegotiate,
}: {
  game: GameState;
  onNegotiate: (target: { resource: ResourceId; direction: 'import' | 'export' }) => void;
}) {
  const rows = useMemo(
    () =>
      RESOURCES.map((def) => {
        const holding = game.resources[def.id];
        const contracted = agreementFlow(game, def.id);
        const effective = holding.production + contracted;
        const residual = effective - holding.consumption;
        return { def, holding, contracted, effective, residual, price: game.worldPrices[def.id] };
      }).sort((a, b) => a.residual - b.residual),
    [game],
  );

  return (
    <Reveal delay={0.06}>
      <Card
        title="Commodity balance"
        subtitle="Domestic production, contracted flow, and what is left to clear at world prices"
        icon="⚖️"
      >
        <div className="space-y-2">
          {rows.map(({ def, holding, contracted, residual, price }) => {
            const short = residual < 0;
            return (
              <div key={def.id} className="rounded-xl border border-white/[0.07] p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg">{def.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-xs font-semibold text-white">{def.name}</span>
                      <span className="num text-[10px] text-slate-500">spot ×{price.toFixed(2)}</span>
                      {contracted !== 0 && (
                        <Badge tone={contracted > 0 ? 'info' : 'gold'}>
                          {contracted > 0 ? '+' : ''}
                          {contracted.toFixed(1)} contracted
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-2 text-[10px] text-slate-500">
                      <span>Produce <span className="num text-slate-300">{holding.production.toFixed(1)}</span></span>
                      <span>Consume <span className="num text-slate-300">{holding.consumption.toFixed(1)}</span></span>
                      <span>
                        Balance{' '}
                        <span className={clsx('num font-semibold', short ? 'text-aurora-red' : 'text-aurora-lime')}>
                          {residual >= 0 ? '+' : ''}
                          {residual.toFixed(1)}
                        </span>
                      </span>
                    </div>
                    <Meter value={holding.reserves} height={2} className="mt-2" />
                    <p className="mt-1 text-[10px] text-slate-600">
                      Reserves {holding.reserves.toFixed(0)}/100
                      {holding.reserves <= 0 && ' — depleted, production has stopped'}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1.5">
                    <Tooltip label={`Contract to buy ${def.name} from a producer`}>
                      <Button
                        size="sm"
                        variant={short ? 'primary' : 'secondary'}
                        icon={<ArrowDownLeft size={12} />}
                        onClick={() => onNegotiate({ resource: def.id, direction: 'import' })}
                      >
                        Import
                      </Button>
                    </Tooltip>
                    <Tooltip label={`Contract to sell surplus ${def.name}`}>
                      <Button
                        size="sm"
                        variant={residual > 1 ? 'primary' : 'secondary'}
                        icon={<ArrowUpRight size={12} />}
                        disabled={residual <= 0}
                        onClick={() => onNegotiate({ resource: def.id, direction: 'export' })}
                      >
                        Export
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
          Anything not under contract clears automatically at the world price, which drifts every month. An
          agreement locks a price for its whole term — protection when the market spikes, a cost when it falls.
        </p>
      </Card>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ */
/* Agreements                                                          */
/* ------------------------------------------------------------------ */

function AgreementsTab({ game }: { game: GameState }) {
  const cancelTradeAgreement = useGameStore((s) => s.cancelTradeAgreement);
  const [confirm, setConfirm] = useState<TradeAgreement | null>(null);
  const symbol = game.identity.currency.symbol;

  if (game.tradeAgreements.length === 0) {
    return (
      <EmptyState
        icon="🚢"
        title="No standing agreements"
        body="Open the commodity balance and contract with a producer. Agreements lock a price for their term and turn a shortage into a relationship."
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {game.tradeAgreements.map((agreement, i) => {
          const nation = game.nations.find((n) => n.id === agreement.countryId);
          const def = RESOURCE_INDEX[agreement.resource];
          const elapsed = game.turn - agreement.signedTurn;
          const remaining = Math.max(0, agreement.termMonths - elapsed);
          const value = agreement.quantity * agreement.lockedPrice * 0.85;
          const spot = game.worldPrices[agreement.resource] ?? 1;
          // Whether the lock is currently working for or against you.
          const advantage =
            agreement.direction === 'import'
              ? (spot - agreement.lockedPrice) / spot
              : (agreement.lockedPrice - spot) / spot;

          return (
            <Reveal key={agreement.id} delay={Math.min(0.3, i * 0.03)}>
              <Card
                className={clsx('h-full', agreement.suspended && 'border-aurora-amber/35 opacity-80')}
                title={`${def.name} — ${agreement.direction}`}
                icon={def.icon}
                subtitle={nation?.name ?? agreement.countryId}
                action={
                  agreement.suspended ? (
                    <Badge tone="warn">Suspended</Badge>
                  ) : (
                    <Badge tone={agreement.direction === 'export' ? 'good' : 'info'}>
                      {agreement.direction === 'export' ? <ArrowUpRight size={9} /> : <ArrowDownLeft size={9} />}
                    </Badge>
                  )
                }
              >
                <dl className="space-y-1.5 text-[11px]">
                  <Row label="Quantity" value={`${agreement.quantity.toFixed(1)} units / month`} />
                  <Row label="Locked price" value={`×${agreement.lockedPrice.toFixed(2)}`} />
                  <Row label="Spot price now" value={`×${spot.toFixed(2)}`} />
                  <Row
                    label={agreement.direction === 'export' ? 'Revenue' : 'Cost'}
                    value={`${formatMoney(value, symbol)} / month`}
                  />
                  <Row label="Term remaining" value={`${remaining} of ${agreement.termMonths} months`} />
                </dl>

                <Meter
                  value={agreement.termMonths - remaining}
                  max={agreement.termMonths}
                  height={3}
                  className="mt-2.5"
                  color="#3ddbd9"
                />

                <p
                  className={clsx(
                    'mt-2 text-[11px]',
                    advantage > 0.03 ? 'text-aurora-lime' : advantage < -0.03 ? 'text-aurora-amber' : 'text-slate-500',
                  )}
                >
                  {advantage > 0.03
                    ? `The lock is saving you ${(advantage * 100).toFixed(0)}% against spot.`
                    : advantage < -0.03
                      ? `The lock is costing you ${(Math.abs(advantage) * 100).toFixed(0)}% against spot.`
                      : 'Roughly in line with the spot market.'}
                </p>

                <Button size="sm" variant="ghost" full className="mt-3" icon={<X size={12} />} onClick={() => setConfirm(agreement)}>
                  Terminate
                </Button>
              </Card>
            </Reveal>
          );
        })}
      </div>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        size="sm"
        title="Break this agreement?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>Keep it</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm) cancelTradeAgreement(confirm.id);
                setConfirm(null);
              }}
            >
              Terminate
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-slate-300">
          Walking away from a signed contract costs you 12 points of relations and 15 of trust with{' '}
          {game.nations.find((n) => n.id === confirm?.countryId)?.name ?? 'the counterparty'}. They will remember it
          the next time you want something.
        </p>
      </Modal>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="num text-slate-200">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Partners                                                            */
/* ------------------------------------------------------------------ */

function PartnersTab({ game }: { game: GameState }) {
  const partners = useMemo(
    () =>
      [...game.nations]
        .map((nation) => ({
          nation,
          agreements: game.tradeAgreements.filter((a) => a.countryId === nation.id).length,
          exports: RESOURCES.filter((r) => (nation.resources[r.id] ?? 0) >= 55),
        }))
        .sort((a, b) => b.agreements - a.agreements || b.nation.relations - a.nation.relations),
    [game],
  );

  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {partners.map(({ nation, agreements, exports }, i) => (
        <Reveal key={nation.id} delay={Math.min(0.25, i * 0.012)}>
          <div
            className={clsx(
              'glass flex h-full items-start gap-3 p-3',
              (nation.atWarWithPlayer || nation.sanctioned) && 'opacity-60',
            )}
          >
            <Flag iso2={nation.iso2} width={80} className="h-8 w-11 shrink-0" title={nation.name} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-xs font-semibold text-white">{nation.name}</p>
                {agreements > 0 && <Badge tone="info">{agreements}</Badge>}
                {nation.atWarWithPlayer && <Badge tone="bad">War</Badge>}
                {nation.sanctioned && <Badge tone="warn">Sanctioned</Badge>}
              </div>
              <p className="truncate text-[10px] text-slate-500">{REGION_LABELS[nation.region]}</p>

              {exports.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {exports.slice(0, 6).map((r) => (
                    <Tooltip key={r.id} label={`${r.name} — endowment ${nation.resources[r.id]}/100`}>
                      <span className="rounded bg-white/[0.06] px-1 py-0.5 text-[11px]">{r.icon}</span>
                    </Tooltip>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 text-[10px] text-slate-600">No significant commodity exports</p>
              )}

              <div className="mt-1.5 flex items-center gap-2">
                <Meter value={nation.relations + 100} max={200} height={2} className="flex-1" />
                <span className="num shrink-0 text-[10px]" style={{ color: meterColor((nation.relations + 100) / 2) }}>
                  {nation.relations.toFixed(0)}
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Negotiation                                                         */
/* ------------------------------------------------------------------ */

function NegotiationModal({
  game, resource, direction, onClose,
}: {
  game: GameState;
  resource: ResourceId;
  direction: 'import' | 'export';
  onClose: () => void;
}) {
  const propose = useGameStore((s) => s.proposeTradeAgreement);
  const def = RESOURCE_INDEX[resource];
  const symbol = game.identity.currency.symbol;

  const [partnerId, setPartnerId] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [term, setTerm] = useState<TradeTerm>(60);

  // Rank partners by how much they can actually offer on this commodity.
  const candidates = useMemo(
    () =>
      game.nations
        .map((nation) => ({
          nation,
          available: availableQuantity(game, nation, resource, direction),
          eligible: tradeEligibility(game, nation, resource, direction, 0.1).ok,
        }))
        .filter((c) => c.available > 0.05)
        .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.available - a.available),
    [game, resource, direction],
  );

  const selected = candidates.find((c) => c.nation.id === partnerId) ?? candidates[0];
  const maxQuantity = selected ? Math.max(0.1, selected.available) : 1;
  const clampedQuantity = Math.min(quantity, maxQuantity);

  const price = selected ? quotedPrice(game, selected.nation, resource, direction, term) : 0;
  const monthly = clampedQuantity * price * 0.85;
  const eligibility = selected
    ? tradeEligibility(game, selected.nation, resource, direction, clampedQuantity)
    : { ok: false, reason: 'No partner available' };

  const spot = game.worldPrices[resource] ?? 1;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <span className="text-xl">{def.icon}</span>
          {direction === 'import' ? `Buy ${def.name}` : `Sell ${def.name}`}
        </span>
      }
      subtitle={`Spot price ×${spot.toFixed(2)} · ${def.description}`}
    >
      {candidates.length === 0 ? (
        <EmptyState
          icon="🤷"
          title={direction === 'import' ? 'Nobody has any to spare' : 'Nobody wants to buy it'}
          body={
            direction === 'import'
              ? 'No simulated nation has a meaningful surplus of this commodity that is not already committed.'
              : 'No simulated nation has appetite for this commodity that is not already committed.'
          }
        />
      ) : (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {direction === 'import' ? 'Choose a supplier' : 'Choose a buyer'}
            </p>
            <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {candidates.map(({ nation, available, eligible }) => (
                <button
                  key={nation.id}
                  onClick={() => setPartnerId(nation.id)}
                  disabled={!eligible}
                  className={clsx(
                    'focus-ring flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left transition',
                    selected?.nation.id === nation.id
                      ? 'border-gold-500/55 bg-gold-500/[0.08]'
                      : 'border-white/10 hover:border-white/25',
                    !eligible && 'pointer-events-none opacity-45',
                  )}
                >
                  <Flag iso2={nation.iso2} width={40} className="h-6 w-8 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-white">{nation.name}</span>
                    <span className="num block text-[10px] text-slate-500">
                      up to {available.toFixed(1)} units · relations {nation.relations.toFixed(0)}
                    </span>
                  </span>
                  {!eligible && <Badge tone="bad">Blocked</Badge>}
                </button>
              ))}
            </div>
          </div>

          {selected && (
            <>
              <Slider
                label="Quantity"
                value={clampedQuantity}
                min={0.1}
                max={Math.round(maxQuantity * 10) / 10}
                step={0.1}
                onChange={setQuantity}
                format={(v) => `${v.toFixed(1)} units / month`}
                hint={`${selected.nation.name} can commit up to ${maxQuantity.toFixed(1)} units.`}
              />

              <div>
                <p className="mb-2 text-xs font-medium text-slate-300">Contract length</p>
                <div className="grid grid-cols-3 gap-2">
                  {TRADE_TERMS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTerm(t)}
                      className={clsx(
                        'focus-ring rounded-xl border p-2.5 text-center transition',
                        term === t ? 'border-gold-500/55 bg-gold-500/[0.08]' : 'border-white/10 hover:border-white/25',
                      )}
                    >
                      <span className="block text-xs font-semibold text-white">{t / 12} years</span>
                      <span className="block text-[10px] text-slate-500">
                        ×{quotedPrice(game, selected.nation, resource, direction, t).toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  A longer lock costs a worse price. That premium is what the certainty is worth.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <dl className="space-y-1.5 text-[11px]">
                  <Row label="Locked price" value={`×${price.toFixed(2)} (spot ×${spot.toFixed(2)})`} />
                  <Row
                    label={direction === 'export' ? 'Monthly revenue' : 'Monthly cost'}
                    value={formatMoney(monthly, symbol)}
                  />
                  <Row label="Over the full term" value={formatMoney(monthly * term, symbol)} />
                </dl>
              </div>

              <Button
                variant="primary"
                full
                icon={<Ship size={15} />}
                disabled={!eligibility.ok}
                onClick={() => {
                  const result = propose(selected.nation.id, resource, direction, clampedQuantity, term);
                  if (result.ok) onClose();
                }}
              >
                {eligibility.ok
                  ? `Propose to ${selected.nation.name}`
                  : eligibility.reason ?? 'Cannot propose'}
              </Button>

              <p className="text-center text-[11px] text-slate-500">
                They may decline. Warmer relations and higher trust make acceptance more likely.
              </p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
