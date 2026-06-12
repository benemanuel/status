/*
 * Recipe Box — pure data helpers (no DOM).
 * Loaded in the browser as window.RecipeLib, and in Node via require() for tests.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RecipeLib = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var EXPORT_FORMAT = "recipe-box";
  var EXPORT_VERSION = 1;

  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "r-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function asArray(value) {
    if (value == null) return [];
    return Array.isArray(value) ? value : [value];
  }

  function cleanLines(value) {
    return asArray(value)
      .map(function (v) { return String(v).trim(); })
      .filter(Boolean);
  }

  function cleanTags(value) {
    var parts;
    if (Array.isArray(value)) {
      parts = value.map(String);
    } else if (typeof value === "string") {
      parts = value.split(",");
    } else {
      parts = [];
    }
    var seen = {};
    return parts
      .map(function (t) { return t.trim().toLowerCase(); })
      .filter(function (t) { return t && !seen[t] && (seen[t] = true); });
  }

  /* Build a well-formed recipe object from loosely-shaped input. */
  function normalizeRecipe(raw) {
    if (!raw || typeof raw !== "object") return null;
    var title = String(raw.title || raw.name || "").trim();
    if (!title) return null;
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
      title: title,
      description: String(raw.description || "").trim(),
      image: String(raw.image || raw.imageUrl || "").trim(),
      servings: String(raw.servings || raw.yield || "").trim(),
      prepTime: String(raw.prepTime || "").trim(),
      cookTime: String(raw.cookTime || "").trim(),
      ingredients: cleanLines(raw.ingredients),
      steps: cleanLines(raw.steps || raw.instructions || raw.directions),
      tags: cleanTags(raw.tags),
      notes: String(raw.notes || "").trim(),
      source: String(raw.source || raw.url || "").trim(),
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString()
    };
  }

  /* ---- schema.org Recipe (JSON-LD) support ---- */

  function isSchemaRecipe(obj) {
    if (!obj || typeof obj !== "object") return false;
    var type = obj["@type"];
    return asArray(type).indexOf("Recipe") !== -1;
  }

  function schemaText(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return schemaText(value[0]);
    if (typeof value === "object") return schemaText(value.text || value.name || value.url || value["@id"] || "");
    return String(value);
  }

  function schemaSteps(instructions) {
    var steps = [];
    asArray(instructions).forEach(function (item) {
      if (item && typeof item === "object" && asArray(item["@type"]).indexOf("HowToSection") !== -1) {
        steps = steps.concat(schemaSteps(item.itemListElement));
      } else {
        var text = schemaText(item);
        if (text) steps.push(text);
      }
    });
    return steps;
  }

  function fromSchemaRecipe(obj) {
    return normalizeRecipe({
      title: schemaText(obj.name),
      description: schemaText(obj.description),
      image: schemaText(obj.image),
      servings: schemaText(obj.recipeYield),
      prepTime: humanDuration(schemaText(obj.prepTime)),
      cookTime: humanDuration(schemaText(obj.cookTime)),
      ingredients: asArray(obj.recipeIngredient || obj.ingredients).map(schemaText),
      steps: schemaSteps(obj.recipeInstructions),
      tags: typeof obj.keywords === "string" ? obj.keywords : asArray(obj.keywords).map(schemaText),
      source: schemaText(obj.url || obj.mainEntityOfPage)
    });
  }

  /* ISO-8601 durations (PT1H30M) -> "1 h 30 min"; anything else passes through. */
  function humanDuration(value) {
    var m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(String(value || "").trim());
    if (!m || (!m[1] && !m[2] && !m[3])) return String(value || "");
    var parts = [];
    if (m[1]) parts.push(m[1] + " d");
    if (m[2]) parts.push(m[2] + " h");
    if (m[3]) parts.push(m[3] + " min");
    return parts.join(" ");
  }

  /* Pull recipe candidates out of any parsed-JSON shape. */
  function collectCandidates(data, out) {
    if (!data || typeof data !== "object") return;
    if (Array.isArray(data)) {
      data.forEach(function (item) { collectCandidates(item, out); });
      return;
    }
    if (data["@graph"]) {
      collectCandidates(data["@graph"], out);
      return;
    }
    if (isSchemaRecipe(data)) {
      out.push(fromSchemaRecipe(data));
      return;
    }
    if (data["@type"]) return; // typed JSON-LD node that isn't a Recipe
    if (Array.isArray(data.recipes)) {
      data.recipes.forEach(function (item) { collectCandidates(item, out); });
      return;
    }
    out.push(normalizeRecipe(data));
  }

  /*
   * Parse the text of an imported file. Accepts:
   *  - a Recipe Box export (object with recipes/collections arrays)
   *  - a bare array of recipes, or a single recipe object
   *  - schema.org Recipe JSON-LD (single, array, or @graph)
   * Returns { recipes, collections }; throws on unparseable input.
   */
  function parseImport(text) {
    var data = JSON.parse(text);
    var recipes = [];
    collectCandidates(data, recipes);
    recipes = recipes.filter(Boolean);
    if (!recipes.length) {
      throw new Error("No recipes found in file (need at least a title/name per recipe).");
    }
    var collections = [];
    if (data && !Array.isArray(data) && Array.isArray(data.collections)) {
      collections = data.collections
        .map(function (c) {
          if (!c || typeof c !== "object" || !c.name) return null;
          return {
            id: typeof c.id === "string" && c.id ? c.id : uid(),
            name: String(c.name).trim(),
            recipeIds: cleanLines(c.recipeIds)
          };
        })
        .filter(Boolean);
    }
    return { recipes: recipes, collections: collections };
  }

  /*
   * Merge imported data into existing data.
   * Recipes matching an existing id, or an existing title (case-insensitive),
   * are skipped as duplicates. Returns { recipes, collections, added, skipped }.
   */
  function mergeImport(existing, imported) {
    var byId = {};
    var byTitle = {};
    existing.recipes.forEach(function (r) {
      byId[r.id] = true;
      byTitle[r.title.toLowerCase()] = true;
    });
    var added = [];
    var skipped = 0;
    imported.recipes.forEach(function (r) {
      if (byId[r.id] || byTitle[r.title.toLowerCase()]) {
        skipped++;
        return;
      }
      byId[r.id] = true;
      byTitle[r.title.toLowerCase()] = true;
      added.push(r);
    });
    var recipes = existing.recipes.concat(added);
    var validIds = {};
    recipes.forEach(function (r) { validIds[r.id] = true; });

    var collections = existing.collections.slice();
    var collNames = {};
    collections.forEach(function (c) { collNames[c.name.toLowerCase()] = c; });
    (imported.collections || []).forEach(function (c) {
      var ids = c.recipeIds.filter(function (id) { return validIds[id]; });
      var current = collNames[c.name.toLowerCase()];
      if (current) {
        ids.forEach(function (id) {
          if (current.recipeIds.indexOf(id) === -1) current.recipeIds.push(id);
        });
      } else {
        var copy = { id: c.id, name: c.name, recipeIds: ids };
        collections.push(copy);
        collNames[c.name.toLowerCase()] = copy;
      }
    });
    return { recipes: recipes, collections: collections, added: added.length, skipped: skipped };
  }

  function toExportJSON(recipes, collections) {
    return JSON.stringify(
      {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        recipes: recipes,
        collections: collections || []
      },
      null,
      2
    );
  }

  function toMarkdown(recipes) {
    return recipes
      .map(function (r) {
        var lines = ["# " + r.title, ""];
        if (r.description) lines.push(r.description, "");
        var meta = [];
        if (r.servings) meta.push("Servings: " + r.servings);
        if (r.prepTime) meta.push("Prep: " + r.prepTime);
        if (r.cookTime) meta.push("Cook: " + r.cookTime);
        if (meta.length) lines.push("*" + meta.join(" · ") + "*", "");
        if (r.ingredients.length) {
          lines.push("## Ingredients", "");
          r.ingredients.forEach(function (i) { lines.push("- " + i); });
          lines.push("");
        }
        if (r.steps.length) {
          lines.push("## Steps", "");
          r.steps.forEach(function (s, idx) { lines.push(idx + 1 + ". " + s); });
          lines.push("");
        }
        if (r.notes) lines.push("## Notes", "", r.notes, "");
        if (r.source) lines.push("Source: " + r.source, "");
        if (r.tags.length) lines.push("Tags: " + r.tags.join(", "), "");
        return lines.join("\n");
      })
      .join("\n---\n\n");
  }

  return {
    uid: uid,
    normalizeRecipe: normalizeRecipe,
    parseImport: parseImport,
    mergeImport: mergeImport,
    toExportJSON: toExportJSON,
    toMarkdown: toMarkdown,
    humanDuration: humanDuration
  };
});
