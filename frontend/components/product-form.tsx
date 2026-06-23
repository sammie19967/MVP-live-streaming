"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/components/auth-provider";
import {
  createProduct,
  getProductMeta,
  type AttributeDefinition,
  type Category,
  type Country,
  type Location,
} from "@/lib/api";

type OptionNode<T> = {
  item: T;
  children: OptionNode<T>[];
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

export function ProductForm() {
  const { token, user } = useAuth();
  const [countries, setCountries] = useState<Country[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [attributes, setAttributes] = useState<AttributeDefinition[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [createdProduct, setCreatedProduct] = useState<{ title: string; slug: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCountryId, setSelectedCountryId] = useState<number | "">("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [negotiable, setNegotiable] = useState(true);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [condition, setCondition] = useState<"new" | "used" | "refurbished">("used");
  const [imageUrls, setImageUrls] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [attributeState, setAttributeState] = useState<Record<number, string>>({});

  const categoryTree = useMemo(() => buildTree(categories), [categories]);
  const categoryNodesByParent = useMemo(() => {
    const map = new Map<number | null, OptionNode<Category>[]>();
    const walk = (nodes: OptionNode<Category>[]) => {
      for (const node of nodes) {
        const bucket = map.get(node.item.parent) ?? [];
        bucket.push(node);
        map.set(node.item.parent, bucket);
        walk(node.children);
      }
    };
    walk(categoryTree);
    return map;
  }, [categoryTree]);
  const locationTree = useMemo(
    () => buildTree(locations.filter((location) => location.country === selectedCountryId)),
    [locations, selectedCountryId],
  );
  const locationNodesByParent = useMemo(() => {
    const map = new Map<number | null, OptionNode<Location>[]>();
    const walk = (nodes: OptionNode<Location>[]) => {
      for (const node of nodes) {
        const bucket = map.get(node.item.parent) ?? [];
        bucket.push(node);
        map.set(node.item.parent, bucket);
        walk(node.children);
      }
    };
    walk(locationTree);
    return map;
  }, [locationTree]);

  const selectedCategory = useMemo(
    () => findNodeAtPath(categoryTree, selectedCategoryIds)?.item ?? null,
    [categoryTree, selectedCategoryIds],
  );
  const selectedLocation = useMemo(
    () => findNodeAtPath(locationTree, selectedLocationIds)?.item ?? null,
    [locationTree, selectedLocationIds],
  );
  const selectedAttributeDefinitions = useMemo(() => {
    if (!selectedCategory) return [];
    const categoryIds = new Set<number>();
    let current: Category | null = selectedCategory;
    while (current) {
      categoryIds.add(current.id);
      current = categories.find((category) => category.id === current?.parent) ?? null;
    }
    return attributes.filter((attribute) => categoryIds.has(attribute.category));
  }, [attributes, categories, selectedCategory]);

  const missingRequiredAttributes = useMemo(
    () =>
      selectedAttributeDefinitions
        .filter((attribute) => attribute.is_required && !attributeState[attribute.id])
        .map((attribute) => attribute.name),
    [attributeState, selectedAttributeDefinitions],
  );

  const hasBasicDraft = Boolean(title.trim() && description.trim() && price.trim());
  const canSubmit =
    Boolean(token && user) &&
    !submitting &&
    !loadingMeta &&
    hasBasicDraft &&
    Boolean(selectedCountryId) &&
    Boolean(selectedCategory) &&
    Boolean(selectedLocation);

  useEffect(() => {
    const nextPreviews = imageFiles.map((file) => URL.createObjectURL(file));
    setImagePreviews(nextPreviews);
    return () => {
      nextPreviews.forEach((preview) => URL.revokeObjectURL(preview));
    };
  }, [imageFiles]);

  async function loadMeta() {
    if (!token) return;
    setLoadingMeta(true);
    setMetaError(null);
    try {
      const meta = await getProductMeta(token);
      setCountries(meta.countries);
      setCategories(meta.categories);
      setLocations(meta.locations);
      setAttributes(meta.attributes);
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : "Unable to load product metadata.");
    } finally {
      setLoadingMeta(false);
    }
  }

  useEffect(() => {
    if (!countries.length && !loadingMeta) {
      void loadMeta();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token || !user) {
    return (
      <section className="panel stack">
        <h1 className="section-title">Create product</h1>
        <p className="section-copy">Please log in to list a product.</p>
        <Link className="button" href="/login">Login</Link>
      </section>
    );
  }
  const authToken = token;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const trimmedPrice = price.trim();
    const parsedPrice = Number(trimmedPrice);

    if (!trimmedTitle) {
      setSubmitError("Add a title before publishing.");
      return;
    }
    if (!trimmedDescription) {
      setSubmitError("Add a description before publishing.");
      return;
    }
    if (!trimmedPrice || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      setSubmitError("Enter a valid price before publishing.");
      return;
    }

    if (!selectedCategory || !selectedLocation || !selectedCountryId) {
      setSubmitError("Pick a country, location, and category before publishing.");
      return;
    }
    if (missingRequiredAttributes.length) {
      setSubmitError(`Fill in required fields: ${missingRequiredAttributes.join(", ")}.`);
      return;
    }
    const countryId = selectedCountryId;

    const custom_fields: Record<string, unknown> = Object.fromEntries(
      Object.entries(attributeState)
        .filter(([, value]) => value !== "")
        .map(([definitionId, value]) => [definitionId, value]),
    );

    const attribute_values = selectedAttributeDefinitions.map((definition) => {
      const rawValue = attributeState[definition.id];
      if (!rawValue) {
        return null;
      }
      if (definition.data_type === "select") {
        const option = definition.options.find((entry) => entry.value === rawValue || String(entry.id) === rawValue);
        return { definition: definition.id, option: option?.id ?? null };
      }
      if (definition.data_type === "number") {
        return { definition: definition.id, value_number: Number(rawValue) };
      }
      if (definition.data_type === "boolean") {
        return { definition: definition.id, value_boolean: rawValue === "true" };
      }
      return { definition: definition.id, value_text: rawValue };
    }).filter(Boolean) as Array<{
      definition: number;
      option?: number | null;
      value_text?: string;
      value_number?: number;
      value_boolean?: boolean;
    }>;

    setSubmitting(true);
    setCreatedProduct(null);
    try {
      const response = await createProduct(authToken, {
        category: selectedCategory.id,
        country: countryId,
        location: selectedLocation.id,
        title: trimmedTitle,
        description: trimmedDescription,
        price: trimmedPrice,
        currency,
        negotiable,
        discount_percent: discountPercent,
        condition,
        custom_fields,
        attribute_values,
        image_files: imageFiles,
        image_urls: imageUrls
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      });
      setSuccessMessage(response.message);
      setCreatedProduct({ title: response.product.title, slug: response.product.slug });
      setTitle("");
      setDescription("");
      setPrice("");
      setCurrency("KES");
      setNegotiable(true);
      setDiscountPercent(0);
      setCondition("used");
      setImageFiles([]);
      setImagePreviews([]);
      setImageUrls("");
      setAttributeState({});
      setSelectedCountryId("");
      setSelectedCategoryIds([]);
      setSelectedLocationIds([]);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to create product.");
    } finally {
      setSubmitting(false);
    }
  }

  const currentCategories = categoryNodesByParent.get(null) ?? [];
  const currentLocations = locationNodesByParent.get(null) ?? [];

  return (
    <div className="shell">
      <div className="nav">
        <div className="nav-brand">
          <span className="nav-mark">LIVE MVP</span>
          <span className="nav-copy">Product listing workspace</span>
        </div>
        <div className="nav-row">
          <Link className="ghost-button" href="/">Home</Link>
          <button className="button" onClick={() => void loadMeta()} type="button">
            {loadingMeta ? "Loading..." : "Load taxonomies"}
          </button>
        </div>
      </div>

      <section className="hero-card">
        <span className="eyebrow">New listing</span>
        <h1 className="headline" style={{ fontSize: "clamp(2.3rem, 7vw, 4.5rem)" }}>
          Create a product like a real marketplace.
        </h1>
        <p className="lede">
          Pick the country first, then narrow down to the right location, choose the catalog category, and add the
          product details that matter.
        </p>
      </section>

      <div aria-live="polite" style={{ marginTop: "1rem" }}>
        {metaError ? <p className="form-error">{metaError}</p> : null}
        {submitError ? <p className="form-error">{submitError}</p> : null}
        {successMessage ? <p className="form-success">{successMessage}</p> : null}
        {createdProduct ? (
          <p className="form-success" style={{ marginTop: "0.5rem" }}>
            You can review it at <code>/products/{createdProduct.slug}</code>
          </p>
        ) : null}
      </div>

      <form className="grid two-col" onSubmit={handleSubmit} style={{ marginTop: "1.5rem", alignItems: "start" }}>
        <section className="panel stack">
          <h2 className="section-title">Product details</h2>

          <div className="field">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Apple iPhone 15 Pro Max" />
          </div>

          <div className="field">
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Condition, warranty, what is included, and other useful details."
              rows={7}
              style={{ width: "100%", borderRadius: "16px", border: "1px solid var(--line)", padding: "0.8rem 0.95rem", background: "rgba(255,255,255,0.72)" }}
            />
          </div>

          <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <div className="field">
              <label>Price</label>
              <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="45000" inputMode="decimal" />
            </div>
            <div className="field">
              <label>Currency</label>
              <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="KES" />
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <div className="field">
              <label>Negotiable</label>
              <select value={String(negotiable)} onChange={(e) => setNegotiable(e.target.value === "true")} className="field-select">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div className="field">
              <label>Discount %</label>
              <input
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
                type="number"
                min={0}
                max={100}
              />
            </div>
          </div>

          <div className="field">
            <label>Condition</label>
            <select value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)} className="field-select">
              <option value="new">New</option>
              <option value="used">Used</option>
              <option value="refurbished">Refurbished</option>
            </select>
          </div>

          <div className="field">
            <label>Images</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setImageFiles(Array.from(e.target.files ?? []))}
            />
            <p className="section-copy" style={{ marginTop: "0.45rem" }}>
              Upload one or more files for the listing gallery.
            </p>
            {imagePreviews.length ? (
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.65rem" }}>
                {imagePreviews.map((preview, index) => (
                  <figure className="stack" key={`${preview}-${index}`} style={{ gap: "0.45rem" }}>
                    <img
                      alt={`Selected upload ${index + 1}`}
                      src={preview}
                      style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: "10px" }}
                    />
                    <figcaption className="section-copy" style={{ fontSize: "0.8rem", margin: 0 }}>
                      {imageFiles[index]?.name}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : null}
          </div>

          <div className="field">
            <label>Image URLs</label>
            <textarea
              value={imageUrls}
              onChange={(e) => setImageUrls(e.target.value)}
              rows={5}
              placeholder="Optional fallback: one image URL per line"
              style={{ width: "100%", borderRadius: "16px", border: "1px solid var(--line)", padding: "0.8rem 0.95rem", background: "rgba(255,255,255,0.72)" }}
            />
          </div>

          <div className="stack" style={{ gap: "0.85rem" }}>
            <h3 className="section-title" style={{ fontSize: "1rem" }}>Category fields</h3>
            {selectedAttributeDefinitions.length ? (
              selectedAttributeDefinitions.map((attribute) => (
                <div className="field" key={attribute.id}>
                  <label>
                    {attribute.name}
                    {attribute.is_required ? " *" : ""}
                  </label>
                  {attribute.data_type === "select" ? (
                    <select
                      className="field-select"
                      value={attributeState[attribute.id] ?? ""}
                      onChange={(e) =>
                        setAttributeState((current) => ({ ...current, [attribute.id]: e.target.value }))
                      }
                    >
                      <option value="">Select {attribute.name.toLowerCase()}</option>
                      {attribute.options.map((option) => (
                        <option key={option.id} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : attribute.data_type === "number" ? (
                    <input
                      type="number"
                      value={attributeState[attribute.id] ?? ""}
                      onChange={(e) =>
                        setAttributeState((current) => ({ ...current, [attribute.id]: e.target.value }))
                      }
                      placeholder={attribute.help_text || `Enter ${attribute.name.toLowerCase()}`}
                    />
                  ) : attribute.data_type === "boolean" ? (
                    <select
                      className="field-select"
                      value={attributeState[attribute.id] ?? ""}
                      onChange={(e) =>
                        setAttributeState((current) => ({ ...current, [attribute.id]: e.target.value }))
                      }
                    >
                      <option value="">Select option</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  ) : (
                    <input
                      value={attributeState[attribute.id] ?? ""}
                      onChange={(e) =>
                        setAttributeState((current) => ({ ...current, [attribute.id]: e.target.value }))
                      }
                      placeholder={attribute.help_text || `Enter ${attribute.name.toLowerCase()}`}
                    />
                  )}
                </div>
              ))
            ) : (
              <p className="section-copy">Select a category to load the matching fields.</p>
            )}
          </div>
        </section>

        <section className="panel stack">
          <h2 className="section-title">Catalog and location</h2>

          <div className="field">
            <label>Country</label>
            <select
              className="field-select"
              value={selectedCountryId}
              onChange={(e) => {
                const value = e.target.value ? Number(e.target.value) : "";
                setSelectedCountryId(value);
                setSelectedLocationIds([]);
              }}
            >
              <option value="">Select country</option>
              {countries.map((country) => (
                <option key={country.id} value={country.id}>{country.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Category</label>
            <select
              className="field-select"
              value={selectedCategoryIds[0] ?? ""}
              onChange={(e) => {
                const value = e.target.value ? Number(e.target.value) : "";
                setSelectedCategoryIds(value ? [value] : []);
              }}
            >
              <option value="">Select category</option>
              {currentCategories.map((node) => (
                <option key={node.item.id} value={node.item.id}>{node.item.name}</option>
              ))}
            </select>
          </div>

          {selectedCategoryIds.map((selectedId, index) => {
            const parentNode = findNodeAtPath(categoryTree, selectedCategoryIds.slice(0, index + 1));
            const children = parentNode?.children ?? [];
            if (!children.length) return null;
            return (
              <div className="field" key={`${selectedId}-${index}`}>
                <label>{index === 0 ? "Subcategory" : `Level ${index + 2}`}</label>
                <select
                  className="field-select"
                  value={selectedCategoryIds[index + 1] ?? ""}
                  onChange={(e) => {
                    const value = e.target.value ? Number(e.target.value) : "";
                    const next = selectedCategoryIds.slice(0, index + 1);
                    if (value) next.push(value);
                    setSelectedCategoryIds(next);
                  }}
                >
                  <option value="">Select option</option>
                  {children.map((node) => (
                    <option key={node.item.id} value={node.item.id}>{node.item.name}</option>
                  ))}
                </select>
              </div>
            );
          })}

          <div className="field">
            <label>Location</label>
            <select
              className="field-select"
              value={selectedLocationIds[0] ?? ""}
              onChange={(e) => {
                const value = e.target.value ? Number(e.target.value) : "";
                setSelectedLocationIds(value ? [value] : []);
              }}
              disabled={!selectedCountryId}
            >
              <option value="">{selectedCountryId === "" ? "Select country first" : "Select county/city"}</option>
              {currentLocations.filter((node) => node.item.level === 1).map((node) => (
                <option key={node.item.id} value={node.item.id}>{node.item.name}</option>
              ))}
            </select>
          </div>

          {selectedLocationIds.map((selectedId, index) => {
            const node = findNodeAtPath(locationTree, selectedLocationIds.slice(0, index + 1));
            const children = node?.children ?? [];
            if (!children.length) return null;
            return (
              <div className="field" key={`${selectedId}-${index}`}>
                <label>{index === 0 ? "Area / Town" : `Location level ${index + 2}`}</label>
                <select
                  className="field-select"
                  value={selectedLocationIds[index + 1] ?? ""}
                  onChange={(e) => {
                    const value = e.target.value ? Number(e.target.value) : "";
                    const next = selectedLocationIds.slice(0, index + 1);
                    if (value) next.push(value);
                    setSelectedLocationIds(next);
                  }}
                >
                  <option value="">Select option</option>
                  {children.map((child) => (
                    <option key={child.item.id} value={child.item.id}>{child.item.name}</option>
                  ))}
                </select>
              </div>
            );
          })}

          <div className="status-card stack">
            <div className="status-row">
              <h3 className="section-title" style={{ fontSize: "1rem" }}>Selection preview</h3>
              <span className="status-pill">Draft</span>
            </div>
            <dl className="meta-list">
              <div>
                <dt>Country</dt>
                <dd>{selectedCountryId ? countries.find((country) => country.id === selectedCountryId)?.name : "Not selected"}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd>{selectedCategory?.full_path ?? "Not selected"}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{selectedLocation?.full_path ?? "Not selected"}</dd>
              </div>
              <div>
                <dt>Price preview</dt>
                <dd>{price ? `${currency} ${price}` : "No price yet"}</dd>
              </div>
            </dl>
          </div>

          <button className="button" disabled={!canSubmit} type="submit">
            {submitting ? "Publishing..." : "Publish product"}
          </button>
        </section>
      </form>
    </div>
  );
}
