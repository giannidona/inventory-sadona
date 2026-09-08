import { Suspense } from "react";
import InventoryDashboard from "@/components/InventoryDashboard";

export default function OutOfStockPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-center text-white/50">Cargando...</div>
      }
    >
      <InventoryDashboard title="Sin stock" lockToOutOfStock />
    </Suspense>
  );
}
