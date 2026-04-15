const SUBCATEGORIES = ['All', 'Poultry', 'Beef', 'Pork', 'Mutton', 'Processed', 'Specialty'] as const;

type Props = {
  active: string;
  onChange: (sub: string) => void;
};

export default function SubcategoryFilter({ active, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUBCATEGORIES.map((sub) => {
        const isActive = active === sub;
        return (
          <button
            key={sub}
            onClick={() => onChange(sub)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              isActive
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {sub}
          </button>
        );
      })}
    </div>
  );
}
