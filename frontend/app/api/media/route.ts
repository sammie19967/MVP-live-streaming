import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ detail: "Missing media URL." }, { status: 400 });
  }

  let mediaUrl: URL;
  try {
    mediaUrl = new URL(url);
  } catch {
    return NextResponse.json({ detail: "Invalid media URL." }, { status: 400 });
  }

  const apiOrigin = new URL(API_BASE_URL).origin;
  if (mediaUrl.origin !== apiOrigin) {
    return NextResponse.json({ detail: "Media URL is not allowed." }, { status: 400 });
  }

  const response = await fetch(mediaUrl, {
    cache: "no-store",
  });

  if (!response.ok || !response.body) {
    return NextResponse.json(
      { detail: "Unable to load media." },
      { status: response.status || 502 },
    );
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers: {
      "Cache-Control": "public, max-age=60",
      "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
    },
  });
}
