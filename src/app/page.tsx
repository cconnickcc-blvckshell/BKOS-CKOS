import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Network } from "lucide-react";

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
      <div className="relative z-10 max-w-2xl text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Blvckshell Knowledge OS
        </p>
        <h1 className="mt-4 font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          CKOS
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Comfy Knowledge Operating System — transform unstructured generation
          knowledge into structured, searchable, decision-ready intelligence.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" render={<Link href="/login" />}>
            Enter cockpit
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="outline" size="lg" render={<Link href="/signup" />}>
            Create account
          </Button>
        </div>
        <div className="mt-16 grid gap-4 text-left sm:grid-cols-3">
          {[
            {
              title: "Knowledge graph",
              desc: "First-class relationships between nodes, models, and techniques",
            },
            {
              title: "Workflow intelligence",
              desc: "Ingest and analyze ComfyUI workflow JSON at scale",
            },
            {
              title: "Semantic search",
              desc: "pgvector hybrid search across all knowledge entities",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-border/60 bg-card/40 p-4"
            >
              <Network className="mb-2 h-5 w-5 text-primary" />
              <h3 className="text-sm font-medium">{item.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
