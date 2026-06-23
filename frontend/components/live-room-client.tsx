"use client";

import "@livekit/components-styles";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  TrackToggle,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import { ParticipantEvent, RoomEvent, Track, type Participant } from "livekit-client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import {
  buildWebSocketUrl,
  endLiveSession,
  getLiveComments,
  getLiveSession,
  getLiveToken,
  postLiveComment,
  postLiveReaction,
  getDMs,
  postDM,
  getDMThreads,
  type Comment,
  type LiveSession,
  type LiveTokenResponse,
  type DirectMessage,
  type DMThread,
  type User,
} from "@/lib/api";


type LiveRoomClientProps = {
  sessionId: string;
};

type ParticipantMetadata = {
  avatarUrl?: string;
  displayName?: string;
  handRaised?: boolean;
  role?: "creator" | "viewer";
};

function parseParticipantMetadata(metadata?: string): ParticipantMetadata {
  if (!metadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadata) as ParticipantMetadata;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function ParticipantCaption({ participant, source }: { participant: Participant; source: Track.Source }) {
  const [metadata, setMetadata] = useState(participant.metadata);
  const handRaised = parseParticipantMetadata(metadata).handRaised;
  const label = source === Track.Source.ScreenShare ? "Screen" : "Camera";

  useEffect(() => {
    const handleMetadataChanged = () => setMetadata(participant.metadata);
    participant.on(ParticipantEvent.ParticipantMetadataChanged, handleMetadataChanged);
    return () => {
      participant.off(ParticipantEvent.ParticipantMetadataChanged, handleMetadataChanged);
    };
  }, [participant]);

  return (
    <div className="video-caption">
      <span>{participant.name || participant.identity} - {label}</span>
      {handRaised ? <span className="hand-pill">Hand raised</span> : null}
    </div>
  );
}

function Stage({ audioMuted }: { audioMuted: boolean }) {
  const videoTracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: false },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  return (
    <div className="live-stage">
      <RoomAudioRenderer muted={audioMuted} />
      {videoTracks.length ? (
        <div className="video-grid">
          {videoTracks.map((trackRef) =>
            trackRef.publication ? (
              <div
                className="video-card"
                key={trackRef.publication.trackSid ?? trackRef.participant.identity}
              >
                <VideoTrack trackRef={trackRef} />
                <ParticipantCaption
                  participant={trackRef.participant}
                  source={trackRef.source}
                />
              </div>
            ) : null,
          )}
        </div>
      ) : (
        <div className="empty-stage">
          <h3 className="section-title">Waiting for camera feed</h3>
          <p className="section-copy">
            Turn on your camera or wait for someone else in the room to start video.
          </p>
        </div>
      )}
    </div>
  );
}

function getParticipantDisplayName(participant: Participant, metadata: ParticipantMetadata) {
  return metadata.displayName || participant.name || participant.identity;
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.length > 1
    ? `${words[0][0] ?? ""}${words[1][0] ?? ""}`
    : name.slice(0, 2);
  return initials.toUpperCase();
}

function ParticipantAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  return (
    <span
      aria-label={name}
      className={`participant-avatar ${avatarUrl ? "participant-avatar--image" : ""}`}
      style={avatarUrl ? { backgroundImage: `url("${avatarUrl}")` } : undefined}
    >
      {!avatarUrl ? getInitials(name) : null}
    </span>
  );
}

