"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SiteNavbar } from "@/components/site-navbar";
import { useAuth } from "@/components/auth-provider";
import { getLiveFeed, getProducts, getProfile, updateProfile, type LiveSession, type Product, type Profile } from "@/lib/api";

const DEFAULT_PROFILE: Profile = {
  display_name: "",
  avatar_url: "",
  bio: "",
  account_type: "individual",
  phone_number: "",
  location: "",
  business_name: "",
  business_registration_number: "",
  tax_pin: "",
  website: "",
  seller_type: "",
  is_profile_complete: false,
};

type ProfileSection = "info" | "payments" | "subscription" | "lives" | "products";
const PAGE_SIZE = 10;

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {subtitle ? <p className="text-white/35 text-sm mt-1">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="text-[0.65rem] uppercase tracking-[0.22em] text-white/35 font-mono">{label}</div>
      <div className="mt-2 text-sm text-white/85 break-words">{value}</div>
    </div>
  );
}

function ShortList({ items, emptyText }: { items: Array<{ title: string; meta: string; href?: string; image?: string | null }>; emptyText: string }) {
  if (!items.length) return <p className="text-white/35 text-sm">{emptyText}</p>;

  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div key={`${item.title}-${item.meta}`} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-white font-medium">{item.title}</p>
            <p className="text-white/35 text-sm mt-1">{item.meta}</p>
          </div>
          {item.href ? (
            <Link href={item.href} className="text-sm font-semibold text-violet-300 hover:text-violet-200">
              View
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function getProductPreview(product: Product): string | null {
  return product.images.slice().sort((a, b) => a.sort_order - b.sort_order).map((image) => image.image).find(Boolean) ?? null;
}

function getLivePreview(session: LiveSession): string | null {
  return session.thumbnail;
}

function SidebarButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition-all duration-200 border ${
        active
          ? "bg-violet-600 text-white border-violet-500/40 shadow-lg shadow-violet-900/20"
          : "bg-white/[0.03] text-white/70 border-white/[0.08] hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

export default function ProfilePage() {
  const { token, user } = useAuth();
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [pastSessions, setPastSessions] = useState<LiveSession[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeSection, setActiveSection] = useState<ProfileSection>("info");
  const [visibleLiveCount, setVisibleLiveCount] = useState(PAGE_SIZE);
  const [visibleProductCount, setVisibleProductCount] = useState(PAGE_SIZE);

  const userSummary = useMemo(
    () => [
      { label: "Username", value: user?.username ?? "" },
      { label: "Email", value: user?.email ?? "" },
      { label: "Account type", value: profile.account_type },
      { label: "Profile status", value: profile.is_profile_complete ? "Complete" : "Incomplete" },
    ],
    [profile.account_type, profile.is_profile_complete, user?.email, user?.username],
  );

  const sectionItems = useMemo(
    () => [
      { id: "info" as const, label: "My info" },
      { id: "payments" as const, label: "Payments" },
      { id: "subscription" as const, label: "Subscription" },
      { id: "lives" as const, label: `My lives (${liveSessions.length + pastSessions.length})` },
      { id: "products" as const, label: `My products (${products.length})` },
    ],
    [liveSessions.length, pastSessions.length, products.length],
  );

  useEffect(() => {
    let alive = true;
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    void Promise.all([getProfile(token), getProducts({ page: 1, page_size: 100 }), getLiveFeed("live"), getLiveFeed("ended")])
      .then(([profileData, productData, liveData, endedData]) => {
        if (!alive) return;
        setProfile(profileData);
        setProducts(productData.results.filter((product) => product.owner.id === user?.id));
        setLiveSessions(liveData.filter((session) => session.creator.id === user?.id));
        setPastSessions(endedData.filter((session) => session.creator.id === user?.id));
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Unable to load profile.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [token, user?.id]);

  if (!token || !user) {
    return (
      <div className="min-h-screen">
        <SiteNavbar />
        <div className="max-w-3xl mx-auto px-6 pt-28">
          <div className="p-6 rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <p className="text-white/70">Please log in to manage your profile.</p>
            <Link href="/login" className="inline-flex mt-4 px-4 py-2 rounded-xl bg-violet-600 text-white">
              Log in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const authToken = token;
  const userEmail = user.email;
  const isBusiness = profile.account_type !== "individual";

  async function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await updateProfile(authToken, profile);
      setProfile(updated);
      setMessage(updated.is_profile_complete ? "Profile saved and ready for product listings." : "Profile saved. Fill all required fields to unlock product listings.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  }

  function renderSection() {
    switch (activeSection) {
      case "info":
        return (
          <SectionCard title="My info" subtitle="Edit the profile data shown to buyers and viewers.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {userSummary.map((item) => (
                <StatPill key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
            <form className="space-y-5 pt-2" onSubmit={submitProfile}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-2 text-sm text-white/70">
                  Display name
                  <input value={profile.display_name} onChange={(e) => setProfile((current) => ({ ...current, display_name: e.target.value }))} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" required />
                </label>
                <label className="flex flex-col gap-2 text-sm text-white/70">
                  Email
                  <input value={userEmail} disabled className="rounded-xl border border-white/[0.1] bg-white/[0.02] px-4 py-3 text-white/50" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-2 text-sm text-white/70">
                  Account type
                  <select value={profile.account_type} onChange={(e) => setProfile((current) => ({ ...current, account_type: e.target.value as Profile["account_type"] }))} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white">
                    <option value="individual">Individual</option>
                    <option value="company">Company</option>
                    <option value="manufacturer">Manufacturer</option>
                    <option value="bulk_seller">Bulk seller</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm text-white/70">
                  Seller type
                  <input value={profile.seller_type} onChange={(e) => setProfile((current) => ({ ...current, seller_type: e.target.value }))} placeholder="Retail, reseller, distributor" className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-2 text-sm text-white/70">
                  Phone number
                  <input value={profile.phone_number} onChange={(e) => setProfile((current) => ({ ...current, phone_number: e.target.value }))} placeholder="+254..." className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" required />
                </label>
                <label className="flex flex-col gap-2 text-sm text-white/70">
                  Location
                  <input value={profile.location} onChange={(e) => setProfile((current) => ({ ...current, location: e.target.value }))} placeholder="City, area, or business address" className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" required />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-2 text-sm text-white/70">
                  Avatar URL
                  <input value={profile.avatar_url} onChange={(e) => setProfile((current) => ({ ...current, avatar_url: e.target.value }))} placeholder="https://..." className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" />
                </label>
                <label className="flex flex-col gap-2 text-sm text-white/70">
                  Website
                  <input value={profile.website} onChange={(e) => setProfile((current) => ({ ...current, website: e.target.value }))} placeholder="https://..." className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" />
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm text-white/70">
                Bio
                <textarea value={profile.bio} onChange={(e) => setProfile((current) => ({ ...current, bio: e.target.value }))} rows={4} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" />
              </label>

              {isBusiness ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="flex flex-col gap-2 text-sm text-white/70">
                    Business name
                    <input value={profile.business_name} onChange={(e) => setProfile((current) => ({ ...current, business_name: e.target.value }))} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" required />
                  </label>
                  <label className="flex flex-col gap-2 text-sm text-white/70">
                    Registration number
                    <input value={profile.business_registration_number} onChange={(e) => setProfile((current) => ({ ...current, business_registration_number: e.target.value }))} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" />
                  </label>
                  <label className="flex flex-col gap-2 text-sm text-white/70">
                    Tax PIN
                    <input value={profile.tax_pin} onChange={(e) => setProfile((current) => ({ ...current, tax_pin: e.target.value }))} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" />
                  </label>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3 pt-2">
                <p className="text-xs text-white/35 font-mono">{profile.is_profile_complete ? "Profile complete" : "Profile incomplete"}</p>
                <button type="submit" disabled={saving} className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold disabled:opacity-50">
                  {saving ? "Saving..." : "Save profile"}
                </button>
              </div>
            </form>
          </SectionCard>
        );
      case "payments":
        return (
          <SectionCard title="Payments" subtitle="Payment accounts and payout preferences will be connected here later.">
            <div className="grid gap-3 md:grid-cols-3">
              <StatPill label="Status" value="Not connected yet" />
              <StatPill label="Payouts" value="Coming soon" />
              <StatPill label="Billing" value="Coming soon" />
            </div>
          </SectionCard>
        );
      case "subscription":
        return (
          <SectionCard title="Subscription" subtitle="Subscription tiers and plan management are planned for a later release.">
            <div className="grid gap-3 md:grid-cols-3">
              <StatPill label="Plan" value="Planned for later" />
              <StatPill label="Renewal" value="Not available yet" />
              <StatPill label="Limits" value="To be defined" />
            </div>
          </SectionCard>
        );
      case "lives": {
        const liveItems = liveSessions.slice(0, visibleLiveCount).map((session) => ({
          title: session.title,
          meta: `Live - ${session.viewer_count_live} viewers - ${session.heart_count} hearts`,
          href: `/live/${session.id}`,
          image: getLivePreview(session),
        }));
        const pastItems = pastSessions.slice(0, visibleLiveCount).map((session) => ({
          title: session.title,
          meta: `Ended - ${session.total_view_count} views - ${session.comment_count} comments`,
          href: `/live/${session.id}`,
          image: getLivePreview(session),
        }));
        const total = liveSessions.length + pastSessions.length;
        const visibleTotal = Math.min(visibleLiveCount, total);
        return (
          <SectionCard title="My lives" subtitle="Live and archived sessions owned by your account.">
            <div className="grid gap-4">
              <ShortList items={liveItems} emptyText="No live sessions right now." />
              <div className="pt-2 border-t border-white/[0.06]">
                <p className="text-xs uppercase tracking-[0.22em] text-white/35 font-mono mb-3">Past sessions</p>
                <ShortList items={pastItems} emptyText="No archived sessions yet." />
              </div>
              {total > visibleTotal ? (
                <button
                  type="button"
                  className="px-4 py-3 rounded-xl border border-white/[0.1] bg-white/[0.04] text-white/80 font-semibold hover:bg-white/[0.07] transition-colors"
                  onClick={() => setVisibleLiveCount((current) => current + PAGE_SIZE)}
                >
                  Load 10 more
                </button>
              ) : null}
            </div>
          </SectionCard>
        );
      }
      case "products": {
        const visibleProducts = products.slice(0, visibleProductCount).map((product) => ({
          title: product.title,
          meta: `${product.category.full_path} - ${product.location?.full_path ?? "Location not set"}`,
          href: `/products/${product.slug}`,
          image: getProductPreview(product),
        }));
        return (
          <SectionCard title="My products" subtitle="Listings created from your account.">
            <div className="grid gap-4">
              <ShortList items={visibleProducts} emptyText="You have not listed any products yet." />
              {products.length > visibleProductCount ? (
                <button
                  type="button"
                  className="px-4 py-3 rounded-xl border border-white/[0.1] bg-white/[0.04] text-white/80 font-semibold hover:bg-white/[0.07] transition-colors"
                  onClick={() => setVisibleProductCount((current) => current + PAGE_SIZE)}
                >
                  Load 10 more
                </button>
              ) : null}
            </div>
          </SectionCard>
        );
      }
    }
  }

  return (
    <div className="min-h-screen">
      <SiteNavbar />
      <div className="max-w-6xl mx-auto px-6 pt-28 pb-20 space-y-6">
        <div className="flex items-center gap-2 text-xs text-white/30 font-mono">
          <Link href="/" className="hover:text-white/60">Home</Link>
          <span>/</span>
          <span className="text-white/50">Profile</span>
        </div>

        <section className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Your dashboard</h1>
              <p className="text-white/35 text-sm mt-1">Use the menu to move between profile info, lives, products, and account placeholders.</p>
            </div>
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${profile.is_profile_complete ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" : "bg-amber-500/10 text-amber-300 border border-amber-500/20"}`}>
              <span className="w-2 h-2 rounded-full bg-current" />
              {profile.is_profile_complete ? "Profile complete" : "Profile incomplete"}
            </div>
          </div>

          {loading ? <div className="h-40 rounded-2xl bg-white/[0.03] animate-pulse" /> : null}
          {error ? <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div> : null}
          {message ? <div className="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm">{message}</div> : null}

          {!loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-6 items-start">
              <aside className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-4 space-y-3 lg:sticky lg:top-24">
                <p className="text-xs uppercase tracking-[0.22em] text-white/35 font-mono px-2 pb-1">Menu</p>
                <div className="grid gap-2">
                  {sectionItems.map((item) => (
                    <SidebarButton key={item.id} active={activeSection === item.id} label={item.label} onClick={() => setActiveSection(item.id)} />
                  ))}
                </div>
              </aside>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {userSummary.map((item) => (
                    <StatPill key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
                {renderSection()}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}










