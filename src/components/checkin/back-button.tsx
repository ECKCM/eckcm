import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CheckinBackButton({
  href = "/admin/checkin",
  label = "Back",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <Button asChild variant="ghost" size="icon" className="h-8 w-8">
      <Link href={href} aria-label={label}>
        <ArrowLeft className="h-4 w-4" />
      </Link>
    </Button>
  );
}
