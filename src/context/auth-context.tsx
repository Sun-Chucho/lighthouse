import type { User } from "firebase/auth";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { firebaseApp } from "../lib/firebase";
import { normalizeStaffRole, type StaffRole } from "../types/roles";

export type StaffSession = {
  uid: string;
  email: string;
  displayName: string;
  role: StaffRole;
};

type AuthStatus = "loading" | "signed-out" | "authenticated" | "unauthorized";

type AuthContextValue = {
  status: AuthStatus;
  session: StaffSession | null;
  initializationError: string | null;
  signIn: (email: string, password: string, expectedRole: StaffRole) => Promise<StaffSession>;
  signOut: () => Promise<void>;
};

export class StaffAuthError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "StaffAuthError";
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function sessionFromUser(user: User): Promise<StaffSession | null> {
  const token = await user.getIdTokenResult();
  const role = normalizeStaffRole(token.claims.role ?? token.claims.staffRole);
  if (!role) return null;

  return {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName || user.email?.split("@")[0] || "Lighthouse staff",
    role,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<StaffSession | null>(null);
  const [initializationError, setInitializationError] = useState<string | null>(null);

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
          if (!user) {
            setSession(null);
            setStatus("signed-out");
            return;
          }

          try {
            const nextSession = await sessionFromUser(user);
            if (!active) return;
            setSession(nextSession);
            setStatus(nextSession ? "authenticated" : "unauthorized");
          } catch {
            if (!active) return;
            setSession(null);
            setStatus("unauthorized");
          }
        });

        // Subscribe first so signed-out routes remain responsive while a new
        // Firebase project's Authentication service is being enabled.
        void setPersistence(auth, browserLocalPersistence).catch(() => undefined);
      })
      .catch(() => {
        if (!active) return;
        setInitializationError("Firebase Authentication could not be initialized.");
        setStatus("signed-out");
      });

    return () => {
      active = false;
      window.clearTimeout(initializationTimeout);
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    session,
    initializationError,
    async signIn(email, password, expectedRole) {
      const {
        browserLocalPersistence,
        getAuth,
        setPersistence,
        signInWithEmailAndPassword,
        signOut: firebaseSignOut,
      } = await import("firebase/auth");
      const auth = getAuth(firebaseApp);
      await setPersistence(auth, browserLocalPersistence);
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const nextSession = await sessionFromUser(credential.user);

      if (!nextSession) {
        await firebaseSignOut(auth);
        throw new StaffAuthError(
          "auth/missing-role",
          "This Firebase account does not have a Lighthouse staff role.",
        );
      }

      if (nextSession.role !== expectedRole) {
        await firebaseSignOut(auth);
        throw new StaffAuthError(
          "auth/wrong-role",
          `This account belongs to the ${nextSession.role} portal.`,
        );
      }

      setSession(nextSession);
      setStatus("authenticated");
      return nextSession;
    },
    async signOut() {
      const { getAuth, signOut: firebaseSignOut } = await import("firebase/auth");
      await firebaseSignOut(getAuth(firebaseApp));
      setSession(null);
      setStatus("signed-out");
    },
  }), [initializationError, session, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
