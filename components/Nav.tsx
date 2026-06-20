"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function CameraIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

export default function Nav() {
  const pathname = usePathname();

  const tabs = [
    { href: "/", label: "Inventario" },
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
            const active = pathname === tab.href;
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

          <Link
            href="/scan"
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:px-4 ${
              pathname === "/scan"
                ? "bg-[#E0457B] text-white shadow-lg shadow-[#E0457B]/25"
                : "bg-[#E0457B] text-white hover:bg-[#c93a6a] shadow-lg shadow-[#E0457B]/20"
            }`}
          >
            <CameraIcon />
            <span>Scanner</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
