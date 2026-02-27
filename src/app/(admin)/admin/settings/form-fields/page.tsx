"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

export default function FormFieldsPage() {
  return (
    <div className="flex flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <h1 className="text-lg font-semibold">Form Fields</h1>
      </header>
      <div className="mx-auto w-full max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Registration Form Fields</CardTitle>
            <CardDescription>
              Configure which fields are displayed and required in the registration form.
              Custom field configuration will be available via the eckcm_form_field_config table.
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
            <p className="mt-4 text-sm text-muted-foreground">
              Field customization through the admin interface is coming soon.
              Contact the system administrator to modify field requirements.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
