import { InventoryControlView } from "@/components/dashboard/inventory-control-view";

export default function StockMovementPage() {
  return <InventoryControlView initialTab="barista-stock" visibleTabs={["barista-stock"]} />;
}
