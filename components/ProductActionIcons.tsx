"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const MENU_WIDTH = 176; // px, matches w-44
const MENU_HEIGHT_ESTIMATE = 140;

type MenuPosition = { top: number; left: number };

// Only the two links (Doan/ML) stay as always-visible icon buttons — the
// rest live behind a "⋮" menu, rendered through a portal into <body> with
// fixed positioning. The table row sits inside an overflow-x-auto wrapper
// (which per the CSS spec forces overflow-y to auto too) plus a
// overflow-hidden glass-card, so an absolutely-positioned menu nested
// inside the row got clipped instead of floating free — a portal escapes
// both ancestors entirely, so the menu always renders in full regardless
// of scroll position or which row it's on.
export default function ProductActionIcons({
  sku,
  ean,
  onEdit,
  onHistory,
  onDelete,
}: ProductActionIconsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function computePosition(): MenuPosition {
    const rect = triggerRef.current!.getBoundingClientRect();
    const openUpward = rect.bottom + MENU_HEIGHT_ESTIMATE > window.innerHeight;
    return {
      top: openUpward ? rect.top - MENU_HEIGHT_ESTIMATE : rect.bottom + 4,
      left: Math.max(8, rect.right - MENU_WIDTH),
    };
  }

  function toggleMenu() {
    if (!menuOpen) setMenuPos(computePosition());
    setMenuOpen((prev) => !prev);
  }

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(e: MouseEvent) {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    // Any scroll (including inside the table's own overflow-x-auto wrapper)
    // would leave the fixed-position menu floating over the wrong row, so
    // just close it — matches how most native dropdowns behave on scroll.
    function handleScroll() {
      setMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [menuOpen]);

  function runAndClose(action: () => void) {
    setMenuOpen(false);
    action();
  }

  return (
    <div className="inline-flex items-center gap-1.5">
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
        ref={triggerRef}
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

      {menuOpen &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
            className="fixed z-50 overflow-hidden rounded-xl border border-white/10 bg-[#1a1a1a] shadow-2xl"
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
          </div>,
          document.body
        )}
    </div>
  );
}
