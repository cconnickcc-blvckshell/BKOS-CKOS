# Recipe inheritance and versioning

CKOS recipes are **domain-aware**, optionally linked to **canonical entities**, and support **parent/child inheritance** so variants (e.g. Facebook-safe poster) only store deltas.

## Data model

| Table | Purpose |
|-------|---------|
| `recipe_categories` | Lookup: poster, video, research, … (no TS enums) |
| `recipe_variant_types` | Lookup: base, facebook_safe, cinematic, … |
| `recipe_dependency_types` | Lookup: extends, requires, overrides, recommends |
| `recipes` | Extended with `parent_recipe_id`, `category_id`, `variant_type_id`, `recipe_slug`, JSONB schemas, etc. Legacy columns (`goal`, `steps`, `knowledge_record_ids`) are **unchanged**. |
| `recipe_steps` | Normalized steps per recipe |
| `recipe_versions` | Immutable snapshots on create/update |
| `recipe_dependencies` | Directed edges between recipes |
| `recipe_knowledge_links` | Recipe ↔ knowledge record |
| `recipe_workflow_links` | Recipe ↔ workflow |
| `recipe_failure_links` | Recipe ↔ failure (mitigation) |

Unique slug per domain: `(domain_id, recipe_slug)`.

## Inheritance rules

The resolver (`src/lib/recipes/inheritance.ts`) walks `parent_recipe_id` from **root → child** (cycle-safe).

| Field | Merge behavior |
|-------|----------------|
| `objective` / `goal` | Child replaces parent when set |
| `constraints`, `default_parameters`, `quality_checks`, `inputs_schema`, `output_schema` | **Deep merge**; child keys win |
| `safety_notes` | Child replaces parent when set |
| `recipe_steps` | Union by `step_number`; child step at same number **overrides** parent |

Resolved output is shown on `/recipes/[id]` with badges for **inherited**, **override**, and **local** steps.

## Versioning

Every `createRecipe` / `updateRecipe` / step change calls `snapshotRecipeVersion`, which appends a row to `recipe_versions` with:

- `steps_snapshot` — current `recipe_steps` rows
- `parameters_snapshot` — `default_parameters` at that time
- `quality_checks_snapshot` — `quality_checks` at that time
- `change_notes` — human-readable reason

Historical rows are never updated in place.

## Example flow (seed data)

1. **Base Poster Recipe** (`base_poster`) — root, poster category, base variant, full constraints and four steps.
2. **Facebook-Safe Poster Variant** (`facebook_safe_poster`) — child of base; overrides resolution/export constraints and adds step 3 “Compress for Meta”.
3. Detail page for the child shows merged constraints (e.g. inherited `color_profile` + child `platform`) and all resolved steps.

## UI

- `/recipes` — explorer
- `/recipes/new` — create root or child
- `/recipes/[id]` — resolved inheritance panel, edit form, local steps, links, version list

## Tests

```bash
npm run test:recipes
```

Offline tests cover ancestry walking, deep merge, step merge, and provenance for child overrides.

## Out of scope (Slice 4)

- Agents, scraping, decision engine
- Hardcoded category/variant enums in TypeScript (always load from DB)
