"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import {
  appendLiveChatMessage,
  markThreadSeenByReception,
  readLiveChatThreads,
  STORAGE_LIVE_CHAT,
  type LiveChatThread,
} from "@/app/lib/live-chat";
import { subscribeToSyncedStorageKey } from "@/app/lib/firebase-sync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LiveChatPage() {
  const [liveChats, setLiveChats] = useState<LiveChatThread[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [receptionReply, setReceptionReply] = useState("");

  useEffect(() => {
    setLiveChats(readLiveChatThreads());
    const unsubscribe = subscribeToSyncedStorageKey<LiveChatThread[]>(STORAGE_LIVE_CHAT, (value) => {
      setLiveChats(Array.isArray(value) ? value : readLiveChatThreads());
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (liveChats.length === 0) {
      setActiveChatId(null);
      return;
    }

    if (!activeChatId || !liveChats.some((thread) => thread.id === activeChatId)) {
      setActiveChatId(liveChats[0].id);
    }
  }, [activeChatId, liveChats]);

  const unreadLiveChats = useMemo(
    () => liveChats.filter((thread) => thread.unreadByReception > 0 && thread.status === "open"),
    [liveChats],
  );
  const activeLiveChat = useMemo(
    () => liveChats.find((thread) => thread.id === activeChatId) ?? liveChats[0] ?? null,
    [activeChatId, liveChats],
  );

  const openReceptionChat = (threadId: string) => {
    setActiveChatId(threadId);
    markThreadSeenByReception(threadId);
  };

  const sendReceptionReply = () => {
    if (!activeLiveChat || !receptionReply.trim()) return;
    appendLiveChatMessage(activeLiveChat.id, "reception", receptionReply);
    markThreadSeenByReception(activeLiveChat.id);
    setActiveChatId(activeLiveChat.id);
    setReceptionReply("");
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Live Chat</h1>
          <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Website guest conversations synced live with reception
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline" className="h-10 px-4 font-black uppercase tracking-widest text-[10px]">
            {liveChats.length} Conversations
          </Badge>
          <Badge variant="outline" className="h-10 border-emerald-500 bg-emerald-50 px-4 font-black uppercase tracking-widest text-[10px] text-emerald-700">
            {unreadLiveChats.length} New
          </Badge>
        </div>
      </header>

      <Card className="overflow-hidden border-none shadow-sm">
        <CardHeader className="border-b">
          <CardTitle className="text-xl font-black uppercase tracking-tight">Reception Live Chat</CardTitle>
          <CardDescription>Website conversations appear here and update live.</CardDescription>
        </CardHeader>
        <CardContent className="grid min-h-[620px] p-0 md:grid-cols-[320px_1fr]">
          <div className="border-r bg-muted/10">
            <div className="max-h-[540px] overflow-y-auto">
              {liveChats.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => openReceptionChat(thread.id)}
                  className={`w-full border-b px-5 py-4 text-left transition hover:bg-white ${activeLiveChat?.id === thread.id ? "bg-white" : "bg-transparent"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{thread.guestName}</p>
                      <p className="mt-1 text-xs font-bold text-muted-foreground">{thread.guestContact || "Website guest"}</p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {new Date(thread.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {thread.unreadByReception > 0 ? (
                      <Badge className="bg-amber-500 text-white hover:bg-amber-500">{thread.unreadByReception}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                    {thread.messages[thread.messages.length - 1]?.text ?? "No messages yet"}
                  </p>
                </button>
              ))}
              {liveChats.length === 0 && (
                <div className="px-5 py-10 text-center opacity-40">
                  <MessageCircle className="mx-auto mb-3 h-10 w-10" />
                  <p className="text-xs font-black uppercase tracking-widest">No live chats yet</p>
                </div>
              )}
            </div>
          </div>
          <div className="flex min-h-[620px] flex-col">
            {activeLiveChat ? (
              <>
                <div className="border-b px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-black">{activeLiveChat.guestName}</p>
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        {activeLiveChat.guestContact || "Website guest"} | {activeLiveChat.status} | {new Date(activeLiveChat.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="outline" className="font-black uppercase tracking-widest text-[10px]">
                      {activeLiveChat.messages.length} Messages
                    </Badge>
                  </div>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto bg-[#f8f6f3] px-5 py-5">
                  {activeLiveChat.messages.map((message) => (
                    <div key={message.id} className={`flex ${message.sender === "reception" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.sender === "reception" ? "bg-amber-500 text-white" : "bg-white text-black shadow-sm"}`}>
                        <p>{message.text}</p>
                        <p className={`mt-2 text-[10px] font-black uppercase tracking-widest ${message.sender === "reception" ? "text-white/70" : "text-muted-foreground"}`}>
                          {message.sender} | {new Date(message.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t bg-white px-5 py-4">
                  <div className="flex items-end gap-2">
                    <textarea
                      rows={2}
                      value={receptionReply}
                      onChange={(event) => setReceptionReply(event.target.value)}
                      placeholder="Reply to guest..."
                      className="min-h-[48px] flex-1 resize-none rounded-2xl border border-black/10 px-4 py-3 text-sm outline-none ring-amber-500 transition focus:ring-2"
                    />
                    <Button onClick={sendReceptionReply} disabled={!receptionReply.trim()} className="h-12 rounded-2xl px-4">
                      <Send className="mr-2 h-4 w-4" /> Send
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-center opacity-40">
                <div>
                  <MessageCircle className="mx-auto mb-3 h-12 w-12" />
                  <p className="text-xs font-black uppercase tracking-widest">Select a live chat to reply</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
