"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { SiteNavbar } from "@/components/site-navbar";
import { createProductReview, deleteProduct, getMediaUrl, getProductBySlug, type Product } from "@/lib/api";

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button" onClick={() => onChange(star)} onMouseEnter={() => setHovered(star)} onMouseLeave={() => setHovered(0)} className="text-2xl transition-transform duration-100 hover:scale-125">
          <span className={(hovered || value) >= star ? "text-amber-400" : "text-white/20"}>*</span>
        </button>
      ))}
      <span className="ml-2 text-sm text-white/40 font-mono">{value}/5</span>
    </div>
  );
}

function DetailGallery({ images, title }: { images: Product["images"]; title: string }) {
  const [active, setActive] = useState(0);
  const urls = useMemo(() => images.slice().sort((a, b) => a.sort_order - b.sort_order).map((img) => ({ url: getMediaUrl(img.image), alt: img.alt_text || title, id: img.id })).filter((x): x is { url: string; alt: string; id: number } => Boolean(x.url)), [images, title]);
  useEffect(() => setActive(0), [title]);
  if (!urls.length) return <div className="w-full aspect-video rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-white/20">No images uploaded</div>;
  return <div className="flex flex-col gap-3"><div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/[0.07] bg-black/40"><img src={urls[active].url} alt={urls[active].alt} className="w-full h-full object-cover" /></div>{urls.length > 1 ? <div className="flex gap-2 overflow-x-auto pb-1">{urls.map((img, i) => <button key={img.id} type="button" onClick={() => setActive(i)} className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 ${i === active ? "border-violet-500" : "border-transparent opacity-60"}`}><img src={img.url} alt={img.alt} className="w-full h-full object-cover" /></button>)}</div> : null}</div>;
}

