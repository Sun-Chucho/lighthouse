import { NextRequest, NextResponse } from "next/server";
import { readServerSyncedStorageValue, writeServerSyncedStorageValue } from "@/app/lib/firebase-server";
import { STORAGE_LOGIN_PROFILES, type LoginProfiles, type LoginProfileEntry, type LoginUserAccount } from "@/app/lib/login-profile-types";
import { normalizeRole } from "@/app/lib/auth";
import { getLighthouseAdminAuth } from "@/app/lib/firebase-admin-server";
import type { Role } from "@/app/lib/mock-data";

export const runtime = "nodejs";

function sanitizeEntry(entry: Partial<LoginProfileEntry> | null | undefined): LoginProfileEntry | null {
  const username = typeof entry?.username === "string" ? entry.username.trim() : "";
  if (!username) return null;

  const shift = entry?.shift === "day" || entry?.shift === "night" ? entry.shift : undefined;
  const updatedAt = typeof entry?.updatedAt === "number" && Number.isFinite(entry.updatedAt) ? entry.updatedAt : Date.now();
  const users = Array.isArray(entry?.users)
    ? entry.users
        .map((user) => {
          const userName = typeof user?.username === "string" ? user.username.trim() : "";
          if (!userName) return null;
          const userUpdatedAt = typeof user?.updatedAt === "number" && Number.isFinite(user.updatedAt) ? user.updatedAt : updatedAt;
          const nextUser: LoginUserAccount = {
            username: userName,
            ...(user?.blocked === true ? { blocked: true } : {}),
            updatedAt: userUpdatedAt,
          };
          return nextUser;
        })
        .filter(Boolean) as LoginUserAccount[]
    : undefined;

  return {
    username,
    ...(shift ? { shift } : {}),
    ...(users && users.length > 0 ? { users } : {}),
    updatedAt,
  };
}

async function readStaffRole(request: NextRequest): Promise<Role | null> {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  try {
    const decoded = await getLighthouseAdminAuth().verifyIdToken(authorization.slice(7));
    return normalizeRole(typeof decoded.role === "string" ? decoded.role : null);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!await readStaffRole(request)) {
    return NextResponse.json({ error: "Staff authentication is required." }, { status: 401 });
  }
  try {
    const profiles = (await readServerSyncedStorageValue<LoginProfiles>(STORAGE_LOGIN_PROFILES).catch(() => null)) ?? {};
    return NextResponse.json(profiles);
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(request: NextRequest) {
  const requestRole = await readStaffRole(request);
  if (!requestRole) {
    return NextResponse.json({ error: "Staff authentication is required." }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { role?: string; entry?: Partial<LoginProfileEntry> };
    const role = normalizeRole(body?.role);
    const entry = sanitizeEntry(body?.entry);

    if (!role || !entry) {
      return NextResponse.json({ error: "Invalid login profile payload." }, { status: 400 });
    }
    if (requestRole !== role && requestRole !== "manager" && requestRole !== "director") {
      return NextResponse.json({ error: "This role cannot edit another staff profile." }, { status: 403 });
    }

    const current = (await readServerSyncedStorageValue<LoginProfiles>(STORAGE_LOGIN_PROFILES)) ?? {};
    const next: LoginProfiles = {
      ...current,
      [role]: entry,
    };

    await writeServerSyncedStorageValue(STORAGE_LOGIN_PROFILES, next).catch(() => undefined);
    return NextResponse.json(next);
  } catch {
    return NextResponse.json({ error: "Unable to save login profile." }, { status: 500 });
  }
}
