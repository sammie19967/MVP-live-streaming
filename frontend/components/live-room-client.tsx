"use client";

import "@livekit/components-styles";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  TrackToggle,
  useLocalParticipant,
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
  type Comment,
  type LiveSession,
  type LiveTokenResponse,
} from "@/lib/api";

type LiveRoomClientProps = {
  sessionId: string;
};

type ParticipantMetadata = {
  handRaised?: boolean;
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
      <span>{participant.name || participant.identity} · {label}</span>
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
            If you are the creator, grant camera and microphone permissions so your stream can publish.
          </p>
        </div>
      )}
    </div>
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
  const canPublish = role === "creator";

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
        {canPublish ? (
          <>
            <TrackToggle className="control-button" source={Track.Source.Microphone}>
              Mic
            </TrackToggle>
            <TrackToggle className="control-button" source={Track.Source.Camera}>
              Camera
            </TrackToggle>
            <TrackToggle
              captureOptions={{ audio: true, selfBrowserSurface: "include" }}
              className="control-button"
              source={Track.Source.ScreenShare}
            >
              Share screen
            </TrackToggle>
          </>
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

    socket.onerror = () => {
      if (!liveEndedMessage) {
        setError("Room socket disconnected. Refresh to reconnect.");
      }
    };

    return () => {
      roomSocketRef.current = null;
      socket.close();
    };
  }, [activeSessionId, activeSessionStatus, liveEndedMessage, sessionId, token]);

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

          <aside className="panel stack comments-panel">
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
