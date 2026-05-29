"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { GraphLink, GraphNode } from "@/types/database";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

export function KnowledgeGraphView({
  nodes,
  links,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setDimensions({
        width: entry.contentRect.width,
        height: Math.max(400, entry.contentRect.height),
      });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (nodes.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        No relationships yet. Link knowledge records to populate the graph.
      </div>
    );
  }

  const graphData = {
    nodes: nodes.map((n) => ({ ...n, val: 3 })),
    links: links.map((l) => ({ ...l })),
  };

  return (
    <div
      ref={containerRef}
      className="h-[min(70vh,600px)] w-full overflow-hidden rounded-lg border border-border bg-background/50"
    >
      <ForceGraph2D
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeLabel="label"
        nodeColor={(node) => {
          const colors: Record<string, string> = {
            node: "#22d3ee",
            model: "#a78bfa",
            workflow: "#34d399",
            failure: "#f87171",
            performance: "#fbbf24",
            technique: "#fb923c",
          };
          return colors[(node as GraphNode).type] ?? "#94a3b8";
        }}
        linkLabel="type"
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        backgroundColor="transparent"
      />
    </div>
  );
}
