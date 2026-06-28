"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { getMediaUrl, getProductMeta, getProducts, type Category, type Country, type Location, type Product } from "@/lib/api";

type SortMode = "newest" | "oldest" | "price_low" | "price_high";

type FilterState = {
  q: string;
  category: string;
  country: string;
  location: string;
  condition: "" | Product["condition"];
  negotiable: "" | "true" | "false";
  min_price: string;
  max_price: string;
  ordering: SortMode;
};

type OptionNode<T> = {
  item: T;
  children: OptionNode<T>[];
};

const DEFAULT_FILTERS: FilterState = {
  q: "",
  category: "",
  country: "",
  location: "",
  condition: "",
  negotiable: "",
  min_price: "",
  max_price: "",
  ordering: "newest",
};

function buildTree<T extends { id: number; parent: number | null }>(items: T[]): OptionNode<T>[] {
  const byParent = new Map<number | null, T[]>();
  for (const item of items) {
    const bucket = byParent.get(item.parent) ?? [];
    bucket.push(item);
    byParent.set(item.parent, bucket);
  }

  const build = (parent: number | null): OptionNode<T>[] =>
    (byParent.get(parent) ?? []).map((item) => ({ item, children: build(item.id) }));

  return build(null);
}

function findNodeAtPath<T extends { id: number }>(nodes: OptionNode<T>[], selectedIds: number[]) {
  let currentNodes = nodes;
  let current: OptionNode<T> | null = null;

  for (const selectedId of selectedIds) {
    current = currentNodes.find((node) => node.item.id === selectedId) ?? null;
    if (!current) return null;
    currentNodes = current.children;
  }

  return current;
}

function getLeafIdPath(value: string) {
  if (!value) return "";
  return value.split(".").filter(Boolean).at(-1) ?? "";
}

function parseFiltersFromSearchParams(searchParams: URLSearchParams): FilterState {
  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? "";
  const country = searchParams.get("country") ?? "";
  const location = searchParams.get("location") ?? "";
  const conditionParam = searchParams.get("condition") ?? "";
  const condition = conditionParam === "new" || conditionParam === "used" || conditionParam === "refurbished" ? conditionParam : "";
  const negotiableParam = (searchParams.get("negotiable") ?? "").toLowerCase();
  const negotiable = negotiableParam === "true" || negotiableParam === "1" ? "true" : negotiableParam === "false" || negotiableParam === "0" ? "false" : "";
  const min_price = searchParams.get("min_price") ?? "";
  const max_price = searchParams.get("max_price") ?? "";
  const orderingParam = searchParams.get("ordering") ?? "newest";
  const ordering: SortMode = orderingParam === "oldest" || orderingParam === "price_low" || orderingParam === "price_high" ? orderingParam : "newest";

  return { q, category, country, location, condition, negotiable, min_price, max_price, ordering };
}

function buildSearchParams(filters: FilterState) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.category) params.set("category", filters.category);
  if (filters.country) params.set("country", filters.country);
  const leafLocationId = getLeafIdPath(filters.location);
  if (leafLocationId) params.set("location", leafLocationId);
  if (filters.condition) params.set("condition", filters.condition);
  if (filters.negotiable) params.set("negotiable", filters.negotiable);
  if (filters.min_price.trim()) params.set("min_price", filters.min_price.trim());
  if (filters.max_price.trim()) params.set("max_price", filters.max_price.trim());
  if (filters.ordering !== "newest") params.set("ordering", filters.ordering);
  return params;
}

