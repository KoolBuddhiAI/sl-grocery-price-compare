import { useEffect, useState } from 'react';
import type { NormalizedProduct } from '../lib/api';
import PriceChart from './PriceChart';
import PriceComparisonCard, { type ComparisonPoint } from './PriceComparisonCard';

type Props = {
  product: NormalizedProduct;
  apiUrl: string;
  category?: string;
};

type HistoryEntry = {
  date: string;
  prices?: Record<string, number | null>;
  prices_per_kg?: Record<string, number | null>;
};

export default function ProductHistoryPanel({ product, apiUrl, category = 'meat' }: Props) {
  const [points, setPoints] = useState<ComparisonPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: plumb category from parent when non-meat history launches
    fetch(`${apiUrl}/api/history?store=${product.store}&category=${category}`)
      .then((res) => res.json())
      .then((data) => {
        const entries: HistoryEntry[] = Array.isArray(data) ? data : (data?.data ?? []);
        const extracted: ComparisonPoint[] = entries
          .map((entry) => ({
            date: entry.date,
            displayed: entry.prices?.[product.id] ?? null,
            perKg: entry.prices_per_kg?.[product.id] ?? null,
          }))
          .filter((p) => p.displayed !== null)
          .reverse(); // oldest first
        setPoints(extracted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [product.id, product.store, apiUrl, category]);

  if (loading) {
    return <div className="text-sm text-gray-500 dark:text-gray-400 py-2 px-4">Loading history...</div>;
  }

  if (points.length === 0) {
    return <div className="text-sm text-gray-500 dark:text-gray-400 py-2 px-4">No history yet</div>;
  }

  if (points.length === 1) {
    return (
      <div className="px-4">
        <PriceComparisonCard mode="single" point={points[0]} />
      </div>
    );
  }

  const before = points[0];
  const after = points[points.length - 1];
  const chartHistory = points.map((p) => ({ date: p.date, price: p.displayed }));

  return (
    <div className="px-4">
      <PriceComparisonCard mode="pair" before={before} after={after} />
      {points.length >= 3 && (
        <PriceChart
          productId={product.id}
          store={product.store}
          currentPrice={product.displayed_price_lkr}
          apiUrl={apiUrl}
          history={chartHistory}
          category={category}
        />
      )}
    </div>
  );
}
