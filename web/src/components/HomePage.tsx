import { useEffect, useState } from 'react';
import type { HealthResponse, Store } from '../lib/api';
import { fetchHealth } from '../lib/api';

const storeConfig: Record<Store, { label: string; border: string; text: string; bg: string }> = {
  keells: {
    label: 'Keells',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-700 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-900/20',
  },
  glomark: {
    label: 'Glomark',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-700 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
  },
  cargills: {
    label: 'Cargills',
    border: 'border-orange-200 dark:border-orange-800',
    text: 'text-orange-700 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
  },
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'No data yet';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h ago`;
  if (hours > 0) return `${hours}h ago`;
  const mins = Math.floor(diff / (1000 * 60));
  return `${mins}m ago`;
}

export default function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch(() => setError(true));
  }, []);

  const totalProducts = health
    ? Object.values(health.stores).reduce((sum, s) => sum + s.count, 0)
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center">
      <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-4">
        Sri Lanka Grocery Price Compare
      </h1>
      <p className="text-lg text-gray-500 dark:text-gray-400 mb-8">
        Compare meat prices across Keells, Glomark & Cargills
      </p>

      <a
        href="/meat"
        className="inline-flex items-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-3 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-lg"
      >
        Browse Meat Prices
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </a>

      <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {error && (
          <div className="sm:col-span-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">
            Unable to connect to API. Make sure the Worker is running.
          </div>
        )}
        {!health && !error && (
          <div className="sm:col-span-3 text-gray-400 dark:text-gray-500 animate-pulse py-8">
            Loading store data...
          </div>
        )}
        {health &&
          (Object.entries(health.stores) as [Store, HealthResponse['stores'][string]][]).map(
            ([store, meta]) => {
              const cfg = storeConfig[store];
              return (
                <div
                  key={store}
                  className={`${cfg.bg} border ${cfg.border} rounded-xl p-5 text-left`}
                >
                  <div className={`text-lg font-semibold ${cfg.text} mb-2`}>{cfg.label}</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {meta.count} <span className="text-sm font-normal text-gray-500 dark:text-gray-400">products</span>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Updated {timeAgo(meta.captured_at)}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Status: {meta.source_status}
                  </div>
                </div>
              );
            }
          )}
      </div>

      {totalProducts !== null && (
        <p className="mt-8 text-sm text-gray-400 dark:text-gray-500">
          {totalProducts} total products tracked
        </p>
      )}
    </div>
  );
}