function formatPrice(product: Product) {
  const value = product.discount_percent > 0 ? product.effective_price : Number(product.price);
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
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[0.7rem] font-semibold border ${cls}`}>{label}</span>;
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.16" strokeWidth="3.5" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

function StarRating({ value }: { value: number | null }) {
  if (value == null) return <span className="text-white/30 text-xs">No reviews</span>;

  const fullStars = Math.floor(value);
  const hasHalfStar = value - fullStars >= 0.25 && value - fullStars < 0.75;
  const roundedStars = hasHalfStar ? fullStars + 0.5 : Math.round(value);
  const starPath = "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.164c.969 0 1.371 1.24.588 1.81l-3.371 2.449a1 1 0 00-.364 1.118l1.286 3.957c.3.921-.755 1.688-1.54 1.118l-3.371-2.45a1 1 0 00-1.175 0l-3.371 2.45c-.784.57-1.838-.197-1.539-1.118l1.285-3.957a1 1 0 00-.364-1.118L2.06 9.384c-.783-.57-.38-1.81.588-1.81h4.164a1 1 0 00.95-.69l1.286-3.957z";

  return (
    <span className="flex items-center gap-1" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      <span className="flex items-center gap-0.5">
        {Array.from({ length: 5 }, (_, index) => {
          const starNumber = index + 1;
          const filled = starNumber <= fullStars;
          const half = hasHalfStar && starNumber === fullStars + 1;
          return (
            <span key={starNumber} className="relative inline-flex h-3.5 w-3.5 shrink-0" aria-hidden="true">
              <svg className="absolute inset-0 h-3.5 w-3.5 text-white/15" fill="currentColor" viewBox="0 0 20 20">
                <path d={starPath} />
              </svg>
              {filled ? (
                <svg className="absolute inset-0 h-3.5 w-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d={starPath} />
                </svg>
              ) : half ? (
                <>
                  <svg className="absolute inset-0 h-3.5 w-3.5 text-white/15" fill="currentColor" viewBox="0 0 20 20">
                    <path d={starPath} />
                  </svg>
                  <span className="absolute inset-0 overflow-hidden" style={{ width: "50%" }}>
                    <svg className="h-3.5 w-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d={starPath} />
                    </svg>
                  </span>
                </>
              ) : null}
            </span>
          );
        })}
      </span>
      <span className="text-white/40 text-xs font-mono">{roundedStars.toFixed(1)}</span>
    </span>
  );
}

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
      <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-black/40 border border-white/[0.06]">
        <img src={urls[active].url} alt={urls[active].alt} className="w-full h-full object-cover transition-opacity duration-300" />
      </div>
      {urls.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {urls.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all duration-150 ${i === active ? "border-violet-500 opacity-100" : "border-transparent opacity-50 hover:opacity-80"}`}
            >
              <img src={img.url} alt={img.alt} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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

function ProductCard({ product }: { product: Product }) {
  const discounted = product.discount_percent > 0;
  return (
    <article className="group flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden transition-all duration-300 hover:border-violet-500/30 hover:bg-white/[0.05] hover:shadow-[0_0_32px_rgba(124,58,237,0.1)] hover:-translate-y-0.5">
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

      <div className="flex flex-col gap-2.5 p-4 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-white/90 leading-snug line-clamp-2 tracking-tight">{product.title}</h3>
          <ConditionBadge condition={product.condition} />
        </div>
        <p className="text-[0.7rem] text-white/30 font-mono line-clamp-1">{product.category.full_path}</p>
        <StarRating value={product.average_rating} />
        <div className="flex items-baseline gap-2 mt-auto">
          <span className="text-lg font-bold text-white tracking-tight">{formatPrice(product)}</span>
          {discounted && (
            <span className="text-xs text-white/30 line-through font-mono">
              {new Intl.NumberFormat(undefined, { style: "currency", currency: product.currency || "USD", maximumFractionDigits: 0 }).format(Number(product.price))}
            </span>
          )}
          {product.negotiable && <span className="ml-auto text-[0.68rem] text-violet-400 font-semibold">Negotiable</span>}
        </div>
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
        <Link href={`/products/${product.slug}`} className="mt-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-all duration-200 shadow-lg shadow-violet-900/30">
          View product
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
      </div>
    </article>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode; }) {
  return (
    <label className="flex flex-col gap-2 text-xs text-white/50 font-mono">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 focus:outline-none focus:border-violet-500/50">
        {children}
      </select>
    </label>
  );
}

