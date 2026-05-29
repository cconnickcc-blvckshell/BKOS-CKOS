# Knowledge gap detection (Phase 2 Slice 7)

Identifies **evidence-backed** weaknesses in CKOS coverage for campaigns, entities, and linked records.

## Principles

- **Evidence required** — every `knowledge_gaps` row has `knowledge_gap_evidence` entries.
- **Database-driven** — statuses, severities, and types are lookup tables (no TS enums).
- **Detection sources** — `manual`, `system`, or `campaign`.
- **No auto-fix** — gaps inform curation; they do not fetch, normalize, or publish automatically.

## Campaign analysis

On **Analyze gaps** for a curation campaign, CKOS evaluates:

| Condition | Gap type |
|-----------|----------|
| Target entity has no knowledge records | `missing_entity` |
| Knowledge without failure links | `missing_failure_modes` |
| No recipes for entity/topic | `missing_recipe` |
| No workflows for entity | `missing_workflow` |
| Records without citations / source version | `missing_citations` |
| Confidence below threshold (default 0.5) | `weak_confidence` |
| Source version older than freshness days (default 180) | `stale_source` |
| No campaign URLs | `missing_entity` (status `source_needed`) |
| Extraction without normalization job | `missing_citations` (status `normalization_needed`) |

Configure thresholds in campaign `inclusion_rules` or `metadata`:

```json
{ "confidence_threshold": 0.5, "freshness_days": 180 }
```

## Resolution workflow

Gap statuses: `open` → `investigating` → `source_needed` / `normalization_needed` → `resolved` or `dismissed`.

Update on `/gaps/[id]` with resolution notes.

## Tables

| Table | Purpose |
|-------|---------|
| `gap_statuses` | Workflow states |
| `gap_severity_levels` | low → critical |
| `gap_types` | Taxonomy of gap kinds |
| `knowledge_gaps` | Gap records |
| `knowledge_gap_evidence` | Required proof |
| `campaign_gap_links` | Campaign ↔ gap |
| `entity_gap_links` | Entity ↔ gap |

## UI

- `/gaps` — dashboard
- `/gaps/[id]` — detail, evidence, resolution
- `/curation/[id]` — Analyze gaps + campaign gaps panel
- `/entities/[id]` — Analyze gaps + entity gaps panel

## Tests

```bash
npm run test:knowledge-gaps
```

## Out of scope

- Autonomous URL discovery or crawling
- Auto-publishing or auto-normalization
