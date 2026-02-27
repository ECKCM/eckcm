import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Toolbar } from "@/components/shared/toolbar";
import { AdventistLogo } from "@/components/shared/adventist-logo";
import { EckcmLogo } from "@/components/shared/eckcm-logo";
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
        <div className="flex items-center justify-center gap-3 mb-4">
          <AdventistLogo className="h-12 w-12 sm:h-16 sm:w-16" />
          <EckcmLogo className="h-12 w-12 sm:h-16 sm:w-16" />
          <div
            className="h-12 w-12 sm:h-16 sm:w-16"
            role="img"
            aria-label="University of Pittsburgh Johnstown"
            style={{
              backgroundColor: "#0c1a33",
              maskImage: "url(/images/upj-crest-128.png)",
              WebkitMaskImage: "url(/images/upj-crest-128.png)",
              maskSize: "contain",
              WebkitMaskSize: "contain",
              maskRepeat: "no-repeat",
              WebkitMaskRepeat: "no-repeat",
              maskPosition: "center",
              WebkitMaskPosition: "center",
            }}
          />
        </div>
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
          Sign up to register for ECKCM
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 w-full">
          <Button asChild size="lg" variant="secondary" className="w-full">
            <Link href="/dashboard/epass">Find My E-Pass</Link>
          </Button>
          <div className="flex w-full gap-4">
            <Button asChild size="lg" className="flex-1">
              <Link href="/signup">Sign Up</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="flex-1">
              <Link href="/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
