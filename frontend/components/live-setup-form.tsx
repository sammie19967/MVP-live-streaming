"use client";

import { useRouter } from "next/navigation";
import { useState, ChangeEvent } from "react";

import { useAuth } from "@/components/auth-provider";
import { startLiveSession } from "@/lib/api";

export function LiveSetupForm() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    if (!token) {
      setError("You need to be logged in before starting a live session.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = new FormData();
      payload.append("title", String(formData.get("title") || ""));
      const thumbnailFile = formData.get("thumbnail");
      if (thumbnailFile && thumbnailFile instanceof File && thumbnailFile.size > 0) {
        payload.append("thumbnail", thumbnailFile);
      }
      const session = await startLiveSession(token, payload);
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

  function handleThumbnailChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setThumbnailPreview(url);
    } else {
      setThumbnailPreview(null);
    }
  }

  return (
    <main className="shell flex items-center justify-center min-h-[80vh] px-4">
      <section className="w-full max-w-xl p-8 rounded-3xl border border-line bg-surface shadow-2xl backdrop-blur-xl relative overflow-hidden animate-slide-up">
        {/* Decorative ambient background glows */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-accent-glow rounded-full blur-3xl opacity-40 pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-live rounded-full blur-3xl opacity-20 pointer-events-none" />

        <div className="flex flex-col gap-1 mb-8 relative z-10">
          <span className="self-start text-xs font-bold tracking-wider text-accent uppercase bg-accent-soft px-3 py-1 rounded-full border border-accent/20">
            Creator Studio
          </span>
          <h1 className="text-3xl font-black mt-3 tracking-tight bg-gradient-to-r from-foreground to-muted bg-clip-text text-transparent">
            Launch Your Stream
          </h1>
          <p className="text-sm text-muted mt-1 leading-relaxed">
            Configure your streaming metadata below. Once created, we will bootstrap a LiveKit room for you to broadcast live.
          </p>
        </div>

        {/* User Account Info Bar */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-strong/60 border border-line mb-8 text-sm relative z-10">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs uppercase tracking-wider text-muted font-semibold">Broadcaster</span>
            <span className="font-bold text-foreground">{user ? user.username : "No active session"}</span>
          </div>
          <div className="flex flex-col gap-0.5 items-end">
            <span className="text-xs uppercase tracking-wider text-muted font-semibold">Tier</span>
            <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-accent/20 text-foreground border border-accent/30">
              {user ? (user.is_creator ? "Creator Pro" : "Viewer") : "Unknown"}
            </span>
          </div>
        </div>

        <form
          className="space-y-6 relative z-10"
          action={async (formData) => {
            await handleSubmit(formData);
          }}
        >
          <div className="space-y-2">
            <label htmlFor="title" className="block text-xs uppercase tracking-widest text-muted font-bold">
              Stream Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              placeholder="e.g. Building an AI agent live!"
              required
              className="w-full min-h-[50px] px-4 py-3 rounded-2xl border border-line bg-surface-strong/40 text-foreground placeholder-muted/65 focus:border-accent-strong focus:ring-2 focus:ring-accent-glow focus:outline-none transition-all duration-300 shadow-inner"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-widest text-muted font-bold">
              Thumbnail Cover
            </label>
            
            <div className="group relative border-2 border-dashed border-line hover:border-accent/50 rounded-2xl transition-all duration-300 overflow-hidden bg-surface-strong/20">
              <input
                id="thumbnail"
                name="thumbnail"
                type="file"
                accept="image/*"
                onChange={handleThumbnailChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              />
              
              {thumbnailPreview ? (
                <div className="relative w-full h-44 flex items-center justify-center bg-black/40">
                  <img
                    src={thumbnailPreview}
                    alt="Thumbnail preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center pointer-events-none">
                    <span className="text-xs text-foreground bg-surface/80 px-3 py-1.5 rounded-full border border-line font-bold">
                      Change Image
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center pointer-events-none">
                  <svg
                    className="w-8 h-8 text-muted group-hover:text-accent mb-3 transition-colors duration-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-sm font-semibold text-foreground">Click or drag thumbnail here</span>
                  <span className="text-xs text-muted mt-1">PNG, JPG, or WEBP up to 5MB</span>
                </div>
              )}
            </div>
          </div>

          {error ? (
            <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          ) : null}

          <button
            className="w-full py-4 px-6 rounded-2xl font-bold bg-accent-gradient hover:shadow-glow text-foreground transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2 relative overflow-hidden group"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Creating Session...</span>
              </>
            ) : (
              <>
                <span>Go Live Now</span>
                <svg
                  className="w-4 h-4 transform group-hover:translate-x-1 transition-transform duration-200"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </form>
      </section>
    </main>
  );
}

