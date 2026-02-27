import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function GoogleSheetsSettingsPage() {
  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Google Sheets Integration</h1>
      </header>
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Google Sheets Sync
              <Badge variant="outline">Coming Soon</Badge>
            </CardTitle>
            <CardDescription>
              Automatically sync participant and registration data to Google Sheets
              for reporting and external access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Google Sheets integration is not yet configured.
                This feature will allow automatic data synchronization
                with a designated Google Sheets spreadsheet.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Planned Features:</h4>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                <li>Auto-sync registrations to a shared spreadsheet</li>
                <li>Real-time participant data updates</li>
                <li>Configurable sync schedule</li>
                <li>Selective field mapping</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
