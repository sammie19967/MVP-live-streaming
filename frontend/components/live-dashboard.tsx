"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { buildWebSocketUrl, getLiveFeed, getMediaUrl, type LiveSession } from "@/lib/api";

function formatStartedAt(value: string | null) {
  if (!value) {
    return "Starting now";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(seconds: number | null) {
  if (seconds === null || seconds === undefined) {
    return "0s";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const remainingSecs = seconds % 60;
  if (mins < 60) {
    return `${mins}m ${remainingSecs}s`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

export function LiveDashboard() {
  const { isLoading, logout, token, user } = useAuth();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [pastSessions, setPastSessions] = useState<LiveSession[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadFeed() {
      try {
        const data = await getLiveFeed("live");
        if (!isActive) {
          return;
        }
        setSessions(data);

        const endedData = await getLiveFeed("ended");
        if (!isActive) {
          return;
        }
        setPastSessions(endedData);
        setFeedError(null);
      } catch (error) {
        if (!isActive) {
          return;
        }
        setFeedError(
          error instanceof Error ? error.message : "Unable to load live feed.",
        );
      } finally {
        if (isActive) {
          setFeedLoading(false);
        }
      }
    }

    void loadFeed();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const socket = new WebSocket(buildWebSocketUrl("/ws/live/feed/"));

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as {
        type: string;
        session: LiveSession;
      };

      if (payload.type === "session.started") {
        setSessions((current) => {
          const withoutDuplicate = current.filter(
            (session) => session.id !== payload.session.id,
          );
          return [payload.session, ...withoutDuplicate];
        });
      } else if (payload.type === "session.updated") {
        setSessions((current) =>
          current.map((session) =>
            session.id === payload.session.id ? payload.session : session,
          )
        );
      } else if (payload.type === "session.ended") {
        setSessions((current) =>
          current.filter((session) => session.id !== payload.session.id)
        );
        setPastSessions((current) => {
          const withoutDuplicate = current.filter(
            (session) => session.id !== payload.session.id,
          );
          return [payload.session, ...withoutDuplicate];
        });
      }
    };

    socket.onerror = () => {
      setFeedError("Live feed socket disconnected. Refresh to reconnect.");
    };

    return () => {
      socket.close();
    };
  }, []);

  return (
    <div className="shell">
      <nav className="nav">
        <div className="nav-brand">
          <span className="nav-mark">LIVE MVP</span>
          <span className="nav-copy">
            Django auth, live feed, and LiveKit room flow
          </span>
        </div>
        <div className="nav-row">
          <Link className="ghost-button" href="/">
            Feed
          </Link>
          {user ? (
            <>
              <Link className="ghost-button" href="/live/setup">
                Go live
              </Link>
              <button className="button" onClick={() => void logout()} type="button">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link className="ghost-button" href="/login">
                Login
              </Link>
              <Link className="button" href="/register">
                Register
              </Link>
            </>
          )}
        </div>
      </nav>

      <section className="hero-card">
        <span className="eyebrow">Live MVP</span>
        <h1 className="headline">Start live. Join live. Prove the loop.</h1>
        <p className="lede">
          This is the first live slice of the product. A creator can create an
          active session, viewers can enter it, and the room is backed by the
          Django API plus LiveKit OSS.
        </p>
        <div className="cta-row">
          {user ? (
            <Link className="button" href="/live/setup">
              Start a live session
            </Link>
          ) : (
            <Link className="button" href="/register">
              Create an account
            </Link>
          )}
          <Link className="ghost-button" href="#live-feed">
            Browse active sessions
          </Link>
        </div>
      </section>

      <div className="grid two-col" style={{ marginTop: "1.5rem" }}>
        <section className="status-card stack">
          <div className="status-row">
            <h2 className="section-title">Session state</h2>
            <span className={`status-pill ${user ? "" : "offline"}`}>
              {isLoading ? "Checking session" : user ? "Authenticated" : "Guest"}
            </span>
          </div>
          <dl className="meta-list">
            <div>
              <dt>Current user</dt>
              <dd>{user ? `${user.username} (${user.email})` : "Not signed in"}</dd>
            </div>
            <div>
              <dt>Stored token</dt>
              <dd>{token ? `${token.slice(0, 12)}...` : "No token stored"}</dd>
            </div>
            <div>
              <dt>Live access</dt>
              <dd>
                {user
                  ? "You can start or join sessions."
                  : "Login is required because viewer tokens are protected by the backend."}
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel stack">
          <h2 className="section-title">What this slice covers</h2>
          <ul className="feature-list">
            <li>Fetch active sessions from `GET /api/live/feed`.</li>
            <li>Start a room from `/live/setup` using `POST /api/live/start`.</li>
            <li>Join a room at `/live/[sessionId]` with a viewer or creator token.</li>
            <li>Render the remote camera feed and local publishing state.</li>
          </ul>
        </section>
      </div>

      <section className="panel stack" id="live-feed" style={{ marginTop: "1.5rem" }}>
        <div className="status-row">
          <h2 className="section-title">Active live feed</h2>
          <span className="muted">
            {feedLoading ? "Loading..." : `Live updates enabled | ${sessions.length} live now`}
          </span>
        </div>

        {feedError ? <p className="form-error">{feedError}</p> : null}

        {feedLoading ? (
          <p className="muted">Loading the current sessions from Django.</p>
        ) : sessions.length ? (
          <div className="session-grid">
            {sessions.map((session) => (
              <article className="session-card" key={session.id}>
                {session.thumbnail ? (
                  <div className="session-card__thumbnail">
                    <img src={getMediaUrl(session.thumbnail) ?? undefined} alt={session.title} />
                  </div>
                ) : (
                  <div className="session-card__thumbnail placeholder-gradient" />
                )}
                <div className="session-card__meta">
                  <span className="session-badge">LIVE</span>
                  <span className="muted">{formatStartedAt(session.started_at)}</span>
                </div>
                <h3 className="session-card__title">{session.title}</h3>
                <p className="muted">
                  by {session.creator.profile.display_name || session.creator.username}
                </p>
                <p className="muted">
                  Live viewers: {session.viewer_count_live} | Total views: {session.total_view_count}
                </p>
                <p className="muted">
                  {session.comment_count} comments | {session.heart_count} hearts
                </p>
                <Link className="button" href={`/live/${session.id}`}>
                  Join room
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3 className="section-title">No one is live yet.</h3>
            <p className="section-copy">
              Start the first session from the creator flow and it will appear here.
            </p>
            {user ? (
              <Link className="button" href="/live/setup">
                Start first live
              </Link>
            ) : null}
          </div>
        )}
      </section>

      {/* Past Broadcasts Section */}
      <section className="panel stack" id="past-broadcasts" style={{ marginTop: "1.5rem" }}>
        <div className="status-row">
          <h2 className="section-title">Past broadcasts</h2>
          <span className="muted">
            {feedLoading ? "Loading..." : `Recorded live sessions | ${pastSessions.length} recorded`}
          </span>
        </div>

        {feedLoading ? (
          <p className="muted">Loading past broadcasts from Django.</p>
        ) : pastSessions.length ? (
          <div className="session-grid">
            {pastSessions.map((session) => (
              <article className="session-card session-card--past" key={session.id}>
                {session.thumbnail ? (
                  <div className="session-card__thumbnail">
                    <img src={getMediaUrl(session.thumbnail) ?? undefined} alt={session.title} />
                  </div>
                ) : (
                  <div className="session-card__thumbnail placeholder-gradient" />
                )}
                <div className="session-card__meta">
                  <span className="session-badge session-badge--ended">ENDED</span>
                  <span className="muted">{formatStartedAt(session.started_at)}</span>
                </div>
                <h3 className="session-card__title">{session.title}</h3>
                <p className="muted">
                  by {session.creator.profile.display_name || session.creator.username}
                </p>
                <div className="past-stats" style={{ display: "grid", gap: "0.2rem", fontSize: "0.88rem" }}>
                  <p className="muted">
                    Duration: <strong>{formatDuration(session.duration_seconds)}</strong>
                  </p>
                  <p className="muted">
                    Total views: <strong>{session.total_view_count}</strong>
                  </p>
                  <p className="muted">
                    Engagement: <strong>{session.comment_count} comments</strong> | <strong>{session.heart_count} hearts</strong>
                  </p>
                </div>
                <Link className="button ghost-button" href={`/live/${session.id}`}>
                  View archive
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3 className="section-title">No recordings available.</h3>
            <p className="section-copy">
              Ended live streams will appear here as records for future reference.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
