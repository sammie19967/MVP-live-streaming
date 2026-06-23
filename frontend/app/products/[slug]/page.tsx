"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { createProductReview, getMediaUrl, getProductBySlug, type Product } from "@/lib/api";

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="status-row" style={{ gap: "0.35rem" }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="ghost-button"
          style={{
            padding: "0.4rem 0.55rem",
            borderColor: star <= value ? "var(--accent)" : "var(--line)",
            color: star <= value ? "var(--accent)" : "inherit",
          }}
        >
          {star <= value ? "★" : "☆"}
        </button>
      ))}
    </div>
  );
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

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    void getProductBySlug(slug)
      .then((item) => {
        if (!alive) return;
        setProduct(item);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Unable to load product.");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [slug]);

  const gallery = useMemo(() => product?.images ?? [], [product]);

  async function handleReviewSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !user) {
      setReviewError("Please log in to leave a review.");
      return;
    }
    if (!product) return;
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
      setReviewSuccess("Your review was saved.");
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Unable to save review.");
    } finally {
      setSubmittingReview(false);
    }
  }

  return (
    <div className="shell">
      <div className="nav">
        <div className="nav-brand">
          <span className="nav-mark">LIVE MVP</span>
          <span className="nav-copy">Product details</span>
        </div>
        <div className="nav-row">
          <Link className="ghost-button" href="/products">
            Back to products
          </Link>
          <Link className="button" href="/products/new">
            Create product
          </Link>
        </div>
      </div>

      {loading ? <p className="section-copy">Loading product...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {product ? (
        <>
          <section className="panel stack">
            <span className="eyebrow">Listing</span>
            <h1 className="headline" style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)" }}>
              {product.title}
            </h1>
            <div className="status-row">
              <span className="status-pill">
                {product.average_rating ? `${product.average_rating} / 5` : "No reviews yet"}
              </span>
              <span className="status-pill">{product.review_count} review(s)</span>
              <span className="status-pill">{product.negotiable ? "Negotiable" : "Fixed price"}</span>
            </div>
            <p className="lede">{product.description}</p>
            {gallery.length ? (
              <div className="grid" style={{ gridTemplateColumns: gallery.length > 1 ? "2fr 1fr" : "1fr", gap: "0.75rem" }}>
                <img
                  alt={gallery[0].alt_text || product.title}
                  src={getMediaUrl(gallery[0].image) ?? undefined}
                  style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: "12px" }}
                />
                {gallery.length > 1 ? (
                  <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.75rem" }}>
                    {gallery.slice(1).map((image, index) => {
                      const url = getMediaUrl(image.image);
                      return url ? (
                        <img
                          key={image.id}
                          alt={image.alt_text || `${product.title} gallery ${index + 2}`}
                          src={url}
                          style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: "10px" }}
                        />
                      ) : null;
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
            <dl className="meta-list">
              <div>
                <dt>Category</dt>
                <dd>{product.category.full_path}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{product.location?.full_path ?? "Not set"}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>
                  {product.currency} {Number(product.price).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{product.owner.username}</dd>
              </div>
            </dl>
          </section>

          <section className="grid two-col" style={{ marginTop: "1.5rem", alignItems: "start" }}>
            <section className="panel stack">
              <h2 className="section-title">Leave a review</h2>
              {reviewError ? <p className="form-error">{reviewError}</p> : null}
              {reviewSuccess ? <p className="form-success">{reviewSuccess}</p> : null}
              {!token || !user ? <p className="section-copy">Log in to rate this product.</p> : null}
              <form className="stack" onSubmit={handleReviewSubmit}>
                <div className="field">
                  <label>Rating</label>
                  <StarPicker value={reviewRating} onChange={setReviewRating} />
                </div>
                <div className="field">
                  <label>Title</label>
                  <input value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} placeholder="Good seller" />
                </div>
                <div className="field">
                  <label>Review</label>
                  <textarea
                    value={reviewBody}
                    onChange={(e) => setReviewBody(e.target.value)}
                    rows={5}
                    placeholder="Share what mattered to you."
                    style={{ width: "100%", borderRadius: "16px", border: "1px solid var(--line)", padding: "0.8rem 0.95rem", background: "rgba(255,255,255,0.72)" }}
                  />
                </div>
                <button className="button" type="submit" disabled={submittingReview || !token || !user}>
                  {submittingReview ? "Saving..." : "Submit review"}
                </button>
              </form>
            </section>

            <section className="panel stack">
              <h2 className="section-title">Reviews</h2>
              {product.reviews.length ? (
                <div className="stack">
                  {product.reviews.map((review) => (
                    <article key={review.id} className="status-card stack">
                      <div className="status-row">
                        <strong>{review.reviewer.username}</strong>
                        <span className="status-pill">{review.rating} / 5</span>
                      </div>
                      {review.title ? <h3 className="section-title" style={{ fontSize: "1rem" }}>{review.title}</h3> : null}
                      {review.body ? <p className="section-copy" style={{ margin: 0 }}>{review.body}</p> : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="section-copy">No reviews yet.</p>
              )}
            </section>
          </section>
        </>
      ) : null}
    </div>
  );
}





