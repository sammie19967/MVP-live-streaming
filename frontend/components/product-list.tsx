"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getMediaUrl, getProducts, type Product } from "@/lib/api";

type SortMode = "newest" | "oldest" | "price_low" | "price_high";

function formatPrice(product: Product) {
  const value = product.discount_percent > 0 ? product.effective_price : Number(product.price);
  return `${product.currency} ${value.toLocaleString()}`;
}

export function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("newest");

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
        setError(err instanceof Error ? err.message : "Unable to load products.");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const sortedProducts = useMemo(() => {
    const items = [...products];
    items.sort((a, b) => {
      switch (sortMode) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "price_low":
          return Number(a.price) - Number(b.price);
        case "price_high":
          return Number(b.price) - Number(a.price);
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return items;
  }, [products, sortMode]);

  return (
    <section className="stack">
      <div className="status-row">
        <div>
          <span className="eyebrow">Product catalog</span>
          <h2 className="section-title">Created products</h2>
        </div>
        <div className="field" style={{ minWidth: "180px", margin: 0 }}>
          <label>Sort</label>
          <select className="field-select" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="price_low">Price low to high</option>
            <option value="price_high">Price high to low</option>
          </select>
        </div>
      </div>

      {loading ? <p className="section-copy">Loading products...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {!loading && !error && !sortedProducts.length ? (
        <p className="section-copy">No products have been created yet.</p>
      ) : null}

      <div className="grid two-col">
        {sortedProducts.map((product) => {
          const image = getMediaUrl(product.images[0]?.image ?? null);
          return (
            <article className="panel stack" key={product.id}>
              {image ? (
                <img
                  alt={product.images[0]?.alt_text || product.title}
                  src={image}
                  style={{ width: "100%", aspectRatio: "16 / 10", objectFit: "cover", borderRadius: "12px" }}
                />
              ) : null}
              <div className="status-row">
                <h3 className="section-title" style={{ fontSize: "1rem" }}>{product.title}</h3>
                <span className="status-pill">{product.condition}</span>
              </div>
              <p className="section-copy" style={{ marginTop: 0 }}>{product.category.full_path}</p>
              <dl className="meta-list">
                <div>
                  <dt>Price</dt>
                  <dd>{formatPrice(product)}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{product.location?.full_path ?? "Not set"}</dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd>{product.owner.username}</dd>
                </div>
                <div>
                  <dt>Rating</dt>
                  <dd>{product.average_rating ? `${product.average_rating} / 5` : "No reviews yet"}</dd>
                </div>
              </dl>
              <div className="cta-row">
                <Link className="button" href={`/products/${product.slug}`}>
                  View product
                </Link>
                {product.negotiable ? <span className="status-pill">Negotiable</span> : <span className="status-pill offline">Fixed</span>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
