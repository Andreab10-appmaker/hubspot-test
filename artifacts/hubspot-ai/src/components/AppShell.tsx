import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Building2,
  Users,
  Handshake,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/companies", label: "Aziende", icon: Building2 },
  { href: "/contacts", label: "Contatti", icon: Users },
  { href: "/deals", label: "Trattative", icon: Handshake },
  // Tab Insight temporaneamente disattivata su richiesta:
  // { href: "/insight", label: "Insight", icon: LineChart },
  { href: "/chat", label: "Assistente", icon: Sparkles },
];

function isActive(current: string, href: string): boolean {
  if (href === "/") return current === "/";
  return current === href || current.startsWith(href + "/");
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar — desktop & tablet */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 shrink-0"
            data-testid="link-home"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <span className="text-[15px] font-bold leading-none">H</span>
            </span>
            <span className="hidden sm:block">
              <span className="block text-[13px] font-bold leading-tight tracking-tight">
                HubSpot Workspace
              </span>
              <span className="flex items-center gap-1 text-[10.5px] font-medium leading-tight text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Sincronizzato con HubSpot
              </span>
            </span>
          </Link>

          {/* Desktop tabs */}
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = isActive(location, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`tab-${item.label.toLowerCase()}`}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.1} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-10">
        {children}
      </main>

      {/* Bottom nav — mobile-first */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl pb-safe md:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {NAV.map((item) => {
            const active = isActive(location, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`bottomtab-${item.label.toLowerCase()}`}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-semibold transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon
                  className="h-[22px] w-[22px]"
                  strokeWidth={active ? 2.4 : 2}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
