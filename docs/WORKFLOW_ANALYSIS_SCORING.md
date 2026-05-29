# CKOS Workflow Analysis — Scoring Methodology

**Version:** `1.0.0` (stored in `workflow_analysis.analysis_version`)

Workflow intelligence is **deterministic**: the same JSON + database lookup rows always produce the same analysis. No LLM or agent calls.

---

## Pipeline

1. **Parse** ComfyUI workflow JSON (API prompt format or UI `nodes` + `links`).
2. **Extract edges** from node `inputs` link arrays and/or `links` table.
3. **Classify nodes** using pattern rules in `src/lib/workflows/classifier-rules.ts`.
4. **Compute graph metrics** — depth, branch count (`src/lib/workflows/graph-metrics.ts`).
5. **Score purpose** using weighted matches from `workflow_purpose_signals` (database rows).
6. **Score complexity** using weighted formula → map to `complexity_levels.min_score`.
7. **Estimate VRAM** → map to `hardware_tiers.min_vram_gb`.
8. **Persist** `workflow_edges`, `workflow_analysis` (current row), refresh `workflow_nodes`.

---

## Edge extraction

| Format | Source |
|--------|--------|
| API / prompt | Each input value `[node_id, slot]` → edge `from → to` |
| UI export | `links` array entries `[id, from, fromSlot, to, toSlot, type]` |

---

## Node classification (heuristics)

| Signal | Detection |
|--------|-----------|
| Model loader | `class_type` matches checkpoint/UNET/CLIP loader patterns |
| LoRA | `loraloader`, `powerloraloader`, … |
| ControlNet | `controlnet`, `acn_`, … |
| Video | `video`, `wan`, `framepack`, `animatediff`, `svd`, `hunyuan`, `ltxv`, `mochi`, … |
| Upscale | `upscale`, `esrgan`, `ultimatesdupscale`, … |
| Custom | Not in core node set and not classified as model/lora/controlnet |

Model family (for VRAM): inferred from class name + inputs (`flux`, `wan`, `sdxl`, `sd15`, …).

---

## Graph metrics

- **graph_depth:** Longest path in the directed graph (DFS from source nodes; sources = in-degree 0).
- **branch_count:** Nodes with out-degree > 1.

---

## Complexity score (0–100)

| Component | Formula | Weight |
|-----------|---------|--------|
| Nodes | `min(node_count / 5, 20)` | × 2.0 |
| Depth | `graph_depth × 3` | × 2.5 |
| Branches | `min(branch_count, 10)` | × 1.5 |
| Custom nodes | `custom_node_count × 4` | × 3.0 |
| Models | `model_count × 2` | × 2.0 |
| ControlNets | `controlnet_count × 3` | × 2.5 |
| LoRAs | `lora_count × 1.5` | × 1.0 |
| Video | `15` if video_capable | × 1.0 |

Sum components, cap at **100**. Map to level:

```
complexity_level = max level where score >= complexity_levels.min_score
```

Levels (DB seed): `simple` (0), `intermediate` (25), `advanced` (50), `expert` (75).

Full breakdown stored in `analysis_metadata.complexity_breakdown`.

---

## Purpose inference

For each node `class_type` (normalized), add `workflow_purpose_signals.weight` when pattern is contained in class name.

Highest score wins (excluding `unknown`). Ties favor higher weight accumulation order.

Scores stored in `analysis_metadata.purpose_scores`.

Purpose labels come from `workflow_purposes` rows only.

---

## Hardware VRAM estimate

| Component | GB |
|-----------|-----|
| Base model family | max(flux=12, sd15=6, sdxl=10, wan=24, hunyuan=24, svd=16, default=8) |
| Per ControlNet | +2 |
| Per LoRA | +0.5 |
| Video capable | +8 |
| Per upscale stage | +4 |
| Graph depth | +0.5 × depth |
| Extra models | +2 × (model_count − 1) |

Map to tier:

```
hardware_tier = max tier where estimated_vram >= hardware_tiers.min_vram_gb
```

Breakdown in `analysis_metadata.hardware_breakdown` and `estimated_vram_gb`.

---

## Metadata JSONB

`workflow_analysis.analysis_metadata` includes:

- `complexity_breakdown`
- `hardware_breakdown`
- `estimated_vram_gb`
- `purpose_scores`
- `graph.edge_count`
- `node_classifications[]`
- `weights` (complexity constants snapshot)

---

## Validation

```bash
npm run test:workflows    # offline unit tests
npm run test:entities     # entity resolver tests (slice 1)
```

After migrations:

```sql
SELECT complexity_score, workflow_purposes.code, complexity_levels.code
FROM workflow_analysis wa
JOIN workflow_purposes ON workflow_purposes.id = wa.workflow_purpose_id
JOIN complexity_levels ON complexity_levels.id = wa.complexity_level_id
WHERE wa.is_current = true;
```
