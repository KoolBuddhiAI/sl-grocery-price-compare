import React from 'react';

export type ComparisonPoint = {
  date: string; // ISO yyyy-mm-dd
  displayed: number | null;
  perKg: number | null;
};

type Props =
  | { mode: 'pair'; before: ComparisonPoint; after: ComparisonPoint }
  | { mode: 'single'; point: ComparisonPoint };

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-LK', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function formatPrice(price: number | null): string {
  if (price === null) return '--';
  return price.toLocaleString('en-LK', { maximumFractionDigits: 0 });
}

function pctChange(prev: number | null, curr: number | null): number | null {
  if (prev === null || curr === null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function directionOf(prev: number | null, curr: number | null): 'up' | 'down' | 'same' | null {
  if (prev === null || curr === null) return null;
  if (curr > prev) return 'up';
  if (curr < prev) return 'down';
  return 'same';
}

function DirectionPill({ direction, pct }: { direction: 'up' | 'down' | 'same' | null; pct: number | null }) {
  if (direction === null) return null;
  if (direction === 'same') {
    return (
      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
        no change
      </span>
    );
  }
  const arrow = direction === 'down' ? '\u25BC' : '\u25B2';
  const colorClass = direction === 'down'
    ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
    : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400';
  const sign = pct !== null && pct > 0 ? '+' : '';
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${colorClass}`}>
      {arrow} {pct !== null ? `${sign}${pct.toFixed(1)}%` : ''}
    </span>
  );
}

export default function PriceComparisonCard(props: Props) {
  if (props.mode === 'single') {
    const { point } = props;
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 p-4 my-2">
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">First recorded</div>
        <div className="text-sm font-medium text-gray-900 dark:text-white">
          {formatDate(point.date)}: Rs {formatPrice(point.displayed)}
          {point.perKg !== null && (
            <span className="text-gray-500 dark:text-gray-400 ml-2 text-xs">(Rs {formatPrice(point.perKg)}/kg)</span>
          )}
        </div>
      </div>
    );
  }

  const { before, after } = props;
  const displayedDir = directionOf(before.displayed, after.displayed);
  const perKgDir = directionOf(before.perKg, after.perKg);
  const displayedPct = pctChange(before.displayed, after.displayed);
  const perKgPct = pctChange(before.perKg, after.perKg);
  const hasPerKg = before.perKg !== null || after.perKg !== null;
  // If displayed changed but per-kg didn't, pack size likely changed
  const packSizeChanged = displayedDir !== null && displayedDir !== 'same' && perKgDir === 'same';

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 p-4 my-2">
      <div className="flex items-center gap-3">
        {/* Before */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{formatDate(before.date)}</div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            Rs {formatPrice(before.displayed)}
          </div>
          {hasPerKg && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Rs {formatPrice(before.perKg)}/kg
            </div>
          )}
        </div>

        {/* Arrow */}
        <div className="text-gray-400 dark:text-gray-500 text-lg">&rarr;</div>

        {/* After */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{formatDate(after.date)}</div>
          <div className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <span>Rs {formatPrice(after.displayed)}</span>
            <DirectionPill direction={displayedDir} pct={displayedPct} />
          </div>
          {hasPerKg && (
            <div
              className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-2"
              title={packSizeChanged ? 'Pack size changed — per-kg unchanged' : undefined}
            >
              <span>Rs {formatPrice(after.perKg)}/kg</span>
              <DirectionPill direction={perKgDir} pct={perKgPct} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
