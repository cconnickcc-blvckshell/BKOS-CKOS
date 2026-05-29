"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Boxes,
  Database,
  LayoutDashboard,
  Network,
  Search,
  AlertTriangle,
  ChefHat,
  Workflow,
  Brain,
  LogOut,
  Download,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/knowledge", label: "Knowledge Explorer", icon: BookOpen },
  { href: "/entities", label: "Canonical Entities", icon: Boxes },
  { href: "/sources", label: "Source Explorer", icon: Database },
  { href: "/acquisition", label: "Source Acquisition", icon: Download },
  { href: "/normalization", label: "Normalization Queue", icon: ListChecks },
  { href: "/embeddings", label: "Embedding Jobs", icon: Sparkles },
  { href: "/workflows", label: "Workflow Explorer", icon: Workflow },
  { href: "/failures", label: "Failure Explorer", icon: AlertTriangle },
  { href: "/recipes", label: "Recipe Explorer", icon: ChefHat },
  { href: "/search", label: "Semantic Search", icon: Search },
  { href: "/graph", label: "Relationship Graph", icon: Network },
  { href: "/decision", label: "Decision Engine", icon: Brain, disabled: true },
];

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-5 py-5">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Blvckshell
        </p>
        <h1 className="mt-1 font-heading text-lg font-semibold tracking-tight">
          CKOS
        </h1>
        <p className="text-xs text-muted-foreground">
          Comfy Knowledge Operating System
        </p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          if (item.disabled) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/50"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
                <span className="ml-auto text-[10px] uppercase">Phase 2</span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
