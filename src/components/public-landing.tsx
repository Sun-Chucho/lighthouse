import {
  ArrowDownRight,
  ArrowRight,
  BedDouble,
  CalendarDays,
  Check,
  ChevronRight,
  Cloud,
  CloudOff,
  ConciergeBell,
  MapPin,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSync } from "../context/sync-context";
import { formatPrice, ROOM_CATEGORIES } from "../data/rooms";
import { AppLink } from "../lib/navigation";
import { STAFF_PORTAL_PATH } from "../types/roles";

type StayForm = {
  checkIn: string;
  checkOut: string;
  guests: string;
  roomType: "luxury" | "classic" | "either";
  guestName: string;
  email: string;
  phone: string;
  note: string;
};

const INITIAL_FORM: StayForm = {
  checkIn: "",
  checkOut: "",
  guests: "2",
  roomType: "either",
  guestName: "",
  email: "",
  phone: "",
  note: "",
};

export function PublicLanding() {
  const { lastError, pendingCount, queueBookingInquiry, status } = useSync();
  const [form, setForm] = useState<StayForm>(INITIAL_FORM);
  const [formError, setFormError] = useState("");
  const [requestId, setRequestId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const minimumDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    document.title = "Lighthouse Lodge | An exceptional private stay";
  }, []);

  const updateField = <Key extends keyof StayForm>(key: Key, value: StayForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormError("");
  };

  const datesAreValid = () => {
    if (!form.checkIn || !form.checkOut) {
      setFormError("Choose both arrival and departure dates.");
      return false;
    }
    if (form.checkOut <= form.checkIn) {
      setFormError("Departure must be after your arrival date.");
      return false;
    }
    return true;
  };

  const handlePlanStay = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!datesAreValid()) return;
    document.getElementById("reserve")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!datesAreValid()) return;
    setSubmitting(true);
    setRequestId("");

    try {
      const id = await queueBookingInquiry({
        guestName: form.guestName,
        email: form.email,
        phone: form.phone,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        guests: Number(form.guests),
        roomType: form.roomType,
        note: form.note,
      });
      setRequestId(id);
    } catch {
      setFormError("Your request could not be saved. Please check the details and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="public-page">
      <header className="public-header">
        <a className="public-brand" href="#top" aria-label="Lighthouse Lodge home">
          <img src="/logo.jpeg" alt="" width={58} height={58} />
          <span><strong>Lighthouse</strong><small>Lodge</small></span>
        </a>
        <nav className="public-navigation" aria-label="Main navigation">
          <a href="#stays">The stays</a>
          <a href="#experience">Experience</a>
          <a href="#reserve">Reservations</a>
        </nav>
        <a className="public-header__book" href="#reserve">Plan your stay <ArrowDownRight size={17} /></a>
      </header>

      <main id="top">
        <section className="public-hero">
          <div className="public-hero__image" aria-hidden="true" />
          <div className="public-hero__shade" />
          <div className="public-hero__content">
            <p className="public-kicker"><span /> A quieter kind of luxury</p>
            <h1>Stay where every<br />detail feels considered.</h1>
            <p className="public-hero__lead">
              Twenty private rooms, warm architecture, and thoughtful lodge service—
              composed for unhurried arrivals and memorable nights.
            </p>
            <div className="public-hero__actions">
              <a className="public-button public-button--gold" href="#reserve">Request a stay <ArrowRight size={18} /></a>
              <a className="public-text-link" href="#stays">Discover the rooms <ChevronRight size={17} /></a>
            </div>
          </div>
          <div className="public-hero__aside">
            <span>20</span>
            <p>distinct rooms<br />one considered stay</p>
          </div>
        </section>

        <form className="stay-planner" onSubmit={handlePlanStay} aria-label="Plan your stay">
          <div className="stay-planner__intro">
            <p className="public-kicker">Plan your stay</p>
            <strong>Begin with your dates.</strong>
          </div>
          <label>
            <span><CalendarDays size={15} /> Arrival</span>
            <input type="date" min={minimumDate} required value={form.checkIn} onChange={(event) => updateField("checkIn", event.target.value)} />
          </label>
          <label>
            <span><CalendarDays size={15} /> Departure</span>
            <input type="date" min={form.checkIn || minimumDate} required value={form.checkOut} onChange={(event) => updateField("checkOut", event.target.value)} />
          </label>
          <label>
            <span><Users size={15} /> Guests</span>
            <select value={form.guests} onChange={(event) => updateField("guests", event.target.value)}>
              {[1, 2, 3, 4, 5, 6].map((count) => <option value={count} key={count}>{count} {count === 1 ? "guest" : "guests"}</option>)}
            </select>
          </label>
          <label>
            <span><BedDouble size={15} /> Stay</span>
            <select value={form.roomType} onChange={(event) => updateField("roomType", event.target.value as StayForm["roomType"])}>
              <option value="either">Best available</option>
              <option value="luxury">Luxury room</option>
              <option value="classic">Classic room</option>
            </select>
          </label>
          <button type="submit">Check availability <ArrowRight size={18} /></button>
          {formError ? <p className="stay-planner__error" role="alert">{formError}</p> : null}
        </form>

        <section className="public-intro" id="experience">
          <div>
            <p className="public-kicker">The Lighthouse feeling</p>
            <h2>Grounded in warmth.<br />Elevated by restraint.</h2>
          </div>
          <div className="public-intro__copy">
            <p>
              Lighthouse is a modern lodge made for guests who value calm, character,
              and attentive hospitality. Every arrival begins simply; every room is
              designed to let the day slow down.
            </p>
            <div className="public-intro__features">
              <span><ConciergeBell size={19} /> Considered service</span>
              <span><Wifi size={19} /> Connected comfort</span>
              <span><ShieldCheck size={19} /> Private, secure stays</span>
            </div>
          </div>
        </section>

        <section className="public-stays" id="stays" aria-labelledby="stays-title">
          <div className="public-section-heading">
            <div><p className="public-kicker">Choose your room</p><h2 id="stays-title">Two expressions of Lighthouse.</h2></div>
            <p>Every category is part of the same twenty-room lodge experience.</p>
          </div>
          <div className="public-room-grid">
            {(Object.entries(ROOM_CATEGORIES) as Array<[keyof typeof ROOM_CATEGORIES, typeof ROOM_CATEGORIES[keyof typeof ROOM_CATEGORIES]]>).map(([key, room], index) => (
              <article className="public-room-card" key={key}>
                <div className="public-room-card__image">
                  <img src={room.image} alt={`${room.label} room at Lighthouse Lodge`} />
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="public-room-card__body">
                  <div>
                    <p className="public-kicker">{room.rooms.length} private rooms</p>
                    <h3>{room.label}</h3>
                  </div>
                  <p>A refined private room with the essential comforts of an effortless lodge stay.</p>
                  <div className="public-room-card__footer">
                    <span>From <strong>TZS {formatPrice(room.price)}</strong> / night</span>
                    <a href="#reserve" onClick={() => updateField("roomType", key)}>Reserve <ArrowRight size={16} /></a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="public-moment">
          <div className="public-moment__image" aria-hidden="true" />
          <div className="public-moment__content">
            <Sparkles size={28} />
            <p className="public-kicker">Made for the in-between</p>
            <h2>Arrive. Exhale.<br />Let the stay unfold.</h2>
            <p>From quiet mornings to late returns, Lighthouse keeps the experience generous and uncomplicated.</p>
          </div>
        </section>

        <section className="reservation-section" id="reserve">
          <div className="reservation-section__story">
            <p className="public-kicker">Reservations</p>
            <h2>Your Lighthouse stay starts here.</h2>
            <p>Share a few details and our reception team can confirm the right room for your dates.</p>
            <div className="reservation-assurances">
              <span><Check size={16} /> Saved even when this device is offline</span>
              <span><Check size={16} /> Automatically synchronized when connected</span>
              <span><Check size={16} /> No payment is taken with this request</span>
            </div>
            <SyncBadge status={status} pendingCount={pendingCount} />
          </div>

          <form className="reservation-form" onSubmit={handleRequest}>
            <div className="reservation-form__row">
              <label><span>Arrival</span><input type="date" min={minimumDate} required value={form.checkIn} onChange={(event) => updateField("checkIn", event.target.value)} /></label>
              <label><span>Departure</span><input type="date" min={form.checkIn || minimumDate} required value={form.checkOut} onChange={(event) => updateField("checkOut", event.target.value)} /></label>
            </div>
            <div className="reservation-form__row">
              <label><span>Guests</span><select value={form.guests} onChange={(event) => updateField("guests", event.target.value)}>{[1, 2, 3, 4, 5, 6].map((count) => <option value={count} key={count}>{count}</option>)}</select></label>
              <label><span>Room preference</span><select value={form.roomType} onChange={(event) => updateField("roomType", event.target.value as StayForm["roomType"])}><option value="either">Best available</option><option value="luxury">Luxury</option><option value="classic">Classic</option></select></label>
            </div>
            <label><span>Full name</span><input type="text" required minLength={2} maxLength={120} autoComplete="name" value={form.guestName} onChange={(event) => updateField("guestName", event.target.value)} placeholder="Your name" /></label>
            <div className="reservation-form__row">
              <label><span>Email</span><input type="email" required maxLength={160} autoComplete="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} placeholder="you@example.com" /></label>
              <label><span>Phone</span><input type="tel" required minLength={5} maxLength={40} autoComplete="tel" value={form.phone} onChange={(event) => updateField("phone", event.target.value)} placeholder="Your phone number" /></label>
            </div>
            <label><span>Anything we should know? <small>Optional</small></span><textarea maxLength={600} rows={3} value={form.note} onChange={(event) => updateField("note", event.target.value)} placeholder="Arrival time, room preference, or a special request" /></label>
            {formError ? <p className="reservation-form__error" role="alert">{formError}</p> : null}
            {requestId ? (
              <div className="reservation-success" role="status">
                <span><Check size={18} /></span>
                <p><strong>Request saved.</strong><small>{status === "offline" ? "It will send automatically when internet returns." : "It is being synchronized with Lighthouse reception."}</small></p>
              </div>
            ) : null}
            {!requestId && lastError && pendingCount > 0 ? <p className="reservation-form__notice">Your request is safe on this device and will retry automatically.</p> : null}
            <button className="public-button public-button--dark" type="submit" disabled={submitting}>
              {submitting ? "Saving your request…" : "Request this stay"} {!submitting ? <ArrowRight size={18} /> : null}
            </button>
          </form>
        </section>
      </main>

      <footer className="public-footer">
        <div className="public-footer__brand"><img src="/logo.jpeg" alt="" width={62} height={62} /><span><strong>Lighthouse</strong><small>Lodge</small></span></div>
        <div><p className="public-kicker">Stay</p><a href="#stays">Luxury rooms</a><a href="#stays">Classic rooms</a><a href="#reserve">Request a booking</a></div>
        <div><p className="public-kicker">Lighthouse</p><span><MapPin size={14} /> Private lodge hospitality</span><span><Cloud size={14} /> Online and offline continuity</span></div>
        <div className="public-footer__staff"><p className="public-kicker">Operations</p><AppLink href={STAFF_PORTAL_PATH}>Staff access <ArrowRight size={15} /></AppLink></div>
        <p className="public-footer__legal">© {new Date().getFullYear()} Lighthouse Lodge. All stays are subject to confirmation.</p>
      </footer>
    </div>
  );
}

function SyncBadge({ status, pendingCount }: { status: "online" | "offline" | "syncing" | "error"; pendingCount: number }) {
  const offline = status === "offline";
  return (
    <div className={`public-sync public-sync--${status}`}>
      {offline ? <CloudOff size={17} /> : <Cloud size={17} />}
      <span>
        <strong>{status === "syncing" ? "Synchronizing" : offline ? "Working offline" : status === "error" ? "Sync will retry" : "Online and connected"}</strong>
        <small>{pendingCount > 0 ? `${pendingCount} saved request${pendingCount === 1 ? "" : "s"} waiting` : "No changes waiting to sync"}</small>
      </span>
    </div>
  );
}
