import Link from "next/link";

import { ProductList } from "@/components/product-list";

export default function ProductsPage() {
  return (
    <div className="shell">
      <div className="nav">
        <div className="nav-brand">
          <span className="nav-mark">LIVE MVP</span>
          <span className="nav-copy">Browse products</span>
        </div>
        <div className="nav-row">
          <Link className="ghost-button" href="/">
            Home
          </Link>
          <Link className="button" href="/products/new">
            Create product
          </Link>
        </div>
      </div>

      <section className="hero-card">
        <span className="eyebrow">Marketplace</span>
        <h1 className="headline">Browse the products people have listed.</h1>
        <p className="lede">
          This page shows created listings with price, location, owner, rating, and a simple sort control.
        </p>
      </section>

      <ProductList />
    </div>
  );
}
