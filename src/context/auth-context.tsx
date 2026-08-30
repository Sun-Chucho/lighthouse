import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { firebaseApp } from "../lib/firebase";
import { ROLE_CONFIG, type StaffRole } from "../types/roles";

export type StaffSession = {
  uid: string;
  displayName: string;
  role: StaffRole;
};

type AuthStatus = "loading" | "signed-out" | "guest" | "authenticated";

type AuthContextValue = {
  status: AuthStatus;
  session: StaffSession | null;
  ensureAnonymousSession: () => Promise<string>;
  signIn: (password: string, expectedRole: StaffRole) => Promise<StaffSession>;
  signOut: () => Promise<void>;
};

export class StaffAuthError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "StaffAuthError";
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

function localSessionForRole(role: StaffRole): StaffSession {
  return {
    uid: `lighthouse-${role}`,
    displayName: ROLE_CONFIG[role].label,
    role,
  };
}

function passwordForRole(role: StaffRole) {
  return role === "manager" ? "4321" : "1234";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<StaffSession | null>(null);
  const staffSessionRef = useRef<StaffSession | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;
    const initializationTimeout = window.setTimeout(() => {
      if (!active) return;
      setStatus((currentStatus) => currentStatus === "loading" ? "signed-out" : currentStatus);
    }, 2_000);

    void import("firebase/auth")
      .then(({ browserLocalPersistence, getAuth, onAuthStateChanged, setPersistence }) => {
        const auth = getAuth(firebaseApp);

        if (!active) return;
        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (!active) return;

          if (staffSessionRef.current) return;

          if (!user) {
            setSession(null);
            setStatus("signed-out");
            return;
          }

          if (user.isAnonymous) {
            setSession(null);
            setStatus("guest");
            return;
          }

          // Email accounts from the earlier access model no longer unlock staff
          // routes. Staff access is deliberately selected by role and PIN.
          setSession(null);
          setStatus("signed-out");
        });

        void setPersistence(auth, browserLocalPersistence).catch(() => undefined);
      })
      .catch(() => {
        if (!active) return;
        setStatus("signed-out");
      });

    return () => {
      active = false;
      window.clearTimeout(initializationTimeout);
      unsubscribe();
    };
  }, []);

  const ensureAnonymousSession = useCallback(async () => {
    const {
      browserLocalPersistence,
      getAuth,
      setPersistence,
      signInAnonymously,
    } = await import("firebase/auth");
    const auth = getAuth(firebaseApp);
    await setPersistence(auth, browserLocalPersistence);
    if (auth.currentUser?.isAnonymous) return auth.currentUser.uid;

    const credential = await signInAnonymously(auth);
    if (!staffSessionRef.current) setStatus("guest");
    return credential.user.uid;
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    session,
    ensureAnonymousSession,
    async signIn(password, expectedRole) {
      if (password !== passwordForRole(expectedRole)) {
        throw new StaffAuthError("auth/invalid-pin", "Incorrect password for this staff role.");
      }

      const nextSession = localSessionForRole(expectedRole);
      staffSessionRef.current = nextSession;
      setSession(nextSession);
      setStatus("authenticated");
      return nextSession;
    },
    async signOut() {
      staffSessionRef.current = null;
      try {
        const { getAuth, signOut: firebaseSignOut } = await import("firebase/auth");
        await firebaseSignOut(getAuth(firebaseApp));
      } catch {
        // Local PIN sign-out must remain available without a network connection.
      } finally {
        await window.lighthouseDesktop?.clearVerifiedSession().catch(() => false);
        setSession(null);
        setStatus("signed-out");
      }
    },
  }), [ensureAnonymousSession, session, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
