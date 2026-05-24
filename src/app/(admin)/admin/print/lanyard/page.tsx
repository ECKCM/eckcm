import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function PrintLanyardPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Print Lanyards</h1>
      </div>
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
