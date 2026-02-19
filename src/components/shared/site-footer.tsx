import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="bg-(--chart-2) text-[#0c1a33]">
      <div className="flex flex-wrap items-center justify-center gap-x-1 px-4 py-3 text-[8px] sm:text-sm">
        <span>&copy; {new Date().getFullYear()} ECKCM. All rights reserved.</span>
        <span className="hidden sm:inline">&middot;</span>
        <Link href="/terms" className="hover:underline">
          Terms of Service
        </Link>
        <span className="hidden sm:inline">&middot;</span>
        <Link href="/privacy" className="hover:underline">
          Privacy Policy
        </Link>
      </div>
    </footer>
  );
}
