"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import {
  buildWebSocketUrl,
  getDMs,
  getDMThreads,
  getUsers,
  getMediaUrl,
  postDM,
  type DirectMessage,
  type DMThread,
  type User,
} from "@/lib/api";

type MessageNode = DirectMessage & { replies: MessageNode[] };

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length > 1
    ? `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function WidgetAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  return (
    <span
      className="participant-avatar"
      style={{
        width: "36px",
        height: "36px",
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--accent-soft)",
        color: "var(--accent-strong)",
        fontWeight: "bold",
        fontSize: "0.85rem",
        border: "1px solid var(--line)",
        backgroundImage: avatarUrl ? `url("${avatarUrl}")` : undefined,
        backgroundSize: "cover",
        flexShrink: 0,
      }}
    >
      {!avatarUrl ? getInitials(name) : null}
    </span>
  );
}

function formatAttachmentSize(size: number | null) {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageAttachment(message: DirectMessage) {
  return message.attachment_content_type.startsWith("image/");
}

function getMessagePreview(message: DirectMessage | null) {
  if (!message) return "No messages yet";
  if (message.body) return message.body;
  return message.attachment_name ? `Attachment: ${message.attachment_name}` : "Attachment";
}

function buildMessageTree(messages: DirectMessage[]): MessageNode[] {
  const nodes = new Map<number, MessageNode>();
  const roots: MessageNode[] = [];

  messages.forEach((message) => {
    nodes.set(message.id, { ...message, replies: [] });
  });

  messages.forEach((message) => {
    const node = nodes.get(message.id);
    if (!node) return;

    const parent = message.parent_id ? nodes.get(message.parent_id) : null;
    if (parent) {
      parent.replies.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export function DirectMessageWidget({
  isOpen,
  setIsOpen,
}: {
  isOpen?: boolean;
  setIsOpen?: (open: boolean) => void;
}) {
  const { token, user } = useAuth();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const drawerIsOpen = isOpen ?? internalIsOpen;
  const setDrawerIsOpen = setIsOpen ?? setInternalIsOpen;
  const [screen, setScreen] = useState<"threads" | "chat" | "search">("threads");
  const [threads, setThreads] = useState<DMThread[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [activePartner, setActivePartner] = useState<User | null>(null);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [replyTarget, setReplyTarget] = useState<DirectMessage | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chatSocketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Keep refs updated for the socket event handler to prevent closure stales
  const activePartnerRef = useRef(activePartner);
  const screenRef = useRef(screen);
  const userRef = useRef(user);

  useEffect(() => { activePartnerRef.current = activePartner; }, [activePartner]);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  useEffect(() => { userRef.current = user; }, [user]);

  // Calculate total unread count
  const totalUnread = useMemo(() => {
    return threads.reduce((sum, t) => sum + t.unread_count, 0);
  }, [threads]);
  const messageTree = useMemo(() => buildMessageTree(messages), [messages]);

  // Auto-scroll messages list to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (screen === "chat" && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, screen]);

  // Fetch threads on mount / login
  useEffect(() => {
    if (!token) return;

    async function loadThreads() {
      try {
        const data = await getDMThreads(token!);
        setThreads(data);
      } catch (err) {
        console.error("Error fetching threads:", err);
      }
    }

    loadThreads();
  }, [token]);

  // Load chat messages when partner is selected
  useEffect(() => {
    if (!token || !activePartner?.id) return;
    const partnerId = activePartner.id;

    async function loadMessages() {
      try {
        const data = await getDMs(token!, partnerId);
        setMessages(data);

        // Reset local thread unread count
        setThreads((current) =>
          current.map((t) => (t.user.id === partnerId ? { ...t, unread_count: 0 } : t))
        );
      } catch (err) {
        console.error("Error loading chat messages:", err);
      }
    }

    loadMessages();
  }, [token, activePartner?.id]);

  // Connect to the WebSocket
  useEffect(() => {
    if (!token) return;

    const socket = new WebSocket(buildWebSocketUrl("/ws/chat/", token));
    chatSocketRef.current = socket;

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as {
        type: "dm.created";
        dm: DirectMessage;
      };

      if (payload.type === "dm.created") {
        const msg = payload.dm;
        const currentPartner = activePartnerRef.current;
        const currentScreen = screenRef.current;
        const currentUser = userRef.current;

        // Is the message from/to our active chat?
        const isCurrentChat =
          currentPartner &&
          (msg.sender.id === currentPartner.id || msg.recipient.id === currentPartner.id);

        if (isCurrentChat) {
          setMessages((current) => {
            if (current.some((d) => d.id === msg.id)) return current;
            return [...current, msg];
          });
        }

        // Update thread list
        if (currentUser) {
          setThreads((current) => {
            const partner = msg.sender.id === currentUser.id ? msg.recipient : msg.sender;
            const exists = current.some((t) => t.user.id === partner.id);
            const isChatOpen = currentPartner?.id === partner.id && currentScreen === "chat";

            if (exists) {
              return current
                .map((t) => {
                  if (t.user.id === partner.id) {
                    return {
                      ...t,
                      last_message: msg,
                      unread_count: isChatOpen ? 0 : t.unread_count + (msg.sender.id !== currentUser.id ? 1 : 0),
                    };
                  }
                  return t;
                })
                .sort(
                  (a, b) =>
                    new Date(b.last_message?.created_at || 0).getTime() -
                    new Date(a.last_message?.created_at || 0).getTime()
                );
            } else {
              return [
                {
                  user: partner,
                  last_message: msg,
                  unread_count: isChatOpen ? 0 : msg.sender.id !== currentUser.id ? 1 : 0,
                },
                ...current,
              ];
            }
          });
        }
      }
    };

    socket.onerror = (err) => {
      console.error("DM Widget WebSocket error:", err);
    };

    return () => {
      chatSocketRef.current = null;
      socket.close();
    };
  }, [token]);

  // Load all users for starting a new chat
  const handleOpenSearch = async () => {
    setScreen("search");
    if (!token) return;
    try {
      const list = await getUsers(token, { onlineOnly: true });
      setUsersList(list);
    } catch (err) {
      console.error("Error loading users:", err);
    }
  };

  const filteredUsers = useMemo(() => {
    return usersList.filter(
      (u) =>
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.profile?.display_name || "").toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [usersList, searchQuery]);

  const handleSelectPartner = (partner: User) => {
    setActivePartner(partner);
    setScreen("chat");
    setSearchQuery("");
    setReplyTarget(null);
    setSelectedFile(null);
    setMsgBody("");
  };

  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token || !activePartner || (!msgBody.trim() && !selectedFile)) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await postDM(token, activePartner.id, msgBody.trim(), {
        parentId: replyTarget?.id ?? null,
        attachment: selectedFile,
      });
      setMsgBody("");
      setSelectedFile(null);
      setReplyTarget(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setMessages((current) => {
        if (current.some((d) => d.id === response.id)) return current;
        return [...current, response];
      });

      // Update thread last message
      setThreads((current) => {
        const exists = current.some((t) => t.user.id === activePartner.id);
        const next = exists
          ? current.map((t) => {
              if (t.user.id === activePartner.id) {
                return { ...t, last_message: response, unread_count: 0 };
              }
              return t;
            })
          : [
              {
                user: activePartner,
                last_message: response,
                unread_count: 0,
              },
              ...current,
            ];

        return next
          .sort(
            (a, b) =>
              new Date(b.last_message?.created_at || 0).getTime() -
              new Date(a.last_message?.created_at || 0).getTime()
          );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderAttachment = (msg: DirectMessage) => {
    const url = getMediaUrl(msg.attachment_url || msg.attachment);
    if (!url) return null;
    const fileName = msg.attachment_name || "Attachment";
    const size = formatAttachmentSize(msg.attachment_size);

    if (isImageAttachment(msg)) {
      return (
        <a href={url} rel="noreferrer" target="_blank" style={{ display: "block", marginTop: msg.body ? "0.45rem" : 0 }}>
          <img
            alt={fileName}
            src={url}
            style={{
              width: "100%",
              maxHeight: "180px",
              objectFit: "cover",
              borderRadius: "12px",
              border: "1px solid var(--line)",
            }}
          />
        </a>
      );
    }

    return (
      <a
        href={url}
        rel="noreferrer"
        target="_blank"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginTop: msg.body ? "0.45rem" : 0,
          padding: "0.45rem 0.55rem",
          borderRadius: "10px",
          border: "1px solid var(--line)",
          background: "rgba(255, 255, 255, 0.58)",
          color: "inherit",
          fontSize: "0.72rem",
          minWidth: 0,
        }}
      >
        <span aria-hidden="true">File</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</span>
        {size && <span style={{ color: "var(--muted)", flexShrink: 0 }}>{size}</span>}
      </a>
    );
  };

  const renderMessageNode = (msg: MessageNode, depth = 0): React.ReactNode => {
    const isMine = msg.sender.id === user?.id;
    const senderName = msg.sender.profile?.display_name || msg.sender.username;

    return (
      <div key={msg.id} style={{ display: "grid", gap: "0.4rem", marginLeft: depth ? `${Math.min(depth, 4) * 14}px` : 0 }}>
        <div
          style={{
            alignSelf: isMine ? "flex-end" : "flex-start",
            background: isMine ? "var(--accent-soft)" : "rgba(255, 255, 255, 0.72)",
            color: isMine ? "var(--accent-strong)" : "var(--foreground)",
            padding: "0.5rem 0.75rem",
            borderRadius: "14px",
            maxWidth: depth ? "92%" : "80%",
            border: "1px solid var(--line)",
            justifySelf: isMine ? "end" : "start",
          }}
        >
          {depth > 0 && (
            <div style={{ color: "var(--muted)", fontSize: "0.62rem", marginBottom: "0.25rem" }}>
              Reply from {senderName}
            </div>
          )}
          {msg.body && <p style={{ wordBreak: "break-word", fontSize: "0.82rem", margin: 0 }}>{msg.body}</p>}
          {renderAttachment(msg)}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.6rem",
              color: "var(--muted)",
              marginTop: "0.35rem",
            }}
          >
            <button
              onClick={() => setReplyTarget(msg)}
              style={{ background: "none", border: "none", color: "inherit", padding: 0, fontSize: "0.6rem" }}
              type="button"
            >
              Reply
            </button>
            <span>
              {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
                new Date(msg.created_at)
              )}
            </span>
          </div>
        </div>
        {msg.replies.map((reply) => renderMessageNode(reply, depth + 1))}
      </div>
    );
  };

  if (!token || !user) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: 9999,
        fontFamily: "var(--font-mono), monospace",
      }}
    >
      {/* Chat Bubble Toggle Button */}
      {!drawerIsOpen && (
        <button
          onClick={() => setDrawerIsOpen(true)}
          style={{
            width: "60px",
            height: "60px",
            borderRadius: "50%",
            background: "var(--accent)",
            color: "white",
            border: "none",
            boxShadow: "0 10px 30px rgba(232, 93, 4, 0.4)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.5rem",
            position: "relative",
            transition: "transform 150ms ease",
          }}
          type="button"
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          DM
          {totalUnread > 0 && (
            <span
              style={{
                position: "absolute",
                top: "-2px",
                right: "-2px",
                background: "var(--danger)",
                color: "white",
                borderRadius: "50%",
                width: "22px",
                height: "22px",
                fontSize: "0.75rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              }}
            >
              {totalUnread}
            </span>
          )}
        </button>
      )}

      {/* Main Chat Drawer */}
      {drawerIsOpen && (
        <div
          style={{
            width: "360px",
            height: "500px",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "24px",
            boxShadow: "var(--shadow)",
            backdropFilter: "blur(16px)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "slideIn 200ms ease-out",
          }}
        >
          {/* Header */}
          <header
            style={{
              padding: "1rem",
              borderBottom: "1px solid var(--line)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "rgba(255, 255, 255, 0.3)",
            }}
          >
            {screen === "threads" && (
              <>
                <strong style={{ fontSize: "1rem" }}>Messages</strong>
                <button
                  className="button"
                  onClick={handleOpenSearch}
                  style={{
                    minHeight: "28px",
                    height: "28px",
                    padding: "0 0.75rem",
                    fontSize: "0.75rem",
                  }}
                  type="button"
                >
                  New Chat
                </button>
              </>
            )}

            {screen === "chat" && activePartner && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                  <button
                    onClick={() => setScreen("threads")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: "1.2rem",
                      padding: "0 4px",
                    }}
                    type="button"
                  >
                    Back
                  </button>
                  <WidgetAvatar
                    avatarUrl={activePartner.profile?.avatar_url}
                    name={activePartner.profile?.display_name || activePartner.username}
                  />
                  <strong
                    style={{
                      fontSize: "0.9rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {activePartner.profile?.display_name || activePartner.username}
                  </strong>
                </div>
              </>
            )}

            {screen === "search" && (
              <>
                <strong style={{ fontSize: "0.95rem" }}>New Conversation</strong>
                <button
                  onClick={() => setScreen("threads")}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--muted)",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                  }}
                  type="button"
                >
                  Cancel
                </button>
              </>
            )}

            <button
              onClick={() => setDrawerIsOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
                fontSize: "1.1rem",
                marginLeft: "auto",
                paddingLeft: "10px",
              }}
              type="button"
            >
              Close
            </button>
          </header>

          {/* Body Content */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: "1rem" }}>
            {screen === "threads" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", overflowY: "auto", flex: 1 }}>
                {threads.length ? (
                  threads.map((t) => (
                    <div
                      key={t.user.id}
                      onClick={() => handleSelectPartner(t.user)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        padding: "0.6rem",
                        borderRadius: "16px",
                        border: "1px solid var(--line)",
                        cursor: "pointer",
                        background: "rgba(255, 255, 255, 0.46)",
                        transition: "background 100ms ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.7)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.46)")}
                    >
                      <WidgetAvatar
                        avatarUrl={t.user.profile?.avatar_url}
                        name={t.user.profile?.display_name || t.user.username}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <strong
                            style={{
                              fontSize: "0.85rem",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {t.user.profile?.display_name || t.user.username}
                          </strong>
                          {t.unread_count > 0 && (
                            <span
                              style={{
                                background: "var(--danger)",
                                color: "white",
                                borderRadius: "999px",
                                padding: "1px 5px",
                                fontSize: "0.6rem",
                                fontWeight: "bold",
                              }}
                            >
                              {t.unread_count}
                            </span>
                          )}
                        </div>
                        <p
                          style={{
                            color: "var(--muted)",
                            fontSize: "0.75rem",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            marginTop: "2px",
                          }}
                        >
                          {getMessagePreview(t.last_message)}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--muted)" }}>
                    <p style={{ fontSize: "0.85rem" }}>No active conversations.</p>
                  </div>
                )}
              </div>
            )}

            {screen === "chat" && (
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                {error && <p className="form-error">{error}</p>}
                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    marginBottom: "0.75rem",
                    paddingRight: "4px",
                  }}
                >
                  {messageTree.length ? (
                    messageTree.map((msg) => renderMessageNode(msg))
                  ) : (
                    <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--muted)" }}>
                      <p style={{ fontSize: "0.8rem" }}>Say hello to start the conversation!</p>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {replyTarget && (
                  <div className="reply-banner" style={{ marginBottom: "0.5rem" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Replying to {replyTarget.sender.profile?.display_name || replyTarget.sender.username}:{" "}
                      {getMessagePreview(replyTarget)}
                    </span>
                    <button className="reply-banner__cancel" onClick={() => setReplyTarget(null)} type="button">
                      x
                    </button>
                  </div>
                )}

                {selectedFile && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                      marginBottom: "0.5rem",
                      padding: "0.45rem 0.6rem",
                      borderRadius: "12px",
                      border: "1px solid var(--line)",
                      background: "rgba(255, 255, 255, 0.58)",
                      fontSize: "0.75rem",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selectedFile.name} {formatAttachmentSize(selectedFile.size)}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      style={{ background: "none", border: "none", color: "var(--muted)", padding: "0 0.25rem" }}
                      type="button"
                    >
                      x
                    </button>
                  </div>
                )}

                <form onSubmit={handleSendMessage} style={{ display: "flex", gap: "0.5rem", marginTop: "auto" }}>
                  <input
                    accept="image/*,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    type="file"
                  />
                  <button
                    aria-label="Attach file"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "12px",
                      border: "1px solid var(--line)",
                      background: "rgba(255, 255, 255, 0.72)",
                      color: "var(--muted)",
                      flexShrink: 0,
                    }}
                    type="button"
                  >
                    +
                  </button>
                  <div className="field" style={{ flex: 1 }}>
                    <input
                      onChange={(e) => setMsgBody(e.target.value)}
                      placeholder={selectedFile ? "Add a note..." : "Type a message..."}
                      style={{ minHeight: "36px", borderRadius: "12px", padding: "0.5rem 0.75rem", fontSize: "0.85rem" }}
                      value={msgBody}
                    />
                  </div>
                  <button
                    className="button"
                    disabled={submitting || (!msgBody.trim() && !selectedFile)}
                    style={{ minHeight: "36px", borderRadius: "12px", padding: "0 0.85rem", fontSize: "0.85rem" }}
                    type="submit"
                  >
                    Send
                  </button>
                </form>
              </div>
            )}

            {screen === "search" && (
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                <div className="field" style={{ marginBottom: "0.75rem" }}>
                  <input
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search online users..."
                    style={{ minHeight: "36px", borderRadius: "12px", padding: "0.5rem" }}
                    value={searchQuery}
                  />
                </div>
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {filteredUsers.length ? (
                    filteredUsers.map((u) => (
                      <div
                        key={u.id}
                        onClick={() => handleSelectPartner(u)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          padding: "0.5rem",
                          borderRadius: "12px",
                          border: "1px solid var(--line)",
                          cursor: "pointer",
                          background: "rgba(255, 255, 255, 0.46)",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.7)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.46)")}
                      >
                        <WidgetAvatar
                          avatarUrl={u.profile?.avatar_url}
                          name={u.profile?.display_name || u.username}
                        />
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ fontSize: "0.85rem", display: "block" }}>
                            {u.profile?.display_name || u.username}
                          </strong>
                          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>@{u.username}</span>
                          <span
                            style={{
                              color: "var(--success)",
                              display: "block",
                              fontSize: "0.7rem",
                              marginTop: "2px",
                            }}
                          >
                            Online
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--muted)" }}>
                      <p style={{ fontSize: "0.8rem" }}>No online users found.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
