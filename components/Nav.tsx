"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase/client";
import { loadLowStockThreshold, onLowStockThresholdChange } from "@/lib/low-stock";

const POLL_MS = 30000;

export default function Nav() {
  const pathname = usePathname();
  const [lowStockCount, setLowStockCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let threshold = loadLowStockThreshold();

    async function fetchCount() {
      const supabase = createBrowserClient();
      const { count, error } = await supabase
        .from("inventory")
        .select("id", { count: "exact", head: true })
        .lte("stock", threshold);

      if (!cancelled && !error) setLowStockCount(count ?? 0);
    }

    fetchCount();
    const interval = setInterval(fetchCount, POLL_MS);

    function onFocus() {
      fetchCount();
    }
    window.addEventListener("focus", onFocus);

    const unsubscribe = onLowStockThresholdChange((value) => {
      threshold = value;
      fetchCount();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
  }, []);

  const tabs = [
    { href: "/", label: "Inventario" },
    { href: "/invoices", label: "Facturas" },
    { href: "/price-changes", label: "Precios" },
    { href: "/notifications", label: "Notificaciones", badge: lowStockCount },
    { href: "/add", label: "Agregar" },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0f0f0f]/80 backdrop-blur-xl">
      <div className="page-container flex items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="shrink-0">
          <span className="text-lg font-semibold tracking-tight">
            <span className="text-[#E0457B]">SADONA</span>{" "}
            <span className="text-white/90">Inventory</span>
          </span>
        </Link>

        <div className="flex min-w-0 items-center gap-1 overflow-x-auto sm:gap-2">
          {tabs.map((tab) => {
            const active =
              tab.href === "/"
                ? pathname === "/"
                : pathname === tab.href ||
                  pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors sm:px-4 ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                {tab.label}
                {!!tab.badge && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E0457B] px-1 text-[10px] font-bold tabular-nums text-white">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
