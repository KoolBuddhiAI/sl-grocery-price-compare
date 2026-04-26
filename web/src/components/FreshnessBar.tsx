import { useEffect, useState } from 'react';
import type { HealthResponse, Store } from '../lib/api';
import { fetchHealth, getStoresForCategory } from '../lib/api';
import {
  formatAsiaColomboTimestamp,
  getAsiaColomboTimeZoneLabel,
  getAsiaColomboTimeZoneTooltip,
} from '../lib/time';

const storeColors: Record<Store, string> = {
  keells: 'text-green-600 dark:text-green-400',
  glomark: 'text-blue-600 dark:text-blue-400',
  cargills: 'text-orange-600 dark:text-orange-400',
};

const storeLabels: Record<Store, string> = {
  keells: 'Keells',
  glomark: 'Glomark',
  cargills: 'Cargills',
};

function timeAgo(dateStr: string | null): { text: string; stale: boolean } {
  if (!dateStr) return { text: 'No data', stale: true };
  const capturedAt = new Date(dateStr).getTime();
  if (Number.isNaN(capturedAt)) return { text: 'Invalid timestamp', stale: true };

  const diff = Date.now() - capturedAt;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const stale = hours >= 24;
  let text: string;
  if (days > 0) text = `${days}d ${hours % 24}h ago`;
  else if (hours > 0) text = `${hours}h ago`;
  else {
    const mins = Math.floor(diff / (1000 * 60));
    text = `${mins}m ago`;
  }
  return { text, stale };
}

type Props = {
  category?: string;
};

export default function FreshnessBar({ category = 'meat' }: Props) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState(false);
  const timeZoneLabel = getAsiaColomboTimeZoneLabel();
  const timeZoneTooltip = getAsiaColomboTimeZoneTooltip();

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 text-sm text-red-700 dark:text-red-300">
        Unable to connect to API
      </div>
    );
  }

  if (!health) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-2 text-sm text-gray-500 dark:text-gray-400 animate-pulse">
        Loading store data...
      </div>
    );
  }

  const categoryStores = getStoresForCategory(health, category);
  const stores = Object.entries(categoryStores) as [Store, typeof categoryStores[string]][];

  // Only show stores that have data for this category
  const activeStores = stores.filter(([, meta]) => meta.count > 0 || meta.source_status === 'ok');

  if (activeStores.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
        No store data available for this category yet.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {activeStores.map(([store, meta]) => {
        const { text: agoText, stale } = timeAgo(meta.captured_at);
        const exactTime = formatAsiaColomboTimestamp(meta.captured_at);
        const exactTimeDisplay = meta.captured_at ? `${exactTime} ${timeZoneLabel}` : exactTime;
        return (
          <div
            key={store}
            className={`min-w-0 rounded-lg px-3 py-2 text-sm ${
              stale
                ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                : 'bg-gray-50 dark:bg-gray-800'
            }`}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`font-medium ${storeColors[store]}`}>{storeLabels[store]}</span>
              <span className="text-gray-500 dark:text-gray-400">
                {meta.count} items
              </span>
              <span className="text-gray-400 dark:text-gray-500">•</span>
              <span className={stale ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}>
                Updated {agoText}
              </span>
            </div>
            <div
              className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400"
              title={`${exactTime} ${timeZoneTooltip} (${timeZoneLabel})`}
            >
              {exactTimeDisplay}
            </div>
          </div>
        );
      })}
    </div>
  );
}
