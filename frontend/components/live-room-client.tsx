"use client";

import "@livekit/components-styles";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

function Stage() {
  const cameraTracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: false },
  ]);

  return (
    <div className="live-stage">
      <RoomAudioRenderer />
      {cameraTracks.length ? (
        <div className="video-grid">
          {cameraTracks.map((trackRef) =>
            trackRef.publication ? (
              <div
                className="video-card"
                key={trackRef.publication.trackSid ?? trackRef.participant.identity}
              >
                <VideoTrack trackRef={trackRef} />
                <div className="video-caption">
                  {trackRef.participant.name || trackRef.participant.identity}
                </div>
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

export function LiveRoomClient({ sessionId }: LiveRoomClientProps) {
  const router = useRouter();
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

  const requestedRole = searchParams.get("role") === "creator" ? "creator" : "viewer";
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
        const [sessionData, tokenData] = await Promise.all([
          getLiveSession(sessionId),
          getLiveToken(token, sessionId, requestedRole),
        ]);
        if (!isActive) {
          return;
        }
        setSession(sessionData);
        setLivekit(tokenData);
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
  }, [requestedRole, sessionId, token]);

  useEffect(() => {
    if (!token || !session) {
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
  }, [session, sessionId, token]);

  useEffect(() => {
    if (!token || !session) {
      return;
    }

    const socket = new WebSocket(
      buildWebSocketUrl(`/ws/live/sessions/${sessionId}/`, token),
    );

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
        router.push("/");
        router.refresh();
      }
    };

    socket.onerror = () => {
      setError("Room socket disconnected. Refresh to reconnect.");
    };

    return () => {
      socket.close();
    };
  }, [router, session, sessionId, token]);

  async function handleCommentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !commentBody.trim()) {
      return;
    }

    setCommentSubmitting(true);
    setError(null);

    try {
      await postLiveComment(token, sessionId, commentBody.trim());
      setCommentBody("");
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
    if (!token) {
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
      router.push("/");
      router.refresh();
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
      ) : session && livekit ? (
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
                <dd>{session.comment_count} comments | {session.heart_count} hearts</dd>
              </div>
            </dl>

            <div className="inline-actions">
              <button className="button" disabled={heartSubmitting} onClick={() => void handleHeart()} type="button">
                {heartSubmitting ? "Sending..." : `Send heart (${session.heart_count})`}
              </button>
            </div>
          </section>

          <section className="panel stack">
            <LiveKitRoom
              audio={resolvedRole === "creator"}
              video={resolvedRole === "creator"}
              connect
              data-lk-theme="default"
              serverUrl={livekit.livekit_url}
              token={livekit.token}
            >
              <Stage />
            </LiveKitRoom>
          </section>

          <aside className="panel stack comments-panel">
            <div className="status-row">
              <h2 className="section-title">Live chat</h2>
              <span className="muted">Instant WebSocket updates</span>
            </div>

            <form className="stack" onSubmit={handleCommentSubmit}>
              <div className="field">
                <label htmlFor="comment">Comment</label>
                <input
                  id="comment"
                  maxLength={500}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Say something in the stream..."
                  value={commentBody}
                />
              </div>
              <button className="button" disabled={commentSubmitting || !commentBody.trim()} type="submit">
                {commentSubmitting ? "Posting..." : "Send comment"}
              </button>
            </form>

            <div className="comment-list">
              {comments.length ? (
                comments.map((comment) => (
                  <article className="comment-card" key={comment.id}>
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
                  </article>
                ))
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
