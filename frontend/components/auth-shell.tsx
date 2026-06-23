"use client";

import Link from "next/link";

import { useAuth } from "@/components/auth-provider";

export function AuthShell() {
  const { isLoading, logout, token, user } = useAuth();

  return (
    <div className="shell">
      <nav className="nav">
        <div className="nav-brand">
          <span className="nav-mark">LIVE MVP</span>
          <span className="nav-copy">Django auth + Next.js session shell</span>
        </div>
        <div className="nav-row">
          <Link className="ghost-button" href="/">
            Home
          </Link>
          <Link className="ghost-button" href="/products">
            Products
          </Link>
          <Link className="ghost-button" href="/products/new">
            Sell
          </Link>
          {!user ? (
            <>
              <Link className="ghost-button" href="/login">
                Login
              </Link>
              <Link className="button" href="/register">
                Register
              </Link>
            </>
          ) : (
            <button className="button" onClick={() => void logout()} type="button">
              Logout
            </button>
          )}
        </div>
      </nav>

      <section className="hero-card">
        <span className="eyebrow">Auth MVP</span>
        <h1 className="headline">Token auth for your live product starts here.</h1>
        <p className="lede">
          This frontend talks directly to the Django backend you already started.
          Use it to register users, log in, restore a session from local storage,
          inspect the current user, and log out cleanly.
        </p>
        <div className="cta-row">
          <Link className="button" href={user ? "/" : "/register"}>
            {user ? "Stay on dashboard" : "Create first account"}
          </Link>
          <Link className="ghost-button" href="/login">
            Test login
          </Link>
        </div>
      </section>

      <div className="grid two-col" style={{ marginTop: "1.5rem" }}>
        <section className="status-card stack">
          <div className="status-row">
            <h2 className="section-title">Session status</h2>
            <span className={`status-pill ${user ? "" : "offline"}`}>
              {isLoading ? "Checking session" : user ? "Authenticated" : "Guest"}
            </span>
          </div>

          <dl className="meta-list">
            <div>
              <dt>Backend token</dt>
              <dd>{token ? `${token.slice(0, 12)}...` : "No token stored"}</dd>
            </div>
            <div>
              <dt>Current identity</dt>
              <dd>{user ? `${user.username} (${user.email})` : "Not signed in"}</dd>
            </div>
            <div>
              <dt>Creator mode</dt>
              <dd>{user ? (user.is_creator ? "Creator" : "Viewer") : "Unknown"}</dd>
            </div>
          </dl>
        </section>

        <section className="panel stack">
          <h2 className="section-title">What this proves</h2>
          <ul className="feature-list">
            <li>`/api/auth/register` creates a user and stores the returned token.</li>
            <li>`/api/auth/login` restores the same account with a fresh token.</li>
            <li>`/api/auth/me` hydrates the current session after a refresh.</li>
            <li>`/api/auth/logout` clears both backend and local session state.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
