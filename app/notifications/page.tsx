import { Suspense } from "react";
import InventoryDashboard from "@/components/InventoryDashboard";

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-center text-white/50">Cargando...</div>
      }
    >
      <InventoryDashboard title="Notificaciones" lockToLowStock />
    </Suspense>
  );
}
