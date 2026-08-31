import { readJson, writeJson } from "@/app/lib/storage";

export const STORAGE_LIVE_CHAT = "lighthouse-live-chat";
export const LANDING_CHAT_THREAD_KEY = "lighthouse-landing-chat-thread-id";

export type LiveChatSender = "guest" | "reception";
export type LiveChatThreadStatus = "open" | "closed";

export interface LiveChatMessage {
  id: string;
  sender: LiveChatSender;
  text: string;
  createdAt: string;
}

export interface LiveChatThread {
  id: string;
  guestName: string;
  guestContact: string;
  dayKey?: string;
  createdAt: string;
  updatedAt: string;
  status: LiveChatThreadStatus;
  unreadByGuest: number;
  unreadByReception: number;
  messages: LiveChatMessage[];
}

function getDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function sortThreadsByRecentActivity(threads: LiveChatThread[]) {
  return [...threads].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function updateLiveChatThreads(updater: (threads: LiveChatThread[]) => LiveChatThread[]) {
  const currentThreads = readLiveChatThreads();
  const nextThreads = sortThreadsByRecentActivity(updater(currentThreads));
  writeLiveChatThreads(nextThreads);
  return nextThreads;
}

export function readLiveChatThreads() {
  const value = readJson<LiveChatThread[]>(STORAGE_LIVE_CHAT);
  return Array.isArray(value) ? value : [];
}

export function writeLiveChatThreads(threads: LiveChatThread[]) {
  writeJson(STORAGE_LIVE_CHAT, threads);
}

export function getLandingChatThreadId() {
  if (typeof window === "undefined") return null;
  const threadId = localStorage.getItem(LANDING_CHAT_THREAD_KEY);
  if (!threadId) return null;

  const todayKey = getDayKey();
  const thread = readLiveChatThreads().find((entry) => entry.id === threadId);
  const threadDayKey = thread?.dayKey ?? thread?.createdAt?.slice(0, 10);

  if (!thread || threadDayKey !== todayKey) {
    localStorage.removeItem(LANDING_CHAT_THREAD_KEY);
    return null;
  }

  return threadId;
}

export function setLandingChatThreadId(threadId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LANDING_CHAT_THREAD_KEY, threadId);
}

export function createLiveChatThread(guestName: string, guestContact: string, openingMessage: string) {
  const now = new Date().toISOString();
  const dayKey = getDayKey(new Date(now));
  const thread: LiveChatThread = {
    id: createId("chat"),
    guestName: guestName.trim() || "Website Guest",
    guestContact: guestContact.trim(),
    dayKey,
    createdAt: now,
    updatedAt: now,
    status: "open",
    unreadByGuest: 0,
    unreadByReception: 1,
    messages: [
      {
        id: createId("msg"),
        sender: "guest",
        text: openingMessage.trim(),
        createdAt: now,
      },
    ],
  };

  updateLiveChatThreads((threads) => [thread, ...threads]);
  setLandingChatThreadId(thread.id);
  return thread;
}

export function appendLiveChatMessage(threadId: string, sender: LiveChatSender, text: string) {
  const nextText = text.trim();
  if (!nextText) return readLiveChatThreads();

  const now = new Date().toISOString();
  return updateLiveChatThreads((threads) =>
    threads.map((thread) => {
      if (thread.id !== threadId) return thread;

      return {
        ...thread,
        updatedAt: now,
        unreadByGuest: sender === "reception" ? thread.unreadByGuest + 1 : 0,
        unreadByReception: sender === "guest" ? thread.unreadByReception + 1 : 0,
        messages: [
          ...thread.messages,
          {
            id: createId("msg"),
            sender,
            text: nextText,
            createdAt: now,
          },
        ],
      };
    }),
  );
}

export function markThreadSeenByGuest(threadId: string) {
  return updateLiveChatThreads((threads) =>
    threads.map((thread) =>
      thread.id === threadId ? { ...thread, unreadByGuest: 0 } : thread,
    ),
  );
}

export function markThreadSeenByReception(threadId: string) {
  return updateLiveChatThreads((threads) =>
    threads.map((thread) =>
      thread.id === threadId ? { ...thread, unreadByReception: 0 } : thread,
    ),
  );
}
