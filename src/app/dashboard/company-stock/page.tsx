"use client";

import { useEffect, useMemo, useState } from "react";
import { readStoredRole } from "@/app/lib/auth";
import { CompanyStockCategory, CompanyStockItem, STORAGE_COMPANY_STOCK } from "@/app/lib/company-stock";
import { readJson, writeJson } from "@/app/lib/storage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { hydrateStorageKeyFromFirebase, subscribeToSyncedStorageKey } from "@/app/lib/firebase-sync";
import { Pencil, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type InventoryActionMode = "received" | "issued" | "damaged";
type CompanyStockTab = "all" | CompanyStockCategory;

const COMPANY_CATEGORIES: Array<{ value: CompanyStockCategory; label: string }> = [
  { value: "linen", label: "Linen" },
  { value: "cutleries", label: "Cutleries" },
  { value: "cups-pots", label: "Cup & Pots" },
  { value: "glasses", label: "Glasses" },
  { value: "plates-bowls", label: "Plates & Bowls" },
  { value: "others", label: "Others" },
  { value: "staff-utensils", label: "Staff Utensils" },
  { value: "reception", label: "Reception" },
  { value: "lights", label: "Lights" },
];

function parseStockNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateBalance(openingStock: number, received: number, issued: number, damaged: number) {
  return Math.max(0, openingStock + received - issued - damaged);
}

function asStockText(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function asStockDate(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
}

function asCompanyStockCategory(value: unknown): CompanyStockCategory {
  return COMPANY_CATEGORIES.some((entry) => entry.value === value) ? (value as CompanyStockCategory) : "others";
}

function normalizeCompanyStockItems(value: unknown): CompanyStockItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Partial<CompanyStockItem> => typeof item === "object" && item !== null)
    .map((item, index) => ({
      id: asStockText(item.id) || `company-stock-${index}-${asStockDate(item.createdAt)}`,
      name: asStockText(item.name) || "Unnamed Item",
      openingStock: asStockText(item.openingStock),
      received: asStockText(item.received),
      issued: asStockText(item.issued),
      damaged: asStockText(item.damaged),
      damageReason: asStockText(item.damageReason),
      balance: asStockText(item.balance),
      category: asCompanyStockCategory(item.category),
      createdAt: asStockDate(item.createdAt),
    }));
}

