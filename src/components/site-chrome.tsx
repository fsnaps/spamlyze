import Link from "next/link";
import { site } from "@/lib/site";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span
        aria-hidden="true"
        className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm font-bold text-white"
      >
        S
      </span>
      {site.name}
    </Link>
  );
}

export function Header() {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
      <Logo />
      <a
        href="#early-access"
        className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-accent"
      >
        Early access
      </a>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          © 2026 {site.legalEntity}. Not affiliated with Google.
        </p>
        <nav className="flex gap-5">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <a href={`mailto:${site.contactEmail}`} className="hover:text-foreground">
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
