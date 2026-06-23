"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { DirectMessageWidget } from "@/components/dm-widget";
import { SiteNavbar } from "@/components/site-navbar";
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

/* ─────────────────────────── LiveBadge ─────────────────────────── */
function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-widest uppercase bg-[#ff2d55]/15 text-[#ff2d55] border border-[#ff2d55]/20">
      <span className="w-1.5 h-1.5 rounded-full bg-[#ff2d55] animate-pulse" />
      LIVE
    </span>
  );
}

/* ─────────────────────────── EndedBadge ─────────────────────────── */
function EndedBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-widest uppercase bg-white/5 text-white/40 border border-white/10">
      ENDED
    </span>
  );
}

/* ─────────────────────────── SessionCard ─────────────────────────── */
function SessionCard({ session, isLive }: { session: LiveSession; isLive: boolean }) {
  return (
    <article className="group relative flex flex-col gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 transition-all duration-300 hover:border-violet-500/30 hover:bg-white/[0.05] hover:shadow-[0_0_32px_rgba(124,58,237,0.1)] hover:-translate-y-0.5">
      {/* Thumbnail */}
      <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/[0.06]">
        {session.thumbnail ? (
          <img
            src={getMediaUrl(session.thumbnail) ?? undefined}
            alt={session.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-violet-900/40 via-purple-900/30 to-pink-900/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-white/10" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z" />
            </svg>
          </div>
        )}
        {/* Overlay badge */}
        <div className="absolute top-2.5 left-2.5">
          {isLive ? <LiveBadge /> : <EndedBadge />}
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-col gap-1.5 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[0.95rem] font-semibold text-white/90 leading-tight line-clamp-2 tracking-tight">
            {session.title}
          </h3>
        </div>

        <p className="text-xs text-white/40 font-mono">
          by{" "}
          <span className="text-white/60">
            {session.creator.profile.display_name || session.creator.username}
          </span>
        </p>

        {isLive ? (
          <div className="flex items-center gap-3 text-xs text-white/40 font-mono mt-1">
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
              </svg>
              {session.viewer_count_live}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              </svg>
              {session.heart_count}
            </span>
            <span className="ml-auto text-white/30">
              {formatStartedAt(session.started_at)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-xs text-white/40 font-mono mt-1">
            <span>⏱ {formatDuration(session.duration_seconds)}</span>
            <span>👁 {session.total_view_count}</span>
            <span>💬 {session.comment_count}</span>
          </div>
        )}
      </div>

      {/* CTA */}
      <Link
        href={`/live/${session.id}`}
        className={`mt-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
          isLive
            ? "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/30"
            : "bg-white/[0.06] hover:bg-white/[0.1] text-white/70 border border-white/10"
        }`}
      >
        {isLive ? (
          <>
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            Join room
          </>
        ) : (
          "View archive"
        )}
      </Link>
    </article>
  );
}

/* ─────────────────────────── EmptyState ─────────────────────────── */
function EmptyState({ isLive, user }: { isLive: boolean; user: { username?: string } | null }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
        <svg className="w-8 h-8 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isLive ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          )}
        </svg>
      </div>
      <div>
        <p className="text-white/60 font-semibold text-sm">
          {isLive ? "No one is live yet" : "No recordings available"}
        </p>
        <p className="text-white/30 text-xs mt-1">
          {isLive
            ? "Be the first to go live"
            : "Ended streams will appear here"}
        </p>
      </div>
      {isLive && user && (
        <Link
          href="/live/setup"
          className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors duration-200"
        >
          Start first live
        </Link>
      )}
    </div>
  );
}

/* ─────────────────────────── Hero ─────────────────────────── */
function Hero({ user }: { user: { username: string; email: string } | null }) {
  return (
    <section className="relative pt-32 pb-20 px-6 overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute top-20 right-0 w-72 h-72 rounded-full bg-pink-600/6 blur-[80px]" />
      </div>

      <div className="relative max-w-5xl mx-auto text-center">
        {/* Eyebrow */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-violet-500/25 bg-violet-500/10 text-violet-300 text-xs font-semibold tracking-widest uppercase mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          Live Streaming Platform
        </div>

        {/* Headline */}
        <h1 className="font-heading text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight text-white leading-[0.9] mb-6">
          Go live.
          <br />
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
            Reach everyone.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-white/40 text-lg max-w-xl mx-auto leading-relaxed mb-10 font-mono text-base">
          Start or join live sessions in real-time. Powered by LiveKit and Django.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          {user ? (
            <Link
              href="/live/setup"
              className="group flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-all duration-200 shadow-xl shadow-violet-900/40 hover:shadow-violet-900/60 hover:-translate-y-0.5"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              Start a live session
            </Link>
          ) : (
            <Link
              href="/register"
              className="group flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-all duration-200 shadow-xl shadow-violet-900/40 hover:shadow-violet-900/60 hover:-translate-y-0.5"
            >
              Get started free
              <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          )}
          <Link
            href="#live-feed"
            className="px-7 py-3.5 rounded-2xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.07] text-white/70 hover:text-white font-semibold text-sm transition-all duration-200"
          >
            Browse sessions
          </Link>
        </div>

        {/* Stats row */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-8 text-center">
          {[
            { label: "Real-time", value: "WebSocket" },
            { label: "Video", value: "LiveKit OSS" },
            { label: "Auth", value: "Django API" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col gap-0.5">
              <span className="text-white font-bold text-lg font-heading">{stat.value}</span>
              <span className="text-white/30 text-xs uppercase tracking-widest font-mono">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── SectionHeader ─────────────────────────── */
function SectionHeader({
  title,
  badge,
  count,
  loading,
}: {
  title: string;
  badge?: string;
  count?: number;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-white font-heading tracking-tight">{title}</h2>
        {badge && (
          <span className="px-2.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 text-xs font-semibold border border-violet-500/20">
            {badge}
          </span>
        )}
      </div>
      <span className="text-xs text-white/30 font-mono">
        {loading ? "Loading..." : `${count ?? 0} sessions`}
      </span>
    </div>
  );
}

/* ─────────────────────────── LiveDashboard ─────────────────────────── */
export function LiveDashboard() {
  const { isLoading, logout, token, user } = useAuth();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [pastSessions, setPastSessions] = useState<LiveSession[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [isDmOpen, setIsDmOpen] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadFeed() {
      try {
        const data = await getLiveFeed("live");
        if (!isActive) return;
        setSessions(data);

        const endedData = await getLiveFeed("ended");
        if (!isActive) return;
        setPastSessions(endedData);
        setFeedError(null);
      } catch (error) {
        if (!isActive) return;
        setFeedError(
          error instanceof Error ? error.message : "Unable to load live feed.",
        );
      } finally {
        if (isActive) setFeedLoading(false);
      }
    }

    void loadFeed();
    return () => { isActive = false; };
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

    return () => { socket.close(); };
  }, []);

  return (
    <div className="min-h-screen">
      <SiteNavbar />

      <Hero user={user} />

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 pb-24 space-y-16">
        {/* Error banner */}
        {feedError && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z" />
            </svg>
            {feedError}
          </div>
        )}

        {/* Active Live Feed */}
        <section id="live-feed">
          <SectionHeader
            title="Live right now"
            badge="LIVE"
            count={sessions.length}
            loading={feedLoading}
          />

          {feedLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4 space-y-3 animate-pulse"
                >
                  <div className="aspect-video rounded-xl bg-white/[0.05]" />
                  <div className="h-3 w-3/4 rounded-full bg-white/[0.05]" />
                  <div className="h-3 w-1/2 rounded-full bg-white/[0.04]" />
                  <div className="h-9 rounded-xl bg-white/[0.04]" />
                </div>
              ))}
            </div>
          ) : sessions.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sessions.map((session) => (
                <SessionCard key={session.id} session={session} isLive={true} />
              ))}
            </div>
          ) : (
            <EmptyState isLive={true} user={user} />
          )}
        </section>

        {/* Divider */}
        <div className="border-t border-white/[0.06]" />

        {/* Past Broadcasts */}
        <section id="past-broadcasts">
          <SectionHeader
            title="Past broadcasts"
            count={pastSessions.length}
            loading={feedLoading}
          />

          {feedLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4 space-y-3 animate-pulse"
                >
                  <div className="aspect-video rounded-xl bg-white/[0.05]" />
                  <div className="h-3 w-3/4 rounded-full bg-white/[0.05]" />
                  <div className="h-3 w-1/2 rounded-full bg-white/[0.04]" />
                  <div className="h-9 rounded-xl bg-white/[0.04]" />
                </div>
              ))}
            </div>
          ) : pastSessions.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {pastSessions.map((session) => (
                <SessionCard key={session.id} session={session} isLive={false} />
              ))}
            </div>
          ) : (
            <EmptyState isLive={false} user={null} />
          )}
        </section>
      </main>

      <DirectMessageWidget isOpen={isDmOpen} setIsOpen={setIsDmOpen} />
    </div>
  );
}
