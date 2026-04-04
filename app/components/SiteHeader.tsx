import Link from "next/link";

export function SiteHeader() {
  return (
    <header
      style={{
        borderBottom: "1px solid var(--border)",
        background: "rgba(10, 9, 8, 0.85)",
        backdropFilter: "blur(12px)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBlock: "1rem",
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "1.15rem",
            letterSpacing: "-0.03em",
            color: "var(--text)",
            textDecoration: "none",
          }}
        >
          Tryb Studios
        </Link>
        <nav style={{ display: "flex", gap: "1.25rem", alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Dashboard
          </Link>
          <Link href="/leads" style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Leads
          </Link>
          <Link href="/leads-sheet" style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Sheet
          </Link>
        </nav>
      </div>
    </header>
  );
}
