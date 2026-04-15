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
  endLiveSession,
  getLiveSession,
  getLiveToken,
  type LiveSession,
  type LiveTokenResponse,
} from "@/lib/api";

type LiveRoomClientProps = {
  sessionId: string;
};

const ROOM_POLL_INTERVAL_MS = 5000;

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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);

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
    if (!session) {
      return;
    }

    let isActive = true;

    async function refreshSession() {
      try {
        const sessionData = await getLiveSession(sessionId);
        if (!isActive) {
          return;
        }

        setSession(sessionData);
        if (sessionData.status === "ended") {
          router.push("/");
          router.refresh();
        }
      } catch (refreshError) {
        if (!isActive) {
          return;
        }
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : "Unable to refresh the live room state.",
        );
      }
    }

    const intervalId = window.setInterval(() => {
      void refreshSession();
    }, ROOM_POLL_INTERVAL_MS);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [router, session, sessionId]);

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
        <div className="grid two-col room-layout">
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
                <dd>Auto-refreshing every 5s</dd>
              </div>
            </dl>
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
