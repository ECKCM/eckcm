import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Toolbar } from "@/components/shared/toolbar";

import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }
  return (
    <div className="home-gradient flex min-h-screen flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <Toolbar />
      </div>
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-6xl font-bold tracking-tight">
          ECKCM
        </h1>
        <h3 className="text-1xl font-bold tracking-tight sm:text-2xl">
          중동부 연합 야영회
        </h3>
        <p className="mt-2 text-lg text-muted-foreground">
          East Coast Korean Camp Meeting
        </p>
        <p className="mt-6 text-base leading-7 text-muted-foreground">
          Sign up to register for ECKCM
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 w-full">
          <Button asChild size="lg" variant="secondary" className="w-full shadow-xl">
            <Link href="/dashboard/epass">Find My E-Pass</Link>
          </Button>
          <div className="flex w-full gap-4">
            <Button asChild size="lg" className="flex-1 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.3)]">
              <Link href="/signup">Sign Up</Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="flex-1 shadow-xl bg-white dark:bg-card">
              <Link href="/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
