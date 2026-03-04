import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <ShieldX className="h-16 w-16 text-destructive" />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-muted-foreground max-w-sm">
          You don&apos;t have permission to view this page. Contact your
          administrator if you believe this is a mistake.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/admin">Back to Dashboard</Link>
      </Button>
    </div>
  );
}
