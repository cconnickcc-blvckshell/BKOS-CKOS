/**
 * Deterministic node classification patterns for workflow analysis.
 * These are matching heuristics — not taxonomy enums.
 * Purposes / complexity / hardware tiers are resolved from database rows.
 */

/** ComfyUI core nodes (subset). Nodes outside this set count as custom. */
export const CORE_NODE_CLASS_TYPES = new Set([
  "checkpointloadersimple",
  "checkpointloader",
  "unetloader",
  "cliploader",
  "dualcliploader",
  "vaeloader",
  "loadimage",
  "saveimage",
  "previewimage",
  "emptylatentimage",
  "ksampler",
  "ksampleradvanced",
  "cliptextencode",
  "vaedecode",
  "vaeencode",
  "vaedecodetiled",
  "latentupscale",
  "imagescale",
  "imageupscalewithmodel",
  "upscalemodelloader",
  "controlnetloader",
  "controlnetapply",
  "controlnetapplyadvanced",
  "loraloader",
  "loraloadermodelonly",
  "setlatentnoisemask",
  "inpaintmodelconditioning",
  "conditioningcombine",
  "conditioningsetarea",
  "fluxguidance",
  "modelssamplingflux",
  "nunchakufluxdiapatcher",
]);

export const MODEL_LOADER_PATTERNS = [
  "checkpointloader",
  "unetloader",
  "loaddiffusionmodel",
  "loadcheckpoint",
  "fluxloader",
  "dualcliploader",
  "cliploader",
];

export const LORA_LOADER_PATTERNS = ["loraloader", "powerloraloader", "lorastack"];

export const CONTROLNET_PATTERNS = [
  "controlnet",
  "control_net",
  "acn_",
  "applycontrolnet",
];

export const VIDEO_PATTERNS = [
  "video",
  "wan",
  "framepack",
  "animatediff",
  "svd",
  "hunyuan",
  "ltxv",
  "mochi",
  "videocombine",
  "vhs_",
  "sora",
];

export const UPSCALE_PATTERNS = [
  "upscale",
  "esrgan",
  "ultimatesdupscale",
  "upscalemodelloader",
  "imageupscalewithmodel",
];

/** Model family VRAM base estimates (GB) for hardware scoring */
export const MODEL_FAMILY_VRAM_GB: Record<string, number> = {
  flux: 12,
  sd15: 6,
  sdxl: 10,
  wan: 24,
  hunyuan: 24,
  svd: 16,
  default: 8,
};

export function normalizeClassType(classType: string): string {
  return classType.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function matchesAnyPattern(normalized: string, patterns: string[]): boolean {
  return patterns.some((p) => normalized.includes(p.replace(/[^a-z0-9]/g, "")));
}
