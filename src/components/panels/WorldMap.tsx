import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import type { ForeignNation, GameState } from '../../game/types';
import { COUNTRY_COORDS, coordsFor, project } from '../../game/data/geography';
import { LANDMASSES } from '../../game/data/landmasses';
import { Badge } from '../ui/primitives';
import { Flag } from '../ui/Flag';

const WIDTH = 1000;
const HEIGHT = 500;

/** Projects a lat/lon pair into viewBox pixels. */
function toPoint(lat: number, lon: number): { x: number; y: number } {
  const unit = project(lat, lon);
  return { x: unit.x * WIDTH, y: unit.y * HEIGHT };
}

/** Colour ramp for a relations score, -100..100. */
export function relationsColor(relations: number): string {
  if (relations >= 60) return '#7ee787';
  if (relations >= 25) return '#a8d84f';
  if (relations >= 5) return '#3ddbd9';
  if (relations >= -20) return '#8b93a7';
  if (relations >= -50) return '#ffb648';
  return '#ff5c6c';
}

export type MapMode = 'relations' | 'trade' | 'power';

const MODE_LABEL: Record<MapMode, string> = {
  relations: 'Relations',
  trade: 'Trade volume',
  power: 'Military strength',
};

function markerColor(nation: ForeignNation, mode: MapMode, maxTrade: number): string {
  if (mode === 'relations') return relationsColor(nation.relations);
  if (mode === 'power') {
    const v = nation.militaryStrength;
    return v >= 80 ? '#ff5c6c' : v >= 55 ? '#ffb648' : v >= 30 ? '#3ddbd9' : '#8b93a7';
  }
  const share = maxTrade > 0 ? nation.tradeVolume / maxTrade : 0;
  return share >= 0.6 ? '#f5d073' : share >= 0.3 ? '#9d6bff' : share >= 0.1 ? '#4f8cff' : '#8b93a7';
}

/**
 * The world, drawn as a stylised equirectangular map.
 *
 * Continent outlines and nation markers go through the same projection, so a
 * marker always lands where it should relative to the coastline. Markers are
 * sized by economy and coloured by whichever mode is selected.
 */
