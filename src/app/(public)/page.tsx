import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          ECKCM
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Eastern Korean Churches Camp Meeting
        </p>
        <p className="mt-6 text-base leading-7 text-muted-foreground">
          Online Registration & Management System
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/login">Sign In</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/signup">Register</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
