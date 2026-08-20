"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  loadDismissedLowStock,
  loadLowStockThreshold,
  onDismissedLowStockChange,
  onLowStockThresholdChange,
} from "@/lib/low-stock";
import {
  BellIcon,
  GridIcon,
  InboxIcon,
  MenuIcon,
  PackageIcon,
  PlusCircleIcon,
  ReceiptIcon,
  SparklesIcon,
  TrendingUpIcon,
} from "@/components/icons";

const POLL_MS = 30000;

type NavLink = {
  href: string;
  label: string;
  icon: () => React.ReactNode;
  badge?: number | null;
};

const Logo = ({ onClick }: { onClick?: () => void }) => (
  <Link href="/" className="shrink-0" onClick={onClick}>
    <span className="text-lg font-semibold tracking-tight">
      <span className="text-[#E0457B]">SADONA</span>{" "}
      <span className="text-white/90">Inventory</span>
    </span>
  </Link>
);

export default function Sidebar() {
  const pathname = usePathname();
  const [lowStockCount, setLowStockCount] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Close the mobile drawer whenever the route changes (covers back/forward
  // navigation, not just link clicks) — adjusted during render instead of
  // an effect, per React's "you might not need an effect" pattern.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setMobileOpen(false);
  }

  useEffect(() => {
    let cancelled = false;
    let threshold = loadLowStockThreshold();

    async function fetchCount() {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from("inventory")
        .select("id, stock")
        .lte("stock", threshold);

      if (cancelled || error) return;

      const dismissed = loadDismissedLowStock();
      const visible = (data ?? []).filter(
        (item) => dismissed[item.id] !== item.stock
      );
      setLowStockCount(visible.length);
    }

    fetchCount();
    const interval = setInterval(fetchCount, POLL_MS);

    function onFocus() {
      fetchCount();
    }
    window.addEventListener("focus", onFocus);

    const unsubscribeThreshold = onLowStockThresholdChange((value) => {
      threshold = value;
      fetchCount();
    });
    const unsubscribeDismissed = onDismissedLowStockChange(fetchCount);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      unsubscribeThreshold();
      unsubscribeDismissed();
    };
  }, []);

  const links: NavLink[] = [
    { href: "/", label: "Inventario", icon: GridIcon },
    { href: "/invoices", label: "Facturas", icon: ReceiptIcon },
    {
      href: "/notifications",
      label: "Notificaciones",
      icon: BellIcon,
      badge: lowStockCount,
    },
    { href: "/new-products", label: "Productos nuevos", icon: SparklesIcon },
    { href: "/stock-arrivals", label: "Ingresos", icon: InboxIcon },
    { href: "/statistics", label: "Estadísticas", icon: TrendingUpIcon },
    { href: "/shipments", label: "Envíos", icon: PackageIcon },
    { href: "/add", label: "Agregar", icon: PlusCircleIcon },
  ];

  function isActive(href: string) {
    return href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);
  }

  function renderLinks(onNavigate?: () => void) {
    return (
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {links.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon />
              <span className="flex-1 truncate">{link.label}</span>
              {!!link.badge && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E0457B] px-1.5 text-[10px] font-bold tabular-nums text-white">
                  {link.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-white/10 bg-[#0f0f0f]/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/5 hover:text-white"
        >
          <MenuIcon />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col border-r border-white/10 bg-[#0f0f0f] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <Logo onClick={() => setMobileOpen(false)} />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Cerrar menú"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/5 hover:text-white"
              >
                ✕
              </button>
            </div>
            {renderLinks(() => setMobileOpen(false))}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/10 bg-[#0f0f0f]/80 backdrop-blur-xl lg:flex">
        <div className="border-b border-white/10 px-5 py-4">
          <Logo />
        </div>
        {renderLinks()}
      </aside>
    </>
  );
}
