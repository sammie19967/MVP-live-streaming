import Link from "next/link";
import { ProductList } from "@/components/product-list";
import { SiteNavbar } from "@/components/site-navbar";

export const metadata = {
  title: "Products — StreamMVP",
  description: "Browse product listings from the StreamMVP marketplace.",
};

export default function ProductsPage() {
  return (
    <div className="min-h-screen">
      <SiteNavbar />

      {/* Page header */}
      <div className="relative pt-28 pb-12 px-6 overflow-hidden">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[280px] rounded-full bg-violet-600/8 blur-[100px]" />
        </div>

        <div className="relative max-w-7xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs text-white/30 font-mono mb-6">
            <Link href="/" className="hover:text-white/60 transition-colors">Home</Link>
            <span>/</span>
            <span className="text-white/50">Products</span>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/25 bg-violet-500/10 text-violet-300 text-xs font-semibold tracking-widest uppercase mb-4">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                </svg>
                Marketplace
              </div>
              <h1 className="font-heading text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight">
                Browse listings
              </h1>
              <p className="text-white/40 text-sm mt-2 font-mono max-w-md">
                Discover products from creators — sorted, filtered, and ready to explore.
              </p>
            </div>

            <Link
              href="/products/new"
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-all duration-200 shadow-lg shadow-violet-900/30 hover:-translate-y-0.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create listing
            </Link>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/[0.06]" />

      {/* Product grid */}
      <main className="max-w-7xl mx-auto px-6 py-10 pb-24">
        <ProductList />
      </main>
    </div>
  );
}
