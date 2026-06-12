/* Node smoke tests for lib.js: run with `node test-lib.js` */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Lib = require("./lib.js");

// 1. Sample data parses and round-trips through export/import
const sampleText = fs.readFileSync(path.join(__dirname, "sample-recipes.json"), "utf8");
const sample = Lib.parseImport(sampleText);
assert.strictEqual(sample.recipes.length, 3);
assert.strictEqual(sample.collections.length, 1);
assert.strictEqual(sample.recipes[0].title, "Shakshuka");
assert.ok(sample.recipes[0].ingredients.length > 5);

const exported = Lib.toExportJSON(sample.recipes, sample.collections);
const reimported = Lib.parseImport(exported);
assert.deepStrictEqual(reimported.recipes, sample.recipes);
assert.deepStrictEqual(reimported.collections, sample.collections);

// 2. Bare array and single-object imports
assert.strictEqual(Lib.parseImport('[{"title":"A"},{"name":"B"}]').recipes.length, 2);
assert.strictEqual(Lib.parseImport('{"title":"Solo","ingredients":"1 egg"}').recipes[0].ingredients[0], "1 egg");

// 3. schema.org Recipe JSON-LD (incl. @graph, HowToStep, HowToSection, ISO durations)
const jsonld = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebPage", "name": "ignored" },
    {
      "@type": "Recipe",
      "name": "Site Pancakes",
      "image": ["https://example.com/p.jpg"],
      "recipeYield": "4 servings",
      "prepTime": "PT15M",
      "cookTime": "PT1H30M",
      "keywords": "breakfast, quick",
      "recipeIngredient": ["1 cup flour", "1 egg"],
      "recipeInstructions": [
        { "@type": "HowToStep", "text": "Mix everything." },
        {
          "@type": "HowToSection",
          "name": "Frying",
          "itemListElement": [{ "@type": "HowToStep", "text": "Fry until golden." }]
        }
      ]
    }
  ]
});
const ld = Lib.parseImport(jsonld);
assert.strictEqual(ld.recipes.length, 1);
const r = ld.recipes[0];
assert.strictEqual(r.title, "Site Pancakes");
assert.strictEqual(r.image, "https://example.com/p.jpg");
assert.strictEqual(r.prepTime, "15 min");
assert.strictEqual(r.cookTime, "1 h 30 min");
assert.deepStrictEqual(r.tags, ["breakfast", "quick"]);
assert.deepStrictEqual(r.steps, ["Mix everything.", "Fry until golden."]);

// 4. Merge skips duplicates by id and by title, keeps collections consistent
const existing = { recipes: sample.recipes, collections: sample.collections };
const incoming = Lib.parseImport(JSON.stringify({
  recipes: [
    { id: "sample-shakshuka", title: "Shakshuka v2" }, // dup by id
    { title: "tahini cookies" },                        // dup by title (case-insensitive)
    { id: "new-1", title: "Brand New Dish" }
  ],
  collections: [
    { id: "c-new", name: "Weeknight favorites", recipeIds: ["new-1", "missing-id"] }
  ]
}));
const merged = Lib.mergeImport(existing, incoming);
assert.strictEqual(merged.added, 1);
assert.strictEqual(merged.skipped, 2);
assert.strictEqual(merged.recipes.length, 4);
assert.strictEqual(merged.collections.length, 1); // merged into existing collection by name
assert.ok(merged.collections[0].recipeIds.includes("new-1"));
assert.ok(!merged.collections[0].recipeIds.includes("missing-id"));

// 5. Invalid input throws
assert.throws(() => Lib.parseImport("[]"));
assert.throws(() => Lib.parseImport('[{"noTitle":true}]'));
assert.throws(() => Lib.parseImport("not json"));

// 6. Markdown export contains the essentials
const md = Lib.toMarkdown(sample.recipes);
assert.ok(md.includes("# Shakshuka"));
assert.ok(md.includes("## Ingredients"));
assert.ok(md.includes("1. Heat the olive oil"));

console.log("All lib.js tests passed.");
