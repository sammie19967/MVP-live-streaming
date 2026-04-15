"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { startLiveSession } from "@/lib/api";

export function LiveSetupForm() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    if (!token) {
      setError("You need to be logged in before starting a live session.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const session = await startLiveSession(token, {
        title: String(formData.get("title") || ""),
        thumbnail_url: String(formData.get("thumbnail_url") || ""),
      });
      router.push(`/live/${session.id}?role=creator`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to start the live session.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <section className="auth-card stack">
        <span className="eyebrow">Creator flow</span>
        <h1 className="section-title">Go live</h1>
        <p className="section-copy">
          Create a session record in Django, then enter the LiveKit room as the
          publishing participant.
        </p>

        <dl className="meta-list">
          <div>
            <dt>Signed in as</dt>
            <dd>{user ? user.username : "No active session"}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{user ? (user.is_creator ? "Creator" : "Viewer account") : "Unknown"}</dd>
          </div>
        </dl>

        <form
          className="stack"
          action={async (formData) => {
            await handleSubmit(formData);
          }}
        >
          <div className="field">
            <label htmlFor="title">Live title</label>
            <input
              id="title"
              name="title"
              placeholder="Late-night coding session"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="thumbnail_url">Thumbnail URL</label>
            <input
              id="thumbnail_url"
              name="thumbnail_url"
              placeholder="https://example.com/thumb.jpg"
            />
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Starting..." : "Create live session"}
          </button>
        </form>
      </section>
    </main>
  );
}
