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
  getMediaUrl,
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

type LiveRoomClientProps = { sessionId: string };
type ParticipantMetadata = {
  avatarUrl?: string;
  displayName?: string;
  handRaised?: boolean;
  role?: "creator" | "viewer";
};

function formatAttachmentSize(size: number | null) {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getDMPreview(message: DirectMessage | null) {
  if (!message) return "No messages yet";
  if (message.body) return message.body;
  return message.attachment_name ? `📎 ${message.attachment_name}` : "Attachment";
}

function parseParticipantMetadata(metadata?: string): ParticipantMetadata {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata) as ParticipantMetadata;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getParticipantDisplayName(participant: Participant, metadata: ParticipantMetadata) {
  return metadata.displayName || participant.name || participant.identity;
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1
    ? `${words[0][0] ?? ""}${words[1][0] ?? ""}`
    : name.slice(0, 2)
  ).toUpperCase();
}

// ─── Inline SVG Icons ────────────────────────────────────────────────────────

function IconMic({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}
function IconMicOff({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M1 1l22 22M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8" />
    </svg>
  );
}
function IconCamera({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M23 7l-7 5 7 5V7zM1 5h15a2 2 0 012 2v10a2 2 0 01-2 2H1a2 2 0 01-2-2V7a2 2 0 012-2z" />
    </svg>
  );
}
function IconScreen({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" strokeWidth={1.8} strokeLinecap="round" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 21h8M12 17v4M9 7l3-3 3 3M12 4v8" />
    </svg>
  );
}
function IconHand({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18 11V6a2 2 0 00-2-2v0a2 2 0 00-2 2v0M14 10V4a2 2 0 00-2-2v0a2 2 0 00-2 2v2M10 10.5V6a2 2 0 00-2-2v0a2 2 0 00-2 2v8l2 2 1 5h8l1-5 2-3V8a2 2 0 00-2-2v0a2 2 0 00-2 2v3" />
    </svg>
  );
}
function IconLeave({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
function IconHeart({ className = "w-5 h-5", filled = false }: { className?: string; filled?: boolean }) {
  return (
    <svg className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  );
}
function IconUsers({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}
function IconChat({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}
function IconDM({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} points="22,6 12,13 2,6" />
    </svg>
  );
}
function IconSend({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} x1="22" y1="2" x2="11" y2="13" />
      <polygon strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
function IconAttach({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
function IconVolume({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <polygon strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
    </svg>
  );
}
function IconVolumeOff({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <polygon strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} x1="23" y1="9" x2="17" y2="15" />
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}
function IconChevronLeft({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} points="15 18 9 12 15 6" />
    </svg>
  );
}
function IconX({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} x1="18" y1="6" x2="6" y2="18" />
      <line strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Participant Caption Overlay ──────────────────────────────────────────────

function ParticipantCaption({ participant, source }: { participant: Participant; source: Track.Source }) {
  const [metadata, setMetadata] = useState(participant.metadata);
  const handRaised = parseParticipantMetadata(metadata).handRaised;
  const label = source === Track.Source.ScreenShare ? "Screen Share" : participant.name || participant.identity;

  useEffect(() => {
    const handleMetadataChanged = () => setMetadata(participant.metadata);
    participant.on(ParticipantEvent.ParticipantMetadataChanged, handleMetadataChanged);
    return () => { participant.off(ParticipantEvent.ParticipantMetadataChanged, handleMetadataChanged); };
  }, [participant]);

  return (
    <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-white text-xs font-semibold tracking-wide truncate max-w-[160px]">{label}</span>
      </div>
      {handRaised && (
        <span className="flex items-center gap-1 bg-yellow-400/20 border border-yellow-400/40 text-yellow-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
          ✋ Hand Raised
        </span>
      )}
    </div>
  );
}

// ─── Video Stage ─────────────────────────────────────────────────────────────

function Stage({ audioMuted }: { audioMuted: boolean }) {
  const videoTracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: false },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  return (
    <div className="relative w-full h-full flex flex-col">
      <RoomAudioRenderer muted={audioMuted} />
      {videoTracks.length > 0 ? (
        <div
          className={`grid h-full gap-1.5 p-1.5 ${
            videoTracks.length === 1 ? "grid-cols-1" :
            videoTracks.length <= 4 ? "grid-cols-2" : "grid-cols-3"
          }`}
        >
          {videoTracks.map((trackRef) =>
            trackRef.publication ? (
              <div
                key={trackRef.publication.trackSid ?? trackRef.participant.identity}
                className="relative overflow-hidden rounded-2xl bg-black border border-white/5 group"
                style={{ aspectRatio: videoTracks.length === 1 ? "auto" : "16/9" }}
              >
                <VideoTrack className="w-full h-full object-cover" trackRef={trackRef} />
                <ParticipantCaption participant={trackRef.participant} source={trackRef.source} />
                {/* Hover glow border */}
                <div className="absolute inset-0 rounded-2xl ring-0 group-hover:ring-1 group-hover:ring-purple-500/40 transition-all duration-300 pointer-events-none" />
              </div>
            ) : null,
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 select-none">
          {/* Camera off placeholder */}
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-600/30 to-pink-600/20 border border-purple-500/20 flex items-center justify-center animate-pulse-slow">
              <IconCamera className="w-10 h-10 text-purple-400/60" />
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gray-600 border-2 border-background flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-gray-400" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-white/50 text-sm font-semibold">No video streams active</p>
            <p className="text-white/25 text-xs mt-1">Enable your camera or wait for the host to go live</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Participant Avatar ───────────────────────────────────────────────────────

function ParticipantAvatar({ name, avatarUrl, size = "md" }: { name: string; avatarUrl?: string; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = { sm: "w-7 h-7 text-[10px]", md: "w-9 h-9 text-xs", lg: "w-12 h-12 text-sm" };
  return (
    <div
      aria-label={name}
      className={`${sizeClasses[size]} rounded-full flex-shrink-0 flex items-center justify-center font-bold bg-gradient-to-br from-purple-600/40 to-pink-600/30 border border-purple-500/30 text-purple-200 overflow-hidden`}
      style={avatarUrl ? { backgroundImage: `url("${avatarUrl}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      {!avatarUrl ? getInitials(name) : null}
    </div>
  );
}

// ─── Participant Roster (in sidebar) ─────────────────────────────────────────

function ParticipantRoster() {
  const participants = useParticipants();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">In Room</span>
        <span className="text-[11px] font-bold text-purple-400 bg-purple-500/15 px-2 py-0.5 rounded-full">
          {participants.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto scrollbar-thin pr-1">
        {participants.map((participant) => {
          const metadata = parseParticipantMetadata(participant.metadata);
          const name = getParticipantDisplayName(participant, metadata);
          const role = metadata.role ?? "viewer";
          return (
            <div
              key={participant.sid || participant.identity}
              className="flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all duration-150"
            >
              <div className="relative">
                <ParticipantAvatar avatarUrl={metadata.avatarUrl} name={name} size="sm" />
                {participant.isSpeaking && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-[#0a0a0f] animate-pulse" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-white/90 truncate">{name}</span>
                  {participant.isLocal && <span className="text-[9px] text-white/30 font-medium">(you)</span>}
                </div>
                <span className="text-[10px] text-white/35">{role === "creator" ? "🎙 Host" : "👁 Viewer"}</span>
              </div>
              <div className="flex items-center gap-1">
                {participant.isMicrophoneEnabled
                  ? <div className="w-1.5 h-1.5 rounded-full bg-green-400" title="Mic on" />
                  : <div className="w-1.5 h-1.5 rounded-full bg-white/20" title="Mic off" />}
                {participant.isCameraEnabled
                  ? <div className="w-1.5 h-1.5 rounded-full bg-blue-400" title="Camera on" />
                  : <div className="w-1.5 h-1.5 rounded-full bg-white/20" title="Camera off" />}
                {metadata.handRaised && <span className="text-[10px] leading-none">✋</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Floating Controls Bar ────────────────────────────────────────────────────

function LiveControls({
  audioMuted, onAudioMutedChange, role,
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
      if (participant?.sid === localParticipant.sid) setMetadata(participant.metadata);
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
      const nextMetadata = { ...parseParticipantMetadata(localParticipant.metadata), handRaised: !handRaised };
      await localParticipant.setMetadata(JSON.stringify(nextMetadata));
      setMetadata(JSON.stringify(nextMetadata));
    } catch (raiseError) {
      setControlError(raiseError instanceof Error ? raiseError.message : "Unable to update hand status.");
    } finally {
      setMetadataBusy(false);
    }
  }

  const btnBase = "relative flex flex-col items-center justify-center gap-1 w-14 h-14 rounded-2xl border transition-all duration-200 cursor-pointer group overflow-hidden text-[10px] font-bold tracking-wide";
  const btnIdle = "bg-white/[0.06] border-white/[0.1] text-white/60 hover:bg-white/[0.12] hover:border-white/[0.2] hover:text-white";
  const btnActive = "bg-purple-600/30 border-purple-500/50 text-purple-300 shadow-[0_0_16px_rgba(139,92,246,0.25)]";
  const btnDanger = "bg-red-600/20 border-red-500/40 text-red-400 hover:bg-red-600 hover:border-red-500 hover:text-white hover:shadow-[0_0_20px_rgba(239,68,68,0.4)]";
  const btnWarning = handRaised
    ? "bg-amber-500/25 border-amber-400/50 text-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.2)]"
    : btnIdle;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2.5">
        <TrackToggle
          source={Track.Source.Microphone}
          className={`${btnBase} ${btnIdle}`}
        >
          <IconMic className="w-5 h-5" />
          <span>Mic</span>
        </TrackToggle>

        <TrackToggle
          source={Track.Source.Camera}
          className={`${btnBase} ${btnIdle}`}
        >
          <IconCamera className="w-5 h-5" />
          <span>Cam</span>
        </TrackToggle>

        {canShareScreen && (
          <TrackToggle
            captureOptions={{ audio: true, selfBrowserSurface: "include" }}
            source={Track.Source.ScreenShare}
            className={`${btnBase} ${btnIdle}`}
          >
            <IconScreen className="w-5 h-5" />
            <span>Share</span>
          </TrackToggle>
        )}

        <button
          className={`${btnBase} ${btnWarning}`}
          disabled={metadataBusy}
          onClick={() => void toggleHandRaised()}
          type="button"
        >
          <IconHand className="w-5 h-5" />
          <span>{handRaised ? "Lower" : "Hand"}</span>
        </button>

        <button
          className={`${btnBase} ${audioMuted ? "bg-red-600/25 border-red-500/40 text-red-400" : btnIdle}`}
          onClick={() => onAudioMutedChange(!audioMuted)}
          type="button"
        >
          {audioMuted ? <IconVolumeOff className="w-5 h-5" /> : <IconVolume className="w-5 h-5" />}
          <span>{audioMuted ? "Unmute" : "Sound"}</span>
        </button>

        <div className="w-px h-10 bg-white/10" />

        <button
          className={`${btnBase} ${btnDanger} w-16`}
          onClick={() => room.disconnect()}
          type="button"
        >
          <IconLeave className="w-5 h-5" />
          <span>Leave</span>
        </button>
      </div>

      {controlError && (
        <p className="text-red-400 text-xs text-center">{controlError}</p>
      )}
    </div>
  );
}

// ─── LiveRoomSurface (wraps Stage + Controls) ────────────────────────────────

function LiveRoomSurface({ role }: { role: "creator" | "viewer" }) {
  const [audioMuted, setAudioMuted] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Video stage fills the available space */}
      <div className="flex-1 overflow-hidden">
        <Stage audioMuted={audioMuted} />
      </div>

      {/* Floating glassmorphic controls bar */}
      <div className="flex-shrink-0 flex items-center justify-center py-4 px-6">
        <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl px-6 py-3 shadow-2xl shadow-black/50">
          <LiveControls audioMuted={audioMuted} onAudioMutedChange={setAudioMuted} role={role} />
        </div>
      </div>

      {/* Participant roster strip below controls */}
      <div className="flex-shrink-0 px-4 pb-3">
        <div className="bg-black/40 backdrop-blur-xl border border-white/[0.07] rounded-2xl px-4 py-3">
          <ParticipantRoster />
        </div>
      </div>
    </div>
  );
}

// ─── Comment Node ─────────────────────────────────────────────────────────────

interface CommentNodeProps {
  comment: Comment;
  repliesMap: Map<number, Comment[]>;
  session: LiveSession;
  handleReply: (comment: Comment) => void;
}

function CommentNode({ comment, repliesMap, session, handleReply }: CommentNodeProps) {
  const replies = repliesMap.get(comment.id) ?? [];
  const isReply = !!comment.parent_id;
  return (
    <div className={`flex flex-col gap-1 ${isReply ? "ml-5 pl-3 border-l border-purple-500/25" : ""}`}>
      <div className="flex items-start gap-2 group">
        <ParticipantAvatar name={comment.user.profile.display_name || comment.user.username} size="sm" />
        <div className="flex-1 min-w-0 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06] rounded-xl px-3 py-2 transition-all duration-150">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-bold text-white/80 truncate">
              {comment.user.profile.display_name || comment.user.username}
            </span>
            <span className="text-[10px] text-white/30 flex-shrink-0">
              {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(comment.created_at))}
            </span>
          </div>
          <p className="text-xs text-white/70 leading-relaxed break-words">{comment.body}</p>
          {session.status !== "ended" && (
            <button
              className="text-[10px] text-purple-400/60 hover:text-purple-400 font-semibold mt-1.5 transition-colors duration-150"
              onClick={() => handleReply(comment)}
              type="button"
            >
              ↩ Reply
            </button>
          )}
        </div>
      </div>
      {replies.length > 0 && (
        <div className="flex flex-col gap-1 mt-0.5">
          {replies.map((reply) => (
            <CommentNode key={reply.id} comment={reply} repliesMap={repliesMap} session={session} handleReply={handleReply} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main LiveRoomClient ──────────────────────────────────────────────────────

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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const roomSocketRef = useRef<WebSocket | null>(null);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // DM State
  const [activeTab, setActiveTab] = useState<"chat" | "dms">("chat");
  const [dms, setDms] = useState<DirectMessage[]>([]);
  const [dmThreads, setDmThreads] = useState<DMThread[]>([]);
  const [activeDmUser, setActiveDmUser] = useState<User | null>(null);
  const [dmBody, setDmBody] = useState("");
  const [dmReplyTarget, setDmReplyTarget] = useState<DirectMessage | null>(null);
  const [dmAttachment, setDmAttachment] = useState<File | null>(null);
  const [dmSubmitting, setDmSubmitting] = useState(false);
  const chatSocketRef = useRef<WebSocket | null>(null);
  const dmFileInputRef = useRef<HTMLInputElement | null>(null);

  const requestedRole = searchParams.get("role") === "creator" ? "creator" : "viewer";
  const activeSessionId = session?.id;
  const activeSessionStatus = session?.status;
  const resolvedRole = useMemo(() => {
    if (requestedRole === "creator") return "creator";
    if (session && user && session.creator.id === user.id) return "creator";
    return "viewer";
  }, [requestedRole, session, user]);

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
    if (resolvedRole === "creator") return dmThreads.reduce((sum, t) => sum + t.unread_count, 0);
    return dms.filter((d) => d.sender.id === session?.creator.id && !d.is_read).length;
  }, [dmThreads, dms, resolvedRole, session?.creator.id]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  useEffect(() => {
    let isActive = true;
    async function loadRoom() {
      if (!token) {
        if (isActive) { setError("Login is required before joining a live room."); setLoading(false); }
        return;
      }
      try {
        const sessionData = await getLiveSession(sessionId);
        if (!isActive) return;
        setSession(sessionData);
        if (sessionData.status === "ended") {
          setLiveEndedMessage("This live has ended.");
        } else {
          const tokenRole = requestedRole === "creator" || sessionData.creator.id === user?.id ? "creator" : "viewer";
          const tokenData = await getLiveToken(token, sessionId, tokenRole);
          if (!isActive) return;
          setLivekit(tokenData);
        }
      } catch (loadError) {
        if (!isActive) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load the live room.");
      } finally {
        if (isActive) setLoading(false);
      }
    }
    void loadRoom();
    return () => { isActive = false; };
  }, [requestedRole, sessionId, token, user?.id]);

  useEffect(() => {
    if (!token || !activeSessionId) return;
    const authToken = token;
    let isActive = true;
    async function loadComments() {
      try {
        const data = await getLiveComments(authToken, sessionId);
        if (!isActive) return;
        setComments(data);
      } catch (loadError) {
        if (!isActive) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load live comments.");
      }
    }
    void loadComments();
    return () => { isActive = false; };
  }, [activeSessionId, sessionId, token]);

  useEffect(() => {
    if (!token || !activeSessionId || activeSessionStatus === "ended" || liveEndedMessage) return;
    const socket = new WebSocket(buildWebSocketUrl(`/ws/live/sessions/${sessionId}/`, token));
    roomSocketRef.current = socket;
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as
        | { type: "comment.created"; comment: Comment }
        | { type: "reaction.created"; heart_count: number }
        | { type: "session.updated" | "session.ended"; session: LiveSession };
      if (payload.type === "comment.created") {
        setComments((c) => c.some((x) => x.id === payload.comment.id) ? c : [...c, payload.comment]);
        return;
      }
      if (payload.type === "reaction.created") {
        setSession((c) => c ? { ...c, heart_count: payload.heart_count } : c);
        return;
      }
      if (payload.type === "session.updated") { setSession(payload.session); return; }
      if (payload.type === "session.ended") {
        setSession(payload.session);
        setLiveEndedMessage("This live has ended.");
        socket.close();
      }
    };
    socket.onerror = (err) => {
      console.error("Room WebSocket error:", err);
      if (!liveEndedMessage) setError("Room socket disconnected. Refresh to reconnect.");
    };
    return () => { roomSocketRef.current = null; socket.close(); };
  }, [activeSessionId, activeSessionStatus, liveEndedMessage, sessionId, token]);

  useEffect(() => {
    if (!token || resolvedRole !== "creator") return;
    async function loadThreads() {
      try { const threads = await getDMThreads(token!); setDmThreads(threads); }
      catch (e) { console.error("Error loading DM threads:", e); }
    }
    loadThreads();
  }, [token, resolvedRole]);

  useEffect(() => {
    if (!token || resolvedRole !== "viewer" || !session?.creator.id) return;
    async function loadClientDMs() {
      try { const history = await getDMs(token!, session!.creator.id); setDms(history); }
      catch (e) { console.error("Error loading client DMs:", e); }
    }
    if (activeTab === "dms") void loadClientDMs();
  }, [token, resolvedRole, session?.creator.id, activeTab]);

  useEffect(() => {
    if (!token || resolvedRole !== "creator" || !activeDmUser?.id) return;
    async function loadHostDMs() {
      try {
        const history = await getDMs(token!, activeDmUser!.id);
        setDms(history);
        setDmThreads((c) => c.map((t) => t.user.id === activeDmUser!.id ? { ...t, unread_count: 0 } : t));
      } catch (e) { console.error("Error loading host DMs:", e); }
    }
    loadHostDMs();
  }, [token, resolvedRole, activeDmUser?.id]);

  useEffect(() => {
    if (!token) return;
    const socket = new WebSocket(buildWebSocketUrl("/ws/chat/", token));
    chatSocketRef.current = socket;
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { type: "dm.created"; dm: DirectMessage };
      if (payload.type === "dm.created") {
        const msg = payload.dm;
        const currentActiveDmUser = activeDmUserRef.current;
        const currentResolvedRole = resolvedRoleRef.current;
        const currentSession = sessionRef.current;
        const currentUser = userRef.current;
        const currentActiveTab = activeTabRef.current;
        const isRelevant =
          currentResolvedRole === "creator"
            ? currentActiveDmUser && (msg.sender.id === currentActiveDmUser.id || msg.recipient.id === currentActiveDmUser.id)
            : currentSession && (msg.sender.id === currentSession.creator.id || msg.recipient.id === currentSession.creator.id);
        if (isRelevant) setDms((c) => c.some((d) => d.id === msg.id) ? c : [...c, msg]);
        if (currentResolvedRole === "creator" && currentUser) {
          setDmThreads((c) => {
            const partner = msg.sender.id === currentUser.id ? msg.recipient : msg.sender;
            const exists = c.some((t) => t.user.id === partner.id);
            const isCurrentActiveChat = currentActiveDmUser?.id === partner.id && currentActiveTab === "dms";
            if (exists) {
              return c.map((t) => t.user.id === partner.id
                ? { ...t, last_message: msg, unread_count: isCurrentActiveChat ? 0 : t.unread_count + (msg.sender.id !== currentUser.id ? 1 : 0) }
                : t
              ).sort((a, b) => new Date(b.last_message?.created_at || 0).getTime() - new Date(a.last_message?.created_at || 0).getTime());
            }
            return [{ user: partner, last_message: msg, unread_count: isCurrentActiveChat ? 0 : msg.sender.id !== currentUser.id ? 1 : 0 }, ...c];
          });
        }
      }
    };
    socket.onerror = (err) => console.error("Chat WebSocket error:", err);
    return () => { chatSocketRef.current = null; socket.close(); };
  }, [token]);

  async function handleDmSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || (!dmBody.trim() && !dmAttachment)) return;
    let recipientId: number | null = resolvedRole === "creator" ? activeDmUser?.id ?? null : session?.creator.id ?? null;
    if (!recipientId) return;
    setDmSubmitting(true);
    try {
      const response = await postDM(token, recipientId, dmBody.trim(), { parentId: dmReplyTarget?.id ?? null, attachment: dmAttachment });
      setDmBody(""); setDmReplyTarget(null); setDmAttachment(null);
      if (dmFileInputRef.current) dmFileInputRef.current.value = "";
      setDms((c) => c.some((d) => d.id === response.id) ? c : [...c, response]);
      if (resolvedRole === "creator") {
        setDmThreads((c) => c.map((t) => t.user.id === recipientId ? { ...t, last_message: response } : t)
          .sort((a, b) => new Date(b.last_message?.created_at || 0).getTime() - new Date(a.last_message?.created_at || 0).getTime()));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send private message.");
    } finally {
      setDmSubmitting(false);
    }
  }

  function renderDMPayload(dm: DirectMessage) {
    const attachmentUrl = getMediaUrl(dm.attachment_url || dm.attachment);
    const fileName = dm.attachment_name || "Attachment";
    return (
      <>
        {dm.body ? <p className="text-xs text-white/80 break-words leading-relaxed">{dm.body}</p> : null}
        {attachmentUrl && dm.attachment_content_type.startsWith("image/") ? (
          <a href={attachmentUrl} rel="noreferrer" target="_blank" className="block mt-1">
            <img alt={fileName} src={attachmentUrl} className="w-full max-h-40 object-cover rounded-xl border border-white/10" />
          </a>
        ) : attachmentUrl ? (
          <a href={attachmentUrl} rel="noreferrer" target="_blank" className="flex items-center gap-2 mt-1 bg-white/[0.06] border border-white/[0.08] rounded-lg px-2.5 py-2 text-xs text-purple-400 hover:text-purple-300 hover:bg-white/[0.10] transition-all">
            <IconAttach className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{fileName}</span>
            {dm.attachment_size && <span className="text-white/30 flex-shrink-0">{formatAttachmentSize(dm.attachment_size)}</span>}
          </a>
        ) : null}
      </>
    );
  }

  function renderDMMessage(dm: DirectMessage) {
    const isMine = dm.sender.id === user?.id;
    return (
      <div key={dm.id} className={`flex gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
        <ParticipantAvatar name={dm.sender.profile?.display_name || dm.sender.username} size="sm" />
        <div className={`max-w-[75%] flex flex-col gap-1 ${isMine ? "items-end" : "items-start"}`}>
          {dm.parent_id && <span className="text-[9px] text-white/30 font-medium px-1">↩ Reply</span>}
          <div className={`px-3 py-2 rounded-2xl text-xs ${isMine
            ? "bg-purple-600/40 border border-purple-500/30 text-purple-100"
            : "bg-white/[0.06] border border-white/[0.08] text-white/80"
          }`}>
            {renderDMPayload(dm)}
          </div>
          <div className="flex items-center gap-2 px-1">
            <span className="text-[9px] text-white/25">
              {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(dm.created_at))}
            </span>
            <button className="text-[9px] text-white/25 hover:text-purple-400 transition-colors" onClick={() => setDmReplyTarget(dm)} type="button">Reply</button>
          </div>
        </div>
      </div>
    );
  }

  function renderDMComposer(placeholder: string, buttonText: string) {
    return (
      <form className="flex flex-col gap-2" onSubmit={handleDmSubmit}>
        {dmReplyTarget && (
          <div className="flex items-center justify-between bg-purple-500/10 border border-purple-500/20 rounded-xl px-3 py-2">
            <span className="text-[10px] text-purple-300 truncate">
              Replying: {getDMPreview(dmReplyTarget).slice(0, 40)}
            </span>
            <button className="text-white/40 hover:text-white/80 ml-2 flex-shrink-0" onClick={() => setDmReplyTarget(null)} type="button">
              <IconX className="w-3 h-3" />
            </button>
          </div>
        )}
        {dmAttachment && (
          <div className="flex items-center justify-between bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2">
            <div className="flex items-center gap-2">
              <IconAttach className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
              <span className="text-[10px] text-white/60 truncate">{dmAttachment.name}</span>
              <span className="text-[10px] text-white/30">{formatAttachmentSize(dmAttachment.size)}</span>
            </div>
            <button className="text-white/40 hover:text-white/80 ml-2 flex-shrink-0" onClick={() => { setDmAttachment(null); if (dmFileInputRef.current) dmFileInputRef.current.value = ""; }} type="button">
              <IconX className="w-3 h-3" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input accept="image/*,.gif,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip" onChange={(e) => setDmAttachment(e.target.files?.[0] ?? null)} ref={dmFileInputRef} className="hidden" type="file" />
          <button className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/40 hover:text-purple-400 hover:border-purple-500/30 hover:bg-purple-500/10 transition-all cursor-pointer" onClick={() => dmFileInputRef.current?.click()} type="button">
            <IconAttach className="w-3.5 h-3.5" />
          </button>
          <input
            className="flex-1 min-h-[36px] px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs text-white/90 placeholder-white/25 focus:border-purple-500/50 focus:bg-purple-500/[0.04] focus:outline-none transition-all"
            onChange={(e) => setDmBody(e.target.value)}
            placeholder={dmAttachment ? "Add a note..." : placeholder}
            value={dmBody}
          />
          <button
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-xl bg-purple-600/50 border border-purple-500/40 text-purple-200 hover:bg-purple-600 hover:text-white transition-all disabled:opacity-30 cursor-pointer"
            disabled={dmSubmitting || (!dmBody.trim() && !dmAttachment)}
            type="submit"
          >
            <IconSend className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    );
  }

  function handleReply(comment: Comment) {
    setReplyingTo(comment);
    setTimeout(() => commentInputRef.current?.focus(), 50);
  }

  function cancelReply() { setReplyingTo(null); }

  async function handleCommentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !commentBody.trim() || session?.status === "ended") return;
    setCommentSubmitting(true);
    setError(null);
    try {
      await postLiveComment(token, sessionId, commentBody.trim(), replyingTo?.id ?? null);
      setCommentBody(""); setReplyingTo(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to post comment.");
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function handleHeart() {
    if (!token || session?.status === "ended") return;
    setHeartSubmitting(true);
    setError(null);
    try { await postLiveReaction(token, sessionId, "heart"); }
    catch (reactionError) { setError(reactionError instanceof Error ? reactionError.message : "Unable to send heart."); }
    finally { setHeartSubmitting(false); }
  }

  async function handleEndLive() {
    if (!token || !session) return;
    setEnding(true);
    setError(null);
    try {
      await endLiveSession(token, session.id);
      setSession((c) => c ? { ...c, status: "ended", ended_at: new Date().toISOString() } : c);
      setLiveEndedMessage("You ended this live.");
      roomSocketRef.current?.close();
    } catch (endError) {
      setError(endError instanceof Error ? endError.message : "Unable to end this live session.");
    } finally {
      setEnding(false);
    }
  }

  // ── LOADING STATE ──
  if (loading) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#050508] z-50">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-2 border-purple-500/20 animate-spin border-t-purple-500" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-purple-500 animate-pulse" />
          </div>
        </div>
        <p className="mt-6 text-white/40 text-sm font-medium tracking-wide">Connecting to room...</p>
        <p className="mt-1 text-white/20 text-xs">Bootstrapping LiveKit session</p>
      </div>
    );
  }

  // ── ERROR STATE ──
  if (error && !session) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#050508] z-50 gap-6 p-8">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <IconX className="w-8 h-8 text-red-400" />
        </div>
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-black text-white">Room Unavailable</h1>
          <p className="text-sm text-white/40 mt-2">{error}</p>
        </div>
        <Link href="/" className="px-6 py-3 rounded-2xl bg-white/[0.06] border border-white/[0.1] text-white/70 hover:text-white hover:bg-white/[0.1] font-bold text-sm transition-all">
          ← Back to Feed
        </Link>
      </div>
    );
  }

  // ── ROOM UNAVAILABLE ──
  if (!session && !livekit) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#050508] z-50 gap-6 p-8">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-black text-white">Room Not Found</h1>
          <p className="text-sm text-white/40 mt-2">This session could not be loaded. It may have expired.</p>
        </div>
        <Link href="/" className="px-6 py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition-all">
          Return to Feed
        </Link>
      </div>
    );
  }

  const isEnded = session?.status === "ended" || !!liveEndedMessage;

  // ── FULL-SCREEN ROOM ──
  return (
    <div className="fixed inset-0 bg-[#050508] flex flex-col overflow-hidden" style={{ zIndex: 40 }}>

      {/* ── TOP HEADER BAR ── */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-black/50 backdrop-blur-xl border-b border-white/[0.06] z-10">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.09] text-xs font-semibold transition-all"
          >
            <IconChevronLeft className="w-3.5 h-3.5" />
            Feed
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            {isEnded ? (
              <span className="px-2.5 py-1 rounded-lg bg-gray-700/50 border border-gray-600/30 text-gray-400 text-[10px] font-black tracking-widest uppercase">
                Ended
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-black tracking-widest uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                Live
              </span>
            )}
            <h1 className="text-sm font-bold text-white/90 truncate max-w-[240px]">{session?.title}</h1>
          </div>
        </div>

        {/* Center Stats */}
        <div className="flex items-center gap-4 text-xs text-white/40">
          <div className="flex items-center gap-1.5">
            <IconUsers className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-bold text-white/60">{session?.viewer_count_live ?? 0}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <IconHeart className="w-3.5 h-3.5 text-pink-400" />
            <span className="font-bold text-white/60">{session?.heart_count ?? 0}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <IconChat className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-bold text-white/60">{session?.comment_count ?? 0}</span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {!isEnded && (
            <button
              onClick={() => void handleHeart()}
              disabled={heartSubmitting}
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pink-500/15 border border-pink-500/25 text-pink-400 hover:bg-pink-500/25 hover:text-pink-300 text-xs font-bold transition-all cursor-pointer disabled:opacity-40"
            >
              <IconHeart className="w-3.5 h-3.5" filled={heartSubmitting} />
              Heart
            </button>
          )}

          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.09] text-xs font-semibold transition-all cursor-pointer"
          >
            <IconChat className="w-3.5 h-3.5" />
            {sidebarOpen ? "Hide Chat" : "Chat"}
            {totalUnreadDMs > 0 && !sidebarOpen && (
              <span className="w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-black">
                {totalUnreadDMs}
              </span>
            )}
          </button>

          {resolvedRole === "creator" && !isEnded && (
            <button
              onClick={() => void handleEndLive()}
              disabled={ending}
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600 hover:text-white text-xs font-bold transition-all cursor-pointer disabled:opacity-40"
            >
              {ending ? "Ending..." : "End Live"}
            </button>
          )}
        </div>
      </header>

      {/* Error toast */}
      {error && (
        <div className="flex-shrink-0 mx-4 mt-2 flex items-center justify-between px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <span>{error}</span>
          <button onClick={() => setError(null)} type="button" className="ml-3 flex-shrink-0">
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ── VIDEO STAGE (main) ── */}
        <div className="flex-1 min-w-0 overflow-hidden bg-black">
          {isEnded ? (
            /* Ended state */
            <div className="h-full flex flex-col items-center justify-center gap-6 p-8 text-center">
              <div className="relative">
                <div className="w-24 h-24 rounded-3xl bg-gray-800/60 border border-white/10 flex items-center justify-center">
                  <svg className="w-12 h-12 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="absolute -bottom-1 -right-1 px-2 py-0.5 rounded-full bg-gray-700 border border-white/10 text-[9px] text-white/40 font-bold uppercase tracking-wide">
                  Off Air
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-black text-white/80">Broadcast Ended</h2>
                <p className="text-sm text-white/35 mt-2 max-w-sm">
                  {liveEndedMessage ?? "This live session has concluded. Thanks for watching!"}
                </p>
              </div>
              <Link
                href="/"
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-purple-600/80 hover:bg-purple-600 border border-purple-500/50 text-white font-bold text-sm transition-all"
              >
                <IconChevronLeft className="w-4 h-4" />
                Back to Feed
              </Link>
            </div>
          ) : livekit ? (
            <LiveKitRoom
              audio={resolvedRole === "creator"}
              video={resolvedRole === "creator"}
              connect
              data-lk-theme="default"
              serverUrl={livekit.livekit_url}
              token={livekit.token}
              className="h-full"
            >
              <LiveRoomSurface role={resolvedRole} />
            </LiveKitRoom>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-white/20 text-sm">Initializing stream...</div>
            </div>
          )}
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        {sidebarOpen && (
          <aside
            className="w-80 flex-shrink-0 flex flex-col border-l border-white/[0.06] bg-black/40 backdrop-blur-xl overflow-hidden"
            style={{ background: "rgba(8, 8, 14, 0.92)" }}
          >
            {/* Sidebar Tabs */}
            <div className="flex-shrink-0 flex border-b border-white/[0.06]">
              <button
                onClick={() => setActiveTab("chat")}
                type="button"
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-xs font-bold transition-all cursor-pointer relative ${
                  activeTab === "chat"
                    ? "text-white border-b-2 border-purple-500"
                    : "text-white/35 hover:text-white/60"
                }`}
              >
                <IconChat className="w-3.5 h-3.5" />
                Live Chat
              </button>
              <button
                onClick={() => setActiveTab("dms")}
                type="button"
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-xs font-bold transition-all cursor-pointer relative ${
                  activeTab === "dms"
                    ? "text-white border-b-2 border-purple-500"
                    : "text-white/35 hover:text-white/60"
                }`}
              >
                <IconDM className="w-3.5 h-3.5" />
                DMs
                {totalUnreadDMs > 0 && (
                  <span className="absolute top-2 right-8 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white">
                    {totalUnreadDMs}
                  </span>
                )}
              </button>
            </div>

            {/* ── CHAT TAB ── */}
            {activeTab === "chat" && (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2.5 min-h-0">
                  {comments.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-8">
                      <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                        <IconChat className="w-5 h-5 text-purple-400/50" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white/30">No messages yet</p>
                        <p className="text-[11px] text-white/20 mt-0.5">Be the first to say something!</p>
                      </div>
                    </div>
                  ) : (
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
                          session={session!}
                          handleReply={handleReply}
                        />
                      ));
                    })()
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                {session?.status !== "ended" && (
                  <div className="flex-shrink-0 border-t border-white/[0.06] p-3 flex flex-col gap-2">
                    {replyingTo && (
                      <div className="flex items-center justify-between bg-purple-500/10 border border-purple-500/20 rounded-xl px-3 py-2">
                        <span className="text-[10px] text-purple-300 truncate">
                          ↩ Replying to <strong>{replyingTo.user.profile.display_name || replyingTo.user.username}</strong>
                        </span>
                        <button className="text-white/40 hover:text-white/80 ml-2 flex-shrink-0 cursor-pointer" onClick={cancelReply} type="button">
                          <IconX className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <form onSubmit={handleCommentSubmit} className="flex items-center gap-2">
                      <input
                        id="comment"
                        ref={commentInputRef}
                        maxLength={500}
                        onChange={(e) => setCommentBody(e.target.value)}
                        placeholder={replyingTo ? `Reply to ${replyingTo.user.profile.display_name || replyingTo.user.username}...` : "Say something..."}
                        value={commentBody}
                        className="flex-1 min-h-[36px] px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-xs text-white/90 placeholder-white/25 focus:border-purple-500/50 focus:outline-none transition-all"
                      />
                      <button
                        className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl bg-purple-600/60 border border-purple-500/40 text-white hover:bg-purple-600 hover:shadow-[0_0_12px_rgba(139,92,246,0.4)] transition-all disabled:opacity-30 cursor-pointer"
                        disabled={commentSubmitting || !commentBody.trim()}
                        type="submit"
                      >
                        <IconSend className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}

            {/* ── DM TAB ── */}
            {activeTab === "dms" && (
              <div className="flex-1 flex flex-col min-h-0">
                {resolvedRole === "creator" ? (
                  activeDmUser ? (
                    /* Creator: Active DM Thread */
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06]">
                        <button
                          onClick={() => { setActiveDmUser(null); setDmReplyTarget(null); setDmAttachment(null); setDmBody(""); }}
                          type="button"
                          className="p-1 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/80 transition-all cursor-pointer"
                        >
                          <IconChevronLeft className="w-4 h-4" />
                        </button>
                        <ParticipantAvatar name={activeDmUser.profile?.display_name || activeDmUser.username} size="sm" />
                        <span className="text-xs font-bold text-white/80 truncate">
                          {activeDmUser.profile?.display_name || activeDmUser.username}
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 min-h-0">
                        {dms.length === 0 ? (
                          <div className="flex-1 flex items-center justify-center text-center py-8">
                            <p className="text-[11px] text-white/25">No messages yet</p>
                          </div>
                        ) : dms.map((dm) => renderDMMessage(dm))}
                      </div>
                      <div className="flex-shrink-0 p-3 border-t border-white/[0.06]">
                        {renderDMComposer("Type a reply...", "Send")}
                      </div>
                    </div>
                  ) : (
                    /* Creator: Thread List */
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex-shrink-0 px-3 py-2.5 border-b border-white/[0.06]">
                        <h3 className="text-[11px] font-bold text-white/40 uppercase tracking-widest">Inbox</h3>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 min-h-0">
                        {dmThreads.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                              <IconDM className="w-5 h-5 text-purple-400/50" />
                            </div>
                            <p className="text-[11px] text-white/25">No DM threads yet</p>
                          </div>
                        ) : dmThreads.map((thread) => (
                          <button
                            key={thread.user.id}
                            onClick={() => { setActiveDmUser(thread.user); setDmReplyTarget(null); setDmAttachment(null); setDmBody(""); }}
                            type="button"
                            className="flex items-center gap-2.5 p-2.5 rounded-xl border border-transparent hover:bg-white/[0.05] hover:border-white/[0.07] transition-all text-left w-full cursor-pointer"
                          >
                            <ParticipantAvatar name={thread.user.profile?.display_name || thread.user.username} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-xs font-bold text-white/80 truncate">
                                  {thread.user.profile?.display_name || thread.user.username}
                                </span>
                                {thread.unread_count > 0 && (
                                  <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white">
                                    {thread.unread_count}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-white/30 truncate mt-0.5">{getDMPreview(thread.last_message)}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                ) : (
                  /* Viewer: DM with creator */
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06]">
                      {session?.creator && (
                        <ParticipantAvatar name={session.creator.profile?.display_name || session.creator.username} size="sm" />
                      )}
                      <div>
                        <p className="text-xs font-bold text-white/80">{session?.creator.profile?.display_name || session?.creator.username}</p>
                        <p className="text-[10px] text-white/30">Host</p>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 min-h-0">
                      {dms.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-center py-8">
                          <p className="text-[11px] text-white/25">Send a private message to the host</p>
                        </div>
                      ) : dms.map((dm) => renderDMMessage(dm))}
                    </div>
                    <div className="flex-shrink-0 p-3 border-t border-white/[0.06]">
                      {renderDMComposer("Message the host...", "Send")}
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
