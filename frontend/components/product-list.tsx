"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getMediaUrl, getProducts, type Product } from "@/lib/api";

type SortMode = "newest" | "oldest" | "price_low" | "price_high";

function formatPrice(product: Product) {
  const value =
    product.discount_percent > 0
      ? product.effective_price
      : Number(product.price);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: product.currency || "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function ConditionBadge({ condition }: { condition: Product["condition"] }) {
  const map = {
    new: { label: "New", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
    used: { label: "Used", cls: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
    refurbished: { label: "Refurbished", cls: "bg-sky-500/15 text-sky-400 border-sky-500/20" },
  };
  const { label, cls } = map[condition] ?? map.used;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[0.7rem] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

function StarRating({ value }: { value: number | null }) {
  if (!value) return <span className="text-white/30 text-xs">No reviews</span>;
  const full = Math.round(value);
  return (
    <span className="flex items-center gap-1">
      <span className="text-amber-400 text-sm tracking-tighter">
        {"★".repeat(full)}
        <span className="text-white/20">{"★".repeat(5 - full)}</span>
      </span>
      <span className="text-white/40 text-xs font-mono">{value.toFixed(1)}</span>
    </span>
  );
}

/* ── Image Gallery ── */
function ProductGallery({ images, title }: { images: Product["images"]; title: string }) {
  const [active, setActive] = useState(0);
  const urls = images
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((img) => ({ url: getMediaUrl(img.image), alt: img.alt_text || title }))
    .filter((x): x is { url: string; alt: string } => Boolean(x.url));

  if (!urls.length) {
    return (
      <div className="w-full aspect-[4/3] rounded-xl bg-gradient-to-br from-violet-900/30 via-purple-900/20 to-pink-900/10 flex flex-col items-center justify-center gap-2">
        <svg className="w-10 h-10 text-white/10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-white/20 text-xs">No image</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Main image */}
      <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-black/40 border border-white/[0.06]">
        <img
          src={urls[active].url}
          alt={urls[active].alt}
          className="w-full h-full object-cover transition-opacity duration-300"
        />
        {/* Discount badge */}
      </div>

      {/* Thumbnails */}
      {urls.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {urls.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all duration-150 ${
                i === active
                  ? "border-violet-500 opacity-100"
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

/* ── Skeleton card ── */
function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4 space-y-3 animate-pulse">
      <div className="aspect-[4/3] rounded-xl bg-white/[0.05]" />
      <div className="h-4 w-3/4 rounded-full bg-white/[0.05]" />
      <div className="h-3 w-1/2 rounded-full bg-white/[0.04]" />
      <div className="flex gap-2">
        <div className="h-3 w-16 rounded-full bg-white/[0.04]" />
        <div className="h-3 w-12 rounded-full bg-white/[0.03]" />
      </div>
      <div className="h-9 rounded-xl bg-white/[0.04]" />
    </div>
  );
}

/* ── Product Card ── */
function ProductCard({ product }: { product: Product }) {
  const discounted = product.discount_percent > 0;

  return (
    <article className="group flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden transition-all duration-300 hover:border-violet-500/30 hover:bg-white/[0.05] hover:shadow-[0_0_32px_rgba(124,58,237,0.1)] hover:-translate-y-0.5">
      {/* Gallery */}
      <div className="p-3 pb-0">
        <div className="relative">
          <ProductGallery images={product.images} title={product.title} />
          {discounted && (
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[0.68rem] font-bold shadow-lg">
              -{product.discount_percent}%
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2.5 p-4 flex-1">
        {/* Title + condition */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-white/90 leading-snug line-clamp-2 tracking-tight">
            {product.title}
          </h3>
          <ConditionBadge condition={product.condition} />
        </div>

        {/* Category path */}
        <p className="text-[0.7rem] text-white/30 font-mono line-clamp-1">
          {product.category.full_path}
        </p>

        {/* Rating */}
        <StarRating value={product.average_rating} />

        {/* Price row */}
        <div className="flex items-baseline gap-2 mt-auto">
          <span className="text-lg font-bold text-white tracking-tight">
            {formatPrice(product)}
          </span>
          {discounted && (
            <span className="text-xs text-white/30 line-through font-mono">
              {new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: product.currency || "USD",
                maximumFractionDigits: 0,
              }).format(Number(product.price))}
            </span>
          )}
          {product.negotiable && (
            <span className="ml-auto text-[0.68rem] text-violet-400 font-semibold">Negotiable</span>
          )}
        </div>

        {/* Location + owner */}
        <div className="flex items-center justify-between text-[0.7rem] text-white/30 font-mono">
          <span className="flex items-center gap-1 line-clamp-1">
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {product.location?.full_path ?? "Location not set"}
          </span>
          <span>@{product.owner.username}</span>
        </div>

        {/* CTA */}
        <Link
          href={`/products/${product.slug}`}
          className="mt-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-all duration-200 shadow-lg shadow-violet-900/30"
        >
          View product
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
      </div>
    </article>
  );
}

/* ── ProductList ── */
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

    return () => { alive = false; };
  }, []);

  const sortedProducts = useMemo(() => {
    const items = [...products];
    items.sort((a, b) => {
      switch (sortMode) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "price_low":
          return Number(a.effective_price) - Number(b.effective_price);
        case "price_high":
          return Number(b.effective_price) - Number(a.effective_price);
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return items;
  }, [products, sortMode]);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-white/30 text-xs font-mono mt-0.5">
            {loading ? "Loading..." : `${sortedProducts.length} listings found`}
          </p>
        </div>

        {/* Sort control */}
        <div className="relative">
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="appearance-none pl-4 pr-9 py-2.5 rounded-xl border border-white/[0.1] bg-white/[0.04] text-white/70 text-sm font-medium focus:outline-none focus:border-violet-500/50 focus:bg-white/[0.07] transition-all duration-200 cursor-pointer"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="price_low">Price: Low → High</option>
            <option value="price_high">Price: High → Low</option>
          </select>
          <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z" />
          </svg>
          {error}
        </div>
      )}

      {/* Skeleton loaders */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && sortedProducts.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
            <svg className="w-8 h-8 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
            </svg>
          </div>
          <div>
            <p className="text-white/60 font-semibold text-sm">No products yet</p>
            <p className="text-white/30 text-xs mt-1">Be the first to list something</p>
          </div>
          <Link
            href="/products/new"
            className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors duration-200"
          >
            Create listing
          </Link>
        </div>
      )}

      {/* Grid */}
      {!loading && !error && sortedProducts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {sortedProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
