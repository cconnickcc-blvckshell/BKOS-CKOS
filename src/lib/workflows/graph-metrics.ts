import type { WorkflowEdge } from "@/lib/workflows/parser";

export type GraphMetrics = {
  graph_depth: number;
  branch_count: number;
  edge_count: number;
};

function buildAdjacency(
  nodeKeys: string[],
  edges: WorkflowEdge[]
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const key of nodeKeys) adj.set(key, []);
  for (const e of edges) {
    if (!adj.has(e.from_node_key)) adj.set(e.from_node_key, []);
    if (!adj.has(e.to_node_key)) adj.set(e.to_node_key, []);
    adj.get(e.from_node_key)!.push(e.to_node_key);
  }
  return adj;
}

/** Longest path in DAG (approximate for cyclic graphs via visited set per path). */
export function computeGraphMetrics(
  nodeKeys: string[],
  edges: WorkflowEdge[]
): GraphMetrics {
  if (nodeKeys.length === 0) {
    return { graph_depth: 0, branch_count: 0, edge_count: edges.length };
  }

  const adj = buildAdjacency(nodeKeys, edges);
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const key of nodeKeys) {
    inDegree.set(key, 0);
    outDegree.set(key, 0);
  }
  for (const e of edges) {
    inDegree.set(e.to_node_key, (inDegree.get(e.to_node_key) ?? 0) + 1);
    outDegree.set(e.from_node_key, (outDegree.get(e.from_node_key) ?? 0) + 1);
  }

  let branch_count = 0;
  for (const key of nodeKeys) {
    if ((outDegree.get(key) ?? 0) > 1) branch_count++;
  }

  const sources = nodeKeys.filter((k) => (inDegree.get(k) ?? 0) === 0);
  const startNodes = sources.length > 0 ? sources : nodeKeys;

  let maxDepth = 0;

  function dfs(node: string, depth: number, visiting: Set<string>) {
    if (visiting.has(node)) {
      maxDepth = Math.max(maxDepth, depth);
      return;
    }
    visiting.add(node);
    maxDepth = Math.max(maxDepth, depth);
    const next = adj.get(node) ?? [];
    if (next.length === 0) {
      visiting.delete(node);
      return;
    }
    for (const n of next) dfs(n, depth + 1, visiting);
    visiting.delete(node);
  }

  for (const start of startNodes) {
    dfs(start, 1, new Set());
  }

  if (edges.length === 0 && nodeKeys.length > 0) {
    maxDepth = 1;
  }

  return {
    graph_depth: maxDepth,
    branch_count,
    edge_count: edges.length,
  };
}
