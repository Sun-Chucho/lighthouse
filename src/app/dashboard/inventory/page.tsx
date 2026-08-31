import { InventoryControlView } from "@/components/dashboard/inventory-control-view";

export default function InventoryPage() {
  return <InventoryControlView initialTab="kitchen-stock" visibleTabs={["kitchen-stock", "barista-stock"]} />;
}
