import { computeGraphMetrics } from "@/lib/workflows/graph-metrics";
import {
  CORE_NODE_CLASS_TYPES,
  CONTROLNET_PATTERNS,
  LORA_LOADER_PATTERNS,
  MODEL_FAMILY_VRAM_GB,
  MODEL_LOADER_PATTERNS,
  UPSCALE_PATTERNS,
  VIDEO_PATTERNS,
  matchesAnyPattern,
  normalizeClassType,
} from "@/lib/workflows/classifier-rules";
import type { ParsedWorkflow } from "@/lib/workflows/parser";

export const ANALYSIS_VERSION = "1.0.0";

export type LookupRow = {
  id: string;
  code: string;
  label: string;
  min_score?: number;
  min_vram_gb?: number;
  sort_order?: number;
};

export type PurposeSignalRow = {
  pattern: string;
  weight: number;
  workflow_purposes: { code: string } | { code: string }[] | null;
};

export type NodeClassification = {
  node_key: string;
  class_type: string;
  is_custom: boolean;
  is_model_loader: boolean;
  is_lora: boolean;
  is_controlnet: boolean;
  is_video: boolean;
  is_upscale: boolean;
  model_family: string | null;
};

export type WorkflowAnalysisResult = {
  complexity_score: number;
  complexity_level_code: string;
  workflow_purpose_code: string;
  hardware_tier_code: string;
  node_count: number;
  custom_node_count: number;
  model_count: number;
  controlnet_count: number;
  lora_count: number;
  video_capable: boolean;
  graph_depth: number;
  branch_count: number;
  upscale_stage_count: number;
  analysis_version: string;
  analysis_metadata: Record<string, unknown>;
};

const COMPLEXITY_WEIGHTS = {
  node: 2.0,
  depth: 2.5,
  branch: 1.5,
  custom: 3.0,
  model: 2.0,
  controlnet: 2.5,
  lora: 1.0,
  video: 15.0,
} as const;

function detectModelFamily(normalized: string, inputs: Record<string, unknown>): string {
  const blob = JSON.stringify(inputs).toLowerCase() + normalized;
  if (blob.includes("flux")) return "flux";
  if (blob.includes("wan")) return "wan";
  if (blob.includes("hunyuan")) return "hunyuan";
  if (blob.includes("svd")) return "svd";
  if (blob.includes("sdxl") || normalized.includes("sdxl")) return "sdxl";
  if (blob.includes("sd15") || blob.includes("sd1.5")) return "sd15";
  return "default";
}

export function classifyNodes(
  parsed: ParsedWorkflow
): NodeClassification[] {
  return parsed.nodes.map((node) => {
    const normalized = normalizeClassType(node.class_type);
    const is_model_loader = matchesAnyPattern(normalized, MODEL_LOADER_PATTERNS);
    const is_lora = matchesAnyPattern(normalized, LORA_LOADER_PATTERNS);
    const is_controlnet = matchesAnyPattern(normalized, CONTROLNET_PATTERNS);
    const is_video = matchesAnyPattern(normalized, VIDEO_PATTERNS);
    const is_upscale = matchesAnyPattern(normalized, UPSCALE_PATTERNS);
    const is_custom =
      !CORE_NODE_CLASS_TYPES.has(normalized) &&
      !is_model_loader &&
      !is_lora &&
      !is_controlnet;

    return {
      node_key: node.node_key,
      class_type: node.class_type,
      is_custom,
      is_model_loader,
      is_lora,
      is_controlnet,
      is_video,
      is_upscale,
      model_family: is_model_loader
        ? detectModelFamily(normalized, node.inputs)
        : null,
    };
  });
}

export function scorePurposes(
  classifications: NodeClassification[],
  signals: PurposeSignalRow[]
): Record<string, number> {
  const scores: Record<string, number> = {};

  for (const c of classifications) {
    const haystack = normalizeClassType(c.class_type);
    for (const signal of signals) {
      const pattern = signal.pattern.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!pattern || !haystack.includes(pattern)) continue;
      const purpose = signal.workflow_purposes;
      const code = Array.isArray(purpose)
        ? purpose[0]?.code
        : purpose?.code;
      if (!code) continue;
      scores[code] = (scores[code] ?? 0) + Number(signal.weight);
    }
  }

  return scores;
}

export function pickPurposeCode(
  purposeScores: Record<string, number>
): string {
  let best = "unknown";
  let bestScore = 0;
  for (const [code, score] of Object.entries(purposeScores)) {
    if (code === "unknown") continue;
    if (score > bestScore) {
      bestScore = score;
      best = code;
    }
  }
  return bestScore > 0 ? best : "unknown";
}

export function computeComplexityScore(params: {
  node_count: number;
  graph_depth: number;
  branch_count: number;
  custom_node_count: number;
  model_count: number;
  controlnet_count: number;
  lora_count: number;
  video_capable: boolean;
}): { score: number; breakdown: Record<string, number> } {
  const breakdown = {
    nodes: COMPLEXITY_WEIGHTS.node * Math.min(params.node_count / 5, 20),
    depth: COMPLEXITY_WEIGHTS.depth * params.graph_depth * 3,
    branches: COMPLEXITY_WEIGHTS.branch * Math.min(params.branch_count, 10),
    custom: COMPLEXITY_WEIGHTS.custom * params.custom_node_count * 4,
    models: COMPLEXITY_WEIGHTS.model * params.model_count * 2,
    controlnet: COMPLEXITY_WEIGHTS.controlnet * params.controlnet_count * 3,
    lora: COMPLEXITY_WEIGHTS.lora * params.lora_count * 1.5,
    video: params.video_capable ? COMPLEXITY_WEIGHTS.video : 0,
  };

  const raw = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const score = Math.min(100, Math.round(raw * 100) / 100);
  return { score, breakdown };
}

