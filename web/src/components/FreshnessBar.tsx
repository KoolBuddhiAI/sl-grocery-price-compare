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

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'No data';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h ago`;
  if (hours > 0) return `${hours}h ago`;
  const mins = Math.floor(diff / (1000 * 60));
  return `${mins}m ago`;
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
      {stores.map(([store, meta]) => (
        <div
          key={store}
          className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-sm"
        >
          <span className={`font-medium ${storeColors[store]}`}>{storeLabels[store]}</span>
          <span className="text-gray-500 dark:text-gray-400">
            {meta.count} items
          </span>
          <span className="text-gray-400 dark:text-gray-500">|</span>
          <span className="text-gray-500 dark:text-gray-400">
            Updated {timeAgo(meta.captured_at)}
          </span>
        </div>
      ))}
    </div>
  );
}
