"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const pathname = usePathname();

  const tabs = [
    { href: "/", label: "Inventario" },
    { href: "/invoices", label: "Facturas" },
    { href: "/add", label: "Agregar" },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0f0f0f]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="shrink-0">
          <span className="text-lg font-semibold tracking-tight">
            <span className="text-[#E0457B]">SADONA</span>{" "}
            <span className="text-white/90">Inventory</span>
          </span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
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
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
