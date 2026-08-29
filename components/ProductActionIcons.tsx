"use client";

import { useEffect, useRef, useState } from "react";
import { doanSearchUrl, mercadoLibreSearchUrl } from "@/lib/marketplace-links";
import {
  ExternalLinkIcon,
  HistoryIcon,
  MoreVerticalIcon,
  PencilIcon,
  ShoppingBagIcon,
  TrashIcon,
} from "@/components/icons";

type ProductActionIconsProps = {
  sku: string;
  ean?: string | null;
  onEdit: () => void;
  onHistory: () => void;
  onDelete: () => void;
};

const baseIconButton =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors";

// Only the two links (Doan/ML) stay as always-visible icon buttons — the
// rest live behind a "⋮" menu. Squeezing 5 fixed-size buttons into one
// table cell or mobile card made them nearly impossible to tap accurately
// on smaller screens, since a 3-col grid doesn't get any more room to
// breathe there than it does on a wide desktop.
export default function ProductActionIcons({
  sku,
  ean,
  onEdit,
  onHistory,
  onDelete,
}: ProductActionIconsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function toggleMenu() {
    if (!menuOpen && containerRef.current) {
      // Flip the menu above the button when there isn't room below — matters
      // most for rows near the bottom of the table, where the card's own
      // overflow-hidden would otherwise clip it.
      const rect = containerRef.current.getBoundingClientRect();
      const approxMenuHeight = 140;
      setOpenUpward(rect.bottom + approxMenuHeight > window.innerHeight);
    }
    setMenuOpen((prev) => !prev);
  }

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function runAndClose(action: () => void) {
    setMenuOpen(false);
    action();
  }

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-1.5">
      <a
        href={doanSearchUrl(ean || sku)}
        target="_blank"
        rel="noopener noreferrer"
        title="Ver en Doan"
        aria-label="Ver en Doan"
        className={`${baseIconButton} border-[#E0457B]/30 text-[#E0457B]/90 hover:bg-[#E0457B]/10`}
      >
        <ExternalLinkIcon />
      </a>
      <a
        href={mercadoLibreSearchUrl(sku)}
        target="_blank"
        rel="noopener noreferrer"
        title="Ver en MercadoLibre"
        aria-label="Ver en MercadoLibre"
        className={`${baseIconButton} border-yellow-400/30 text-yellow-400/90 hover:bg-yellow-400/10`}
      >
        <ShoppingBagIcon />
      </a>
      <button
        type="button"
        onClick={toggleMenu}
        title="Más acciones"
        aria-label="Más acciones"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={`${baseIconButton} ${
          menuOpen
            ? "border-white/20 bg-white/10 text-white"
            : "border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
        }`}
      >
        <MoreVerticalIcon />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className={`absolute right-0 z-20 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#1a1a1a] shadow-2xl ${
            openUpward ? "bottom-[calc(100%+4px)]" : "top-[calc(100%+4px)]"
          }`}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(onHistory)}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <HistoryIcon />
            Ver historial
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(onEdit)}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <PencilIcon />
            Editar
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(onDelete)}
            className="flex w-full items-center gap-2.5 border-t border-white/10 px-3 py-2.5 text-left text-sm text-red-400/90 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <TrashIcon />
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}