function CategoryField({ categories, value, onChange }: { categories: Category[]; value: string; onChange: (value: string) => void; }) {
  const tree = useMemo(() => buildTree(categories), [categories]);
  const levels = useMemo(() => {
    const selectedIds = value ? value.split(".").map((part) => Number(part)).filter(Boolean) : [];
    const rows: Array<{ key: string; options: OptionNode<Category>[]; selected: string }> = [];
    let nodes = tree;
    let path: number[] = [];

    rows.push({ key: "root", options: nodes, selected: selectedIds[0] ? String(selectedIds[0]) : "" });
    for (let i = 0; i < selectedIds.length; i++) {
      const node = nodes.find((entry) => entry.item.id === selectedIds[i]);
      if (!node) break;
      path = [...path, node.item.id];
      nodes = node.children;
      if (nodes.length) {
        rows.push({ key: path.join("-"), options: nodes, selected: selectedIds[i + 1] ? String(selectedIds[i + 1]) : "" });
      }
    }
    return rows;
  }, [tree, value]);

  const updateAtLevel = (levelIndex: number, nextValue: string) => {
    const nextIds = value ? value.split(".").map((part) => Number(part)).filter(Boolean) : [];
    const truncated = nextIds.slice(0, levelIndex);
    if (nextValue) truncated[levelIndex] = Number(nextValue);
    onChange(truncated.join("."));
  };

  return (
    <div className="flex flex-col gap-2 text-xs text-white/50 font-mono">
      <span>Category</span>
      <div className="space-y-2">
        {levels.map((level, index) => (
          <select
            key={level.key}
            value={level.selected}
            onChange={(e) => updateAtLevel(index, e.target.value)}
            className="appearance-none w-full rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 focus:outline-none focus:border-violet-500/50"
          >
            <option value="">{index === 0 ? "All categories" : "Select subcategory"}</option>
            {level.options.map((node) => (
              <option key={node.item.id} value={node.item.id}>
                {"\u00A0\u00A0".repeat(node.item.level - 1)}{node.item.name}
              </option>
            ))}
          </select>
        ))}
      </div>
    </div>
  );
}

function LocationField({ locations, countryId, value, onCountryChange, onLocationChange, countries }: { locations: Location[]; countryId: string; value: string; onCountryChange: (value: string) => void; onLocationChange: (value: string) => void; countries: Country[]; }) {
  const locationTree = useMemo(() => buildTree(locations.filter((location) => !countryId || String(location.country) === countryId)), [locations, countryId]);
  const levels = useMemo(() => {
    const selectedIds = value ? value.split(".").map((part) => Number(part)).filter(Boolean) : [];
    const rows: Array<{ key: string; options: OptionNode<Location>[]; selected: string }> = [];
    let nodes = locationTree;
    let path: number[] = [];

    rows.push({ key: "root", options: nodes, selected: selectedIds[0] ? String(selectedIds[0]) : "" });
    for (let i = 0; i < selectedIds.length; i++) {
      const node = nodes.find((entry) => entry.item.id === selectedIds[i]);
      if (!node) break;
      path = [...path, node.item.id];
      nodes = node.children;
      if (nodes.length) {
        rows.push({ key: path.join("-"), options: nodes, selected: selectedIds[i + 1] ? String(selectedIds[i + 1]) : "" });
      }
    }
    return rows;
  }, [locationTree, value]);

  const updateAtLevel = (levelIndex: number, nextValue: string) => {
    const nextIds = value ? value.split(".").map((part) => Number(part)).filter(Boolean) : [];
    const truncated = nextIds.slice(0, levelIndex);
    if (nextValue) truncated[levelIndex] = Number(nextValue);
    onLocationChange(truncated.join("."));
  };

  return (
    <div className="flex flex-col gap-2 text-xs text-white/50 font-mono">
      <span>Location</span>
      <div className="flex flex-col gap-2">
        <select
          value={countryId}
          onChange={(e) => onCountryChange(e.target.value)}
          className="appearance-none rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 focus:outline-none focus:border-violet-500/50"
        >
          <option value="">All countries</option>
          {countries.map((country) => (
            <option key={country.id} value={country.id}>{country.name}</option>
          ))}
        </select>
        {levels.map((level, index) => (
          <select
            key={level.key}
            value={level.selected}
            onChange={(e) => updateAtLevel(index, e.target.value)}
            className="appearance-none rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 focus:outline-none focus:border-violet-500/50"
          >
            <option value="">{index === 0 ? "All locations" : "Select sub-location"}</option>
            {level.options.map((node) => (
              <option key={node.item.id} value={node.item.id}>
                {"\u00A0\u00A0".repeat(node.item.level - 1)}{node.item.full_path}
              </option>
            ))}
          </select>
        ))}
      </div>
    </div>
  );
}