function ConditionBadge({ condition }: { condition: Product["condition"] }) {
  const map = { new: { label: "New", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" }, used: { label: "Used", cls: "bg-amber-500/15 text-amber-400 border-amber-500/20" }, refurbished: { label: "Refurbished", cls: "bg-sky-500/15 text-sky-400 border-sky-500/20" } };
  const { label, cls } = map[condition] ?? map.used;
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${cls}`}>{label}</span>;
}

function ReviewCard({ review }: { review: Product["reviews"][0] }) {
  return <article className="flex flex-col gap-2 p-4 rounded-2xl border border-white/[0.07] bg-white/[0.03]"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-[0.65rem] font-bold text-white uppercase shrink-0">{review.reviewer.username.charAt(0)}</div><div className="flex flex-col leading-none gap-0.5"><span className="text-sm font-semibold text-white/80">{review.reviewer.username}</span><span className="text-[0.65rem] text-white/30 font-mono">{new Date(review.created_at).toLocaleDateString()}</span></div></div><div className="flex items-center gap-0.5 text-amber-400 text-sm">{"*".repeat(review.rating)}<span className="text-white/20">{"*".repeat(5 - review.rating)}</span></div></div>{review.title ? <h4 className="text-sm font-semibold text-white/80">{review.title}</h4> : null}{review.body ? <p className="text-sm text-white/50 leading-relaxed">{review.body}</p> : null}</article>;
}

export default function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
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
  const [deletingProduct, setDeletingProduct] = useState(false);
  const isOwner = Boolean(product && user && product.owner.id === user.id);

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

  const shareUrl = product?.share_url ?? (product ? `/products/${product.slug}` : "");
  const discounted = Boolean(product && product.discount_percent > 0);

  async function copyShareLink() {
    if (!product) return;
    const url = product.share_url ?? `${window.location.origin}/products/${product.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage("Share link copied.");
      window.setTimeout(() => setShareMessage(null), 2500);
    } catch {
      setShareMessage("Copy failed. You can use the URL below.");
    }
  }

  async function handleReviewSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token || !user || !product) return;
    setSubmittingReview(true);
    setReviewError(null);
    setReviewSuccess(null);
    try {
      await createProductReview(token, product.slug, { rating: reviewRating, title: reviewTitle.trim(), body: reviewBody.trim() });
      setProduct(await getProductBySlug(product.slug));
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

  async function handleDeleteOwnerProduct() {
    if (!token || !product || !isOwner) return;
    if (!window.confirm("Delete this product permanently? This cannot be undone.")) return;
    setDeletingProduct(true);
    setError(null);
    try {
      await deleteProduct(token, product.slug);
      window.location.href = "/products";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete product.");
    } finally {
      setDeletingProduct(false);
    }
  }

  return (
    <div className="min-h-screen"><SiteNavbar /><div className="max-w-7xl mx-auto px-6 pt-24 pb-24 space-y-8"><div className="flex items-center gap-2 text-xs text-white/30 font-mono"><Link href="/" className="hover:text-white/60">Home</Link><span>/</span><Link href="/products" className="hover:text-white/60">Products</Link><span>/</span><span className="text-white/50 truncate max-w-[200px]">{product?.title ?? "..."}</span></div>{loading ? <div className="h-80 rounded-3xl bg-white/[0.03] animate-pulse" /> : null}{error ? <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div> : null}{product ? <div className="space-y-10"><div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start"><DetailGallery images={product.images} title={product.title} /><div className="flex flex-col gap-5"><div className="flex flex-wrap items-center gap-2"><ConditionBadge condition={product.condition} />{product.negotiable ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border border-violet-500/25 bg-violet-500/10 text-violet-300">Negotiable</span> : null}{discounted ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 border border-rose-500/20 text-rose-400">-{product.discount_percent}% off</span> : null}</div><h1 className="text-3xl md:text-4xl font-bold text-white leading-tight tracking-tight">{product.title}</h1><div className="flex items-center gap-3 text-sm text-white/40"><span>{product.average_rating ? product.average_rating.toFixed(1) : "No reviews"}</span><span>/</span><span>{product.review_count} review{product.review_count !== 1 ? "s" : ""}</span><span>/</span><span>{product.view_count ?? 0} views</span></div><div className="flex items-baseline gap-3"><span className="text-4xl font-bold text-white">{new Intl.NumberFormat(undefined, { style: "currency", currency: product.currency || "USD", maximumFractionDigits: 0 }).format(discounted ? product.effective_price : Number(product.price))}</span>{discounted ? <span className="text-lg text-white/30 line-through font-mono">{new Intl.NumberFormat(undefined, { style: "currency", currency: product.currency || "USD", maximumFractionDigits: 0 }).format(Number(product.price))}</span> : null}</div><p className="text-white/50 leading-relaxed text-sm">{product.description}</p><dl className="grid grid-cols-2 gap-3">{[{ label: "Category", value: product.category.full_path }, { label: "Location", value: product.location?.full_path ?? "Not set" }, { label: "Owner", value: `@${product.owner_username ?? product.owner.username}` }, { label: "Currency", value: product.currency }].map(({ label, value }) => <div key={label} className="flex flex-col gap-1 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"><dt className="text-[0.65rem] text-white/30 uppercase tracking-widest font-mono">{label}</dt><dd className="text-sm text-white/70 font-medium truncate">{value}</dd></div>)}</dl><div className="space-y-3 pt-2"><div className="flex gap-3"><button type="button" className="flex-1 py-3.5 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm">Contact seller</button><button type="button" onClick={() => void copyShareLink()} className="w-12 h-12 rounded-2xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-violet-300" title="Copy share link">Copy</button></div><div className="flex flex-col gap-1 text-xs text-white/35 font-mono"><span>Share link</span><div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2"><input readOnly value={shareUrl} className="w-full bg-transparent outline-none text-white/70 truncate" /></div>{shareMessage ? <span className="text-violet-300">{shareMessage}</span> : null}</div></div>{isOwner ? <div className="p-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-white/80">Owner controls</h2><span className="text-xs text-white/30">Edit, update, or delete this listing</span></div><div className="flex flex-wrap gap-3"><Link href={`/products/${product.slug}/edit`} className="flex-1 min-w-[160px] py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm text-center">Edit product</Link><button type="button" onClick={() => void handleDeleteOwnerProduct()} disabled={deletingProduct} className="px-4 py-3 rounded-2xl border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-300 font-semibold text-sm disabled:opacity-50">{deletingProduct ? "Deleting..." : "Delete"}</button></div></div> : null}</div></div><div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start"><div className="flex flex-col gap-5 p-6 rounded-2xl border border-white/[0.07] bg-white/[0.02]"><div><h2 className="text-xl font-bold text-white">Leave a review</h2><p className="text-white/30 text-xs font-mono mt-1">Share your experience with this product</p></div>{!token || !user ? <div className="flex flex-col items-center gap-3 py-6 text-center"><p className="text-white/40 text-sm">You must be logged in to leave a review.</p><Link href="/login" className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold">Log in</Link></div> : <form onSubmit={handleReviewSubmit} className="flex flex-col gap-4">{reviewError ? <p className="text-xs text-red-400 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">{reviewError}</p> : null}{reviewSuccess ? <p className="text-xs text-emerald-400 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">{reviewSuccess}</p> : null}<StarPicker value={reviewRating} onChange={setReviewRating} /><input value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} placeholder="e.g. Great seller" className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.1] text-white/80 text-sm" /><textarea value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} rows={4} placeholder="Share what mattered to you..." className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.1] text-white/80 text-sm resize-none" /><button type="submit" disabled={submittingReview} className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold text-sm">{submittingReview ? "Saving..." : "Submit review"}</button></form>}</div><div className="flex flex-col gap-4"><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-white">Reviews <span className="ml-2 text-white/30 text-base font-mono font-normal">({product.review_count})</span></h2></div>{product.reviews.length ? <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto pr-1">{product.reviews.map((review) => <ReviewCard key={review.id} review={review} />)}</div> : <div className="flex flex-col items-center justify-center gap-3 py-12 text-center rounded-2xl border border-white/[0.06] bg-white/[0.02] text-white/40">No reviews yet</div>}</div></div></div> : null}</div></div>
  );
}