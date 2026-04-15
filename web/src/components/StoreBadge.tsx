import type { Store } from '../lib/api';

const storeConfig: Record<Store, { label: string; bg: string; text: string }> = {
  keells: { label: 'Keells', bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-800 dark:text-green-300' },
  glomark: { label: 'Glomark', bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-800 dark:text-blue-300' },
  cargills: { label: 'Cargills', bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-800 dark:text-orange-300' },
};

export default function StoreBadge({ store }: { store: Store }) {
  const config = storeConfig[store] ?? { label: store, bg: 'bg-gray-100', text: 'text-gray-800' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
