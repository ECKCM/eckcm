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
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <Toolbar />
      </div>
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          ECKCM
        </h1>
        <h3 className="text-1xl font-bold tracking-tight sm:text-2xl">
          중동부 연합 야영회
        </h3>
        <p className="mt-2 text-lg text-muted-foreground">
          East Coast Korean Campmeeting
        </p>
        <p className="mt-6 text-base leading-7 text-muted-foreground">
          ECKCM Participant Portal & EMS
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/signup">Sign Up</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/login">Sign In</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
