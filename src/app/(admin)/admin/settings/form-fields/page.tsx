import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

const defaultFields = [
  { name: "First Name", required: true, enabled: true },
  { name: "Last Name", required: true, enabled: true },
  { name: "Korean Name", required: false, enabled: true },
  { name: "Gender", required: true, enabled: true },
  { name: "Birth Date", required: true, enabled: true },
  { name: "Phone", required: false, enabled: true },
  { name: "Email", required: false, enabled: true },
  { name: "Church", required: false, enabled: true },
  { name: "Church Role", required: false, enabled: true },
  { name: "Department", required: false, enabled: true },
  { name: "Grade (K-12)", required: false, enabled: true },
];

export default async function FormFieldsPage() {
  const supabase = await createClient();

  // Fetch dynamic field configurations from the database
  const { data: fieldConfigs } = await supabase
    .from("eckcm_form_field_config")
    .select(
      `
      id, field_key, is_visible, is_required,
      eckcm_registration_groups(name_en)
    `
    )
    .order("field_key", { ascending: true });

  const configs = fieldConfigs ?? [];

  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Form Fields</h1>
      </header>
      <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Default Registration Fields</CardTitle>
            <CardDescription>
              Core fields included in all registrations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {defaultFields.map((field) => (
                <div
                  key={field.name}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <span className="font-medium">{field.name}</span>
                  <div className="flex gap-2">
                    {field.required && (
                      <Badge variant="secondary">Required</Badge>
                    )}
                    <Badge variant={field.enabled ? "default" : "outline"}>
                      {field.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {configs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Group-Specific Field Configuration</CardTitle>
              <CardDescription>
                Field visibility and requirements configured per registration group via{" "}
                <code className="text-xs font-mono">eckcm_form_field_config</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {configs.map((config: any) => (
                  <div
                    key={config.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <span className="font-mono text-sm font-medium">
                        {config.field_key}
                      </span>
                      {config.eckcm_registration_groups && (
                        <p className="text-xs text-muted-foreground">
                          Group: {config.eckcm_registration_groups.name_en}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {config.is_required && (
                        <Badge variant="secondary">Required</Badge>
                      )}
                      <Badge variant={config.is_visible ? "default" : "outline"}>
                        {config.is_visible ? "Visible" : "Hidden"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {configs.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Group-Specific Field Configuration</CardTitle>
              <CardDescription>
                Configure per-group field visibility via{" "}
                <code className="text-xs font-mono">eckcm_form_field_config</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No custom field configurations found. Contact the system
                administrator to configure per-group field requirements.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
