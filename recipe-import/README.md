# 🥘 Recipe Box

A lightweight, dependency-free recipe manager inspired by [Vinst](https://www.vinst.me/home):
organize recipes into collections, search and tag them, cook with a fullscreen
step-by-step view — and **import / export your whole recipe box in bulk**.

It is a static web app: open `index.html` (or serve the folder) and everything
runs in the browser. Recipes are stored in `localStorage`; nothing leaves your
device.

## Features

- **Recipe box** — add, edit, duplicate-safe import, delete; title, image,
  servings, prep/cook times, ingredients, steps, tags, notes, source URL.
- **Collections** — playlist-style groupings; a recipe can live in several.
- **Search & tags** — instant filtering by text, ingredient, or tag.
- **Cook mode** — fullscreen one-step-at-a-time view with a screen wake lock
  (where the browser supports it) and checkable ingredient list.
- **Bulk import** — file picker, paste box, or drag & drop anywhere. Accepts:
  - Recipe Box export files (`.json`)
  - any JSON array of recipes (`{"title": …, "ingredients": […], "steps": […]}`)
  - [schema.org Recipe](https://schema.org/Recipe) JSON-LD as published by most
    recipe websites (single object, arrays, or `@graph` documents; `HowToStep`
    and `HowToSection` instructions and ISO-8601 durations are handled).
  - Duplicates (same id or same title, case-insensitive) are skipped and
    reported; imported collections are merged by name.
- **Bulk export** — the whole box, the current collection/filter, or a manual
  selection (via *Select*), as:
  - **JSON** — full-fidelity, re-importable backup including collections.
  - **Markdown** — a readable cookbook file for printing or sharing.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell and dialogs |
| `app.js` | UI logic (DOM, state, persistence) |
| `lib.js` | Pure import/export/normalization logic (browser + Node) |
| `styles.css` | Styling |
| `sample-recipes.json` | Starter data, also a bulk-import format example |
| `test-lib.js` | Node smoke tests: `node test-lib.js` |

## Running

```sh
cd recipe-import
python3 -m http.server 8000   # or any static server
# open http://localhost:8000
```

Run the data-layer tests with:

```sh
node test-lib.js
```
