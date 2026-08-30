import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  BriefcaseBusiness,
  ChefHat,
  ConciergeBell,
  Eye,
  EyeOff,
  LockKeyhole,
  Martini,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { StaffAuthError, useAuth } from "../context/auth-context";
import { AppLink, navigateTo } from "../lib/navigation";
import {
  getRoleHomePath,
  getRoleLoginPath,
  ROLE_CONFIG,
  STAFF_PORTAL_PATH,
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

function authenticationMessage(error: unknown) {
  if (error instanceof StaffAuthError) return error.message;
  return "Sign-in could not be completed. Try the role password again.";
}

export function RoleLogin({ role }: { role: StaffRole }) {
  const config = ROLE_CONFIG[role];
  const Icon = ROLE_ICONS[role];
  const { session, signIn, status } = useAuth();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = `${config.label} Login | Lighthouse Lodge`;
  }, [config.label]);

  useEffect(() => {
    if (status === "authenticated" && session?.role === role) {
      navigateTo(getRoleHomePath(role), { replace: true });
    }
  }, [role, session, status]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await signIn(password, role);
      navigateTo(getRoleHomePath(role), { replace: true });
    } catch (signInError) {
      setError(authenticationMessage(signInError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-visual">
        <div className="auth-visual__image" aria-hidden="true" />
        <div className="auth-visual__shade" />
        <AppLink href={STAFF_PORTAL_PATH} className="auth-brand">
          <span><img src="/logo.jpeg" alt="" width={56} height={56} /></span>
          <div><strong>Lighthouse</strong><small>Lodge management</small></div>
        </AppLink>
        <div className="auth-visual__content">
          <p className="portal-eyebrow">Secure staff portal</p>
          <h1>{config.label}</h1>
          <p>{config.description}</p>
          <div className="auth-route-label">
            <span>Direct route</span>
            <code>{getRoleLoginPath(role)}</code>
          </div>
        </div>
        <div className="auth-visual__mark">{config.initials}</div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel__inner">
          <AppLink className="auth-back" href={STAFF_PORTAL_PATH}>
            <ArrowLeft size={16} /> All staff portals
          </AppLink>

          <div className="auth-heading">
            <div className="auth-avatar" aria-label={`${config.label} profile`}>
              <span>{config.initials}</span>
              <i><Icon size={15} strokeWidth={1.8} /></i>
            </div>
            <p className="kicker">{config.shortLabel} access</p>
            <h2>Welcome back.</h2>
            <p>Enter the four-digit password assigned to the {config.shortLabel} role. No email address is required.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Role password</span>
              <span className="auth-input-wrap">
                <LockKeyhole size={17} />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="Enter 4-digit password"
                  aria-describedby="role-password-help"
                />
                <button
                  className="auth-password-toggle"
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>

            {error ? (
              <p className="auth-error" role="alert">{error}</p>
            ) : null}

            <button className="auth-submit" type="submit" disabled={submitting || password.length !== 4}>
              {submitting ? "Signing in…" : "Sign in securely"}
              {!submitting ? <ArrowRight size={17} /> : null}
            </button>
          </form>

          <div className="auth-security-note">
            <ShieldCheck size={18} />
            <p id="role-password-help"><strong>Offline role access</strong><span>This password works on the Lighthouse Windows application with or without internet.</span></p>
          </div>
        </div>
      </section>
    </main>
  );
}
