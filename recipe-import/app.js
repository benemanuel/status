/* Recipe Box — UI layer. Data helpers live in lib.js (window.RecipeLib). */
(function () {
  "use strict";

  var Lib = window.RecipeLib;
  var STORAGE_KEY = "recipe-box-v1";

  var state = {
    recipes: [],
    collections: [],
    activeCollection: null, // collection id or null = all
    activeTag: null,
    query: "",
    selected: {}, // recipe id -> true (for bulk export selection)
    selectMode: false
  };

  /* ---------- persistence ---------- */

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        state.recipes = (data.recipes || []).map(Lib.normalizeRecipe).filter(Boolean);
        state.collections = data.collections || [];
        return;
      }
    } catch (e) {
      console.error("Failed to load saved data", e);
    }
    seed();
  }

  function save() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ recipes: state.recipes, collections: state.collections })
    );
  }

  function seed() {
    fetch("sample-recipes.json")
      .then(function (res) { return res.text(); })
      .then(function (text) {
        var parsed = Lib.parseImport(text);
        state.recipes = parsed.recipes;
        state.collections = parsed.collections;
        save();
        render();
      })
      .catch(function () { /* offline / file:// — start empty */ });
  }

  /* ---------- helpers ---------- */

  function $(sel, parent) { return (parent || document).querySelector(sel); }
  function $all(sel, parent) { return Array.prototype.slice.call((parent || document).querySelectorAll(sel)); }

  function esc(text) {
    return String(text == null ? "" : text).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function toast(message) {
    var el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove("show"); }, 3500);
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function findRecipe(id) {
    for (var i = 0; i < state.recipes.length; i++) {
      if (state.recipes[i].id === id) return state.recipes[i];
    }
    return null;
  }

  function findCollection(id) {
    for (var i = 0; i < state.collections.length; i++) {
      if (state.collections[i].id === id) return state.collections[i];
    }
    return null;
  }

  function visibleRecipes() {
    var list = state.recipes;
    if (state.activeCollection) {
      var coll = findCollection(state.activeCollection);
      var ids = coll ? coll.recipeIds : [];
      list = list.filter(function (r) { return ids.indexOf(r.id) !== -1; });
    }
    if (state.activeTag) {
      list = list.filter(function (r) { return r.tags.indexOf(state.activeTag) !== -1; });
    }
    if (state.query) {
      var q = state.query.toLowerCase();
      list = list.filter(function (r) {
        return (
          r.title.toLowerCase().indexOf(q) !== -1 ||
          r.description.toLowerCase().indexOf(q) !== -1 ||
          r.ingredients.join("\n").toLowerCase().indexOf(q) !== -1 ||
          r.tags.join(" ").indexOf(q) !== -1
        );
      });
    }
    return list;
  }

  /* ---------- rendering ---------- */

  function render() {
    renderSidebar();
    renderGrid();
    renderToolbar();
  }

  function renderSidebar() {
    var collList = $("#collection-list");
    var html =
      '<li><button class="nav-item' + (state.activeCollection ? "" : " active") +
      '" data-coll="">📚 All recipes <span class="count">' + state.recipes.length + "</span></button></li>";
    state.collections.forEach(function (c) {
      html +=
        '<li><button class="nav-item' + (state.activeCollection === c.id ? " active" : "") +
        '" data-coll="' + esc(c.id) + '">🗂 ' + esc(c.name) +
        ' <span class="count">' + c.recipeIds.length + "</span></button></li>";
    });
    collList.innerHTML = html;

    var tagCounts = {};
    state.recipes.forEach(function (r) {
      r.tags.forEach(function (t) { tagCounts[t] = (tagCounts[t] || 0) + 1; });
    });
    var tags = Object.keys(tagCounts).sort();
    $("#tag-list").innerHTML = tags
      .map(function (t) {
        return (
          '<button class="tag-chip' + (state.activeTag === t ? " active" : "") +
          '" data-tag="' + esc(t) + '">' + esc(t) + " (" + tagCounts[t] + ")</button>"
        );
      })
      .join("");
  }

  function renderGrid() {
    var list = visibleRecipes();
    var grid = $("#recipe-grid");
    if (!list.length) {
      grid.innerHTML =
        '<div class="empty">No recipes here yet. Add one, or use <strong>Import</strong> to bring in recipes in bulk.</div>';
      return;
    }
    grid.innerHTML = list
      .map(function (r) {
        var img = r.image
          ? '<img src="' + esc(r.image) + '" alt="" loading="lazy" onerror="this.remove()">'
          : '<div class="card-placeholder">🍳</div>';
        var meta = [];
        if (r.servings) meta.push("🍽 " + esc(r.servings));
        if (r.cookTime) meta.push("⏱ " + esc(r.cookTime));
        var check = state.selectMode
          ? '<input type="checkbox" class="card-check" data-id="' + esc(r.id) + '"' +
            (state.selected[r.id] ? " checked" : "") + ">"
          : "";
        return (
          '<article class="card" data-id="' + esc(r.id) + '">' + check +
          '<div class="card-image">' + img + "</div>" +
          '<div class="card-body"><h3>' + esc(r.title) + "</h3>" +
          (meta.length ? '<p class="card-meta">' + meta.join(" · ") + "</p>" : "") +
          (r.tags.length
            ? '<p class="card-tags">' + r.tags.map(function (t) { return "#" + esc(t); }).join(" ") + "</p>"
            : "") +
          "</div></article>"
        );
      })
      .join("");
  }

  function renderToolbar() {
    var count = Object.keys(state.selected).filter(function (k) { return state.selected[k]; }).length;
    $("#btn-select").textContent = state.selectMode ? "Done selecting" : "Select";
    $("#selection-info").textContent = state.selectMode ? count + " selected" : "";
    var coll = state.activeCollection ? findCollection(state.activeCollection) : null;
    $("#view-title").textContent = coll ? coll.name : "All recipes";
    $("#btn-delete-collection").hidden = !coll;
  }

  /* ---------- recipe detail / cook mode ---------- */

  function openDetail(id) {
    var r = findRecipe(id);
    if (!r) return;
    var dlg = $("#detail-dialog");
    dlg.dataset.id = id;
    var meta = [];
    if (r.servings) meta.push("🍽 " + esc(r.servings));
    if (r.prepTime) meta.push("Prep " + esc(r.prepTime));
    if (r.cookTime) meta.push("Cook " + esc(r.cookTime));
    $("#detail-content").innerHTML =
      (r.image ? '<img class="detail-image" src="' + esc(r.image) + '" alt="" onerror="this.remove()">' : "") +
      "<h2>" + esc(r.title) + "</h2>" +
      (meta.length ? '<p class="card-meta">' + meta.join(" · ") + "</p>" : "") +
      (r.description ? "<p>" + esc(r.description) + "</p>" : "") +
      "<h3>Ingredients</h3><ul class='ing-list'>" +
      r.ingredients.map(function (i) { return "<li><label><input type='checkbox'> " + esc(i) + "</label></li>"; }).join("") +
      "</ul><h3>Steps</h3><ol>" +
      r.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") +
      "</ol>" +
      (r.notes ? "<h3>Notes</h3><p>" + esc(r.notes) + "</p>" : "") +
      (r.source
        ? '<p class="source">Source: <a href="' + esc(r.source) + '" target="_blank" rel="noopener">' + esc(r.source) + "</a></p>"
        : "");
    dlg.showModal();
  }

  var cook = { recipe: null, step: 0, wakeLock: null };

  function openCookMode(id) {
    var r = findRecipe(id);
    if (!r || !r.steps.length) {
      toast("This recipe has no steps to cook through.");
      return;
    }
    cook.recipe = r;
    cook.step = 0;
    renderCookStep();
    $("#cook-overlay").hidden = false;
    if (navigator.wakeLock && navigator.wakeLock.request) {
      navigator.wakeLock.request("screen").then(
        function (lock) { cook.wakeLock = lock; },
        function () {}
      );
    }
  }

  function closeCookMode() {
    $("#cook-overlay").hidden = true;
    if (cook.wakeLock) {
      cook.wakeLock.release();
      cook.wakeLock = null;
    }
    cook.recipe = null;
  }

  function renderCookStep() {
    var r = cook.recipe;
    $("#cook-title").textContent = r.title;
    $("#cook-progress").textContent = "Step " + (cook.step + 1) + " of " + r.steps.length;
    $("#cook-step").textContent = r.steps[cook.step];
    $("#cook-prev").disabled = cook.step === 0;
    $("#cook-next").textContent = cook.step === r.steps.length - 1 ? "Finish ✓" : "Next →";
  }

  /* ---------- editor ---------- */

  function openEditor(id) {
    var r = id ? findRecipe(id) : null;
    var form = $("#editor-form");
    form.reset();
    form.elements.id.value = r ? r.id : "";
    if (r) {
      form.elements.title.value = r.title;
      form.elements.description.value = r.description;
      form.elements.image.value = r.image;
      form.elements.servings.value = r.servings;
      form.elements.prepTime.value = r.prepTime;
      form.elements.cookTime.value = r.cookTime;
      form.elements.ingredients.value = r.ingredients.join("\n");
      form.elements.steps.value = r.steps.join("\n");
      form.elements.tags.value = r.tags.join(", ");
      form.elements.notes.value = r.notes;
      form.elements.source.value = r.source;
    }
    $("#editor-title").textContent = r ? "Edit recipe" : "New recipe";
    $("#editor-dialog").showModal();
  }

  function saveEditor() {
    var form = $("#editor-form");
    var id = form.elements.id.value;
    var existing = id ? findRecipe(id) : null;
    var recipe = Lib.normalizeRecipe({
      id: id || undefined,
      title: form.elements.title.value,
      description: form.elements.description.value,
      image: form.elements.image.value,
      servings: form.elements.servings.value,
      prepTime: form.elements.prepTime.value,
      cookTime: form.elements.cookTime.value,
      ingredients: form.elements.ingredients.value.split("\n"),
      steps: form.elements.steps.value.split("\n"),
      tags: form.elements.tags.value,
      notes: form.elements.notes.value,
      source: form.elements.source.value,
      createdAt: existing ? existing.createdAt : undefined,
      updatedAt: new Date().toISOString()
    });
    if (!recipe) {
      toast("A recipe needs at least a title.");
      return;
    }
    if (existing) {
      state.recipes[state.recipes.indexOf(existing)] = recipe;
    } else {
      state.recipes.unshift(recipe);
      if (state.activeCollection) {
        var coll = findCollection(state.activeCollection);
        if (coll) coll.recipeIds.push(recipe.id);
      }
    }
    save();
    render();
    $("#editor-dialog").close();
  }

  /* ---------- import / export ---------- */

  function importText(text) {
    var parsed;
    try {
      parsed = Lib.parseImport(text);
    } catch (e) {
      toast("Import failed: " + e.message);
      return;
    }
    var merged = Lib.mergeImport(
      { recipes: state.recipes, collections: state.collections },
      parsed
    );
    state.recipes = merged.recipes;
    state.collections = merged.collections;
    save();
    render();
    toast(
      "Imported " + merged.added + " recipe" + (merged.added === 1 ? "" : "s") +
      (merged.skipped ? " (" + merged.skipped + " duplicate" + (merged.skipped === 1 ? "" : "s") + " skipped)" : "") + "."
    );
  }

  function importFiles(files) {
    Array.prototype.forEach.call(files, function (file) {
      var reader = new FileReader();
      reader.onload = function () { importText(reader.result); };
      reader.readAsText(file);
    });
  }

  function recipesForExport() {
    if (state.selectMode) {
      var picked = state.recipes.filter(function (r) { return state.selected[r.id]; });
      if (picked.length) return picked;
      toast("Nothing selected — exporting the current view instead.");
    }
    return visibleRecipes();
  }

  function exportJSON() {
    var recipes = recipesForExport();
    if (!recipes.length) return toast("No recipes to export.");
    var ids = {};
    recipes.forEach(function (r) { ids[r.id] = true; });
    var collections = state.collections
      .map(function (c) {
        return {
          id: c.id,
          name: c.name,
          recipeIds: c.recipeIds.filter(function (rid) { return ids[rid]; })
        };
      })
      .filter(function (c) { return c.recipeIds.length; });
    download("recipes-" + dateStamp() + ".json", Lib.toExportJSON(recipes, collections));
    toast("Exported " + recipes.length + " recipe" + (recipes.length === 1 ? "" : "s") + " as JSON.");
  }

  function exportMarkdown() {
    var recipes = recipesForExport();
    if (!recipes.length) return toast("No recipes to export.");
    download("recipes-" + dateStamp() + ".md", Lib.toMarkdown(recipes), "text/markdown");
    toast("Exported " + recipes.length + " recipe" + (recipes.length === 1 ? "" : "s") + " as Markdown.");
  }

  function dateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  /* ---------- events ---------- */

  function bind() {
    $("#search").addEventListener("input", function () {
      state.query = this.value.trim();
      renderGrid();
    });

    $("#sidebar").addEventListener("click", function (e) {
      var nav = e.target.closest("[data-coll]");
      if (nav) {
        state.activeCollection = nav.dataset.coll || null;
        render();
        return;
      }
      var tag = e.target.closest("[data-tag]");
      if (tag) {
        state.activeTag = state.activeTag === tag.dataset.tag ? null : tag.dataset.tag;
        render();
      }
    });

    $("#btn-new-collection").addEventListener("click", function () {
      var name = prompt("Collection name:");
      if (!name || !name.trim()) return;
      var coll = { id: Lib.uid(), name: name.trim(), recipeIds: [] };
      state.collections.push(coll);
      state.activeCollection = coll.id;
      save();
      render();
    });

    $("#btn-delete-collection").addEventListener("click", function () {
      var coll = findCollection(state.activeCollection);
      if (!coll) return;
      if (!confirm('Delete collection "' + coll.name + '"? Recipes themselves are kept.')) return;
      state.collections = state.collections.filter(function (c) { return c !== coll; });
      state.activeCollection = null;
      save();
      render();
    });

    $("#btn-add").addEventListener("click", function () { openEditor(null); });

    $("#btn-select").addEventListener("click", function () {
      state.selectMode = !state.selectMode;
      if (!state.selectMode) state.selected = {};
      render();
    });

    $("#recipe-grid").addEventListener("click", function (e) {
      var check = e.target.closest(".card-check");
      if (check) {
        state.selected[check.dataset.id] = check.checked;
        renderToolbar();
        return;
      }
      var card = e.target.closest(".card");
      if (!card) return;
      if (state.selectMode) {
        var box = $(".card-check", card);
        box.checked = !box.checked;
        state.selected[box.dataset.id] = box.checked;
        renderToolbar();
      } else {
        openDetail(card.dataset.id);
      }
    });

    /* detail dialog actions */
    $("#detail-dialog").addEventListener("click", function (e) {
      var id = $("#detail-dialog").dataset.id;
      if (e.target.id === "btn-cook") {
        $("#detail-dialog").close();
        openCookMode(id);
      } else if (e.target.id === "btn-edit") {
        $("#detail-dialog").close();
        openEditor(id);
      } else if (e.target.id === "btn-collect") {
        addToCollection(id);
      } else if (e.target.id === "btn-delete") {
        var r = findRecipe(id);
        if (r && confirm('Delete "' + r.title + '"?')) {
          state.recipes = state.recipes.filter(function (x) { return x.id !== id; });
          state.collections.forEach(function (c) {
            c.recipeIds = c.recipeIds.filter(function (rid) { return rid !== id; });
          });
          save();
          render();
          $("#detail-dialog").close();
        }
      } else if (e.target.id === "btn-close-detail") {
        $("#detail-dialog").close();
      }
    });

    function addToCollection(id) {
      if (!state.collections.length) {
        toast("Create a collection first (sidebar → New collection).");
        return;
      }
      var names = state.collections
        .map(function (c, i) { return i + 1 + ". " + c.name; })
        .join("\n");
      var pick = prompt("Add to which collection?\n" + names, "1");
      var idx = parseInt(pick, 10) - 1;
      var coll = state.collections[idx];
      if (!coll) return;
      if (coll.recipeIds.indexOf(id) === -1) coll.recipeIds.push(id);
      save();
      render();
      toast('Added to "' + coll.name + '".');
    }

    /* cook mode */
    $("#cook-prev").addEventListener("click", function () {
      if (cook.step > 0) {
        cook.step--;
        renderCookStep();
      }
    });
    $("#cook-next").addEventListener("click", function () {
      if (cook.step < cook.recipe.steps.length - 1) {
        cook.step++;
        renderCookStep();
      } else {
        closeCookMode();
      }
    });
    $("#cook-close").addEventListener("click", closeCookMode);

    /* editor */
    $("#editor-form").addEventListener("submit", function (e) {
      e.preventDefault();
      saveEditor();
    });
    $("#btn-cancel-edit").addEventListener("click", function () {
      $("#editor-dialog").close();
    });

    /* import / export */
    $("#btn-import").addEventListener("click", function () {
      $("#import-dialog").showModal();
    });
    $("#import-file").addEventListener("change", function () {
      if (this.files.length) {
        importFiles(this.files);
        this.value = "";
        $("#import-dialog").close();
      }
    });
    $("#btn-import-paste").addEventListener("click", function () {
      var text = $("#import-text").value.trim();
      if (!text) return;
      importText(text);
      $("#import-text").value = "";
      $("#import-dialog").close();
    });
    $("#btn-close-import").addEventListener("click", function () {
      $("#import-dialog").close();
    });
    $("#btn-export-json").addEventListener("click", exportJSON);
    $("#btn-export-md").addEventListener("click", exportMarkdown);

    /* drag & drop import anywhere on the page */
    document.addEventListener("dragover", function (e) { e.preventDefault(); });
    document.addEventListener("drop", function (e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files.length) {
        importFiles(e.dataTransfer.files);
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !$("#cook-overlay").hidden) closeCookMode();
    });
  }

  load();
  bind();
  render();
})();