export function WorldMap({
  game,
  onSelect,
  selectedId,
  mode = 'relations',
  onModeChange,
}: {
  game: GameState;
  onSelect: (id: string) => void;
  selectedId?: string | null;
  mode?: MapMode;
  onModeChange?: (mode: MapMode) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const landPaths = useMemo(
    () =>
      LANDMASSES.map((mass) => ({
        id: mass.id,
        d:
          mass.ring
            .map(([lon, lat], i) => {
              const p = toPoint(lat, lon);
              return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            })
            .join(' ') + ' Z',
      })),
    [],
  );

  const maxTrade = useMemo(
    () => game.nations.reduce((max, n) => Math.max(max, n.tradeVolume), 0),
    [game.nations],
  );

  const maxGdp = useMemo(
    () => Math.max(game.economy.gdp, ...game.nations.map((n) => n.gdp)),
    [game.nations, game.economy.gdp],
  );

  const markers = useMemo(
    () =>
      game.nations
        .filter((n) => COUNTRY_COORDS[n.id])
        .map((nation) => {
          const coords = COUNTRY_COORDS[nation.id];
          const point = toPoint(coords.lat, coords.lon);
          // Area-proportional so a 10x economy is ~3x the radius, not 10x.
          const radius = 4 + Math.sqrt(nation.gdp / maxGdp) * 13;
          return { nation, ...point, radius };
        })
        // Draw the biggest first so small markers stay clickable on top.
        .sort((a, b) => b.radius - a.radius),
    [game.nations, maxGdp],
  );

  const home = useMemo(() => {
    const coords = coordsFor(game.identity.baseCountryId, game.identity.region);
    return { ...toPoint(coords.lat, coords.lon), radius: 5 + Math.sqrt(game.economy.gdp / maxGdp) * 13 };
  }, [game.identity.baseCountryId, game.identity.region, game.economy.gdp, maxGdp]);

  const active = hovered ?? selectedId ?? null;
  const activeNation = game.nations.find((n) => n.id === active) ?? null;

  return (
    <div className="relative">
      {onModeChange && (
        <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-xl bg-ink-950/80 p-1 backdrop-blur-md">
          {(Object.keys(MODE_LABEL) as MapMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={clsx(
                'focus-ring rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition',
                mode === m ? 'bg-gold-500 text-ink-950' : 'text-slate-400 hover:text-white',
              )}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      )}

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-manipulation select-none"
        role="img"
        aria-label={`World map coloured by ${MODE_LABEL[mode].toLowerCase()}`}
      >
        <defs>
          <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a1020" />
            <stop offset="100%" stopColor="#070b16" />
          </linearGradient>
          <radialGradient id="homeGlow">
            <stop offset="0%" stopColor="#e5b447" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#e5b447" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width={WIDTH} height={HEIGHT} fill="url(#ocean)" rx={12} />

        {/* Graticule — every 30° of longitude, 20° of latitude. */}
        <g stroke="rgba(255,255,255,0.05)" strokeWidth={1}>
          {Array.from({ length: 11 }, (_, i) => -150 + i * 30).map((lon) => {
            const x = toPoint(0, lon).x;
            return <line key={`lon${lon}`} x1={x} y1={0} x2={x} y2={HEIGHT} />;
          })}
          {Array.from({ length: 7 }, (_, i) => -60 + i * 20).map((lat) => {
            const y = toPoint(lat, 0).y;
            return <line key={`lat${lat}`} x1={0} y1={y} x2={WIDTH} y2={y} />;
          })}
        </g>

        {/* Equator, marked more strongly than the rest of the grid. */}
        <line
          x1={0}
          y1={toPoint(0, 0).y}
          x2={WIDTH}
          y2={toPoint(0, 0).y}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={1}
          strokeDasharray="6 8"
        />

        {/* Landmasses. */}
        <g>
          {landPaths.map((mass) => (
            <path
              key={mass.id}
              d={mass.d}
              fill="rgba(255,255,255,0.055)"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={1}
              strokeLinejoin="round"
            />
          ))}
        </g>

        {/* Trade lanes to contracted partners. */}
        <g>
          {game.tradeAgreements
            .filter((a) => !a.suspended && COUNTRY_COORDS[a.countryId])
            .map((agreement) => {
              const coords = COUNTRY_COORDS[agreement.countryId];
              const to = toPoint(coords.lat, coords.lon);
              // Curve the lane so overlapping routes stay distinguishable.
              const midX = (home.x + to.x) / 2;
              const midY = (home.y + to.y) / 2 - Math.abs(to.x - home.x) * 0.12;
              return (
                <path
                  key={agreement.id}
                  d={`M${home.x},${home.y} Q${midX},${midY} ${to.x},${to.y}`}
                  fill="none"
                  stroke={agreement.direction === 'import' ? '#3ddbd9' : '#f5d073'}
                  strokeWidth={1.2}
                  strokeOpacity={0.42}
                  strokeDasharray="4 5"
                />
              );
            })}
        </g>

        {/* Home nation. */}
        <g>
          <circle cx={home.x} cy={home.y} r={home.radius * 3.4} fill="url(#homeGlow)" />
          <motion.circle
            cx={home.x}
            cy={home.y}
            r={home.radius}
            fill="#e5b447"
            stroke="#fff"
            strokeWidth={2}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 16 }}
            style={{ transformOrigin: `${home.x}px ${home.y}px` }}
          />
        </g>

        {/* Foreign nations. */}
        <g>
          {markers.map(({ nation, x, y, radius }) => {
            const isActive = active === nation.id;
            const color = markerColor(nation, mode, maxTrade);
            return (
              <g
                key={nation.id}
                onMouseEnter={() => setHovered(nation.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect(nation.id)}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`${nation.name}: relations ${nation.relations.toFixed(0)}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(nation.id);
                  }
                }}
              >
                {/* Generous invisible hit area — the dots are small on mobile. */}
                <circle cx={x} cy={y} r={Math.max(radius + 8, 14)} fill="transparent" />
                {nation.atWarWithPlayer && (
                  <circle cx={x} cy={y} r={radius + 5} fill="none" stroke="#ff5c6c" strokeWidth={1.5} opacity={0.8}>
                    <animate attributeName="r" values={`${radius + 4};${radius + 10};${radius + 4}`} dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={isActive ? radius + 2.5 : radius}
                  fill={color}
                  fillOpacity={nation.sanctioned ? 0.4 : 0.82}
                  stroke={isActive ? '#fff' : 'rgba(255,255,255,0.4)'}
                  strokeWidth={isActive ? 2 : 1}
                  strokeDasharray={nation.sanctioned ? '3 2' : undefined}
                  style={{ transition: 'r 0.15s ease, stroke-width 0.15s ease' }}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {/* Hover card. */}
      {activeNation && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2.5 p-2.5"
        >
          <Flag iso2={activeNation.iso2} width={80} className="h-7 w-10 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{activeNation.name}</p>
            <p className="num text-[10px] text-slate-400">
              Relations {activeNation.relations.toFixed(0)} · ${(activeNation.gdp / 1000).toFixed(2)}T
            </p>
          </div>
          {activeNation.atWarWithPlayer && <Badge tone="bad">War</Badge>}
          {activeNation.sanctioned && <Badge tone="warn">Sanctioned</Badge>}
        </motion.div>
      )}

      <MapLegend mode={mode} hasLanes={game.tradeAgreements.some((a) => !a.suspended)} />
    </div>
  );
}

function MapLegend({ mode, hasLanes }: { mode: MapMode; hasLanes: boolean }) {
  const scales: Record<MapMode, { color: string; label: string }[]> = {
    relations: [
      { color: '#7ee787', label: 'Allied' },
      { color: '#3ddbd9', label: 'Friendly' },
      { color: '#8b93a7', label: 'Neutral' },
      { color: '#ffb648', label: 'Cold' },
      { color: '#ff5c6c', label: 'Hostile' },
    ],
    trade: [
      { color: '#f5d073', label: 'Major partner' },
      { color: '#9d6bff', label: 'Significant' },
      { color: '#4f8cff', label: 'Minor' },
      { color: '#8b93a7', label: 'Negligible' },
    ],
    power: [
      { color: '#ff5c6c', label: 'Great power' },
      { color: '#ffb648', label: 'Strong' },
      { color: '#3ddbd9', label: 'Moderate' },
      { color: '#8b93a7', label: 'Limited' },
    ],
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {scales[mode].map((entry) => (
          <span key={entry.label} className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
            {entry.label}
          </span>
        ))}
      </div>
      <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
        <span className="h-2.5 w-2.5 rounded-full bg-gold-500 ring-1 ring-white" /> You
      </span>
      <span className="text-[10px] text-slate-600">Marker size = economy</span>
      {hasLanes && (
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <svg width="18" height="6" aria-hidden>
            <line x1="0" y1="3" x2="18" y2="3" stroke="#3ddbd9" strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          Trade lanes
        </span>
      )}
    </div>
  );
}