function matchesCompanyStockSearch(item: CompanyStockItem, searchTerm: string) {
  const tokens = searchTerm.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack = [
    item.name,
    item.category,
    item.openingStock,
    item.received,
    item.issued,
    item.damaged,
    item.damageReason,
    item.balance,
    new Date(item.createdAt).toLocaleDateString(),
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(" ")
    .toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

export default function CompanyStockPage() {
  const { confirm, dialog } = useConfirmDialog();
  const [role, setRole] = useState<string | null>(null);
  const [items, setItems] = useState<CompanyStockItem[]>([]);
  const [tab, setTab] = useState<CompanyStockTab>("all");
  const [name, setName] = useState("");
  const [openingStock, setOpeningStock] = useState("");
  const [received, setReceived] = useState("");
  const [issued, setIssued] = useState("");
  const [damaged, setDamaged] = useState("");
  const [balance, setBalance] = useState("");
  const [category, setCategory] = useState<CompanyStockCategory>("linen");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [inventoryMode, setInventoryMode] = useState<InventoryActionMode>("received");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [movementQty, setMovementQty] = useState("");
  const [damageReason, setDamageReason] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const isDirector = role === "director";
  const isInventoryRole = role === "inventory";
  const canEditFullSheet = role !== null && !isDirector && !isInventoryRole;
  const canEditInventoryMovement = role !== null && !isDirector && isInventoryRole;

  useEffect(() => {
    setRole(readStoredRole());
  }, []);

  useEffect(() => {
    const applyCompanyStockSnapshot = () => {
      setItems(normalizeCompanyStockItems(readJson<CompanyStockItem[]>(STORAGE_COMPANY_STOCK)));
    };

    applyCompanyStockSnapshot();
    void hydrateStorageKeyFromFirebase(STORAGE_COMPANY_STOCK).finally(applyCompanyStockSnapshot);
    const unsubscribeCompanyStock = subscribeToSyncedStorageKey(STORAGE_COMPANY_STOCK, applyCompanyStockSnapshot);

    return () => unsubscribeCompanyStock();
  }, []);

  const searchedItems = useMemo(
    () => items.filter((item) => matchesCompanyStockSearch(item, searchTerm)),
    [items, searchTerm],
  );
  const filteredItems = useMemo(
    () => (tab === "all" ? searchedItems : searchedItems.filter((item) => item.category === tab)),
    [searchedItems, tab],
  );

  const resetForm = () => {
    setEditingItemId(null);
    setName("");
    setOpeningStock("");
    setReceived("");
    setIssued("");
    setDamaged("");
    setBalance("");
    setCategory("linen");
    setSelectedItemId("");
    setMovementQty("");
    setDamageReason("");
  };

  const startEdit = (item: CompanyStockItem) => {
    if (isInventoryRole) {
      setSelectedItemId(item.id);
      setCategory(item.category);
      setTab(item.category);
      return;
    }
    setEditingItemId(item.id);
    setName(item.name);
    setOpeningStock(item.openingStock);
    setReceived(item.received);
    setIssued(item.issued);
    setDamaged(item.damaged);
    setDamageReason(item.damageReason ?? "");
    setBalance(item.balance);
    setCategory(item.category);
  };

  const saveInventoryAction = async () => {
    if (isDirector || !isInventoryRole) return;

    const qty = Number(movementQty);
    if (Number.isNaN(qty) || qty <= 0) return;

    const selectedItem = items.find((item) => item.id === selectedItemId);
    if (inventoryMode !== "received" && !selectedItem) return;
    if (inventoryMode === "damaged" && damageReason.trim().length === 0) return;
    if (inventoryMode === "received" && !selectedItem && name.trim().length === 0) return;

    const approved = await confirm({
      title: "Update Company Stock",
      description:
        inventoryMode === "received"
          ? `Are you sure you want to receive ${qty} ${selectedItem ? `for ${selectedItem.name}` : `of ${name.trim()}`}?`
          : inventoryMode === "issued"
            ? `Are you sure you want to issue ${qty} from ${selectedItem?.name}?`
            : `Are you sure you want to record ${qty} damaged for ${selectedItem?.name}?`,
      actionLabel: "Save",
    });
    if (!approved) return;

    let nextItems = items;

    if (inventoryMode === "received" && !selectedItem) {
      const newItem: CompanyStockItem = {
        id: `cs-${Date.now()}`,
        name: name.trim(),
        openingStock: "0",
        received: String(qty),
        issued: "0",
        damaged: "0",
        damageReason: "",
        balance: String(qty),
        category,
        createdAt: Date.now(),
      };
      nextItems = [newItem, ...items];
    } else if (selectedItem) {
      nextItems = items.map((item) => {
        if (item.id !== selectedItem.id) return item;

        const currentReceived = parseStockNumber(item.received);
        const currentIssued = parseStockNumber(item.issued);
        const currentDamaged = parseStockNumber(item.damaged);
        const currentBalance = parseStockNumber(item.balance);

        if ((inventoryMode === "issued" || inventoryMode === "damaged") && qty > currentBalance) {
          toast({
            title: "Quantity exceeds balance",
            description: `${item.name} only has ${currentBalance} in balance.`,
            variant: "destructive",
          });
          return item;
        }

        if (inventoryMode === "received") {
          const nextReceived = currentReceived + qty;
          return {
            ...item,
            received: String(nextReceived),
            balance: String(calculateBalance(parseStockNumber(item.openingStock), nextReceived, currentIssued, currentDamaged)),
          };
        }

        if (inventoryMode === "issued") {
          const nextIssued = currentIssued + qty;
          return {
            ...item,
            issued: String(nextIssued),
            balance: String(calculateBalance(parseStockNumber(item.openingStock), currentReceived, nextIssued, currentDamaged)),
          };
        }

        const nextDamaged = currentDamaged + qty;
        return {
          ...item,
          damaged: String(nextDamaged),
          damageReason: damageReason.trim(),
          balance: String(calculateBalance(parseStockNumber(item.openingStock), currentReceived, currentIssued, nextDamaged)),
        };
      });
    }

    setItems(nextItems);
    writeJson(STORAGE_COMPANY_STOCK, nextItems);
    resetForm();
  };

  const saveItem = async () => {
    if (isDirector) return;
    if (name.trim().length === 0) return;

    const nextOpeningStock = parseStockNumber(openingStock);
    const nextReceived = parseStockNumber(received);
    const nextIssued = parseStockNumber(issued);
    const nextDamaged = parseStockNumber(damaged);
    const nextBalance = calculateBalance(nextOpeningStock, nextReceived, nextIssued, nextDamaged);

    const approved = await confirm({
      title: editingItemId ? "Update Company Stock" : "Add Company Stock",
      description: editingItemId
        ? `Are you sure you want to update ${name.trim()} in company stock?`
        : `Are you sure you want to add ${name.trim()} to company stock?`,
      actionLabel: editingItemId ? "Update Item" : "Add Item",
    });
    if (!approved) return;

    const nextItem: CompanyStockItem = {
      id: editingItemId ?? `cs-${Date.now()}`,
      name: name.trim(),
      openingStock: String(nextOpeningStock),
      received: String(nextReceived),
      issued: String(nextIssued),
      damaged: String(nextDamaged),
      damageReason: damageReason.trim(),
      balance: String(nextBalance),
      category,
      createdAt: editingItemId
        ? items.find((item) => item.id === editingItemId)?.createdAt ?? Date.now()
        : Date.now(),
    };

    const nextItems = editingItemId
      ? items.map((item) => (item.id === editingItemId ? nextItem : item))
      : [nextItem, ...items];

    setItems(nextItems);
    writeJson(STORAGE_COMPANY_STOCK, nextItems);
    resetForm();
  };

  return (
    <div className="space-y-6">
      {dialog}
      <header>
        <h1 className="text-3xl font-black tracking-tight uppercase">Company Stock</h1>
        <p className="text-muted-foreground text-sm uppercase font-bold tracking-wider">
          Enter and record company stock assets and supplies
        </p>
      </header>

      {isDirector && (
        <Card className="border-emerald-200 bg-emerald-50/60 shadow-none">
          <CardContent className="p-3 text-xs font-black uppercase tracking-widest text-emerald-700">
            Managing Director View: Company stock visibility only (read-only)
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm border-none bg-white">
        <CardHeader className="border-b">
          <CardTitle className="text-lg font-black uppercase tracking-tight">Asset Register</CardTitle>
          <CardDescription>Company stock sheet shared across the app and synced to the backend store</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search company stock by item, category, quantity, reason, or date"
              className="h-11 pl-10"
            />
          </div>

          {canEditFullSheet && (
            <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-7 gap-2">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Item Name" />
              <Input value={openingStock} onChange={(event) => setOpeningStock(event.target.value)} placeholder="Opening" />
              <Input value={received} onChange={(event) => setReceived(event.target.value)} placeholder="Received" />
              <Input value={issued} onChange={(event) => setIssued(event.target.value)} placeholder="Issued" />
              <Input value={damaged} onChange={(event) => setDamaged(event.target.value)} placeholder="Damaged" />
              <Input value={balance} onChange={(event) => setBalance(event.target.value)} placeholder="Balance" />
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={category}
                onChange={(event) => setCategory(event.target.value as CompanyStockCategory)}
              >
                {COMPANY_CATEGORIES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <Button className="h-10 font-black uppercase tracking-widest text-[10px]" onClick={saveItem}>
                {editingItemId ? "Update" : "Add"}
              </Button>
              {editingItemId && (
                <Button variant="outline" className="h-10 font-black uppercase tracking-widest text-[10px]" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          )}

          {canEditInventoryMovement && (
            <div className="space-y-4 rounded-xl border p-4">
              <Tabs value={inventoryMode} onValueChange={(value) => setInventoryMode(value as InventoryActionMode)}>
                <TabsList className="h-11">
                  <TabsTrigger value="received" className="font-black uppercase text-[10px] tracking-widest">Received</TabsTrigger>
                  <TabsTrigger value="issued" className="font-black uppercase text-[10px] tracking-widest">Issued</TabsTrigger>
                  <TabsTrigger value="damaged" className="font-black uppercase text-[10px] tracking-widest">Damages</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedItemId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setSelectedItemId(nextId);
                    const nextItem = items.find((item) => item.id === nextId);
                    if (nextItem) {
                      setCategory(nextItem.category);
                      setTab(nextItem.category);
                    }
                  }}
                >
                  <option value="">{inventoryMode === "received" ? "Select existing item (optional)" : "Select item"}</option>
                  {searchedItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.category})
                    </option>
                  ))}
                </select>
                {inventoryMode === "received" && !selectedItemId && (
                  <>
                    <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New item name" />
                    <select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={category}
                      onChange={(event) => setCategory(event.target.value as CompanyStockCategory)}
                    >
                      {COMPANY_CATEGORIES.map((entry) => (
                        <option key={entry.value} value={entry.value}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <Input type="number" min="1" value={movementQty} onChange={(event) => setMovementQty(event.target.value)} placeholder="Quantity" />
                {inventoryMode === "damaged" && (
                  <Input value={damageReason} onChange={(event) => setDamageReason(event.target.value)} placeholder="Damage reason" />
                )}
                <Button className="h-10 font-black uppercase tracking-widest text-[10px]" onClick={saveInventoryAction}>
                  Save {inventoryMode}
                </Button>
              </div>
            </div>
          )}

          <Tabs value={tab} onValueChange={(value) => setTab(value as CompanyStockTab)}>
            <TabsList className="h-auto flex-wrap">
              <TabsTrigger value="all" className="font-black uppercase text-[10px] tracking-widest">
                All Stock
              </TabsTrigger>
              {COMPANY_CATEGORIES.map((entry) => (
                <TabsTrigger key={entry.value} value={entry.value} className="font-black uppercase text-[10px] tracking-widest">
                  {entry.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Item Name</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Opening</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Received</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Issued</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Damaged</TableHead>
                {isInventoryRole && <TableHead className="font-black uppercase text-[10px] tracking-widest">Damage Reason</TableHead>}
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Balance</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Date Added</TableHead>
                {!isDirector && <TableHead className="font-black uppercase text-[10px] tracking-widest text-right">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-bold">{item.name}</TableCell>
                  <TableCell className="font-bold">{item.openingStock || "-"}</TableCell>
                  <TableCell className="font-bold">{item.received || "-"}</TableCell>
                  <TableCell className="font-bold">{item.issued || "-"}</TableCell>
                  <TableCell className="font-bold">{item.damaged || "-"}</TableCell>
                  {isInventoryRole && <TableCell className="font-bold">{item.damageReason || "-"}</TableCell>}
                  <TableCell className="font-bold">{item.balance || "-"}</TableCell>
                  <TableCell className="font-bold text-sm">{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                  {!isDirector && (
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => startEdit(item)}>
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filteredItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isDirector ? (isInventoryRole ? 8 : 7) : (isInventoryRole ? 9 : 8)} className="py-10 text-center font-black uppercase text-[10px] tracking-widest text-muted-foreground">
                    No company stock items in this view
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
