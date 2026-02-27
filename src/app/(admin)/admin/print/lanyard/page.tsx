import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function PrintLanyardPage() {
  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Print Lanyards</h1>
      </header>
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Lanyard Name Badge Printing
              <Badge variant="outline">Coming Soon</Badge>
            </CardTitle>
            <CardDescription>
              Generate printable lanyard name badges for all registered participants.
              Badges include participant name (English and Korean), QR code for check-in,
              and department/group information.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Lanyard printing functionality is in development.
                This will allow batch printing of participant badges
                with customizable layouts.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
