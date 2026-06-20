"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

type Msg = {
  id: string;
  contact_id: string | null;
  salesperson_id: string | null;
  direction: "in" | "out";
  counterparty: string;
  body: string | null;
  status: string | null;
  created_at: string;
};

export function WhatsAppInbox({
  initialMessages,
  companyId,
  leadName,
}: {
  initialMessages: Msg[];
  companyId: string;
  leadName: Map<string, string>;
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Group messages by counterparty
  const chats = useMemo(() => {
    const map = new Map<string, Msg[]>();
    // Sort oldest to newest so push works correctly
    const sorted = [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    for (const m of sorted) {
      if (!map.has(m.counterparty)) map.set(m.counterparty, []);
      map.get(m.counterparty)!.push(m);
    }
    // Sort chats by most recent message
    return Array.from(map.entries()).sort((a, b) => {
      const lastA = a[1][a[1].length - 1];
      const lastB = b[1][b[1].length - 1];
      return new Date(lastB.created_at).getTime() - new Date(lastA.created_at).getTime();
    });
  }, [messages]);

  const activeMessages = activeChat ? chats.find((c) => c[0] === activeChat)?.[1] || [] : [];
  // Get contact_id for the active chat if any message has it
  const activeContactId = activeMessages.find(m => m.contact_id)?.contact_id || null;

  useEffect(() => {
    // Scroll to bottom when active chat changes or new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat, activeMessages]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("wa_messages_inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `company_id=eq.${companyId}` },
        (payload) => {
          setMessages((prev) => {
            const newMsg = payload.new as Msg;
            // Avoid duplicate insert if we just sent it and manually added it to state
            if (prev.find((m) => m.id === newMsg.id)) return prev;
            return [newMsg, ...prev]; // keep the new ones at the top of the raw list
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_messages", filter: `company_id=eq.${companyId}` },
        (payload) => {
          setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? (payload.new as Msg) : m)));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  async function sendMessage() {
    if (!input.trim() || !activeChat) return;
    const text = input.trim();
    setInput("");
    setSending(true);

    const supabase = createClient();
    // Use the edge function
    const { data, error } = await supabase.functions.invoke("whatsapp-send", {
      body: { to: activeChat, text, contact_id: activeContactId },
    });

    setSending(false);

    if (error || !data?.ok) {
      alert(data?.error || error?.message || "Failed to send message");
      setInput(text); // restore input
    }
  }

  function getChatName(counterparty: string, msgs: Msg[]) {
    // try to find a contact name
    const msgWithContact = msgs.find(m => m.contact_id && leadName.has(m.contact_id));
    if (msgWithContact && msgWithContact.contact_id) {
      return leadName.get(msgWithContact.contact_id) + ` (${counterparty})`;
    }
    return counterparty;
  }

  return (
    <div className="chat-container">
      {/* Sidebar */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">Active Conversations</div>
        <div className="chat-list">
          {chats.length === 0 ? (
            <div style={{ padding: 16, color: "var(--muted)", fontSize: 13 }}>No conversations yet.</div>
          ) : (
            chats.map(([counterparty, msgs]) => {
              const lastMsg = msgs[msgs.length - 1];
              return (
                <div
                  key={counterparty}
                  className={`chat-item ${activeChat === counterparty ? "active" : ""}`}
                  onClick={() => setActiveChat(counterparty)}
                >
                  <div className="chat-item-name">{getChatName(counterparty, msgs)}</div>
                  <div className="chat-item-preview">
                    {lastMsg.direction === "out" && <span style={{ color: "var(--accent)" }}>You: </span>}
                    {lastMsg.body || "Media message"}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="chat-thread">
        {activeChat ? (
          <>
            <div className="chat-header">
              <strong style={{ fontSize: 16, color: "#fff" }}>
                {getChatName(activeChat, activeMessages)}
              </strong>
            </div>
            <div className="chat-messages">
              {activeMessages.map((m) => (
                <div key={m.id} className={`msg-bubble ${m.direction}`}>
                  {m.body}
                  <span className="msg-time">
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {m.direction === "out" && m.status && ` · ${m.status}`}
                  </span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="chat-input-area">
              <textarea
                className="chat-input"
                placeholder="Type a message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <button className="chat-send-btn" onClick={sendMessage} disabled={sending || !input.trim()}>
                <svg className="chat-send-icon" viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
            Select a conversation to start chatting
          </div>
        )}
      </div>
    </div>
  );
}
