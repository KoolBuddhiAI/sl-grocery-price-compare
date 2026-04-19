import { useEffect, useState } from 'react';
import type { NormalizedProduct, Store } from '../lib/api';
import { fetchProducts, API_BASE } from '../lib/api';
import { groupProductsForCategory, applyMergeRules, type GroupedProducts } from '../lib/product-types';
import { getMergeRulesForCategory, addMergeRule, removeMergeRule } from '../lib/merge-rules';
import SubcategoryFilter from './SubcategoryFilter';
import StoreFilter from './StoreFilter';
import ProductTypeGroup from './ProductTypeGroup';
import FreshnessBar from './FreshnessBar';

type CategoryConfig = {
  emoji: string;
  accent: string;
};

const categoryConfigs: Record<string, CategoryConfig> = {
  meat: { emoji: '\uD83E\uDD69', accent: 'text-red-600 dark:text-red-400' },
  seafood: { emoji: '\uD83D\uDC1F', accent: 'text-blue-600 dark:text-blue-400' },
  vegetables: { emoji: '\uD83E\uDD6C', accent: 'text-green-600 dark:text-green-400' },
  fruits: { emoji: '\uD83C\uDF4E', accent: 'text-orange-600 dark:text-orange-400' },
};

type Props = {
  category: string;
  title: string;
};

export default function CategoryPage({ category, title }: Props) {
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [groups, setGroups] = useState<GroupedProducts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState('All');
  const [enabledStores, setEnabledStores] = useState<Set<Store>>(
    new Set(['keells', 'glomark', 'cargills'])
  );
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [mergeLabel, setMergeLabel] = useState('');
  const [mergeRulesVersion, setMergeRulesVersion] = useState(0);

  useEffect(() => {
    fetchProducts(undefined, category)
      .then((res) => {
        setProducts(res.data);
        const baseGroups = groupProductsForCategory(res.data, category);
        const rules = getMergeRulesForCategory(category);
        setGroups(applyMergeRules(baseGroups, rules));
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load products. Make sure the API is running.');
        setLoading(false);
      });
  }, [category, mergeRulesVersion]);

  const filteredGroups =
    subcategory === 'All'
      ? groups
      : groups.filter((g) => g.type.subcategory === subcategory);

  const totalVisible = filteredGroups.reduce((sum, g) => {
    return sum + g.products.filter((p) => enabledStores.has(p.store)).length;
  }, 0);

  const config = categoryConfigs[category] ?? { emoji: '\uD83D\uDCE6', accent: 'text-gray-600 dark:text-gray-400' };
  const showSubcategoryFilter = category === 'meat';

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-white rounded-full animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading {title.toLowerCase()} products...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
          <p className="text-red-700 dark:text-red-300 font-medium">{error}</p>
          <p className="text-red-500 dark:text-red-400 text-sm mt-2">
            The Worker API should be running at localhost:8787 (or configure PUBLIC_API_URL)
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
          <span className="mr-2">{config.emoji}</span>
          {title} Prices
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          {products.length} products across {filteredGroups.length} categories
          {subcategory !== 'All' && ` in ${subcategory}`}
          {' \u00B7 '}{totalVisible} visible
        </p>
      </div>

      <div className="mb-6">
        <FreshnessBar category={category} />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          {showSubcategoryFilter && (
            <SubcategoryFilter active={subcategory} onChange={setSubcategory} />
          )}
          {!showSubcategoryFilter && (
            <button
              onClick={() => {
                setMergeMode(!mergeMode);
                setSelectedForMerge(new Set());
                setMergeLabel('');
              }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                mergeMode
                  ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                  : 'border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600'
              }`}
            >
              {mergeMode ? 'Cancel merge' : 'Merge groups'}
            </button>
          )}
        </div>
        <StoreFilter enabled={enabledStores} onChange={setEnabledStores} />
      </div>

      <div className="flex flex-col gap-4">
        {filteredGroups.map((group) => (
          <ProductTypeGroup
            key={group.type.id}
            type={group.type}
            products={group.products}
            enabledStores={enabledStores}
            apiUrl={API_BASE}
            mergeMode={mergeMode}
            selected={selectedForMerge.has(group.type.id)}
            onToggleSelect={() => {
              const next = new Set(selectedForMerge);
              if (next.has(group.type.id)) {
                next.delete(group.type.id);
              } else {
                next.add(group.type.id);
              }
              setSelectedForMerge(next);
              // Auto-suggest label from selected groups
              if (next.size > 0) {
                const selectedGroups = filteredGroups.filter((g) => next.has(g.type.id));
                const labels = selectedGroups.map((g) => g.type.label);
                labels.sort((a, b) => a.length - b.length);
                setMergeLabel(labels[0] ?? '');
              }
            }}
            mergeRuleId={group.mergeRuleId}
            onUnmerge={(ruleId) => {
              removeMergeRule(ruleId);
              setMergeRulesVersion((v) => v + 1);
            }}
          />
        ))}
        {filteredGroups.length === 0 && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            No products found for this category.
          </div>
        )}
      </div>

      {mergeMode && selectedForMerge.size >= 2 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 border-t border-gray-700 px-4 py-3 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <span className="text-sm text-gray-300">
              {selectedForMerge.size} groups selected
            </span>
            <input
              type="text"
              value={mergeLabel}
              onChange={(e) => setMergeLabel(e.target.value)}
              placeholder="Merged group name"
              className="flex-1 max-w-xs px-3 py-1.5 rounded bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => {
                const label = mergeLabel.trim() || 'Merged Group';
                addMergeRule(category, [...selectedForMerge], label);
                setMergeMode(false);
                setSelectedForMerge(new Set());
                setMergeLabel('');
                setMergeRulesVersion((v) => v + 1);
              }}
              className="px-4 py-1.5 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
            >
              Merge
            </button>
            <button
              onClick={() => {
                setSelectedForMerge(new Set());
                setMergeLabel('');
              }}
              className="px-3 py-1.5 rounded text-gray-400 text-sm hover:text-white transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
