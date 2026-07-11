import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  href?: string;
  showLabel?: boolean;
  compact?: boolean;
  className?: string;
};

export function BrandLogo({
  href = "/",
  showLabel = true,
  compact = false,
  className = "",
}: BrandLogoProps) {
  const logoSize = compact ? 34 : 44;

  const content = (
    <>
      <span
        className="inline-flex items-center justify-center rounded-2xl bg-white shadow-[0_8px_24px_rgba(0,0,0,0.18)] overflow-hidden shrink-0"
        style={{ width: logoSize, height: logoSize }}
      >
        <Image
          src="/kiosq-logo.png"
          alt="KIOSQ logo"
          width={logoSize}
          height={logoSize}
          className="h-full w-full object-contain"
          priority
        />
      </span>
      {showLabel ? (
        <div className="flex flex-col leading-none min-w-0">
          <span className="text-white font-bold tracking-tight font-heading text-[clamp(1.2rem,1vw,1.45rem)]">
            KIOSQ
          </span>
          <span className="text-white/35 text-[0.68rem] tracking-[0.24em] uppercase font-mono">
            Live platform
          </span>
        </div>
      ) : null}
    </>
  );

  return href ? (
    <Link href={href} className={`inline-flex items-center gap-3 group ${className}`.trim()}>
      {content}
    </Link>
  ) : (
    <div className={`inline-flex items-center gap-3 ${className}`.trim()}>{content}</div>
  );
}
