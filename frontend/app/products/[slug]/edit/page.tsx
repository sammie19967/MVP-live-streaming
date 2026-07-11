"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { SiteNavbar } from "@/components/site-navbar";
import { getMediaUrl, getProductBySlug, getProductMeta, updateProduct, type Category, type Country, type Location, type Product } from "@/lib/api";

type ImageDraft = {
  id?: number;
  image?: string;
  alt_text: string;
  sort_order: number;
  keep: boolean;
};

type NewImageDraft = {
  file: File;
  previewUrl: string;
};

type OptionNode<T> = {
  item: T;
  children: OptionNode<T>[];
};

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

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

function getNodePath<T extends { id: number }>(nodes: OptionNode<T>[], selectedIds: number[]) {
  let currentNodes = nodes;
  const path: OptionNode<T>[] = [];

  for (const selectedId of selectedIds) {
    const current = currentNodes.find((node) => node.item.id === selectedId) ?? null;
    if (!current) return [];
    path.push(current);
    currentNodes = current.children;
  }

  return path;
}

function getPathIds<T extends { id: number }>(path: OptionNode<T>[]) {
  return path.map((node) => node.item.id);
}

function getCountryPathIds(countries: Country[], selectedCountryId: number | null) {
  if (selectedCountryId == null) return [];
  return countries.some((country) => country.id === selectedCountryId) ? [selectedCountryId] : [];
}

