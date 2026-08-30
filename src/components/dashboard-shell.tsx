import {
  ArrowRight,
  BarChart3,
  BedDouble,
  Bell,
  BookOpen,
  Boxes,
  Building2,
  ChefHat,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  Cloud,
  CloudOff,
  ConciergeBell,
  CreditCard,
  DoorOpen,
  FileClock,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  UserRoundSearch,
  Users,
  Wine,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "../context/auth-context";
import { useSync } from "../context/sync-context";
import { formatPrice, ROOM_CATEGORIES, ROOMS, type RoomCategory } from "../data/rooms";
import { AppLink, navigateTo } from "../lib/navigation";
import {
  getRoleHomePath,
  getRoleLoginPath,
  ROLE_CONFIG,
  STAFF_PORTAL_PATH,
  type StaffRole,
} from "../types/roles";

type ModuleId =
  | "dashboard"
  | "rooms"
  | "bookings"
  | "guests"
  | "payments"
  | "inventory"
  | "movements"
  | "suppliers"
  | "orders"
  | "menu"
  | "staff"
  | "reports"
  | "settings";

type NavigationItem = {
  id: ModuleId;
  label: string;
  icon: LucideIcon;
};

const ROLE_NAVIGATION: Record<StaffRole, NavigationItem[]> = {
  manager: [
    { id: "dashboard", label: "Overview", icon: LayoutDashboard },
    { id: "rooms", label: "Rooms", icon: BedDouble },
    { id: "bookings", label: "Bookings", icon: ClipboardList },
    { id: "inventory", label: "Inventory", icon: Boxes },
    { id: "staff", label: "Staff & access", icon: Users },
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "settings", label: "Settings", icon: Settings },
  ],
  director: [
    { id: "dashboard", label: "Executive overview", icon: LayoutDashboard },
    { id: "rooms", label: "Rooms", icon: BedDouble },
    { id: "bookings", label: "Bookings", icon: ClipboardList },
    { id: "reports", label: "Reports", icon: BarChart3 },
    { id: "settings", label: "Settings", icon: Settings },
  ],
  reception: [
    { id: "dashboard", label: "Front desk", icon: LayoutDashboard },
    { id: "rooms", label: "Rooms", icon: BedDouble },
    { id: "bookings", label: "Bookings", icon: ClipboardList },
    { id: "guests", label: "Guests", icon: UserRoundSearch },
    { id: "payments", label: "Payments", icon: CreditCard },
  ],
  inventory: [
    { id: "dashboard", label: "Stock overview", icon: LayoutDashboard },
    { id: "inventory", label: "Inventory", icon: Boxes },
    { id: "movements", label: "Stock movements", icon: FileClock },
    { id: "suppliers", label: "Suppliers", icon: Truck },
  ],
  kitchen: [
    { id: "dashboard", label: "Kitchen overview", icon: LayoutDashboard },
    { id: "orders", label: "Orders", icon: ChefHat },
    { id: "menu", label: "Menu", icon: BookOpen },
    { id: "inventory", label: "Kitchen stock", icon: Boxes },
  ],
  bar: [
    { id: "dashboard", label: "Bar overview", icon: LayoutDashboard },
    { id: "orders", label: "Orders & POS", icon: Wine },
    { id: "menu", label: "Drinks menu", icon: BookOpen },
    { id: "inventory", label: "Bar stock", icon: Boxes },
  ],
};

const MODULE_COPY: Partial<Record<ModuleId, { eyebrow: string; title: string; description: string; noun: string }>> = {
  bookings: {
    eyebrow: "Reception operations",
    title: "Bookings",
    description: "The booking workspace is restored and ready for the new Lighthouse reservation workflow.",
    noun: "bookings",
  },
  guests: {
    eyebrow: "Guest management",
    title: "Guests",
    description: "Guest profiles and stay history will appear here after the new data model is approved.",
    noun: "guest records",
  },
  payments: {
    eyebrow: "Reception controls",
    title: "Payments",
    description: "Payment collection is intentionally inactive until the Lighthouse transaction workflow is designed.",
    noun: "payments",
  },
  inventory: {
    eyebrow: "Stock control",
    title: "Inventory",
    description: "A clean inventory workspace for the new Lighthouse store, kitchen, and bar catalogue.",
    noun: "inventory items",
  },
  movements: {
    eyebrow: "Stock control",
    title: "Stock movements",
    description: "Receipts, transfers, adjustments, and usage will be recorded here after inventory setup.",
    noun: "stock movements",
  },
  suppliers: {
    eyebrow: "Procurement",
    title: "Suppliers",
    description: "Supplier records are ready to be added as part of the Lighthouse inventory phase.",
    noun: "suppliers",
  },
  orders: {
    eyebrow: "Service operations",
    title: "Orders",
    description: "The order workspace is restored without importing any old kitchen, bar, or POS tickets.",
    noun: "orders",
  },
  menu: {
    eyebrow: "Catalogue setup",
    title: "Menu",
    description: "Menu structure is ready. New Lighthouse food and drink items will be added in the next phase.",
    noun: "menu items",
  },
  staff: {
    eyebrow: "Access management",
    title: "Staff & access",
    description: "Firebase staff accounts and role claims will be managed here without legacy credentials.",
    noun: "staff profiles",
  },
  reports: {
    eyebrow: "Management insight",
    title: "Reports",
    description: "Reports will begin with clean Lighthouse activity after operational collections are connected.",
    noun: "reporting records",
  },
  settings: {
    eyebrow: "System configuration",
    title: "Settings",
    description: "Lighthouse project, roles, routes, and room catalogue are configured. Operational settings come next.",
    noun: "custom settings",
  },
};

