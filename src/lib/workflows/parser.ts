export type ParsedWorkflowNode = {
  node_key: string;
  class_type: string;
  node_type: string | null;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
};

export type ParsedWorkflow = {
  nodes: ParsedWorkflowNode[];
  node_count: number;
};

/** Extract nodes from ComfyUI workflow JSON (API format). */
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
    return { nodes, node_count: nodes.length };
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

  return { nodes, node_count: nodes.length };
}