export default function ProductEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { token, user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [draftImages, setDraftImages] = useState<ImageDraft[]>([]);
  const [newImages, setNewImages] = useState<NewImageDraft[]>([]);
  const [customFieldsText, setCustomFieldsText] = useState("");
  const [selectedCountryId, setSelectedCountryId] = useState<number | "">("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void Promise.all([getProductBySlug(slug), getProductMeta(token ?? undefined)])
      .then(([item, meta]) => {
        if (!alive) return;
        setProduct(item);
        setCountries(meta.countries);
        setCategories(meta.categories);
        setLocations(meta.locations);
        setDraftImages(item.images.map((image, index) => ({ id: image.id, image: image.image, alt_text: image.alt_text ?? "", sort_order: image.sort_order ?? index, keep: true })));
        setCustomFieldsText(JSON.stringify(item.custom_fields ?? {}, null, 2));
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Unable to load product.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug, token]);

  const isOwner = Boolean(product && user && product.owner.id === user.id);
  const categoryTree = useMemo(() => buildTree(categories), [categories]);
  const locationTree = useMemo(() => buildTree(locations.filter((location) => selectedCountryId === "" || location.country === selectedCountryId)), [locations, selectedCountryId]);
  const categoryPath = useMemo(() => getNodePath(categoryTree, selectedCategoryIds), [categoryTree, selectedCategoryIds]);
  const locationPath = useMemo(() => getNodePath(locationTree, selectedLocationIds), [locationTree, selectedLocationIds]);
  const selectedCategory = categoryPath.at(-1)?.item ?? null;
  const selectedLocation = locationPath.at(-1)?.item ?? null;
  const currentCategories = categoryPath.length ? categoryPath.at(-1)!.children : categoryTree;
  const currentLocations = locationPath.length ? locationPath.at(-1)!.children : locationTree;

  useEffect(() => {
    if (!product || !categories.length || !locations.length) return;

    const categoryIds: number[] = [];
    let currentCategory: Category | null = product.category;
    while (currentCategory) {
      categoryIds.unshift(currentCategory.id);
      currentCategory = categories.find((category) => category.id === currentCategory?.parent) ?? null;
    }

    const countryId = product.country?.id ?? "";
    const productLocations = locations.filter((location) => !product.country || location.country === product.country.id);
    const locationIds: number[] = [];
    let currentLocation: Location | null = product.location ? product.location : null;
    while (currentLocation) {
      locationIds.unshift(currentLocation.id);
      currentLocation = product.country ? productLocations.find((location) => location.id === currentLocation?.parent) ?? null : null;
    }

    setSelectedCountryId(countryId);
    setSelectedCategoryIds(categoryIds);
    setSelectedLocationIds(locationIds);
  }, [categories, locations, product]);

  function updateField<K extends keyof Product>(key: K, value: Product[K]) {
    setProduct((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateImage(index: number, updates: Partial<ImageDraft>) {
    setDraftImages((current) => current.map((image, imageIndex) => (imageIndex === index ? { ...image, ...updates } : image)));
  }

  function removeNewImage(index: number) {
    setNewImages((current) => current.filter((_, imageIndex) => imageIndex !== index));
  }

  async function submitSave() {
    if (!token || !product || !isOwner) return;
    if (!selectedCategory || !selectedLocation || selectedCountryId === "") {
      setError("Pick a country, location, and category before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("category", String(selectedCategory.id));
      body.append("country", String(selectedCountryId));
      body.append("location", String(selectedLocation.id));
      body.append("title", product.title.trim());
      body.append("description", product.description.trim());
      body.append("price", String(product.price));
      body.append("currency", product.currency);
      body.append("negotiable", String(product.negotiable));
      body.append("discount_percent", String(product.discount_percent));
      body.append("condition", product.condition);
      body.append("is_active", String(product.is_active));
      body.append("custom_fields", customFieldsText.trim() ? customFieldsText : "{}");
      body.append("images", JSON.stringify(draftImages.map(({ id, alt_text, sort_order, keep }) => ({ id, alt_text, sort_order, keep }))));
      for (const image of newImages) {
        body.append("image_files", image.file);
      }

      const updated = await updateProduct(token, product.slug, body);
      setProduct(updated);
      setDraftImages(updated.images.map((image, index) => ({ id: image.id, image: image.image, alt_text: image.alt_text ?? "", sort_order: image.sort_order ?? index, keep: true })));
      setNewImages([]);
      setCustomFieldsText(JSON.stringify(updated.custom_fields ?? {}, null, 2));
      router.push(`/products/${updated.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update product.");
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  if (!token || !user) {
    return <div className="min-h-screen"><SiteNavbar /><div className="max-w-3xl mx-auto px-6 pt-28"><div className="p-6 rounded-2xl border border-white/[0.07] bg-white/[0.02]"><p className="text-white/70">Please log in to edit products.</p><Link href="/login" className="inline-flex mt-4 px-4 py-2 rounded-xl bg-violet-600 text-white">Log in</Link></div></div></div>;
  }

  if (loading) {
    return <div className="min-h-screen"><SiteNavbar /><div className="max-w-4xl mx-auto px-6 pt-28"><div className="h-80 rounded-3xl bg-white/[0.03] animate-pulse" /></div></div>;
  }

  if (error) {
    return <div className="min-h-screen"><SiteNavbar /><div className="max-w-4xl mx-auto px-6 pt-28"><div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div></div></div>;
  }

  if (!product) return null;
  if (!isOwner) {
    return <div className="min-h-screen"><SiteNavbar /><div className="max-w-3xl mx-auto px-6 pt-28"><div className="p-6 rounded-2xl border border-white/[0.07] bg-white/[0.02]"><p className="text-white/70">You do not own this product.</p><Link href={`/products/${slug}`} className="inline-flex mt-4 px-4 py-2 rounded-xl bg-violet-600 text-white">Back to product</Link></div></div></div>;
  }

  return (
    <div className="min-h-screen">
      <SiteNavbar />
      <div className="max-w-5xl mx-auto px-6 pt-28 pb-20 space-y-6">
        <div className="flex items-center gap-2 text-xs text-white/30 font-mono"><Link href="/products" className="hover:text-white/60">Products</Link><span>/</span><Link href={`/products/${product.slug}`} className="hover:text-white/60">{product.title}</Link><span>/</span><span className="text-white/50">Edit</span></div>

        <section className="p-6 rounded-3xl border border-white/[0.07] bg-white/[0.02] space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Edit product</h1>
            <p className="text-white/35 text-sm mt-1">Update the listing title, category, pricing, location, status, and images.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Title
              <input value={product.title} onChange={(e) => updateField("title", e.target.value as Product["title"])} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Currency
              <input value={product.currency} onChange={(e) => updateField("currency", e.target.value as Product["currency"])} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" />
            </label>
          </div>

          <label className="flex flex-col gap-2 text-sm text-white/70">
            Description
            <textarea value={product.description} onChange={(e) => updateField("description", e.target.value as Product["description"])} rows={6} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Country
              <select
                value={selectedCountryId}
                onChange={(e) => {
                  const value = e.target.value ? Number(e.target.value) : "";
                  setSelectedCountryId(value);
                  setSelectedLocationIds([]);
                  updateField("country", (countries.find((item) => item.id === value) ?? null) as Product["country"]);
                  updateField("location", null as Product["location"]);
                }}
                className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white"
              >
                <option value="">Select country</option>
                {countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Category
              <select
                value={selectedCategoryIds[0] ?? ""}
                onChange={(e) => {
                  const value = e.target.value ? Number(e.target.value) : "";
                  setSelectedCategoryIds(value ? [value] : []);
                  updateField("category", (categories.find((item) => item.id === value) ?? product.category) as Product["category"]);
                }}
                className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white"
              >
                <option value="">Select category</option>
                {categoryTree.map((node) => <option key={node.item.id} value={node.item.id}>{node.item.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Location
              <select
                value={selectedLocationIds[0] ?? ""}
                onChange={(e) => {
                  const value = e.target.value ? Number(e.target.value) : "";
                  setSelectedLocationIds(value ? [value] : []);
                  updateField("location", (locations.find((item) => item.id === value) ?? null) as Product["location"]);
                }}
                className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white"
                disabled={selectedCountryId === ""}
              >
                <option value="">{selectedCountryId === "" ? "Select country first" : "Select county/city"}</option>
                {currentLocations.map((node) => <option key={node.item.id} value={node.item.id}>{node.item.name}</option>)}
              </select>
            </label>
          </div>

          {selectedCategoryIds.map((selectedId, index) => {
            const path = getNodePath(categoryTree, selectedCategoryIds.slice(0, index + 1));
            const node = path.at(-1);
            const children = node?.children ?? [];
            if (!children.length) return null;
            return (
              <label key={`${selectedId}-${index}`} className="flex flex-col gap-2 text-sm text-white/70">
                {index === 0 ? "Subcategory" : `Level ${index + 2}`}
                <select
                  className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white"
                  value={selectedCategoryIds[index + 1] ?? ""}
                  onChange={(e) => {
                    const value = e.target.value ? Number(e.target.value) : "";
                    const next = selectedCategoryIds.slice(0, index + 1);
                    if (value) next.push(value);
                    setSelectedCategoryIds(next);
                    const nextNode = getNodePath(categoryTree, next).at(-1)?.item;
                    if (nextNode) updateField("category", nextNode as Product["category"]);
                  }}
                >
                  <option value="">Select option</option>
                  {children.map((child) => <option key={child.item.id} value={child.item.id}>{child.item.name}</option>)}
                </select>
              </label>
            );
          })}

          {selectedLocationIds.map((selectedId, index) => {
            const path = getNodePath(locationTree, selectedLocationIds.slice(0, index + 1));
            const node = path.at(-1);
            const children = node?.children ?? [];
            if (!children.length) return null;
            return (
              <label key={`${selectedId}-${index}`} className="flex flex-col gap-2 text-sm text-white/70">
                {index === 0 ? "Area / Town" : `Location level ${index + 2}`}
                <select
                  className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white"
                  value={selectedLocationIds[index + 1] ?? ""}
                  onChange={(e) => {
                    const value = e.target.value ? Number(e.target.value) : "";
                    const next = selectedLocationIds.slice(0, index + 1);
                    if (value) next.push(value);
                    setSelectedLocationIds(next);
                    const nextNode = getNodePath(locationTree, next).at(-1)?.item;
                    if (nextNode) updateField("location", nextNode as Product["location"]);
                  }}
                >
                  <option value="">Select option</option>
                  {children.map((child) => <option key={child.item.id} value={child.item.id}>{child.item.name}</option>)}
                </select>
              </label>
            );
          })}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Price
              <input value={product.price} onChange={(e) => updateField("price", e.target.value as Product["price"])} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Discount %
              <input type="number" min="0" max="100" value={product.discount_percent} onChange={(e) => updateField("discount_percent", toNumber(e.target.value) as Product["discount_percent"])} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Condition
              <select value={product.condition} onChange={(e) => updateField("condition", e.target.value as Product["condition"])} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white">
                <option value="new">New</option>
                <option value="used">Used</option>
                <option value="refurbished">Refurbished</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/70">
              Negotiable
              <select value={String(product.negotiable)} onChange={(e) => updateField("negotiable", (e.target.value === "true") as Product["negotiable"])} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          </div>

          <label className="flex items-center gap-3 text-sm text-white/70">
            <input type="checkbox" checked={product.is_active} onChange={(e) => updateField("is_active", e.target.checked as Product["is_active"])} />
            Listing is active
          </label>

          <label className="flex flex-col gap-2 text-sm text-white/70">
            Custom fields JSON
            <textarea value={customFieldsText} onChange={(e) => setCustomFieldsText(e.target.value)} rows={5} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white font-mono text-xs" />
          </label>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Images</h2>
                <p className="text-xs text-white/35 font-mono mt-1">Rename or remove current images, then add new uploads below.</p>
              </div>
              <label className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold cursor-pointer">
                Add images
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    const additions = files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
                    setNewImages((current) => [...current, ...additions]);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {draftImages.map((image, index) => {
                const mediaUrl = getMediaUrl(image.image ?? null);
                return (
                  <div key={image.id ?? index} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                    {mediaUrl ? <img src={mediaUrl} alt={image.alt_text || product.title} className="w-full h-44 object-cover rounded-xl" /> : null}
                    <label className="flex flex-col gap-2 text-sm text-white/70">
                      Alt text
                      <input value={image.alt_text} onChange={(e) => updateImage(index, { alt_text: e.target.value })} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex flex-col gap-2 text-sm text-white/70">
                        Sort order
                        <input type="number" value={image.sort_order} onChange={(e) => updateImage(index, { sort_order: toNumber(e.target.value) })} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" />
                      </label>
                      <label className="flex items-center gap-2 text-sm text-white/70 pt-8">
                        <input type="checkbox" checked={image.keep} onChange={(e) => updateImage(index, { keep: e.target.checked })} />
                        Keep image
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            {newImages.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {newImages.map((image, index) => (
                  <div key={image.previewUrl} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                    <img src={image.previewUrl} alt="New upload preview" className="w-full h-44 object-cover rounded-xl" />
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-white/45 truncate">{image.file.name}</p>
                      <button type="button" onClick={() => removeNewImage(index)} className="text-xs text-rose-300 hover:text-rose-200">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button type="button" onClick={() => setConfirmOpen(true)} className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold">Review and save</button>
            <Link href={`/products/${product.slug}`} className="px-5 py-3 rounded-xl border border-white/[0.1] bg-white/[0.04] text-white/80 font-semibold">Cancel</Link>
          </div>
        </section>
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/[0.08] bg-[#101018] p-6 space-y-4 shadow-2xl">
            <h2 className="text-xl font-bold text-white">Confirm changes</h2>
            <p className="text-sm text-white/40">You are about to save the edited product details. Please confirm to continue.</p>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 text-sm text-white/70 space-y-2 max-h-64 overflow-auto">
              <div><span className="text-white/35">Title:</span> {product.title}</div>
              <div><span className="text-white/35">Price:</span> {product.price}</div>
              <div><span className="text-white/35">Discount:</span> {product.discount_percent}%</div>
              <div><span className="text-white/35">Negotiable:</span> {product.negotiable ? "Yes" : "No"}</div>
              <div><span className="text-white/35">Status:</span> {product.is_active ? "Active" : "Inactive"}</div>
              <div><span className="text-white/35">Images kept:</span> {draftImages.filter((image) => image.keep).length}</div>
              <div><span className="text-white/35">New uploads:</span> {newImages.length}</div>
            </div>
            <div className="flex flex-wrap gap-3 justify-end">
              <button type="button" onClick={() => setConfirmOpen(false)} className="px-4 py-2.5 rounded-xl border border-white/[0.1] bg-white/[0.04] text-white/80">Go back</button>
              <button type="button" onClick={() => void submitSave()} disabled={saving} className="px-4 py-2.5 rounded-xl bg-violet-600 text-white font-semibold disabled:opacity-50">{saving ? "Saving..." : "Confirm save"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
