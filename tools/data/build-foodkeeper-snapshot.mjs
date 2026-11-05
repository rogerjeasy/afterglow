#!/usr/bin/env node
/**
 * Build the compact FoodKeeper snapshot the app and core consume.
 *
 *   node tools/data/build-foodkeeper-snapshot.mjs
 *
 * Input : data/foodkeeper/foodkeeper.raw.json  (USDA FSIS FoodKeeper, CC0, vendored unchanged)
 * Output: data/foodkeeper/snapshot.json        (id, names, category, keywords only)
 *
 * This script reshapes data and decides nothing. Outage classification lives in
 * data/foodkeeper/outage-rules.json and is applied by the pure core
 * (packages/core/src/foodkeeper), so every verdict is auditable and tested.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rawPath = resolve(root, 'data/foodkeeper/foodkeeper.raw.json');
const outPath = resolve(root, 'data/foodkeeper/snapshot.json');

const rawText = readFileSync(rawPath, 'utf8');
const raw = JSON.parse(rawText);

/** The raw file stores each row as an array of single-key objects. */
function rows(sheetName) {
  const sheet = raw.sheets.find((s) => s.name === sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  return sheet.data.map((entries) => Object.assign({}, ...entries));
}

const categories = new Map(
  rows('Category').map((c) => [
    Number(c.ID),
    { name: String(c.Category_Name), sub: c.Subcategory_Name ?? null },
  ]),
);

const versions = rows('Version');
const current = versions.find((v) => v.Current_Version === 'Yes') ?? versions.at(-1);

const clean = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s.length > 0 ? s : null;
};

const products = rows('Product')
  .map((p) => {
    const cat = categories.get(Number(p.Category_ID));
    if (!cat) throw new Error(`Product ${p.ID} has unknown category ${p.Category_ID}`);
    return {
      id: Number(p.ID),
      name: clean(p.Name),
      subtitle: clean(p.Name_subtitle),
      categoryId: Number(p.Category_ID),
      category: cat.name,
      subcategory: cat.sub,
      keywords: clean(p.Keywords) ?? '',
    };
  })
  .sort((a, b) => a.id - b.id);

for (const p of products) {
  if (!p.name) throw new Error(`Product ${p.id} has no name`);
}
if (new Set(products.map((p) => p.id)).size !== products.length) {
  throw new Error('Duplicate product ids in FoodKeeper data');
}

const snapshot = {
  snapshotVersion: `foodkeeper-v${current.Data_Version_Number}`,
  source: {
    publisher: 'USDA Food Safety and Inspection Service (FSIS)',
    dataset: 'FoodKeeper',
    url: 'https://www.fsis.usda.gov/shared/data/EN/foodkeeper.json',
    catalog: 'https://catalog.data.gov/dataset/fsis-foodkeeper-data',
    licence: 'CC0 1.0',
    dataVersion: Number(current.Data_Version_Number),
    dataModified: current.Modified_Date ?? null,
    rawSha256: createHash('sha256').update(rawText).digest('hex'),
  },
  productCount: products.length,
  products,
};

writeFileSync(outPath, `${JSON.stringify(snapshot)}\n`);
console.log(`Wrote ${outPath}: ${products.length} products, ${snapshot.snapshotVersion}`);
