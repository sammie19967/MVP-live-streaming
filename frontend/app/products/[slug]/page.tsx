"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { SiteNavbar } from "@/components/site-navbar";
import { createProductReview, getMediaUrl, getProductBySlug, type Product } from "@/lib/api";

/* ── Star picker ── */
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="text-2xl transition-transform duration-100 hover:scale-125"
        >
          <span className={(hovered || value) >= star ? "text-amber-400" : "text-white/20"}>
            ★
          </span>
        </button>
      ))}
      <span className="ml-2 text-sm text-white/40 font-mono">{value}/5</span>
    </div>
  );
}

/* ── Image gallery (full detail view) ── */
function DetailGallery({ images, title }: { images: Product["images"]; title: string }) {
  const [active, setActive] = useState(0);
  const sorted = useMemo(
    () => images.slice().sort((a, b) => a.sort_order - b.sort_order),
    [images],
  );
  const urls = sorted
    .map((img) => ({ url: getMediaUrl(img.image), alt: img.alt_text || title, id: img.id }))
    .filter((x): x is { url: string; alt: string; id: number } => Boolean(x.url));

  if (!urls.length) {
    return (
      <div className="w-full aspect-video rounded-2xl bg-gradient-to-br from-violet-900/30 via-purple-900/20 to-pink-900/10 flex flex-col items-center justify-center gap-3 border border-white/[0.06]">
        <svg className="w-16 h-16 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-white/20 text-sm">No images uploaded</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Main image */}
      <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/[0.07] bg-black/40 group">
        <img
          src={urls[active].url}
          alt={urls[active].alt}
          className="w-full h-full object-cover transition-all duration-500"
        />
        {/* Nav arrows for multiple images */}
        {urls.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setActive((p) => (p - 1 + urls.length) % urls.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/80"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setActive((p) => (p + 1) % urls.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-black/80"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {/* Dot indicators */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {urls.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                    i === active ? "bg-white w-4" : "bg-white/40"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Thumbnails strip */}
      {urls.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {urls.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all duration-150 ${
                i === active
                  ? "border-violet-500 scale-105"
                  : "border-transparent opacity-50 hover:opacity-80"
              }`}
            >
              <img src={img.url} alt={img.alt} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Condition badge ── */
function ConditionBadge({ condition }: { condition: Product["condition"] }) {
  const map = {
    new: { label: "New", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
    used: { label: "Used", cls: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
    refurbished: { label: "Refurbished", cls: "bg-sky-500/15 text-sky-400 border-sky-500/20" },
  };
  const { label, cls } = map[condition] ?? map.used;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

/* ── Review card ── */
function ReviewCard({ review }: { review: Product["reviews"][0] }) {
  return (
    <article className="flex flex-col gap-2 p-4 rounded-2xl border border-white/[0.07] bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-[0.65rem] font-bold text-white uppercase shrink-0">
            {review.reviewer.username.charAt(0)}
          </div>
          <div className="flex flex-col leading-none gap-0.5">
            <span className="text-sm font-semibold text-white/80">{review.reviewer.username}</span>
            <span className="text-[0.65rem] text-white/30 font-mono">
              {new Date(review.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 text-amber-400 text-sm">
          {"★".repeat(review.rating)}
          <span className="text-white/20">{"★".repeat(5 - review.rating)}</span>
        </div>
      </div>
      {review.title && (
        <h4 className="text-sm font-semibold text-white/80">{review.title}</h4>
      )}
      {review.body && (
        <p className="text-sm text-white/50 leading-relaxed">{review.body}</p>
      )}
    </article>
  );
}

/* ── Page ── */
export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { token, user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    void getProductBySlug(slug)
      .then((item) => { if (alive) setProduct(item); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : "Unable to load product."); })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [slug]);

  async function handleReviewSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token || !user || !product) return;
    setSubmittingReview(true);
    setReviewError(null);
    setReviewSuccess(null);

    try {
      await createProductReview(token, product.slug, {
        rating: reviewRating,
        title: reviewTitle.trim(),
        body: reviewBody.trim(),
      });
      const refreshed = await getProductBySlug(product.slug);
      setProduct(refreshed);
      setReviewRating(5);
      setReviewTitle("");
      setReviewBody("");
      setReviewSuccess("Your review was saved!");
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Unable to save review.");
    } finally {
      setSubmittingReview(false);
    }
  }

  const discounted = product && product.discount_percent > 0;
  const shareUrl = product?.share_url ?? (product ? `/products/${product.slug}` : '');

  async function copyShareLink() {
    if (!product) return;
    const url = product.share_url ?? `${window.location.origin}/products/${product.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage('Share link copied.');
      window.setTimeout(() => setShareMessage(null), 2500);
    } catch {
      setShareMessage('Copy failed. You can use the URL below.');
    }
  }

  return (
    <div className="min-h-screen">
      <SiteNavbar />

      <div className="max-w-7xl mx-auto px-6 pt-24 pb-24">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-white/30 font-mono mb-8 mt-4">
          <Link href="/" className="hover:text-white/60 transition-colors">Home</Link>
          <span>/</span>
          <Link href="/products" className="hover:text-white/60 transition-colors">Products</Link>
          <span>/</span>
          <span className="text-white/50 truncate max-w-[200px]">{product?.title ?? "..."}</span>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="aspect-video rounded-2xl bg-white/[0.04] animate-pulse" />
              <div className="space-y-4">
                <div className="h-8 w-3/4 rounded-xl bg-white/[0.04] animate-pulse" />
                <div className="h-4 w-1/2 rounded-xl bg-white/[0.03] animate-pulse" />
                <div className="h-16 rounded-xl bg-white/[0.03] animate-pulse" />
                <div className="h-12 rounded-xl bg-white/[0.04] animate-pulse" />
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-8">
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z" />
            </svg>
            {error}
          </div>
        )}

        {product && (
          <div className="space-y-10">
            {/* ── Main product section ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
              {/* Gallery */}
              <div>
                <DetailGallery images={product.images} title={product.title} />
              </div>

              {/* Product info */}
              <div className="flex flex-col gap-5">
                {/* Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <ConditionBadge condition={product.condition} />
                  {product.negotiable && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border border-violet-500/25 bg-violet-500/10 text-violet-300">
                      Negotiable
                    </span>
                  )}
                  {discounted && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 border border-rose-500/20 text-rose-400">
                      -{product.discount_percent}% off
                    </span>
                  )}
                </div>

                {/* Title */}
                <h1 className="font-heading text-3xl md:text-4xl font-bold text-white leading-tight tracking-tight">
                  {product.title}
                </h1>

                {/* Rating row */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 text-amber-400">
                    {product.average_rating
                      ? <>
                          {"★".repeat(Math.round(product.average_rating))}
                          <span className="text-white/20">{"★".repeat(5 - Math.round(product.average_rating))}</span>
                        </>
                      : <span className="text-white/20">★★★★★</span>
                    }
                  </div>
                  <span className="text-white/40 text-sm font-mono">
                    {product.average_rating ? product.average_rating.toFixed(1) : "No reviews"} · {product.review_count} review{product.review_count !== 1 ? "s" : ""}
                  </span>
                  <span className="text-white/20 text-sm font-mono">·</span>
                  <span className="text-white/30 text-xs font-mono">
                    {product.review_count ?? 0} views
                  </span>
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-bold text-white tracking-tight">
                    {new Intl.NumberFormat(undefined, {
                      style: "currency",
                      currency: product.currency || "USD",
                      maximumFractionDigits: 0,
                    }).format(discounted ? product.effective_price : Number(product.price))}
                  </span>
                  {discounted && (
                    <span className="text-lg text-white/30 line-through font-mono">
                      {new Intl.NumberFormat(undefined, {
                        style: "currency",
                        currency: product.currency || "USD",
                        maximumFractionDigits: 0,
                      }).format(Number(product.price))}
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="text-white/50 leading-relaxed text-sm">{product.description}</p>

                {/* Meta grid */}
                <dl className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Category", value: product.category.full_path },
                    { label: "Location", value: product.location?.full_path ?? "Not set" },
                    { label: "Owner", value: `@${product.owner_username ?? product.owner.username}` },
                    { label: "Currency", value: product.currency },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col gap-1 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                      <dt className="text-[0.65rem] text-white/30 uppercase tracking-widest font-mono">{label}</dt>
                      <dd className="text-sm text-white/70 font-medium truncate">{value}</dd>
                    </div>
                  ))}
                </dl>

                {/* CTA */}
                <div className="space-y-3 pt-2">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="flex-1 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-all duration-200 shadow-xl shadow-violet-900/30 hover:-translate-y-0.5"
                    >
                      Contact seller
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyShareLink()}
                      className="w-12 h-12 rounded-2xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-violet-300 transition-all duration-200 flex items-center justify-center"
                      title="Copy share link"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a4 4 0 014-4h2m4 8h2a4 4 0 000-8h-2m-4 8h4" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 text-xs text-white/35 font-mono">
                    <span>Share link</span>
                    <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2">
                      <input
                        readOnly
                        value={shareUrl}
                        className="w-full bg-transparent outline-none text-white/70 truncate"
                      />
                    </div>
                    {shareMessage ? <span className="text-violet-300">{shareMessage}</span> : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-white/[0.06]" />

            {/* ── Reviews section ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              {/* Leave a review */}
              <div className="flex flex-col gap-5 p-6 rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                <div>
                  <h2 className="text-xl font-bold text-white font-heading">Leave a review</h2>
                  <p className="text-white/30 text-xs font-mono mt-1">Share your experience with this product</p>
                </div>

                {!token || !user ? (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
                      <svg className="w-5 h-5 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <p className="text-white/40 text-sm">You must be logged in to leave a review.</p>
                    <Link href="/login" className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors">
                      Log in
                    </Link>
                  </div>
                ) : (
                  <form onSubmit={handleReviewSubmit} className="flex flex-col gap-4">
                    {reviewError && (
                      <p className="text-xs text-red-400 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">{reviewError}</p>
                    )}
                    {reviewSuccess && (
                      <p className="text-xs text-emerald-400 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">{reviewSuccess}</p>
                    )}

                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-white/40 uppercase tracking-widest font-mono">Rating</label>
                      <StarPicker value={reviewRating} onChange={setReviewRating} />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-white/40 uppercase tracking-widest font-mono">Title</label>
                      <input
                        value={reviewTitle}
                        onChange={(e) => setReviewTitle(e.target.value)}
                        placeholder="e.g. Great seller, fast shipping"
                        className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.1] text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.06] transition-all"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-white/40 uppercase tracking-widest font-mono">Review</label>
                      <textarea
                        value={reviewBody}
                        onChange={(e) => setReviewBody(e.target.value)}
                        rows={4}
                        placeholder="Share what mattered to you..."
                        className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.1] text-white/80 text-sm placeholder-white/20 focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.06] transition-all resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submittingReview}
                      className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all duration-200"
                    >
                      {submittingReview ? "Saving..." : "Submit review"}
                    </button>
                  </form>
                )}
              </div>

              {/* Existing reviews */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white font-heading">
                    Reviews
                    <span className="ml-2 text-white/30 text-base font-mono font-normal">({product.review_count})</span>
                  </h2>
                  {product.average_rating && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <span className="text-amber-400 text-sm">★</span>
                      <span className="text-amber-300 font-bold text-sm">{product.average_rating.toFixed(1)}</span>
                      <span className="text-white/30 text-xs font-mono">/5</span>
                    </div>
                  )}
                </div>

                {product.reviews.length ? (
                  <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto pr-1">
                    {product.reviews.map((review) => (
                      <ReviewCard key={review.id} review={review} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 py-12 text-center rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                    <span className="text-3xl">📭</span>
                    <p className="text-white/40 text-sm">No reviews yet — be the first!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
