export type MergeRule = {
  id: string;
  category: string;
  sourceGroupKeys: string[];
  label: string;
  createdAt: string;
};

const STORAGE_KEY = 'grocery-merge-rules';

export function loadMergeRules(): MergeRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMergeRules(rules: MergeRule[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export function getMergeRulesForCategory(category: string): MergeRule[] {
  return loadMergeRules().filter((r) => r.category === category);
}

export function addMergeRule(
  category: string,
  sourceGroupKeys: string[],
  label: string
): MergeRule {
  const rules = loadMergeRules();

  // Collect all original keys — if any selected group is itself a merged group,
  // gather its source keys and remove the old rule (transitive merge)
  const expandedKeys = new Set<string>();
  const rulesToRemove = new Set<string>();

  for (const key of sourceGroupKeys) {
    const existingRule = rules.find(
      (r) => r.category === category && r.id === key
    );
    if (existingRule) {
      for (const k of existingRule.sourceGroupKeys) expandedKeys.add(k);
      rulesToRemove.add(existingRule.id);
    } else {
      expandedKeys.add(key);
    }
  }

  const remaining = rules.filter((r) => !rulesToRemove.has(r.id));

  const newRule: MergeRule = {
    id: Date.now().toString(),
    category,
    sourceGroupKeys: [...expandedKeys],
    label,
    createdAt: new Date().toISOString(),
  };

  remaining.push(newRule);
  saveMergeRules(remaining);
  return newRule;
}

export function removeMergeRule(ruleId: string): void {
  const rules = loadMergeRules().filter((r) => r.id !== ruleId);
  saveMergeRules(rules);
}