function moduleHref(role: StaffRole, moduleId: ModuleId) {
  const base = getRoleLoginPath(role);
  return moduleId === "dashboard" ? `${base}/dashboard` : `${base}/${moduleId}`;
}

export function isModuleAvailable(role: StaffRole, moduleId: string): moduleId is ModuleId {
  return ROLE_NAVIGATION[role].some((item) => item.id === moduleId);
}

export function DashboardShell({ role, moduleId }: { role: StaffRole; moduleId: ModuleId }) {
  const { session, signOut } = useAuth();
  const { pendingCount, status: syncStatus } = useSync();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const config = ROLE_CONFIG[role];
  const navigation = ROLE_NAVIGATION[role];
  const activeItem = navigation.find((item) => item.id === moduleId) ?? navigation[0];

  const handleLogout = async () => {
    await signOut();
    navigateTo(STAFF_PORTAL_PATH, { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavigationOpen ? "sidebar--open" : ""}`}>
        <AppLink href={getRoleHomePath(role)} className="brand" onClick={() => setMobileNavigationOpen(false)}>
          <div className="brand__logo-wrap">
            <img className="brand__logo" src="/logo.jpeg" alt="Lighthouse Lodge" width={84} height={84} />
          </div>
          <div>
            <p className="brand__name">Lighthouse</p>
            <p className="brand__descriptor">Lodge</p>
          </div>
        </AppLink>

        <button className="sidebar__close" type="button" aria-label="Close navigation" onClick={() => setMobileNavigationOpen(false)}>
          <X size={20} />
        </button>

        <div className="sidebar__rule" />
        <p className="sidebar__eyebrow">{config.shortLabel} workspace</p>

        <nav className="navigation" aria-label={`${config.label} navigation`}>
          {navigation.map((item) => {
            const Icon = item.icon;
            const selected = activeItem.id === item.id;
            return (
              <AppLink
                key={item.id}
                href={moduleHref(role, item.id)}
                className={`navigation__item ${selected ? "navigation__item--active" : ""}`}
                aria-current={selected ? "page" : undefined}
                onClick={() => setMobileNavigationOpen(false)}
              >
                <Icon size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
                {selected ? <span className="navigation__marker" /> : null}
              </AppLink>
            );
          })}
        </nav>

        <div className="sidebar__spacer" />

        <div className="system-card">
          <span className="system-card__icon"><ShieldCheck size={17} /></span>
          <div>
            <p>Secure session</p>
            <span>{config.shortLabel} role verified</span>
          </div>
        </div>

        <div className="sidebar-session">
          <span className="sidebar-session__avatar">{config.initials}</span>
          <span><strong>{session?.displayName || config.shortLabel}</strong><small>{session?.email}</small></span>
        </div>
        <button className="sidebar-logout" type="button" onClick={() => void handleLogout()}>
          <LogOut size={16} /> Exit session
        </button>
      </aside>

      {mobileNavigationOpen ? (
        <button className="sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileNavigationOpen(false)} />
      ) : null}

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" type="button" aria-label="Open navigation" onClick={() => setMobileNavigationOpen(true)}>
            <Menu size={21} />
          </button>
          <div>
            <p className="topbar__title">{activeItem.label}</p>
            <p className="topbar__subtitle">{config.label} · Lighthouse Lodge</p>
          </div>
          <div className={`topbar__status ${syncStatus === "offline" ? "topbar__status--offline" : ""}`}>
            {syncStatus === "offline" ? <CloudOff size={15} /> : <Cloud size={15} />}
            <span>{syncStatus === "syncing" ? "Synchronizing data" : syncStatus === "offline" ? `${pendingCount} waiting · offline` : "Online · data synced"}</span>
          </div>
          <button className="topbar-alert" type="button" aria-label="Notifications"><Bell size={17} /><span>0</span></button>
          <div className="profile-mark" aria-label={`${config.label} profile`}>{config.initials}</div>
        </header>

        {moduleId === "dashboard" ? <Overview role={role} navigation={navigation} /> : null}
        {moduleId === "rooms" ? <RoomsModule /> : null}
        {moduleId !== "dashboard" && moduleId !== "rooms" ? <EmptyModule role={role} moduleId={moduleId} /> : null}
      </main>
    </div>
  );
}

function Overview({ role, navigation }: { role: StaffRole; navigation: NavigationItem[] }) {
  const config = ROLE_CONFIG[role];
  const metrics = getMetrics(role);

  return (
    <div className="page-content dashboard-page">
      <section className="dashboard-intro">
        <div>
          <p className="kicker">{config.shortLabel} command centre</p>
          <h1>{role === "reception" ? "Front desk overview." : `${config.shortLabel} overview.`}</h1>
          <p>A clean operational workspace with the original role structure restored for Lighthouse.</p>
        </div>
        <span className="dashboard-intro__badge"><ShieldCheck size={15} /> Role access active</span>
      </section>

      <section className="metric-grid" aria-label="System summary">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className="metric-card" key={metric.label}>
              <span className="metric-card__icon"><Icon size={19} /></span>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <small>{metric.note}</small>
            </article>
          );
        })}
      </section>

      <div className="dashboard-columns">
        <section className="dashboard-panel">
          <div className="dashboard-panel__heading">
            <div><p className="kicker">Workspace</p><h2>Available modules</h2></div>
            <span>{navigation.length} routes</span>
          </div>
          <div className="module-grid">
            {navigation.filter((item) => item.id !== "dashboard").map((item) => {
              const Icon = item.icon;
              return (
                <AppLink className="module-card" href={moduleHref(role, item.id)} key={item.id}>
                  <span><Icon size={20} /></span>
                  <div><strong>{item.label}</strong><small>{moduleHref(role, item.id)}</small></div>
                  <ChevronRight size={17} />
                </AppLink>
              );
            })}
          </div>
        </section>

        <aside className="dashboard-panel system-readiness">
          <div className="dashboard-panel__heading">
            <div><p className="kicker">Foundation</p><h2>System readiness</h2></div>
          </div>
          <div className="readiness-list">
            <div><span className="readiness-dot readiness-dot--ready" /><p><strong>Role routes</strong><small>Restored and protected</small></p></div>
            <div><span className="readiness-dot readiness-dot--ready" /><p><strong>Firebase Auth</strong><small>Client and claims wired</small></p></div>
            <div><span className="readiness-dot readiness-dot--ready" /><p><strong>Cloud Firestore</strong><small>Persistent offline sync active</small></p></div>
            <div><span className="readiness-dot" /><p><strong>Operational records</strong><small>Clean slate · 0 imported</small></p></div>
          </div>
        </aside>
      </div>

      {(role === "manager" || role === "director" || role === "reception") ? (
        <section className="room-category-summary">
          <div>
            <p className="kicker">Room catalogue</p>
            <h2>Twenty configured rooms</h2>
            <p>Room definitions are ready; occupancy and bookings remain empty.</p>
          </div>
          {Object.entries(ROOM_CATEGORIES).map(([key, category]) => (
            <AppLink href={moduleHref(role, "rooms")} className="room-category-summary__item" key={key}>
              <span>{category.rooms.length}</span>
              <div><strong>{category.label}</strong><small>TZS {formatPrice(category.price)} per night</small></div>
              <ArrowRight size={17} />
            </AppLink>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function getMetrics(role: StaffRole): Array<{ label: string; value: string; note: string; icon: LucideIcon }> {
  if (role === "inventory") {
    return [
      { label: "Inventory items", value: "0", note: "New catalogue pending", icon: Boxes },
      { label: "Low stock", value: "0", note: "No thresholds set", icon: PackageSearch },
      { label: "Movements", value: "0", note: "No imported history", icon: FileClock },
      { label: "Suppliers", value: "0", note: "Ready to configure", icon: Truck },
    ];
  }
  if (role === "kitchen" || role === "bar") {
    return [
      { label: "Open orders", value: "0", note: "Clean queue", icon: ClipboardList },
      { label: "Menu items", value: "0", note: "Next integration phase", icon: BookOpen },
      { label: "Stock items", value: "0", note: "Inventory not loaded", icon: Boxes },
      { label: "Today's sales", value: "TZS 0", note: "No transactions", icon: CreditCard },
    ];
  }
  if (role === "reception") {
    return [
      { label: "Configured rooms", value: "20", note: "10 Luxury · 10 Classic", icon: BedDouble },
      { label: "Active bookings", value: "0", note: "No imported reservations", icon: ClipboardList },
      { label: "Guests in house", value: "0", note: "Clean guest register", icon: CircleUserRound },
      { label: "Payments today", value: "TZS 0", note: "No transactions", icon: CreditCard },
    ];
  }

  return [
    { label: "Configured rooms", value: "20", note: "10 Luxury · 10 Classic", icon: BedDouble },
    { label: "Active bookings", value: "0", note: "No imported reservations", icon: ClipboardList },
    { label: "Staff portals", value: "5", note: "Director access is direct-only", icon: Users },
    { label: "Operational data", value: "0", note: "Clean Lighthouse start", icon: Building2 },
  ];
}

function RoomsModule() {
  const [filter, setFilter] = useState<"all" | RoomCategory>("all");
  const [query, setQuery] = useState("");
  const filteredRooms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return ROOMS.filter((room) => {
      const matchesFilter = filter === "all" || room.category === filter;
      const matchesQuery = !normalizedQuery || room.number.toString().includes(normalizedQuery) || room.label.toLowerCase().includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [filter, query]);

  return (
    <div className="page-content">
      <section className="welcome-row rooms-page__intro">
        <div><p className="kicker">Room catalogue</p><h1>Room directory.</h1><p className="welcome-row__copy">The definitive Lighthouse room list. All rooms begin without occupancy or booking records.</p></div>
        <div className="room-total"><span>20</span><p>rooms configured</p></div>
      </section>
      <div className="room-toolbar">
        <div className="filter-tabs" aria-label="Filter rooms">
          {(["all", "luxury", "classic"] as const).map((value) => (
            <button className={`filter-tab ${filter === value ? "filter-tab--active" : ""}`} type="button" key={value} onClick={() => setFilter(value)}>
              {value === "all" ? "All rooms" : ROOM_CATEGORIES[value].label}
              <span>{value === "all" ? ROOMS.length : ROOM_CATEGORIES[value].rooms.length}</span>
            </button>
          ))}
        </div>
        <label className="room-search"><Search size={16} /><span className="sr-only">Search rooms</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search room number or category" /></label>
      </div>
      <div className="room-table-card">
        <div className="room-table__header"><span>Room</span><span>Category</span><span>Nightly rate</span><span>Current state</span></div>
        {filteredRooms.map((room) => (
          <div className="room-row" key={room.number}>
            <div className="room-row__room"><span className="room-row__icon"><DoorOpen size={18} /></span><div><strong>{room.number}</strong><small>Lighthouse Lodge</small></div></div>
            <div><span className={`room-type room-type--${room.category}`}>{room.label}</span></div>
            <div className="room-row__price"><strong>TZS {formatPrice(room.price)}</strong><small>per night</small></div>
            <div className="connection-state"><span /> No stay record</div>
          </div>
        ))}
        {filteredRooms.length === 0 ? <div className="room-empty"><Search size={25} /><h2>No rooms found</h2><p>Try another room number or category.</p></div> : null}
      </div>
      <p className="room-table__caption">Room catalogue only · occupancy data has not been created</p>
    </div>
  );
}

function EmptyModule({ role, moduleId }: { role: StaffRole; moduleId: Exclude<ModuleId, "dashboard" | "rooms"> }) {
  const copy = MODULE_COPY[moduleId] ?? MODULE_COPY.settings!;
  const Icon = ROLE_NAVIGATION[role].find((item) => item.id === moduleId)?.icon ?? Settings;

  return (
    <div className="page-content module-page">
      <section className="module-page__heading">
        <span><Icon size={25} /></span>
        <div><p className="kicker">{copy.eyebrow}</p><h1>{copy.title}.</h1><p>{copy.description}</p></div>
      </section>
      <section className="empty-workspace">
        <span className="empty-workspace__icon"><Icon size={30} /></span>
        <p className="kicker">Clean workspace</p>
        <h2>No {copy.noun} yet.</h2>
        <p>Nothing from the previous system was carried into this module. It will begin with data created specifically for Lighthouse.</p>
        <div className="empty-workspace__status">
          <span><i className="readiness-dot readiness-dot--ready" /> Route available</span>
          <span><i className="readiness-dot" /> Legacy records excluded</span>
          <span><i className="readiness-dot readiness-dot--pending" /> Database collection pending</span>
        </div>
      </section>
    </div>
  );
}
