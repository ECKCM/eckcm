import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function PrintQRCardsPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Print QR Cards</h1>
      </div>
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              QR Code Card Printing
              <Badge variant="outline">Coming Soon</Badge>
            </CardTitle>
            <CardDescription>
              Generate printable QR code cards for participant check-in.
              Each card contains a unique E-Pass QR code that can be scanned
              at check-in stations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                QR card printing functionality is in development.
                This will support batch generation of QR cards
                in standard card sizes for easy distribution.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
