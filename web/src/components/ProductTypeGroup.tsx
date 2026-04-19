import React, { useState } from 'react';
import type { NormalizedProduct, Store } from '../lib/api';
import type { ProductType } from '../lib/product-types';
import StoreBadge from './StoreBadge';
import PriceChart from './PriceChart';

type Props = {
  type: ProductType;
  products: NormalizedProduct[];
  enabledStores: Set<Store>;
  apiUrl: string;
  mergeMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  mergeRuleId?: string;
  onUnmerge?: (ruleId: string) => void;
};

function formatPrice(price: number | null): string {
  if (price === null) return '--';
  return price.toLocaleString('en-LK', { maximumFractionDigits: 0 });
}

function formatPackSize(product: NormalizedProduct): string {
  if (product.raw_size_text) return product.raw_size_text;
  if (product.net_weight_g) return `${product.net_weight_g}g`;
  if (product.price_per_kg_lkr !== null) return 'per kg';
  return '\u2014';
}

const subcategoryEmoji: Record<string, string> = {
  Poultry: '\uD83D\uDC14',
  Beef: '\uD83D\uDC02',
  Pork: '\uD83D\uDC37',
  Mutton: '\uD83D\uDC11',
  Turkey: '\uD83E\uDD83',
  Processed: '\uD83C\uDF2D',
  Specialty: '\u2B50',
  Other: '\uD83D\uDCE6',
};

export default function ProductTypeGroup({ type, products, enabledStores, apiUrl, mergeMode, selected, onToggleSelect, mergeRuleId, onUnmerge }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  const filtered = products.filter((p) => enabledStores.has(p.store));

  if (filtered.length === 0) return null;

  const cheapest = filtered.reduce<number | null>((min, p) => {
    if (p.price_per_kg_lkr === null) return min;
    if (min === null) return p.price_per_kg_lkr;
    return Math.min(min, p.price_per_kg_lkr);
  }, null);

  const emoji = subcategoryEmoji[type.subcategory] ?? '\uD83D\uDCE6';

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center">
        {mergeMode && (
          <label
            className="flex items-center justify-center w-10 h-full cursor-pointer px-2 py-3"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={() => onToggleSelect?.()}
              className="w-4 h-4 accent-blue-500 cursor-pointer"
            />
          </label>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
        <div className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <span className="font-semibold text-gray-900 dark:text-white">{type.label}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">({filtered.length})</span>
          {mergeRuleId && !mergeMode && (
            <button
              onClick={(e) => { e.stopPropagation(); onUnmerge?.(mergeRuleId); }}
              className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors"
              title="Unmerge this group"
            >
              merged &times;
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {cheapest !== null && (
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              cheapest: Rs {formatPrice(cheapest)}/kg
            </span>
          )}
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400 w-24">Rs/kg</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">Product</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400 w-20">Pack</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400 w-20">Price</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400 w-24">Store</th>
                <th className="text-center px-4 py-2 font-medium text-gray-500 dark:text-gray-400 w-14">Stock</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product, idx) => {
                const isCheapest = product.price_per_kg_lkr !== null && product.price_per_kg_lkr === cheapest;
                return (
                  <React.Fragment key={product.id}>
                    <tr
                      onClick={() => setExpandedProductId(expandedProductId === product.id ? null : product.id)}
                      className={`cursor-pointer border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                        isCheapest
                          ? 'bg-green-50 dark:bg-green-900/20'
                          : idx % 2 === 0
                            ? 'bg-white dark:bg-gray-900'
                            : 'bg-gray-50/50 dark:bg-gray-800/20'
                      }`}
                    >
                      <td className="px-4 py-2">
                        {product.price_per_kg_lkr !== null ? (
                          <>
                            <span className={`${isCheapest ? 'font-bold text-green-700 dark:text-green-400' : 'font-semibold text-gray-900 dark:text-white'}`}>
                              {formatPrice(product.price_per_kg_lkr)}
                            </span>
                            <span className="text-gray-400 dark:text-gray-500 text-xs">/kg</span>
                          </>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 text-xs" title="Weight unknown — cannot compute per-kg price">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <a
                          href={product.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline text-blue-600 dark:text-blue-400"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {product.name}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs">
                        {formatPackSize(product)}
                      </td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">
                        {product.displayed_price_lkr !== null
                          ? `Rs ${formatPrice(product.displayed_price_lkr)}`
                          : '--'}
                        {product.price_direction === "down" && (
                          <span className="text-green-600 ml-1 cursor-help" title={`Was Rs ${product.previous_price_lkr}`}>&#9660;</span>
                        )}
                        {product.price_direction === "up" && (
                          <span className="text-red-500 ml-1 cursor-help" title={`Was Rs ${product.previous_price_lkr}`}>&#9650;</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <StoreBadge store={product.store} />
                      </td>
                      <td className="px-4 py-2 text-center">
                        {product.in_stock === true && (
                          <span className="text-green-600 dark:text-green-400" title="In stock">{'\u2713'}</span>
                        )}
                        {product.in_stock === false && (
                          <span className="text-red-500 dark:text-red-400" title="Out of stock">{'\u2717'}</span>
                        )}
                        {product.in_stock === null && (
                          <span className="text-gray-300 dark:text-gray-600">-</span>
                        )}
                      </td>
                    </tr>
                    {expandedProductId === product.id && (
                      <tr key={`${product.id}-chart`}>
                        <td colSpan={6}>
                          <PriceChart
                            productId={product.id}
                            store={product.store}
                            currentPrice={product.displayed_price_lkr}
                            apiUrl={apiUrl}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
