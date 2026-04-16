import { useEffect, useState } from 'react';
import type { HealthResponse, Store } from '../lib/api';
import { fetchHealth } from '../lib/api';

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
  const diff = Date.now() - new Date(dateStr).getTime();
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

export default function FreshnessBar() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState(false);

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

  const stores = Object.entries(health.stores) as [Store, HealthResponse['stores'][string]][];

  return (
    <div className="flex flex-wrap gap-3">
      {stores.map(([store, meta]) => {
        const { text: agoText, stale } = timeAgo(meta.captured_at);
        return (
          <div
            key={store}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              stale
                ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                : 'bg-gray-50 dark:bg-gray-800'
            }`}
          >
            <span className={`font-medium ${storeColors[store]}`}>{storeLabels[store]}</span>
            <span className="text-gray-500 dark:text-gray-400">
              {meta.count} items
            </span>
            <span className="text-gray-400 dark:text-gray-500">|</span>
            <span className={stale ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-500 dark:text-gray-400'}>
              Updated {agoText}
            </span>
          </div>
        );
      })}
    </div>
  );
}