function ParticipantRoster() {
  const participants = useParticipants();

  return (
    <section className="participant-roster" aria-label="People in room">
      <div className="status-row">
        <h2 className="section-title">People in room</h2>
        <span className="muted">{participants.length} joined</span>
      </div>
      <div className="participant-list">
        {participants.map((participant) => {
          const metadata = parseParticipantMetadata(participant.metadata);
          const name = getParticipantDisplayName(participant, metadata);
          const role = metadata.role ?? "viewer";

          return (
            <article className="participant-row" key={participant.sid || participant.identity}>
              <ParticipantAvatar avatarUrl={metadata.avatarUrl} name={name} />
              <div className="participant-main">
                <div className="participant-name-row">
                  <strong>{name}</strong>
                  {participant.isLocal ? <span className="muted">You</span> : null}
                </div>
                <span className="muted">
                  {role === "creator" ? "Creator" : "Participant"}
                  {participant.isSpeaking ? " - speaking" : ""}
                </span>
              </div>
              <div className="participant-badges">
                {participant.isMicrophoneEnabled ? <span className="status-dot">Mic</span> : null}
                {participant.isCameraEnabled ? <span className="status-dot">Video</span> : null}
                {metadata.handRaised ? <span className="hand-pill">Hand</span> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function LiveControls({
  audioMuted,
  onAudioMutedChange,
  role,
}: {
  audioMuted: boolean;
  onAudioMutedChange: (muted: boolean) => void;
  role: "creator" | "viewer";
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [metadata, setMetadata] = useState(localParticipant.metadata);
  const [metadataBusy, setMetadataBusy] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);
  const handRaised = parseParticipantMetadata(metadata).handRaised;
  const canShareScreen = role === "creator";

  useEffect(() => {
    const handleMetadataChanged = () => setMetadata(localParticipant.metadata);
    const handleRoomMetadataChanged = (_metadata: string | undefined, participant?: Participant) => {
      if (participant?.sid === localParticipant.sid) {
        setMetadata(participant.metadata);
      }
    };

    localParticipant.on(ParticipantEvent.ParticipantMetadataChanged, handleMetadataChanged);
    room.on(RoomEvent.ParticipantMetadataChanged, handleRoomMetadataChanged);
    return () => {
      localParticipant.off(ParticipantEvent.ParticipantMetadataChanged, handleMetadataChanged);
      room.off(RoomEvent.ParticipantMetadataChanged, handleRoomMetadataChanged);
    };
  }, [localParticipant, room]);

  async function toggleHandRaised() {
    setMetadataBusy(true);
    setControlError(null);

    try {
      const nextMetadata = {
        ...parseParticipantMetadata(localParticipant.metadata),
        handRaised: !handRaised,
      };
      await localParticipant.setMetadata(JSON.stringify(nextMetadata));
      setMetadata(JSON.stringify(nextMetadata));
    } catch (raiseError) {
      setControlError(
        raiseError instanceof Error
          ? raiseError.message
          : "Unable to update your hand status.",
      );
    } finally {
      setMetadataBusy(false);
    }
  }

  return (
    <div className="live-controls-wrap">
      <div className="live-controls" aria-label="Live room controls">
        <TrackToggle className="control-button" source={Track.Source.Microphone}>
          Mic
        </TrackToggle>
        <TrackToggle className="control-button" source={Track.Source.Camera}>
          Camera
        </TrackToggle>
        {canShareScreen ? (
          <TrackToggle
            captureOptions={{ audio: true, selfBrowserSurface: "include" }}
            className="control-button"
            source={Track.Source.ScreenShare}
          >
            Share screen
          </TrackToggle>
        ) : null}
        <button
          className={`control-button ${handRaised ? "control-button--active" : ""}`}
          disabled={metadataBusy}
          onClick={() => void toggleHandRaised()}
          type="button"
        >
          {handRaised ? "Lower hand" : "Raise hand"}
        </button>
        <button
          className={`control-button ${audioMuted ? "control-button--active" : ""}`}
          onClick={() => onAudioMutedChange(!audioMuted)}
          type="button"
        >
          {audioMuted ? "Unmute audio" : "Mute audio"}
        </button>
        <button className="control-button control-button--danger" onClick={() => room.disconnect()} type="button">
          Leave
        </button>
      </div>
      {controlError ? <p className="form-error">{controlError}</p> : null}
    </div>
  );
}

function LiveRoomSurface({ role }: { role: "creator" | "viewer" }) {
  const [audioMuted, setAudioMuted] = useState(false);

  return (
    <>
      <Stage audioMuted={audioMuted} />
      <LiveControls
        audioMuted={audioMuted}
        onAudioMutedChange={setAudioMuted}
        role={role}
      />
      <ParticipantRoster />
    </>
  );
}

interface CommentNodeProps {
  comment: Comment;
  repliesMap: Map<number, Comment[]>;
  session: LiveSession;
  handleReply: (comment: Comment) => void;
}

function CommentNode({ comment, repliesMap, session, handleReply }: CommentNodeProps) {
  const replies = repliesMap.get(comment.id) ?? [];
  return (
    <div className="comment-thread" key={comment.id}>
      <article className={`comment-card ${comment.parent_id ? "comment-card--reply" : ""}`}>
        <div className="comment-card__meta">
          <strong>
            {comment.user.profile.display_name || comment.user.username}
          </strong>
          <span className="muted">
            {new Intl.DateTimeFormat(undefined, {
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(comment.created_at))}
          </span>
        </div>
        <p>{comment.body}</p>
        {session.status !== "ended" && (
          <button
            className="reply-btn"
            onClick={() => handleReply(comment)}
            type="button"
          >
            Reply
          </button>
        )}
      </article>

      {replies.length > 0 && (
        <div className="comment-replies">
          {replies.map((reply) => (
            <CommentNode
              key={reply.id}
              comment={reply}
              repliesMap={repliesMap}
              session={session}
              handleReply={handleReply}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function LiveRoomClient({ sessionId }: LiveRoomClientProps) {
  const searchParams = useSearchParams();
  const { token, user } = useAuth();
  const [session, setSession] = useState<LiveSession | null>(null);
  const [livekit, setLivekit] = useState<LiveTokenResponse | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [heartSubmitting, setHeartSubmitting] = useState(false);
  const [liveEndedMessage, setLiveEndedMessage] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const roomSocketRef = useRef<WebSocket | null>(null);
  const commentInputRef = useRef<HTMLInputElement | null>(null);

  // DM State
  const [activeTab, setActiveTab] = useState<"chat" | "dms">("chat");
  const [dms, setDms] = useState<DirectMessage[]>([]);
  const [dmThreads, setDmThreads] = useState<DMThread[]>([]);
  const [activeDmUser, setActiveDmUser] = useState<User | null>(null);
  const [dmBody, setDmBody] = useState("");
  const [dmSubmitting, setDmSubmitting] = useState(false);
  const chatSocketRef = useRef<WebSocket | null>(null);

  const requestedRole = searchParams.get("role") === "creator" ? "creator" : "viewer";
  const activeSessionId = session?.id;
  const activeSessionStatus = session?.status;
  const resolvedRole = useMemo(() => {
    if (requestedRole === "creator") {
      return "creator";
    }
    if (session && user && session.creator.id === user.id) {
      return "creator";
    }
    return "viewer";
  }, [requestedRole, session, user]);

  // Keep refs updated to prevent socket reconnections
  const activeDmUserRef = useRef(activeDmUser);
  const activeTabRef = useRef(activeTab);
  const resolvedRoleRef = useRef(resolvedRole);
  const sessionRef = useRef(session);
  const userRef = useRef(user);

  useEffect(() => { activeDmUserRef.current = activeDmUser; }, [activeDmUser]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { resolvedRoleRef.current = resolvedRole; }, [resolvedRole]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { userRef.current = user; }, [user]);

  const totalUnreadDMs = useMemo(() => {
    if (resolvedRole === "creator") {
      return dmThreads.reduce((sum, t) => sum + t.unread_count, 0);
    } else {
      return dms.filter((d) => d.sender.id === session?.creator.id && !d.is_read).length;
    }
  }, [dmThreads, dms, resolvedRole, session?.creator.id]);


  useEffect(() => {
    let isActive = true;

    async function loadRoom() {
      if (!token) {
        if (isActive) {
          setError("Login is required before joining a live room.");
          setLoading(false);
        }
        return;
      }

      try {
        const sessionData = await getLiveSession(sessionId);
        if (!isActive) {
          return;
        }

        setSession(sessionData);

        if (sessionData.status === "ended") {
          setLiveEndedMessage("This live has ended.");
        } else {
          const tokenRole =
            requestedRole === "creator" || sessionData.creator.id === user?.id
              ? "creator"
              : "viewer";
          const tokenData = await getLiveToken(token, sessionId, tokenRole);
          if (!isActive) {
            return;
          }
          setLivekit(tokenData);
        }
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the live room.",
        );
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    void loadRoom();
    return () => {
      isActive = false;
    };
  }, [requestedRole, sessionId, token, user?.id]);

  useEffect(() => {
    if (!token || !activeSessionId) {
      return;
    }

    const authToken = token;
    let isActive = true;

    async function loadComments() {
      try {
        const data = await getLiveComments(authToken, sessionId);
        if (!isActive) {
          return;
        }
        setComments(data);
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load live comments.",
        );
      }
    }

    void loadComments();

    return () => {
      isActive = false;
    };
  }, [activeSessionId, sessionId, token]);

  useEffect(() => {
    if (
      !token ||
      !activeSessionId ||
      activeSessionStatus === "ended" ||
      liveEndedMessage
    ) {
      return;
    }

    const socket = new WebSocket(
      buildWebSocketUrl(`/ws/live/sessions/${sessionId}/`, token),
    );
    roomSocketRef.current = socket;

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as
        | { type: "comment.created"; comment: Comment }
        | { type: "reaction.created"; heart_count: number }
        | { type: "session.updated" | "session.ended"; session: LiveSession };

      if (payload.type === "comment.created") {
        setComments((current) => {
          if (current.some((comment) => comment.id === payload.comment.id)) {
            return current;
          }
          return [...current, payload.comment];
        });
        return;
      }

      if (payload.type === "reaction.created") {
        setSession((current) =>
          current
            ? {
              ...current,
              heart_count: payload.heart_count,
            }
            : current,
        );
        return;
      }

      if (payload.type === "session.updated") {
        setSession(payload.session);
        return;
      }

      if (payload.type === "session.ended") {
        setSession(payload.session);
        setLiveEndedMessage("This live has ended.");
        socket.close();
      }
    };

    socket.onerror = (err) => {
      console.error("Room WebSocket error:", err);
      if (!liveEndedMessage) {
        setError("Room socket disconnected. Refresh to reconnect.");
      }
    };

    return () => {
      roomSocketRef.current = null;
      socket.close();
    };
  }, [activeSessionId, activeSessionStatus, liveEndedMessage, sessionId, token]);

  // Load DM threads for creator
  useEffect(() => {
    if (!token || resolvedRole !== "creator") {
      return;
    }

    async function loadThreads() {
      try {
        const threads = await getDMThreads(token!);
        setDmThreads(threads);
      } catch (e) {
        console.error("Error loading DM threads:", e);
      }
    }

    loadThreads();
  }, [token, resolvedRole]);

  // Load DM history for client
  useEffect(() => {
    if (!token || resolvedRole !== "viewer" || !session?.creator.id) {
      return;
    }

    async function loadClientDMs() {
      try {
        const history = await getDMs(token!, session!.creator.id);
        setDms(history);
      } catch (e) {
        console.error("Error loading client DMs:", e);
      }
    }

    if (activeTab === "dms") {
      void loadClientDMs();
    }
  }, [token, resolvedRole, session?.creator.id, activeTab]);

  // Load DM history for host with specific client
  useEffect(() => {
    if (!token || resolvedRole !== "creator" || !activeDmUser?.id) {
      return;
    }

    async function loadHostDMs() {
      try {
        const history = await getDMs(token!, activeDmUser!.id);
        setDms(history);
        setDmThreads((current) =>
          current.map((t) => (t.user.id === activeDmUser!.id ? { ...t, unread_count: 0 } : t))
        );
      } catch (e) {
        console.error("Error loading host DMs:", e);
      }
    }

    loadHostDMs();
  }, [token, resolvedRole, activeDmUser?.id]);

  // Global Chat WebSocket Connection
  useEffect(() => {
    if (!token) {
      return;
    }

    const socket = new WebSocket(buildWebSocketUrl("/ws/chat/", token));
    chatSocketRef.current = socket;

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as {
        type: "dm.created";
        dm: DirectMessage;
      };

      if (payload.type === "dm.created") {
        const msg = payload.dm;
        const currentActiveDmUser = activeDmUserRef.current;
        const currentResolvedRole = resolvedRoleRef.current;
        const currentSession = sessionRef.current;
        const currentUser = userRef.current;
        const currentActiveTab = activeTabRef.current;

        // Check if message belongs to the current conversation
        const isRelevant =
          currentResolvedRole === "creator"
            ? currentActiveDmUser &&
              (msg.sender.id === currentActiveDmUser.id || msg.recipient.id === currentActiveDmUser.id)
            : currentSession &&
              (msg.sender.id === currentSession.creator.id || msg.recipient.id === currentSession.creator.id);

        if (isRelevant) {
          setDms((current) => {
            if (current.some((d) => d.id === msg.id)) {
              return current;
            }
            return [...current, msg];
          });
        }

        // Update threads list for creator (host)
        if (currentResolvedRole === "creator" && currentUser) {
          setDmThreads((current) => {
            const partner = msg.sender.id === currentUser.id ? msg.recipient : msg.sender;
            const exists = current.some((t) => t.user.id === partner.id);
            const isCurrentActiveChat =
              currentActiveDmUser?.id === partner.id && currentActiveTab === "dms";

            if (exists) {
              return current
                .map((t) => {
                  if (t.user.id === partner.id) {
                    return {
                      ...t,
                      last_message: msg,
                      unread_count:
                        isCurrentActiveChat
                          ? 0
                          : t.unread_count + (msg.sender.id !== currentUser.id ? 1 : 0),
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
                  unread_count: isCurrentActiveChat ? 0 : msg.sender.id !== currentUser.id ? 1 : 0,
                },
                ...current,
              ];
            }
          });
        }
      }
    };

    socket.onerror = (err) => {
      console.error("Chat WebSocket error:", err);
    };

    return () => {
      chatSocketRef.current = null;
      socket.close();
    };
  }, [token]);

  async function handleDmSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !dmBody.trim()) {
      return;
    }

    let recipientId: number | null = null;
    if (resolvedRole === "creator") {
      recipientId = activeDmUser?.id ?? null;
    } else {
      recipientId = session?.creator.id ?? null;
    }

    if (!recipientId) {
      return;
    }

    setDmSubmitting(true);
    try {
      const response = await postDM(token, recipientId, dmBody.trim());
      setDmBody("");
      setDms((current) => {
        if (current.some((d) => d.id === response.id)) {
          return current;
        }
        return [...current, response];
      });

      if (resolvedRole === "creator") {
        setDmThreads((current) => {
          return current
            .map((t) => {
              if (t.user.id === recipientId) {
                return {
                  ...t,
                  last_message: response,
                };
              }
              return t;
            })
            .sort(
              (a, b) =>
                new Date(b.last_message?.created_at || 0).getTime() -
                new Date(a.last_message?.created_at || 0).getTime()
            );
        });
      }
    } catch (e) {
      console.error("Error sending DM:", e);
      setError(e instanceof Error ? e.message : "Failed to send private message.");
    } finally {
      setDmSubmitting(false);
    }
  }


  function handleReply(comment: Comment) {
    setReplyingTo(comment);
    setTimeout(() => commentInputRef.current?.focus(), 50);
  }

  function cancelReply() {
    setReplyingTo(null);
  }

  async function handleCommentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !commentBody.trim() || session?.status === "ended") {
      return;
    }

    setCommentSubmitting(true);
    setError(null);

    try {
      await postLiveComment(token, sessionId, commentBody.trim(), replyingTo?.id ?? null);
      setCommentBody("");
      setReplyingTo(null);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to post comment.",
      );
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function handleHeart() {
    if (!token || session?.status === "ended") {
      return;
    }

    setHeartSubmitting(true);
    setError(null);

    try {
      await postLiveReaction(token, sessionId, "heart");
    } catch (reactionError) {
      setError(
        reactionError instanceof Error
          ? reactionError.message
          : "Unable to send heart reaction.",
      );
    } finally {
      setHeartSubmitting(false);
    }
  }

  async function handleEndLive() {
    if (!token || !session) {
      return;
    }

    setEnding(true);
    setError(null);

    try {
      await endLiveSession(token, session.id);
      setSession((current) =>
        current
          ? {
            ...current,
            status: "ended",
            ended_at: new Date().toISOString(),
          }
          : current,
      );
      setLiveEndedMessage("You ended this live.");
      roomSocketRef.current?.close();
    } catch (endError) {
      setError(
        endError instanceof Error
          ? endError.message
          : "Unable to end this live session.",
      );
    } finally {
      setEnding(false);
    }
  }

  return (
    <main className="shell">
      <div className="nav" style={{ marginBottom: "1rem" }}>
        <div className="nav-brand">
          <span className="nav-mark">ROOM</span>
          <span className="nav-copy">LiveKit session bootstrap</span>
        </div>
        <div className="nav-row">
          <Link className="ghost-button" href="/">
            Back to feed
          </Link>
          {resolvedRole === "creator" ? (
            <button className="button" disabled={ending} onClick={() => void handleEndLive()} type="button">
              {ending ? "Ending..." : "End live"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {loading ? (
        <section className="panel stack">
          <h1 className="section-title">Loading room</h1>
          <p className="section-copy">
            Fetching session detail and requesting your LiveKit access token.
          </p>
        </section>
      ) : session && (session.status === "ended" || livekit) ? (
        <div className="grid room-layout room-grid">
          <section className="panel stack">
            <span className="eyebrow">{resolvedRole === "creator" ? "Broadcasting" : "Watching"}</span>
            <h1 className="section-title">{session.title}</h1>
            <p className="section-copy">
              Created by {session.creator.profile.display_name || session.creator.username}
            </p>
            <dl className="meta-list">
              <div>
                <dt>Room name</dt>
                <dd>{session.livekit_room_name}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{resolvedRole}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{session.status}</dd>
              </div>
              <div>
                <dt>Room sync</dt>
                <dd>WebSocket live updates</dd>
              </div>
              <div>
                <dt>Engagement</dt>
                <dd>{session.viewer_count_live} watching | {session.total_view_count} total views | {session.comment_count} comments | {session.heart_count} hearts</dd>
              </div>
            </dl>

            <div className="inline-actions">
              <button
                className="button"
                disabled={heartSubmitting || session.status === "ended"}
                onClick={() => void handleHeart()}
                type="button"
              >
                {heartSubmitting ? "Sending..." : `Send heart (${session.heart_count})`}
              </button>
            </div>
          </section>

          <section className="panel stack">
            {session.status === "ended" || liveEndedMessage ? (
              <div className="empty-stage">
                <h2 className="section-title">Live has ended</h2>
                <p className="section-copy">
                  {liveEndedMessage ?? "This live session is no longer active."}
                </p>
                <Link className="button" href="/">
                  Back to feed
                </Link>
              </div>
            ) : (
              <LiveKitRoom
                audio={resolvedRole === "creator"}
                video={resolvedRole === "creator"}
                connect
                data-lk-theme="default"
                serverUrl={livekit!.livekit_url}
                token={livekit!.token}
              >
                <LiveRoomSurface role={resolvedRole} />
              </LiveKitRoom>
            )}
          </section>

          <aside className="panel stack comments-panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Tabs Header */}
            <div className="tabs-header" style={{ display: "flex", borderBottom: "1px solid var(--line)", marginBottom: "1rem" }}>
              <button
                className={`tab-btn ${activeTab === "chat" ? "tab-btn--active" : ""}`}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === "chat" ? "2px solid var(--accent)" : "none",
                  fontWeight: activeTab === "chat" ? "bold" : "normal",
                  color: activeTab === "chat" ? "var(--accent)" : "var(--muted)",
                  cursor: "pointer"
                }}
                onClick={() => setActiveTab("chat")}
                type="button"
              >
                Live Chat
              </button>
              <button
                className={`tab-btn ${activeTab === "dms" ? "tab-btn--active" : ""}`}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === "dms" ? "2px solid var(--accent)" : "none",
                  fontWeight: activeTab === "dms" ? "bold" : "normal",
                  color: activeTab === "dms" ? "var(--accent)" : "var(--muted)",
                  cursor: "pointer",
                  position: "relative"
                }}
                onClick={() => setActiveTab("dms")}
                type="button"
              >
                Direct Messages
                {totalUnreadDMs > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "2px",
                      right: "10px",
                      background: "var(--danger)",
                      color: "white",
                      borderRadius: "999px",
                      padding: "2px 6px",
                      fontSize: "0.7rem",
                      fontWeight: "bold"
                    }}
                  >
                    {totalUnreadDMs}
                  </span>
                )}
              </button>
            </div>

            {activeTab === "chat" ? (
              <>
                <div className="status-row">
                  <h2 className="section-title">Live chat</h2>
                  <span className="muted">Instant WebSocket updates</span>
                </div>

                <form className="stack" onSubmit={handleCommentSubmit}>
                  {replyingTo && (
                    <div className="reply-banner">
                      <span>
                        Replying to{" "}
                        <strong>
                          {replyingTo.user.profile.display_name || replyingTo.user.username}
                        </strong>
                      </span>
                      <button
                        className="reply-banner__cancel"
                        onClick={cancelReply}
                        type="button"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="comment">Comment</label>
                    <input
                      id="comment"
                      ref={commentInputRef}
                      maxLength={500}
                      onChange={(event) => setCommentBody(event.target.value)}
                      placeholder={
                        replyingTo
                          ? `Reply to ${replyingTo.user.profile.display_name || replyingTo.user.username}...`
                          : "Say something in the stream..."
                      }
                      disabled={session.status === "ended"}
                      value={commentBody}
                    />
                  </div>
                  <button
                    className="button"
                    disabled={commentSubmitting || !commentBody.trim() || session.status === "ended"}
                    type="submit"
                  >
                    {commentSubmitting ? "Posting..." : replyingTo ? "Reply" : "Send comment"}
                  </button>
                </form>

                <div className="comment-list">
                  {comments.length ? (
                    (() => {
                      const rootComments = comments.filter((c) => !c.parent_id);
                      const repliesByParent = new Map<number, Comment[]>();
                      for (const c of comments) {
                        if (c.parent_id) {
                          const list = repliesByParent.get(c.parent_id) ?? [];
                          list.push(c);
                          repliesByParent.set(c.parent_id, list);
                        }
                      }

                      return rootComments.map((comment) => (
                        <CommentNode
                          key={comment.id}
                          comment={comment}
                          repliesMap={repliesByParent}
                          session={session}
                          handleReply={handleReply}
                        />
                      ));
                    })()
                  ) : (
                    <div className="empty-stage">
                      <h3 className="section-title">No comments yet</h3>
                      <p className="section-copy">
                        Start the conversation from this panel.
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Direct Messages Tab */
              <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                {resolvedRole === "creator" ? (
                  /* Creator/Host View */
                  activeDmUser ? (
                    /* Creator chatting with specific client */
                    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                        <button
                          className="ghost-button"
                          style={{ minHeight: "32px", height: "32px", padding: "0 0.75rem", fontSize: "0.85rem" }}
                          onClick={() => setActiveDmUser(null)}
                          type="button"
                        >
                          ← Back
                        </button>
                        <strong style={{ fontSize: "0.95rem" }}>
                          Chat with {activeDmUser.profile?.display_name || activeDmUser.username}
                        </strong>
                      </div>

                      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem", paddingRight: "4px" }}>
                        {dms.length ? (
                          dms.map((dm) => (
                            <div
                              key={dm.id}
                              style={{
                                alignSelf: dm.sender.id === user?.id ? "flex-end" : "flex-start",
                                background: dm.sender.id === user?.id ? "var(--accent-soft)" : "rgba(255, 255, 255, 0.72)",
                                color: dm.sender.id === user?.id ? "var(--accent-strong)" : "var(--foreground)",
                                padding: "0.6rem 0.9rem",
                                borderRadius: "16px",
                                maxWidth: "85%",
                                border: "1px solid var(--line)"
                              }}
                            >
                              <p style={{ wordBreak: "break-word", fontSize: "0.9rem" }}>{dm.body}</p>
                              <div style={{ fontSize: "0.65rem", color: "var(--muted)", textAlign: "right", marginTop: "0.2rem" }}>
                                {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(dm.created_at))}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="empty-stage" style={{ padding: "1rem 0" }}>
                            <p className="section-copy">No messages yet. Send a message to start the conversation.</p>
                          </div>
                        )}
                      </div>

                      <form className="stack" onSubmit={handleDmSubmit}>
                        <div className="field">
                          <input
                            onChange={(e) => setDmBody(e.target.value)}
                            placeholder="Type a private reply..."
                            value={dmBody}
                          />
                        </div>
                        <button
                          className="button"
                          disabled={dmSubmitting || !dmBody.trim()}
                          type="submit"
                        >
                          {dmSubmitting ? "Sending..." : "Send Message"}
                        </button>
                      </form>
                    </div>
                  ) : (
                    /* Creator viewing all DM threads */
                    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflowY: "auto" }}>
                      <h3 className="section-title" style={{ fontSize: "0.95rem", marginBottom: "0.75rem" }}>
                        Inbox Conversations
                      </h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {dmThreads.length ? (
                          dmThreads.map((thread) => (
                            <div
                              key={thread.user.id}
                              onClick={() => setActiveDmUser(thread.user)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.75rem",
                                padding: "0.75rem",
                                borderRadius: "16px",
                                border: "1px solid var(--line)",
                                cursor: "pointer",
                                background: "rgba(255, 255, 255, 0.46)",
                                transition: "background 120ms ease"
                              }}
                            >
                              <ParticipantAvatar
                                avatarUrl={thread.user.profile?.avatar_url}
                                name={thread.user.profile?.display_name || thread.user.username}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <strong style={{ fontSize: "0.9rem", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                                    {thread.user.profile?.display_name || thread.user.username}
                                  </strong>
                                  {thread.unread_count > 0 && (
                                    <span
                                      style={{
                                        background: "var(--danger)",
                                        color: "white",
                                        borderRadius: "999px",
                                        padding: "1px 5px",
                                        fontSize: "0.65rem",
                                        fontWeight: "bold"
                                      }}
                                    >
                                      {thread.unread_count} new
                                    </span>
                                  )}
                                </div>
                                <p style={{
                                  color: "var(--muted)",
                                  fontSize: "0.8rem",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  marginTop: "0.1rem"
                                }}>
                                  {thread.last_message ? thread.last_message.body : "No messages yet"}
                                </p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="empty-stage" style={{ padding: "2rem 0" }}>
                            <p className="section-copy">No active DM threads.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                ) : (
                  /* Viewer/Client View (Direct chat with host) */
                  <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                      <strong style={{ fontSize: "0.95rem" }}>
                        Chat with Creator ({session.creator.profile?.display_name || session.creator.username})
                      </strong>
                    </div>

                    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem", paddingRight: "4px" }}>
                      {dms.length ? (
                        dms.map((dm) => (
                          <div
                            key={dm.id}
                            style={{
                              alignSelf: dm.sender.id === user?.id ? "flex-end" : "flex-start",
                              background: dm.sender.id === user?.id ? "var(--accent-soft)" : "rgba(255, 255, 255, 0.72)",
                              color: dm.sender.id === user?.id ? "var(--accent-strong)" : "var(--foreground)",
                              padding: "0.6rem 0.9rem",
                              borderRadius: "16px",
                              maxWidth: "85%",
                              border: "1px solid var(--line)"
                            }}
                          >
                            <p style={{ wordBreak: "break-word", fontSize: "0.9rem" }}>{dm.body}</p>
                            <div style={{ fontSize: "0.65rem", color: "var(--muted)", textAlign: "right", marginTop: "0.2rem" }}>
                              {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(dm.created_at))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="empty-stage" style={{ padding: "1rem 0" }}>
                          <p className="section-copy">Send a message to chat privately with the host.</p>
                        </div>
                      )}
                    </div>

                    <form className="stack" onSubmit={handleDmSubmit}>
                      <div className="field">
                        <input
                          onChange={(e) => setDmBody(e.target.value)}
                          placeholder="Type a private message..."
                          value={dmBody}
                        />
                      </div>
                      <button
                        className="button"
                        disabled={dmSubmitting || !dmBody.trim()}
                        type="submit"
                      >
                        {dmSubmitting ? "Sending..." : "Send DM"}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      ) : (
        <section className="panel stack">
          <h1 className="section-title">Room unavailable</h1>
          <p className="section-copy">
            The session could not be loaded. Return to the feed and try again.
          </p>
        </section>
      )}
    </main>
  );
}