export function ProductList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(1);
  const [hasMore, setHasMore] = useState(true);
  const [countries, setCountries] = useState<Country[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [filters, setFilters] = useState<FilterState>(() => parseFiltersFromSearchParams(new URLSearchParams(searchParams.toString())));
  const [pendingSearch, setPendingSearch] = useState(filters.q);
  const loadMoreAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFilters(parseFiltersFromSearchParams(new URLSearchParams(searchParams.toString())));
    setPendingSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    let alive = true;
    void getProductMeta()
      .then((meta) => {
        if (!alive) return;
        setCountries(meta.countries);
        setCategories(meta.categories);
        setLocations(meta.locations);
      })
      .catch(() => {
        if (!alive) return;
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => (current.q === pendingSearch.trim() ? current : { ...current, q: pendingSearch.trim() }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [pendingSearch]);

  useEffect(() => {
    const nextParams = buildSearchParams(filters).toString();
    const currentParams = searchParams.toString();
    if (nextParams !== currentParams) {
      router.replace(nextParams ? `${pathname}?${nextParams}` : pathname, { scroll: false });
    }
  }, [filters, pathname, router, searchParams]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setProducts([]);
    setNextPage(1);
    setHasMore(true);

    void getProducts({
      q: filters.q,
      category: filters.category,
      country: filters.country,
      location: getLeafIdPath(filters.location),
      condition: filters.condition || undefined,
      negotiable: filters.negotiable || undefined,
      min_price: filters.min_price,
      max_price: filters.max_price,
      ordering: filters.ordering,
      page: 1,
      page_size: 12,
    })
      .then((payload) => {
        if (!alive) return;
        setProducts(payload.results);
        setNextPage(payload.next ? 2 : null);
        setHasMore(Boolean(payload.next));
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
  }, [filters]);

  async function loadMoreProducts() {
    if (!nextPage || loadingMore || loading) return;
    setLoadingMore(true);
    setError(null);
    try {
      const payload = await getProducts({
        q: filters.q,
        category: filters.category,
        country: filters.country,
        location: getLeafIdPath(filters.location),
        condition: filters.condition || undefined,
        negotiable: filters.negotiable || undefined,
        min_price: filters.min_price,
        max_price: filters.max_price,
        ordering: filters.ordering,
        page: nextPage,
        page_size: 12,
      });
      setProducts((current) => [...current, ...payload.results]);
      setNextPage(payload.next ? nextPage + 1 : null);
      setHasMore(Boolean(payload.next));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load more products.");
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const sentinel = loadMoreAnchorRef.current;
    if (!sentinel || !hasMore || loading || loadingMore || !nextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMoreProducts();
        }
      },
      { rootMargin: "400px 0px 400px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, nextPage, products.length]);

  const resetFilters = () => {
    setPendingSearch("");
    setFilters(DEFAULT_FILTERS);
    router.replace(pathname, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 rounded-3xl border border-white/[0.06] bg-white/[0.03] p-4 backdrop-blur-sm lg:grid-cols-12">
        <label className="lg:col-span-4 flex flex-col gap-2 text-xs text-white/50 font-mono">
          <span>Search</span>
          <input
            value={pendingSearch}
            onChange={(e) => setPendingSearch(e.target.value)}
            placeholder="Search products, categories, locations"
            className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 placeholder:text-white/30 focus:outline-none focus:border-violet-500/50"
          />
        </label>

        <div className="lg:col-span-4">
          <CategoryField categories={categories} value={filters.category} onChange={(value) => setFilters((current) => ({ ...current, category: value }))} />
        </div>

        <div className="lg:col-span-4">
          <LocationField
            locations={locations}
            countries={countries}
            countryId={filters.country}
            value={filters.location}
            onCountryChange={(value) => setFilters((current) => ({ ...current, country: value, location: "" }))}
            onLocationChange={(value) => setFilters((current) => ({ ...current, location: value }))}
          />
        </div>

        <div className="lg:col-span-3">
          <SelectField label="Condition" value={filters.condition} onChange={(value) => setFilters((current) => ({ ...current, condition: value as FilterState["condition"] }))}>
            <option value="">Any condition</option>
            <option value="new">New</option>
            <option value="used">Used</option>
            <option value="refurbished">Refurbished</option>
          </SelectField>
        </div>

        <div className="lg:col-span-3">
          <SelectField label="Sort" value={filters.ordering} onChange={(value) => setFilters((current) => ({ ...current, ordering: value as SortMode }))}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="price_low">Price: Low to High</option>
            <option value="price_high">Price: High to Low</option>
          </SelectField>
        </div>

        <label className="flex flex-col gap-2 text-xs text-white/50 font-mono">
          <span>Min price</span>
          <input value={filters.min_price} onChange={(e) => setFilters((current) => ({ ...current, min_price: e.target.value }))} placeholder="0" inputMode="decimal" className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 placeholder:text-white/30 focus:outline-none focus:border-violet-500/50" />
        </label>

        <label className="flex flex-col gap-2 text-xs text-white/50 font-mono">
          <span>Max price</span>
          <input value={filters.max_price} onChange={(e) => setFilters((current) => ({ ...current, max_price: e.target.value }))} placeholder="Any" inputMode="decimal" className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 placeholder:text-white/30 focus:outline-none focus:border-violet-500/50" />
        </label>

        <div className="lg:col-span-3">
          <SelectField label="Negotiable" value={filters.negotiable} onChange={(value) => setFilters((current) => ({ ...current, negotiable: value as FilterState["negotiable"] }))}>
            <option value="">Any</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </SelectField>
        </div>

        <div className="lg:col-span-12 flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-white/30 text-xs font-mono">{loading ? "Loading..." : `${products.length} listings shown`}</p>
          <button type="button" onClick={resetFilters} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.08]">
            Reset filters
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z" />
          </svg>
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white/70">
            <Spinner className="h-4 w-4 text-violet-300" />
            <span>{products.length ? "Refreshing listings..." : "Loading listings..."}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[...Array(8)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      )}

      {!loading && !error && products.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
            <svg className="w-8 h-8 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
            </svg>
          </div>
          <div>
            <p className="text-white/60 font-semibold text-sm">No products match those filters</p>
            <p className="text-white/30 text-xs mt-1">Try broadening the search or resetting the filters</p>
          </div>
          <Link href="/products/new" className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors duration-200">Create listing</Link>
        </div>
      )}

      {!loading && !error && products.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {products.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
          <div className="flex flex-col items-center gap-3 pt-4" ref={loadMoreAnchorRef}>
            {hasMore ? (
              <button
                type="button"
                onClick={() => void loadMoreProducts()}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/80 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? <Spinner className="h-4 w-4 text-violet-300" /> : null}
                {loadingMore ? "Loading more..." : "Load more products"}
              </button>
            ) : (
              <p className="text-xs text-white/30 font-mono">You?ve reached the end of the list.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}


