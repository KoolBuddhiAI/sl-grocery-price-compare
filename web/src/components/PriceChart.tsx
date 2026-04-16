import { useState, useEffect } from 'react';

interface PriceChartProps {
  productId: string;
  store: string;
  currentPrice: number | null;
  apiUrl: string;
}

export default function PriceChart({ productId, store, currentPrice, apiUrl }: PriceChartProps) {
  const [history, setHistory] = useState<Array<{ date: string; price: number | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiUrl}/api/history?store=${store}&category=meat`)
      .then(res => res.json())
      .then(data => {
        // Extract this product's prices over time
        const points = (data || [])
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
  }, [productId, store, apiUrl]);

  if (loading) return <div className="text-sm text-gray-500 py-2">Loading history...</div>;
  if (history.length < 2) return <div className="text-sm text-gray-500 py-2">Not enough history data yet</div>;

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
