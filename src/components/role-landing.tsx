import {
  ArrowRight,
  Boxes,
  BriefcaseBusiness,
  Building2,
  ChefHat,
  ConciergeBell,
  LockKeyhole,
  Martini,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { AppLink } from "../lib/navigation";
import { useAuth } from "../context/auth-context";
import {
  getRoleHomePath,
  getRoleLoginPath,
  ROLE_CONFIG,
  STAFF_PORTAL_PATH,
  VISIBLE_STAFF_ROLES,
  type StaffRole,
} from "../types/roles";

const ROLE_ICONS: Record<StaffRole, LucideIcon> = {
  manager: ShieldCheck,
  director: BriefcaseBusiness,
  reception: ConciergeBell,
  inventory: Boxes,
  kitchen: ChefHat,
  bar: Martini,
};

export function RoleLanding() {
  const { session, status } = useAuth();

  return (
    <div className="portal-page">
      <header className="portal-topbar">
        <AppLink className="portal-brand" href={STAFF_PORTAL_PATH} aria-label="Lighthouse staff portals">
          <span className="portal-brand__logo">
            <img src="/logo.jpeg" alt="" width={52} height={52} />
          </span>
          <span>
            <strong>Lighthouse</strong>
            <small>Lodge management</small>
          </span>
        </AppLink>
        <div className="portal-topbar__security">
          <LockKeyhole size={15} /> Secure staff access
        </div>
      </header>

      <main>
        <section className="portal-hero">
          <div className="portal-hero__image" aria-hidden="true" />
          <div className="portal-hero__shade" />
          <div className="portal-hero__content">
            <p className="portal-eyebrow">Lighthouse operations</p>
            <h1>The right entrance<br />for every team.</h1>
            <p>
              Choose your staff portal. Each role has its own secure login, routes,
              navigation, and workspace.
            </p>
            {status === "authenticated" && session ? (
              <AppLink className="portal-continue" href={getRoleHomePath(session.role)}>
                Continue as {ROLE_CONFIG[session.role].shortLabel}
                <ArrowRight size={17} />
              </AppLink>
            ) : null}
            <div className="portal-hero__facts">
              <span><strong>5</strong> staff portals</span>
              <span><strong>20</strong> configured rooms</span>
              <span><strong>0</strong> imported records</span>
            </div>
          </div>
          <div className="portal-hero__mark">LH</div>
        </section>

        <section className="portal-directory" aria-labelledby="portal-directory-title">
          <div className="portal-directory__heading">
            <div>
              <p className="kicker">Access directory</p>
              <h2 id="portal-directory-title">Staff login portals</h2>
            </div>
            <p>Use these same paths directly after your deployed website URL.</p>
          </div>

          <div className="portal-grid">
            {VISIBLE_STAFF_ROLES.map((role, index) => {
              const config = ROLE_CONFIG[role];
              const Icon = ROLE_ICONS[role];
              const loginPath = getRoleLoginPath(role);

              return (
                <AppLink className="portal-card" href={loginPath} key={role}>
                  <span className="portal-card__number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="portal-card__icon"><Icon size={23} strokeWidth={1.7} /></span>
                  <span className="portal-card__content">
                    <strong>{config.label}</strong>
                    <small>{config.description}</small>
                  </span>
                  <code>{loginPath}</code>
                  <ArrowRight className="portal-card__arrow" size={18} />
                </AppLink>
              );
            })}
          </div>
        </section>

        <section className="portal-foundation">
          <span><Building2 size={22} /></span>
          <div>
            <p className="kicker">Clean Lighthouse foundation</p>
            <h2>System structure restored. Legacy business data excluded.</h2>
          </div>
          <p>
            No legacy bookings, payments, drinks, menus, stock, transactions, or staff
            credentials were imported into Lighthouse.
          </p>
        </section>
      </main>

      <footer className="portal-footer">
        <span>Lighthouse Lodge</span>
        <span>Firebase-secured staff system</span>
      </footer>
    </div>
  );
}
