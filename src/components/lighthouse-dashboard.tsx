import {
  BedDouble,
  Building2,
  ChevronRight,
  CircleHelp,
  DoorOpen,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  formatPrice,
  ROOM_CATEGORIES,
  ROOMS,
  type RoomCategory,
} from "../data/rooms";

type View = "overview" | "rooms";
type RoomFilter = "all" | RoomCategory;

const navigation = [
  { id: "overview" as const, label: "Overview", icon: LayoutDashboard },
  { id: "rooms" as const, label: "Rooms", icon: BedDouble },
];

export function LighthouseDashboard() {
  const [activeView, setActiveView] = useState<View>(() =>
    window.location.hash === "#rooms" ? "rooms" : "overview",
  );
  const [roomFilter, setRoomFilter] = useState<RoomFilter>("all");
  const [query, setQuery] = useState("");
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  const filteredRooms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return ROOMS.filter((room) => {
      const matchesFilter = roomFilter === "all" || room.category === roomFilter;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        room.number.toString().includes(normalizedQuery) ||
        room.label.toLowerCase().includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [query, roomFilter]);

  const openView = (view: View) => {
    setActiveView(view);
    window.history.replaceState(
      null,
      "",
      view === "rooms" ? "#rooms" : `${window.location.pathname}${window.location.search}`,
    );
    setMobileNavigationOpen(false);
  };

  const openRoomCategory = (filter: RoomFilter) => {
    setRoomFilter(filter);
    setQuery("");
    setActiveView("rooms");
    window.history.replaceState(null, "", "#rooms");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavigationOpen ? "sidebar--open" : ""}`}>
        <div className="brand">
          <div className="brand__logo-wrap">
            <img
              className="brand__logo"
              src="/logo.jpeg"
              alt="Lighthouse Lodge"
              width={84}
              height={84}
            />
          </div>
          <div>
            <p className="brand__name">Lighthouse</p>
            <p className="brand__descriptor">Lodge</p>
          </div>
        </div>

        <button
          className="sidebar__close"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNavigationOpen(false)}
        >
          <X size={20} />
        </button>

        <div className="sidebar__rule" />
        <p className="sidebar__eyebrow">Management suite</p>

        <nav className="navigation" aria-label="Primary navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            const selected = activeView === item.id;

            return (
              <button
                key={item.id}
                className={`navigation__item ${selected ? "navigation__item--active" : ""}`}
                type="button"
                aria-current={selected ? "page" : undefined}
                onClick={() => openView(item.id)}
              >
                <Icon size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
                {selected ? <span className="navigation__marker" /> : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar__spacer" />

        <div className="system-card">
          <span className="system-card__icon"><Sparkles size={17} /></span>
          <div>
            <p>Clean foundation</p>
            <span>Frontend only</span>
          </div>
        </div>

        <div className="sidebar__utilities" aria-label="Secondary navigation">
          <span><Settings size={17} /> Configuration pending</span>
          <span><CircleHelp size={17} /> Lighthouse v0.1</span>
        </div>
      </aside>

      {mobileNavigationOpen ? (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNavigationOpen(false)}
        />
      ) : null}

      <main className="main-content">
        <header className="topbar">
          <button
            className="mobile-menu"
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileNavigationOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div>
            <p className="topbar__title">{activeView === "overview" ? "Overview" : "Room directory"}</p>
            <p className="topbar__subtitle">Lighthouse Lodge</p>
          </div>
          <div className="topbar__status">
            <span className="status-dot" />
            <span>Frontend ready</span>
          </div>
          <div className="profile-mark" aria-label="Lighthouse profile">LH</div>
        </header>

        {activeView === "overview" ? (
          <Overview onOpenRooms={openRoomCategory} />
        ) : (
          <RoomsView
            filteredRooms={filteredRooms}
            query={query}
            roomFilter={roomFilter}
            onQueryChange={setQuery}
            onFilterChange={setRoomFilter}
          />
        )}
      </main>
    </div>
  );
}

function Overview({ onOpenRooms }: { onOpenRooms: (filter: RoomFilter) => void }) {
  return (
    <div className="page-content">
      <section className="welcome-row">
        <div>
          <p className="kicker">A fresh start</p>
          <h1>Welcome to Lighthouse.</h1>
          <p className="welcome-row__copy">
            A clean operations foundation, ready for the next phase of your lodge system.
          </p>
        </div>
        <button className="primary-button" type="button" onClick={() => onOpenRooms("all")}>
          View room directory <ChevronRight size={18} />
        </button>
      </section>

      <section className="hero-panel">
        <img
          className="hero-panel__image"
          src="/images/lodge-exterior.jpg"
          alt="Lighthouse Lodge exterior"
        />
        <div className="hero-panel__shade" />
        <div className="hero-panel__content">
          <p className="hero-panel__eyebrow">Lighthouse room collection</p>
          <h2>Twenty rooms.<br />One clear view.</h2>
          <div className="hero-panel__metrics">
            <span><strong>20</strong> rooms configured</span>
            <span><strong>2</strong> room categories</span>
          </div>
        </div>
        <div className="hero-panel__monogram">LH</div>
      </section>

      <section className="section-heading">
        <div>
          <p className="kicker">Room catalogue</p>
          <h2>Configured categories</h2>
        </div>
        <button className="text-button" type="button" onClick={() => onOpenRooms("all")}>
          See all rooms <ChevronRight size={16} />
        </button>
      </section>

      <section className="category-grid">
        {(Object.entries(ROOM_CATEGORIES) as [RoomCategory, (typeof ROOM_CATEGORIES)[RoomCategory]][]).map(
          ([key, category], index) => (
            <article className="category-card" key={key}>
              <div className="category-card__image-wrap">
                <img
                  className="category-card__image"
                  src={category.image}
                  alt={`${category.label} room at Lighthouse Lodge`}
                  loading="lazy"
                />
                <span className="category-card__index">0{index + 1}</span>
              </div>
              <div className="category-card__body">
                <div>
                  <p className="category-card__type">{category.label} rooms</p>
                  <p className="category-card__count">{category.rooms.length} rooms</p>
                </div>
                <p className="category-card__price">
                  <strong>TZS {formatPrice(category.price)}</strong>
                  <span>per night</span>
                </p>
                <button type="button" onClick={() => onOpenRooms(key)} aria-label={`View ${category.label} rooms`}>
                  <ChevronRight size={19} />
                </button>
              </div>
            </article>
          ),
        )}
      </section>

      <section className="foundation-strip">
        <div className="foundation-strip__icon"><Building2 size={24} /></div>
        <div>
          <p className="kicker">System status</p>
          <h3>Clean and ready to connect</h3>
        </div>
        <p>
          No guest records or operational history are loaded. Services and integrations can be added from a blank foundation.
        </p>
        <span className="foundation-strip__badge">0 connected services</span>
      </section>
    </div>
  );
}

type RoomsViewProps = {
  filteredRooms: typeof ROOMS;
  query: string;
  roomFilter: RoomFilter;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: RoomFilter) => void;
};

function RoomsView({
  filteredRooms,
  query,
  roomFilter,
  onQueryChange,
  onFilterChange,
}: RoomsViewProps) {
  return (
    <div className="page-content rooms-page">
      <section className="welcome-row rooms-page__intro">
        <div>
          <p className="kicker">Room configuration</p>
          <h1>Room directory</h1>
          <p className="welcome-row__copy">
            The complete Lighthouse room catalogue. Occupancy and booking data will appear after a future service is connected.
          </p>
        </div>
        <div className="room-total">
          <span>{ROOMS.length}</span>
          <p>rooms in total</p>
        </div>
      </section>

      <section className="room-toolbar" aria-label="Room filters">
        <div className="filter-tabs">
          {(["all", "luxury", "classic"] as const).map((filter) => (
            <button
              key={filter}
              className={roomFilter === filter ? "filter-tab filter-tab--active" : "filter-tab"}
              type="button"
              onClick={() => onFilterChange(filter)}
            >
              {filter === "all" ? "All rooms" : ROOM_CATEGORIES[filter].label}
              <span>{filter === "all" ? ROOMS.length : ROOM_CATEGORIES[filter].rooms.length}</span>
            </button>
          ))}
        </div>

        <label className="room-search">
          <Search size={17} />
          <span className="sr-only">Search rooms</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search room or category"
          />
        </label>
      </section>

      <section className="room-table-card">
        <div className="room-table__header">
          <span>Room</span>
          <span>Category</span>
          <span>Nightly rate</span>
          <span>Connection</span>
        </div>

        <div className="room-table__body">
          {filteredRooms.length > 0 ? (
            filteredRooms.map((room) => (
              <article className="room-row" key={room.number}>
                <div className="room-row__room">
                  <span className="room-row__icon"><DoorOpen size={19} /></span>
                  <div>
                    <strong>{room.number}</strong>
                    <small>Third floor</small>
                  </div>
                </div>
                <div><span className={`room-type room-type--${room.category}`}>{room.label}</span></div>
                <div className="room-row__price">
                  <strong>TZS {formatPrice(room.price)}</strong>
                  <small>per night</small>
                </div>
                <div><span className="connection-state"><span /> Ready to connect</span></div>
              </article>
            ))
          ) : (
            <div className="room-empty">
              <Search size={26} />
              <h2>No rooms found</h2>
              <p>Try a different room number or category.</p>
            </div>
          )}
        </div>
      </section>

      <p className="room-table__caption">
        Showing {filteredRooms.length} of {ROOMS.length} configured rooms. No occupancy or guest records are attached.
      </p>
    </div>
  );
}
