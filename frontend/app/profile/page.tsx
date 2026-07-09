"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { SiteNavbar } from "@/components/site-navbar";
import { useAuth } from "@/components/auth-provider";
import { getProfile, updateProfile, type Profile } from "@/lib/api";

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

export default function ProfilePage() {
  const { token, user } = useAuth();
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!token) {
      setLoading(false);
      return;
    }
    void getProfile(token)
      .then((data) => {
        if (alive) setProfile(data);
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
  }, [token]);

  if (!token || !user) {
    return (
      <div className="min-h-screen">
        <SiteNavbar />
        <div className="max-w-3xl mx-auto px-6 pt-28">
          <div className="p-6 rounded-2xl border border-white/[0.07] bg-white/[0.02]">
            <p className="text-white/70">Please log in to manage your profile.</p>
            <Link href="/login" className="inline-flex mt-4 px-4 py-2 rounded-xl bg-violet-600 text-white">Log in</Link>
          </div>
        </div>
      </div>
    );
  }

  const authToken = token;

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

  const isBusiness = profile.account_type !== "individual";

  return (
    <div className="min-h-screen">
      <SiteNavbar />
      <div className="max-w-4xl mx-auto px-6 pt-28 pb-20 space-y-6">
        <div className="flex items-center gap-2 text-xs text-white/30 font-mono">
          <Link href="/" className="hover:text-white/60">Home</Link>
          <span>/</span>
          <span className="text-white/50">Profile</span>
        </div>

        <section className="p-6 rounded-3xl border border-white/[0.07] bg-white/[0.02] space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Your profile</h1>
            <p className="text-white/35 text-sm mt-1">Complete this once, then you can create products.</p>
          </div>

          {loading ? <div className="h-40 rounded-2xl bg-white/[0.03] animate-pulse" /> : null}
          {error ? <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div> : null}
          {message ? <div className="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm">{message}</div> : null}

          {!loading ? (
            <form className="space-y-5" onSubmit={submitProfile}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-2 text-sm text-white/70">
                  Display name
                  <input value={profile.display_name} onChange={(e) => setProfile((current) => ({ ...current, display_name: e.target.value }))} className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3 text-white" required />
                </label>
                <label className="flex flex-col gap-2 text-sm text-white/70">
                  Email
                  <input value={user.email} disabled className="rounded-xl border border-white/[0.1] bg-white/[0.02] px-4 py-3 text-white/50" />
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
                <p className="text-xs text-white/35 font-mono">
                  {profile.is_profile_complete ? "Profile complete" : "Profile incomplete"}
                </p>
                <button type="submit" disabled={saving} className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold disabled:opacity-50">
                  {saving ? "Saving..." : "Save profile"}
                </button>
              </div>
            </form>
          ) : null}
        </section>
      </div>
    </div>
  );
}

