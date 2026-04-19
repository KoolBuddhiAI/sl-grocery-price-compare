import { useState, useEffect } from 'react';

interface PriceChartProps {
  productId: string;
  store: string;
  currentPrice: number | null;
  apiUrl: string;
  // Optional pre-fetched history points (oldest first). If provided, skip fetch.
  history?: Array<{ date: string; price: number | null }>;
  category?: string;
}

export default function PriceChart({ productId, store, currentPrice, apiUrl, history: externalHistory, category = 'meat' }: PriceChartProps) {
  const [history, setHistory] = useState<Array<{ date: string; price: number | null }>>(externalHistory ?? []);
  const [loading, setLoading] = useState(!externalHistory);

  useEffect(() => {
    if (externalHistory) {
      setHistory(externalHistory);
      setLoading(false);
      return;
    }
    fetch(`${apiUrl}/api/history?store=${store}&category=${category}`)
      .then(res => res.json())
      .then(data => {
        // Response is { data: HistoryEntry[] }
        const entries = Array.isArray(data) ? data : (data?.data ?? []);
        const points = entries
          .map((entry: any) => ({
            date: entry.date,
            price: entry.prices?.[productId] ?? null,
          }))
          .filter((p: any) => p.price !== null)
          .reverse(); // oldest first
        setHistory(points);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [productId, store, apiUrl, externalHistory, category]);

  if (loading) return <div className="text-sm text-gray-500 py-2">Loading history...</div>;
  if (history.length < 3) return null;

  // SVG sparkline
  const prices = history.map(h => h.price!);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const width = 300;
  const height = 60;
  const padding = 4;

  const points = prices.map((p, i) => {
    const x = padding + (i / (prices.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (p - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="py-2 px-4">
      <div className="flex items-center gap-4">
        <svg width={width} height={height} className="bg-gray-50 dark:bg-gray-800 rounded">
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-blue-500"
          />
        </svg>
        <div className="text-xs text-gray-500">
          <div>{history[0].date} → {history[history.length - 1].date}</div>
          <div>Low: Rs {min.toLocaleString()} | High: Rs {max.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
