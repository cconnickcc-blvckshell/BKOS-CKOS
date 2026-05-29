export type ParsedWorkflowNode = {
  node_key: string;
  class_type: string;
  node_type: string | null;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
};

export type WorkflowEdge = {
  from_node_key: string;
  to_node_key: string;
  input_slot: string | null;
};

export type ParsedWorkflow = {
  nodes: ParsedWorkflowNode[];
  edges: WorkflowEdge[];
  node_count: number;
};

function isNodeLink(value: unknown): value is [string | number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    (typeof value[0] === "string" || typeof value[0] === "number")
  );
}

function extractEdgesFromInputs(
  nodes: ParsedWorkflowNode[]
): WorkflowEdge[] {
  const edges: WorkflowEdge[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    for (const [slot, value] of Object.entries(node.inputs)) {
      if (!isNodeLink(value)) continue;
      const fromKey = String(value[0]);
      const dedupe = `${fromKey}->${node.node_key}:${slot}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      edges.push({
        from_node_key: fromKey,
        to_node_key: node.node_key,
        input_slot: slot,
      });
    }
  }
  return edges;
}

function extractEdgesFromLinksArray(
  workflowJson: Record<string, unknown>
): WorkflowEdge[] {
  const links = workflowJson.links;
  if (!Array.isArray(links)) return [];

  const edges: WorkflowEdge[] = [];
  const nodeIdMap = new Map<number, string>();

  if (Array.isArray(workflowJson.nodes)) {
    for (const n of workflowJson.nodes as Record<string, unknown>[]) {
      const id = n.id;
      if (typeof id === "number") {
        nodeIdMap.set(id, String(id));
      }
    }
  }

  for (const link of links) {
    if (!Array.isArray(link) || link.length < 5) continue;
    const fromNode = link[1];
    const toNode = link[3];
    const toSlot = link[4];
    if (typeof fromNode !== "number" || typeof toNode !== "number") continue;
    edges.push({
      from_node_key: String(fromNode),
      to_node_key: String(toNode),
      input_slot: typeof toSlot === "string" ? toSlot : String(toSlot ?? ""),
    });
  }
  return edges;
}

/** Extract nodes and edges from ComfyUI workflow JSON (API or UI format). */
export function parseComfyWorkflow(
  workflowJson: Record<string, unknown>
): ParsedWorkflow {
  const nodes: ParsedWorkflowNode[] = [];

  if (workflowJson.nodes && Array.isArray(workflowJson.nodes)) {
    for (const node of workflowJson.nodes as Record<string, unknown>[]) {
      const id = String(node.id ?? node.node_key ?? "");
      nodes.push({
        node_key: id,
        class_type: String(node.type ?? node.class_type ?? "Unknown"),
        node_type: node.mode ? String(node.mode) : null,
        inputs: (node.inputs as Record<string, unknown>) ?? {},
        outputs: (node.outputs as Record<string, unknown>) ?? {},
      });
    }
    const inputEdges = extractEdgesFromInputs(nodes);
    const linkEdges = extractEdgesFromLinksArray(workflowJson);
    const edges = mergeEdges(inputEdges, linkEdges);
    return { nodes, edges, node_count: nodes.length };
  }

  for (const [key, value] of Object.entries(workflowJson)) {
    if (typeof value !== "object" || value === null) continue;
    const node = value as Record<string, unknown>;
    if (!node.class_type) continue;
    nodes.push({
      node_key: key,
      class_type: String(node.class_type),
      node_type: node._meta ? "meta" : null,
      inputs: (node.inputs as Record<string, unknown>) ?? {},
      outputs: {},
    });
  }

  const edges = extractEdgesFromInputs(nodes);
  return { nodes, edges, node_count: nodes.length };
}

function mergeEdges(a: WorkflowEdge[], b: WorkflowEdge[]): WorkflowEdge[] {
  const seen = new Set<string>();
  const out: WorkflowEdge[] = [];
  for (const e of [...a, ...b]) {
    const key = `${e.from_node_key}->${e.to_node_key}:${e.input_slot ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