export function mapComplexityLevel(
  score: number,
  levels: LookupRow[]
): string {
  const sorted = [...levels].sort(
    (a, b) => (b.min_score ?? 0) - (a.min_score ?? 0)
  );
  for (const level of sorted) {
    if (score >= (level.min_score ?? 0)) return level.code;
  }
  return sorted[sorted.length - 1]?.code ?? "simple";
}

export function estimateHardwareVram(params: {
  model_families: string[];
  model_count: number;
  controlnet_count: number;
  lora_count: number;
  video_capable: boolean;
  upscale_stage_count: number;
  graph_depth: number;
}): { vram_gb: number; breakdown: Record<string, number> } {
  let base = MODEL_FAMILY_VRAM_GB.default;
  for (const family of params.model_families) {
    const gb = MODEL_FAMILY_VRAM_GB[family] ?? MODEL_FAMILY_VRAM_GB.default;
    base = Math.max(base, gb);
  }

  const breakdown = {
    base,
    controlnet: params.controlnet_count * 2,
    lora: params.lora_count * 0.5,
    video: params.video_capable ? 8 : 0,
    upscale: params.upscale_stage_count * 4,
    graph: params.graph_depth * 0.5,
    extra_models: Math.max(0, params.model_count - 1) * 2,
  };

  const vram_gb = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { vram_gb, breakdown };
}

export function mapHardwareTier(
  vramGb: number,
  tiers: LookupRow[]
): string {
  const sorted = [...tiers].sort(
    (a, b) => (b.min_vram_gb ?? 0) - (a.min_vram_gb ?? 0)
  );
  for (const tier of sorted) {
    if (vramGb >= (tier.min_vram_gb ?? 0)) return tier.code;
  }
  return sorted[sorted.length - 1]?.code ?? "tier_8gb";
}

export function analyzeWorkflow(
  parsed: ParsedWorkflow,
  lookups: {
    complexityLevels: LookupRow[];
    hardwareTiers: LookupRow[];
    purposeSignals: PurposeSignalRow[];
  }
): WorkflowAnalysisResult {
  const classifications = classifyNodes(parsed);
  const nodeKeys = parsed.nodes.map((n) => n.node_key);
  const graph = computeGraphMetrics(nodeKeys, parsed.edges);

  const custom_node_count = classifications.filter((c) => c.is_custom).length;
  const model_count = classifications.filter((c) => c.is_model_loader).length;
  const controlnet_count = classifications.filter((c) => c.is_controlnet).length;
  const lora_count = classifications.filter((c) => c.is_lora).length;
  const video_capable = classifications.some((c) => c.is_video);
  const upscale_stage_count = classifications.filter((c) => c.is_upscale).length;

  const model_families = [
    ...new Set(
      classifications
        .map((c) => c.model_family)
        .filter((f): f is string => Boolean(f))
    ),
  ];

  const purposeScores = scorePurposes(classifications, lookups.purposeSignals);
  const workflow_purpose_code = pickPurposeCode(purposeScores);

  const { score: complexity_score, breakdown: complexity_breakdown } =
    computeComplexityScore({
      node_count: parsed.node_count,
      graph_depth: graph.graph_depth,
      branch_count: graph.branch_count,
      custom_node_count,
      model_count,
      controlnet_count,
      lora_count,
      video_capable,
    });

  const complexity_level_code = mapComplexityLevel(
    complexity_score,
    lookups.complexityLevels
  );

  const { vram_gb, breakdown: hardware_breakdown } = estimateHardwareVram({
    model_families,
    model_count,
    controlnet_count,
    lora_count,
    video_capable,
    upscale_stage_count,
    graph_depth: graph.graph_depth,
  });

  const hardware_tier_code = mapHardwareTier(vram_gb, lookups.hardwareTiers);

  return {
    complexity_score,
    complexity_level_code,
    workflow_purpose_code,
    hardware_tier_code,
    node_count: parsed.node_count,
    custom_node_count,
    model_count,
    controlnet_count,
    lora_count,
    video_capable,
    graph_depth: graph.graph_depth,
    branch_count: graph.branch_count,
    upscale_stage_count,
    analysis_version: ANALYSIS_VERSION,
    analysis_metadata: {
      complexity_breakdown,
      hardware_breakdown,
      estimated_vram_gb: Math.round(vram_gb * 100) / 100,
      purpose_scores: purposeScores,
      graph: {
        edge_count: graph.edge_count,
      },
      node_classifications: classifications.map((c) => ({
        node_key: c.node_key,
        class_type: c.class_type,
        flags: {
          custom: c.is_custom,
          model: c.is_model_loader,
          lora: c.is_lora,
          controlnet: c.is_controlnet,
          video: c.is_video,
          upscale: c.is_upscale,
        },
        model_family: c.model_family,
      })),
      weights: COMPLEXITY_WEIGHTS,
    },
  };
}
