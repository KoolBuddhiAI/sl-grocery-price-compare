#!/usr/bin/env node

/**
 * Auto-categorize products into product types using keyword matching.
 * Outputs data/product-type-mapping.json for manual review and correction.
 *
 * Usage:
 *   node scripts/generate-product-types.mjs
 *   node scripts/generate-product-types.mjs --update   # preserve manual corrections
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const MAPPING_FILE = path.join(PROJECT_ROOT, "data", "product-type-mapping.json");

// Product type definitions with keyword patterns
// Order matters — first match wins
const PRODUCT_TYPES = [
  // Whole chicken variants
  { id: "whole-chicken", label: "Whole Chicken", subcategory: "Poultry", keywords: ["whole chicken", "half chicken", "pre cut whole", "pre-cut whole", "precut whole", "pre cut chicken", "home pack"] },
  { id: "chicken-breast", label: "Chicken Breast", subcategory: "Poultry", keywords: ["chicken breast", "boneless breast", "full breast"] },
  { id: "chicken-drumsticks", label: "Chicken Drumsticks", subcategory: "Poultry", keywords: ["drumstick"] },
  { id: "chicken-thigh", label: "Chicken Thigh", subcategory: "Poultry", keywords: ["chicken thigh", "boneless thigh"] },
  { id: "chicken-legs", label: "Chicken Legs", subcategory: "Poultry", keywords: ["whole leg", "chicken leg"] },
  { id: "chicken-wings", label: "Chicken Wings", subcategory: "Poultry", keywords: ["chicken wing", "winglet", "cut wing"] },
  { id: "chicken-gizzard", label: "Chicken Gizzard", subcategory: "Poultry", keywords: ["gizzard"] },
  { id: "chicken-liver", label: "Chicken Liver", subcategory: "Poultry", keywords: ["chicken liver"] },
  { id: "chicken-neck", label: "Chicken Neck", subcategory: "Poultry", keywords: ["chicken neck"] },

  // Processed chicken
  { id: "chicken-sausages", label: "Chicken Sausages", subcategory: "Processed", keywords: ["chicken sausage", "chicken bockwurst", "chicken hotdog", "chicken garlic sausage", "chicken lingus", "chicken bacon", "kochchi chicken"] },
  { id: "chicken-meatballs", label: "Chicken Meatballs", subcategory: "Processed", keywords: ["chicken meat ball", "chicken meatball"] },
  { id: "chicken-burgers", label: "Chicken Burgers", subcategory: "Processed", keywords: ["chicken burger"] },
  { id: "chicken-other-processed", label: "Chicken Processed (Other)", subcategory: "Processed", keywords: ["chicken cheese", "chicken ham", "chicken roll", "chicken mortadella", "chicken bologna", "marinated chicken", "chicken paprika", "pawkies", "popcorn", "crispy loin"] },

  // Beef
  { id: "beef-cubes", label: "Beef Cubes", subcategory: "Beef", keywords: ["beef cube", "curry beef"] },
  { id: "beef-topside", label: "Beef Topside", subcategory: "Beef", keywords: ["beef topside", "beef fillet"] },
  { id: "beef-sausages", label: "Beef Sausages", subcategory: "Beef", keywords: ["beef sausage"] },
  { id: "corned-beef", label: "Corned Beef", subcategory: "Beef", keywords: ["corned beef"] },

  // Pork
  { id: "pork-cubes", label: "Pork Cubes / Curry", subcategory: "Pork", keywords: ["pork cube", "curry pork", "bone in curry pork"] },
  { id: "pork-belly", label: "Pork Belly", subcategory: "Pork", keywords: ["pork belly"] },
  { id: "pork-chops", label: "Pork Chops / Shoulder", subcategory: "Pork", keywords: ["pork chop", "pork shoulder", "pork loin"] },
  { id: "pork-leg", label: "Pork Leg", subcategory: "Pork", keywords: ["pork leg", "pork knuckle", "pork roast", "roasted pork", "pork fillet", "pork for roast"] },
  { id: "pork-ham", label: "Pork Ham / Deli", subcategory: "Pork", keywords: ["pork ham", "pork salami", "pork mortadella", "pork bologna", "back bacon", "bacon end", "pork lingus", "spare rib", "bbq spare"] },
  { id: "minced-pork", label: "Minced Pork", subcategory: "Pork", keywords: ["minced pork"] },

  // Mutton / Lamb
  { id: "mutton", label: "Mutton / Lamb", subcategory: "Mutton", keywords: ["mutton", "lamb"] },

  // Turkey
  { id: "turkey", label: "Turkey", subcategory: "Turkey", keywords: ["turkey"] },

  // Imported / Specialty
  { id: "imported-deli", label: "Imported Deli Meats", subcategory: "Specialty", keywords: ["argal", "casa di sapori", "jamon", "chorizo", "salchichon", "salami milano", "salami pepperoni", "smoked salami", "cooked ham", "trio espanol"] },
];

function classifyProduct(name) {
  const lower = name.toLowerCase();
  for (const type of PRODUCT_TYPES) {
    for (const keyword of type.keywords) {
      if (lower.includes(keyword)) {
        return { typeId: type.id, confidence: "auto" };
      }
    }
  }
  return { typeId: "uncategorized", confidence: "auto" };
}

async function main() {
  const isUpdate = process.argv.includes("--update");

  // Load existing mapping if updating
  let existingMapping = {};
  if (isUpdate) {
    try {
      const raw = await fs.readFile(MAPPING_FILE, "utf8");
      const parsed = JSON.parse(raw);
      // Index by product id for quick lookup
      for (const product of parsed.products || []) {
        if (product.confidence === "manual") {
          existingMapping[product.id] = product;
        }
      }
      console.log(`Loaded ${Object.keys(existingMapping).length} manual corrections.`);
    } catch {
      // No existing file
    }
  }

  // Load all products
  const keells = JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, "data/keells.meat.import.json"), "utf8"));
  const glomark = JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, "data/glomark.meat.import.json"), "utf8"));
  const cargills = JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, "data/cargills.meat.import.json"), "utf8"));

  const allProducts = [
    ...keells.items.map(i => ({ ...i, store: "keells" })),
    ...glomark.items.map(i => ({ ...i, store: "glomark" })),
    ...cargills.items.map(i => ({ ...i, store: "cargills" })),
  ];

  // Classify each product
  const products = allProducts.map(p => {
    // Preserve manual corrections
    if (existingMapping[p.id]) {
      return existingMapping[p.id];
    }

    const { typeId, confidence } = classifyProduct(p.name);
    return {
      id: p.id,
      store: p.store,
      name: p.name,
      product_type: typeId,
      confidence,
    };
  });

  // Build type definitions
  const types = PRODUCT_TYPES.map(t => ({
    id: t.id,
    label: t.label,
    subcategory: t.subcategory,
  }));
  types.push({ id: "uncategorized", label: "Uncategorized", subcategory: "Other" });

  // Stats
  const stats = {};
  for (const p of products) {
    stats[p.product_type] = (stats[p.product_type] || 0) + 1;
  }

  const mapping = {
    _generated_at: new Date().toISOString(),
    _note: "Auto-generated by scripts/generate-product-types.mjs. Edit product_type and set confidence to 'manual' for corrections.",
    types,
    products,
  };

  await fs.writeFile(MAPPING_FILE, JSON.stringify(mapping, null, 2) + "\n", "utf8");

  console.log(`\nWrote ${products.length} products to data/product-type-mapping.json\n`);
  console.log("Product type distribution:");
  const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sorted) {
    const label = types.find(t => t.id === type)?.label || type;
    console.log(`  ${String(count).padStart(3)}  ${label}`);
  }

  const uncategorized = products.filter(p => p.product_type === "uncategorized");
  if (uncategorized.length > 0) {
    console.log(`\nUncategorized products (${uncategorized.length}):`);
    for (const p of uncategorized) {
      console.log(`  [${p.store}] ${p.name}`);
    }
  }
}

main().catch(console.error);
