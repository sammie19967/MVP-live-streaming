import { LiveRoomClient } from "@/components/live-room-client";

type LiveRoomPageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function LiveRoomPage({ params }: LiveRoomPageProps) {
  const { sessionId } = await params;
  return <LiveRoomClient sessionId={sessionId} />;
}
