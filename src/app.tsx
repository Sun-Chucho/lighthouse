import { ArrowLeft, ArrowRight, LockKeyhole, ShieldAlert } from "lucide-react";
import { useEffect } from "react";
import { DashboardShell, isModuleAvailable } from "./components/dashboard-shell";
import { RoleLanding } from "./components/role-landing";
import { RoleLogin } from "./components/role-login";
import { useAuth } from "./context/auth-context";
import { AppLink, navigateTo, usePathname } from "./lib/navigation";
import {
  getRoleHomePath,
  getRoleLoginPath,
  roleFromPathSegment,
  ROLE_CONFIG,
  type StaffRole,
} from "./types/roles";

export function LighthouseApp() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const role = roleFromPathSegment(segments[0]);
  const moduleSegment = segments[1];

  useEffect(() => {
    if (pathname === "/") document.title = "Staff Login | Lighthouse Lodge";
  }, [pathname]);

  if (pathname === "/") return <RoleLanding />;
  if (segments[0] === "dashboard") return <LegacyDashboardRedirect />;

  if (role && segments.length === 1) return <RoleLogin role={role} />;

  if (role && segments.length === 2 && moduleSegment && isModuleAvailable(role, moduleSegment)) {
    return <ProtectedWorkspace role={role} moduleId={moduleSegment} />;
  }

  return <NotFound />;
}

function ProtectedWorkspace({ role, moduleId }: { role: StaffRole; moduleId: Parameters<typeof DashboardShell>[0]["moduleId"] }) {
  const { session, status } = useAuth();
  const config = ROLE_CONFIG[role];

  useEffect(() => {
    document.title = `${config.shortLabel} · ${moduleId === "dashboard" ? "Overview" : moduleId} | Lighthouse Lodge`;
  }, [config.shortLabel, moduleId]);

  if (status === "loading") return <LoadingScreen />;
  if (status !== "authenticated" || !session) {
    return (
      <AccessNotice
        icon={LockKeyhole}
        eyebrow="Authentication required"
        title={`${config.label} sign-in required.`}
        description={`Sign in through ${getRoleLoginPath(role)} to access this protected Lighthouse route.`}
        actionLabel={`Open ${config.shortLabel} login`}
        actionHref={getRoleLoginPath(role)}
      />
    );
  }

  if (session.role !== role) {
    const activeConfig = ROLE_CONFIG[session.role];
    return (
      <AccessNotice
        icon={ShieldAlert}
        eyebrow="Role boundary"
        title="This portal belongs to another role."
        description={`You are authenticated as ${activeConfig.label}. Lighthouse does not allow that account to enter the ${config.label} workspace.`}
        actionLabel={`Return to ${activeConfig.shortLabel}`}
        actionHref={getRoleHomePath(session.role)}
      />
    );
  }

  return <DashboardShell role={role} moduleId={moduleId} />;
}

function LegacyDashboardRedirect() {
  const { session, status } = useAuth();

  useEffect(() => {
    if (status === "authenticated" && session) {
      navigateTo(getRoleHomePath(session.role), { replace: true });
    }
  }, [session, status]);

  if (status === "loading" || (status === "authenticated" && session)) return <LoadingScreen />;

  return (
    <AccessNotice
      icon={LockKeyhole}
      eyebrow="Staff access"
      title="Choose your Lighthouse portal."
      description="The old shared dashboard route has been replaced with explicit role routes such as /manager, /rb, and /im."
      actionLabel="View staff portals"
      actionHref="/"
    />
  );
}

function LoadingScreen() {
  return (
    <main className="route-state">
      <img src="/logo.jpeg" alt="Lighthouse Lodge" width={82} height={82} />
      <p>Verifying Lighthouse access…</p>
    </main>
  );
}

function AccessNotice({
  icon: Icon,
  eyebrow,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  icon: typeof LockKeyhole;
  eyebrow: string;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <main className="route-state route-state--card">
      <AppLink href="/" className="route-state__brand"><img src="/logo.jpeg" alt="" width={54} height={54} /><span>Lighthouse</span></AppLink>
      <section>
        <span className="route-state__icon"><Icon size={26} /></span>
        <p className="kicker">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <AppLink href={actionHref} className="auth-submit route-state__action">{actionLabel}<ArrowRight size={17} /></AppLink>
      </section>
    </main>
  );
}

function NotFound() {
  return (
    <main className="route-state route-state--card">
      <AppLink href="/" className="route-state__brand"><img src="/logo.jpeg" alt="" width={54} height={54} /><span>Lighthouse</span></AppLink>
      <section>
        <span className="route-state__code">404</span>
        <p className="kicker">Route not found</p>
        <h1>This Lighthouse page does not exist.</h1>
        <p>Use the staff directory to open a valid manager, reception, inventory, kitchen, bar, or director route.</p>
        <AppLink href="/" className="auth-submit route-state__action"><ArrowLeft size={17} /> Return to staff portals</AppLink>
      </section>
    </main>
  );
}
