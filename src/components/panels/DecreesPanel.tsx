import { useMemo, useState } from 'react';
import { AlertTriangle, Clock, Gavel, Zap } from 'lucide-react';
import clsx from 'clsx';
import type { GameState } from '../../game/types';
import {
  DECREES, DECREE_CATEGORIES, DECREE_CATEGORY_LABELS, decreeCooldownRemaining,
} from '../../game/data/decrees';
import { formatMoney } from '../../game/selectors';
import { decreeAvailability } from '../../game/engine/actions';
import { useGameStore } from '../../store/gameStore';
import { Badge, Button, Card, EmptyState, Meter, Reveal, Stat, Tabs } from '../ui/primitives';
import { ModifierList } from './ModifierList';
import { EffectChips } from './EffectChips';

export function DecreesPanel({ game }: { game: GameState }) {
  const enactDecree = useGameStore((s) => s.enactDecree);
  const [category, setCategory] = useState<(typeof DECREE_CATEGORIES)[number] | 'all'>('all');
  const symbol = game.identity.currency.symbol;

  const rows = useMemo(
    () =>
      DECREES.map((decree) => ({
        decree,
        availability: decreeAvailability(game, decree.id),
        cooldown: decreeCooldownRemaining(game, decree),
      })),
    [game],
  );

  const ready = rows.filter((r) => r.availability.enabled).length;
  const onCooldown = rows.filter((r) => r.cooldown > 0).length;

  const visible = rows.filter((r) => category === 'all' || r.decree.category === category);

  return (
    <div className="space-y-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Actions available" value={`${ready} / ${DECREES.length}`} accent="#f5d073" icon={<Gavel size={14} />} />
          <Stat label="On cooldown" value={onCooldown} accent="#4f8cff" icon={<Clock size={14} />} />
          <Stat label="Treasury" value={formatMoney(game.economy.treasury, symbol)} accent="#7ee787" />
          <Stat label="Political capital" value={`${game.approval.toFixed(0)}%`} hint="Approval rating" accent="#9d6bff" />
        </div>
      </Reveal>

      <Reveal delay={0.03}>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-white">
            <Zap size={13} className="text-gold-400" /> Executive authority
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
            These are the levers you can pull directly, without waiting for a budget cycle or an election. Every
            one has a real cost — money, approval, civil liberties or credibility — and a cooldown, so none of
            them can be leaned on indefinitely.
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.06}>
        <Tabs
          value={category}
          onChange={setCategory}
          tabs={[
            { id: 'all' as const, label: 'All', count: DECREES.length },
            ...DECREE_CATEGORIES.map((c) => ({
              id: c,
              label: DECREE_CATEGORY_LABELS[c],
              count: DECREES.filter((d) => d.category === c).length,
            })),
          ]}
        />
      </Reveal>

      {visible.length === 0 ? (
        <EmptyState icon="⚖️" title="Nothing here" body="No executive action in this category." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ decree, availability, cooldown }, i) => (
            <Reveal key={decree.id} delay={Math.min(0.3, i * 0.02)}>
              <Card
                className={clsx('flex h-full flex-col', cooldown > 0 && 'opacity-70')}
                title={decree.name}
                icon={decree.icon}
                subtitle={DECREE_CATEGORY_LABELS[decree.category]}
                action={
                  cooldown > 0 ? (
                    <Badge tone="neutral"><Clock size={9} /> {cooldown}mo</Badge>
                  ) : availability.enabled ? (
                    <Badge tone="good">Ready</Badge>
                  ) : null
                }
              >
                <div className="flex flex-1 flex-col">
                  <p className="text-xs leading-relaxed text-slate-400">{decree.description}</p>

                  <EffectChips effects={decree.effects} className="mt-3" />

                  {decree.temporary && (
                    <div className="mt-2">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">
                        {decree.temporary.label} ·{' '}
                        {decree.temporary.months > 900 ? 'permanent' : `${decree.temporary.months} months`}
                      </p>
                      <ModifierList modifiers={decree.temporary.modifiers} className="mt-1" limit={4} />
                    </div>
                  )}

                  {decree.caution && (
                    <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-aurora-amber">
                      <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                      {decree.caution}
                    </p>
                  )}

                  <div className="mt-3 flex items-baseline justify-between text-[11px]">
                    <span className="text-slate-500">Cost</span>
                    <span className="num text-slate-300">
                      {availability.cost > 0 ? formatMoney(availability.cost, symbol) : 'None'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between text-[11px]">
                    <span className="text-slate-500">Cooldown</span>
                    <span className="num text-slate-300">{decree.cooldown} months</span>
                  </div>

                  {cooldown > 0 && (
                    <Meter
                      value={decree.cooldown - cooldown}
                      max={decree.cooldown}
                      height={3}
                      className="mt-2"
                      color="#4f8cff"
                    />
                  )}

                  <div className="mt-auto pt-4">
                    <Button
                      size="sm"
                      full
                      variant={availability.enabled ? 'primary' : 'secondary'}
                      disabled={!availability.enabled}
                      icon={<Gavel size={13} />}
                      onClick={() => enactDecree(decree.id)}
                    >
                      {availability.enabled ? 'Enact' : availability.reason}
                    </Button>
                  </div>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
