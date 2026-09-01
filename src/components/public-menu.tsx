"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, ChevronLeft, Minus, Plus, Send, ShoppingBag, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { MenuDepartment, PublicMenuItem } from "@/app/lib/menu-orders";
import styles from "@/app/menu/menu.module.css";

type CartLine = { item: PublicMenuItem; qty: number };
type MenuResponse = { kitchen?: PublicMenuItem[]; bar?: PublicMenuItem[]; error?: string };

const formatPrice = (price: number) => `TSh ${price.toLocaleString()}`;

export function PublicMenu() {
  const [department, setDepartment] = useState<MenuDepartment>("bar");
  const [menu, setMenu] = useState<Record<MenuDepartment, PublicMenuItem[]>>({ bar: [], kitchen: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [destination, setDestination] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public-menu", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as MenuResponse;
        if (!response.ok) throw new Error(data.error || "The menu could not be loaded.");
        if (!cancelled) setMenu({ bar: data.bar || [], kitchen: data.kitchen || [] });
      })
      .catch((error) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "The menu could not be loaded."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setCategory("all");
    setCart((current) => current.filter((line) => line.item.department === department));
    setFeedback(null);
  }, [department]);

  const categories = useMemo(() => ["all", ...Array.from(new Set(menu[department].map((entry) => entry.category)))], [department, menu]);
  const visibleItems = category === "all" ? menu[department] : menu[department].filter((entry) => entry.category === category);
  const cartCount = cart.reduce((sum, line) => sum + line.qty, 0);
  const cartTotal = cart.reduce((sum, line) => sum + line.item.price * line.qty, 0);

  const addItem = (item: PublicMenuItem) => {
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      return existing
        ? current.map((line) => line.item.id === item.id ? { ...line, qty: Math.min(20, line.qty + 1) } : line)
        : [...current, { item, qty: 1 }];
    });
    setFeedback(null);
  };

  const updateQty = (itemId: string, change: number) => {
    setCart((current) => current
      .map((line) => line.item.id === itemId ? { ...line, qty: line.qty + change } : line)
      .filter((line) => line.qty > 0));
  };

  const submitOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (!cart.length || sending) return;
    setSending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/menu-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department,
          customerName,
          phone,
          destination,
          note,
          website,
          lines: cart.map((line) => ({ itemId: line.item.id, qty: line.qty })),
        }),
      });
      const data = await response.json() as { error?: string; reference?: string };
      if (!response.ok) throw new Error(data.error || "The order could not be sent.");
      setFeedback({ type: "success", message: `Order ${data.reference} was sent to the ${department === "bar" ? "bar" : "kitchen"}.` });
      setCart([]);
      setNote("");
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "The order could not be sent." });
    } finally {
      setSending(false);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Back to Lighthouse Lodge">
          <Image src="/logo-192.jpg" alt="Lighthouse Lodge" width={42} height={42} priority sizes="42px" />
          <span><strong>Lighthouse</strong><small>Lodge Menu</small></span>
        </Link>
        <Link href="/" className={styles.back}><ChevronLeft size={16} /> Lodge</Link>
      </header>

      <section className={styles.hero}>
        <p><Sparkles size={15} /> Made fresh at Lighthouse</p>
        <h1>Choose what<br />you feel like.</h1>
        <span>Browse live prices and send your request directly to our team.</span>
      </section>

      <nav className={styles.switcher} aria-label="Menu department">
        <button type="button" className={department === "bar" ? styles.active : ""} onClick={() => setDepartment("bar")}>Bar</button>
        <button type="button" className={department === "kitchen" ? styles.active : ""} onClick={() => setDepartment("kitchen")}>Kitchen</button>
      </nav>

      <section className={styles.menuSection}>
        <div className={styles.sectionHeader}>
          <div><p>{department === "bar" ? "Drinks" : "Food"}</p><h2>{department === "bar" ? "From the bar" : "From the kitchen"}</h2></div>
          <span>{menu[department].length} choices</span>
        </div>

        {categories.length > 1 && <div className={styles.categories}>
          {categories.map((entry) => <button type="button" key={entry} className={category === entry ? styles.selectedCategory : ""} onClick={() => setCategory(entry)}>{entry.replaceAll("-", " ")}</button>)}
        </div>}

        {loading ? <div className={styles.state}>Preparing the menu…</div> : loadError ? <div className={styles.state}>{loadError}</div> : visibleItems.length === 0 ? <div className={styles.state}>This menu is being updated. Please check again shortly.</div> : (
          <div className={styles.grid}>
            {visibleItems.map((item) => (
              <article className={styles.card} key={item.id}>
                <div><small>{item.category.replaceAll("-", " ")}</small><h3>{item.name}</h3>{item.description && <p>{item.description}</p>}</div>
                <footer><strong>{formatPrice(item.price)}</strong><button type="button" onClick={() => addItem(item)}>Order now <Plus size={16} /></button></footer>
              </article>
            ))}
          </div>
        )}
      </section>

      <button type="button" className={styles.cartButton} onClick={() => setCartOpen(true)} aria-label={`Open order with ${cartCount} items`}>
        <ShoppingBag size={20} /><span>{cartCount || "Order"}</span>{cartTotal > 0 && <strong>{formatPrice(cartTotal)}</strong>}
      </button>

      {cartOpen && <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
        <aside className={styles.cart} aria-label="Your order">
          <div className={styles.cartTitle}><div><small>Your request</small><h2>{department === "bar" ? "Bar order" : "Kitchen order"}</h2></div><button type="button" onClick={() => setCartOpen(false)} aria-label="Close order"><X /></button></div>
          <div className={styles.cartLines}>
            {cart.length === 0 ? <p className={styles.emptyCart}>Add something from the menu to begin.</p> : cart.map((line) => (
              <div className={styles.cartLine} key={line.item.id}>
                <div><strong>{line.item.name}</strong><small>{formatPrice(line.item.price * line.qty)}</small></div>
                <span><button type="button" onClick={() => updateQty(line.item.id, -1)}><Minus size={14} /></button>{line.qty}<button type="button" onClick={() => updateQty(line.item.id, 1)}><Plus size={14} /></button></span>
              </div>
            ))}
          </div>
          <form className={styles.form} onSubmit={submitOrder}>
            <input className={styles.honeypot} value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <label><span>Your name</span><input required minLength={2} maxLength={80} value={customerName} onChange={(event) => setCustomerName(event.target.value)} autoComplete="name" /></label>
            <label><span>Phone</span><input required minLength={7} maxLength={24} value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" autoComplete="tel" /></label>
            <label><span>Room, table or pickup</span><input required minLength={2} maxLength={80} value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Room 12, Table 4…" /></label>
            <label><span>Note <small>Optional</small></span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} rows={2} /></label>
            {feedback && <p className={feedback.type === "success" ? styles.success : styles.error}>{feedback.type === "success" && <Check size={16} />}{feedback.message}</p>}
            <div className={styles.total}><span>Total</span><strong>{formatPrice(cartTotal)}</strong></div>
            <button className={styles.send} type="submit" disabled={!cart.length || sending}>{sending ? "Sending…" : "Send order request"}<Send size={17} /></button>
          </form>
        </aside>
      </div>}
    </main>
  );
}
