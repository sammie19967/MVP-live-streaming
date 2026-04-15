"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { getLiveFeed, type LiveSession } from "@/lib/api";

const FEED_POLL_INTERVAL_MS = 5000;

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

export function LiveDashboard() {
  const { isLoading, logout, token, user } = useAuth();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadFeed(isInitialLoad = false) {
      if (isInitialLoad) {
        setFeedLoading(true);
      }

      try {
        const data = await getLiveFeed();
        if (!isActive) {
          return;
        }
        setSessions(data);
        setFeedError(null);
      } catch (error) {
        if (!isActive) {
          return;
        }
        setFeedError(
          error instanceof Error ? error.message : "Unable to load live feed.",
        );
      } finally {
        if (isInitialLoad && isActive) {
          setFeedLoading(false);
        }
      }
    }

    void loadFeed(true);
    const intervalId = window.setInterval(() => {
      void loadFeed();
    }, FEED_POLL_INTERVAL_MS);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
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
            {feedLoading ? "Loading..." : `Auto-refreshing every 5s • ${sessions.length} live now`}
          </span>
        </div>

        {feedError ? <p className="form-error">{feedError}</p> : null}

        {feedLoading ? (
          <p className="muted">Loading the current sessions from Django.</p>
        ) : sessions.length ? (
          <div className="session-grid">
            {sessions.map((session) => (
              <article className="session-card" key={session.id}>
                <div className="session-card__meta">
                  <span className="session-badge">LIVE</span>
                  <span className="muted">{formatStartedAt(session.started_at)}</span>
                </div>
                <h3 className="session-card__title">{session.title}</h3>
                <p className="muted">
                  by {session.creator.profile.display_name || session.creator.username}
                </p>
                <p className="muted">
                  Cached viewers: {session.viewer_count_cached}
                </p>
                <p className="muted">
                  {session.comment_count} comments • {session.heart_count} hearts
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
    </div>
  );
}
