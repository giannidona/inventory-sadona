"use client";

import { doanProductUrl, mercadoLibreSearchUrl } from "@/lib/marketplace-links";
import {
  ExternalLinkIcon,
  HistoryIcon,
  PencilIcon,
  ShoppingBagIcon,
  TrashIcon,
} from "@/components/icons";

type ProductActionIconsProps = {
  sku: string;
  onEdit: () => void;
  onHistory: () => void;
  onDelete: () => void;
};

const baseIconButton =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors";

// Fixed-size icon buttons instead of text pills: they never wrap or grow
// with the column width, so the action row stays compact and readable at
// any screen size (desktop table, tablet, or mobile cards).
export default function ProductActionIcons({
  sku,
  onEdit,
  onHistory,
  onDelete,
}: ProductActionIconsProps) {
  return (
    <div className="inline-grid grid-cols-3 gap-1.5">
      <a
        href={doanProductUrl(sku)}
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
        onClick={onHistory}
        title="Ver historial"
        aria-label="Ver historial"
        className={`${baseIconButton} border-white/10 text-white/60 hover:bg-white/5 hover:text-white`}
      >
        <HistoryIcon />
      </button>
      <button
        type="button"
        onClick={onEdit}
        title="Editar"
        aria-label="Editar"
        className={`${baseIconButton} border-white/10 text-white/60 hover:bg-white/5 hover:text-white`}
      >
        <PencilIcon />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title="Eliminar"
        aria-label="Eliminar"
        className={`${baseIconButton} border-red-500/20 text-red-400/80 hover:bg-red-500/10`}
      >
        <TrashIcon />
      </button>
    </div>
  );
}
