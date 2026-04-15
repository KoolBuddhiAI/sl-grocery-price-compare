import type { Store } from '../lib/api';

const STORES: { id: Store; label: string; color: string; checked: string }[] = [
  {
    id: 'keells',
    label: 'Keells',
    color: 'accent-green-600',
    checked: 'text-green-700 dark:text-green-400',
  },
  {
    id: 'glomark',
    label: 'Glomark',
    color: 'accent-blue-600',
    checked: 'text-blue-700 dark:text-blue-400',
  },
  {
    id: 'cargills',
    label: 'Cargills',
    color: 'accent-orange-500',
    checked: 'text-orange-700 dark:text-orange-400',
  },
];

type Props = {
  enabled: Set<Store>;
  onChange: (stores: Set<Store>) => void;
};

export default function StoreFilter({ enabled, onChange }: Props) {
  function toggle(store: Store) {
    const next = new Set(enabled);
    if (next.has(store)) {
      // Don't allow unchecking all
      if (next.size > 1) next.delete(store);
    } else {
      next.add(store);
    }
    onChange(next);
  }

  return (
    <div className="flex flex-wrap gap-4">
      {STORES.map((s) => {
        const active = enabled.has(s.id);
        return (
          <label
            key={s.id}
            className={`flex items-center gap-2 cursor-pointer text-sm font-medium ${
              active ? s.checked : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            <input
              type="checkbox"
              checked={active}
              onChange={() => toggle(s.id)}
              className={`w-4 h-4 rounded ${s.color}`}
            />
            {s.label}
          </label>
        );
      })}
    </div>
  );
}
