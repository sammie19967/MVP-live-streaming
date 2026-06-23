"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getMediaUrl, getProducts, type Product } from "@/lib/api";

export default function ProductDetailPage({ params }: { params: { slug: string } }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    void getProducts()
      .then((items) => {
        if (!alive) return;
        setProducts(items);
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
  }, []);

  const product = useMemo(
    () => products.find((item) => item.slug === params.slug) ?? null,
    [params.slug, products],
  );

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
      {!loading && !error && !product ? <p className="section-copy">We could not find that product.</p> : null}

      {product ? (
        <section className="panel stack">
          <span className="eyebrow">Listing</span>
          <h1 className="headline" style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)" }}>
            {product.title}
          </h1>
          <p className="lede">{product.description}</p>
          {product.images[0] ? (
            <img
              alt={product.images[0].alt_text || product.title}
              src={getMediaUrl(product.images[0].image) ?? undefined}
              style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: "12px" }}
            />
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
              <dt>Negotiable</dt>
              <dd>{product.negotiable ? "Yes" : "No"}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
