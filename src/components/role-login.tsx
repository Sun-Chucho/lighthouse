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
  Mail,
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
  const code = typeof error === "object" && error && "code" in error
    ? String(error.code)
    : "";

  if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
    return "The email or password is incorrect.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Email/password sign-in is not enabled in the Lighthouse Firebase project yet.";
  }
  if (code === "auth/configuration-not-found") {
    return "Firebase Authentication has not been initialized for Lighthouse yet.";
  }
  if (code === "auth/too-many-requests") {
    return "Sign-in is temporarily limited after too many attempts. Please try again later.";
  }
  if (code === "auth/network-request-failed") {
    return "The login service could not be reached. Check your connection and try again.";
  }

  return "Sign-in could not be completed. Check the account and try again.";
}

export function RoleLogin({ role }: { role: StaffRole }) {
  const config = ROLE_CONFIG[role];
  const Icon = ROLE_ICONS[role];
  const { initializationError, session, signIn, status } = useAuth();
  const [email, setEmail] = useState("");
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
      await signIn(email, password, role);
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
        <AppLink href="/" className="auth-brand">
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
          <AppLink className="auth-back" href="/">
            <ArrowLeft size={16} /> All staff portals
          </AppLink>

          <div className="auth-heading">
            <span className="auth-heading__icon"><Icon size={25} strokeWidth={1.7} /></span>
            <p className="kicker">{config.shortLabel} access</p>
            <h2>Welcome back.</h2>
            <p>Sign in with the Firebase account assigned to this Lighthouse role.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span>Email address</span>
              <span className="auth-input-wrap">
                <Mail size={17} />
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@lighthouse.co.tz"
                />
              </span>
            </label>

            <label className="auth-field">
              <span>Password</span>
              <span className="auth-input-wrap">
                <LockKeyhole size={17} />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
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

            {(error || initializationError) ? (
              <p className="auth-error" role="alert">{error || initializationError}</p>
            ) : null}

            <button className="auth-submit" type="submit" disabled={submitting || status === "loading"}>
              {submitting ? "Signing in…" : "Sign in securely"}
              {!submitting ? <ArrowRight size={17} /> : null}
            </button>
          </form>

          <div className="auth-security-note">
            <ShieldCheck size={18} />
            <p><strong>Role protected</strong><span>Only accounts carrying the {role} role claim can enter this portal.</span></p>
          </div>
        </div>
      </section>
    </main>
  );
}
