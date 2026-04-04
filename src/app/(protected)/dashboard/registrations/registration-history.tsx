"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

interface Registration {
  id: string;
  confirmation_code: string | null;
  status: string;
  registration_type: string | null;
  start_date: string;
  end_date: string;
  nights_count: number;
  total_amount_cents: number;
  created_at: string;
  eckcm_events: {
    name_en: string;
    name_ko: string | null;
  };
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PAID: "default",
  SUBMITTED: "outline",
  DRAFT: "secondary",
  CANCELLED: "destructive",
  REFUNDED: "destructive",
};

function RegistrationList({
  registrations,
  locale,
  t,
}: {
  registrations: Registration[];
  locale: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (registrations.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t("registrations.noRegistrations")}
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {registrations.map((reg) => (
        <Card key={reg.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {locale === "ko" && reg.eckcm_events.name_ko ? reg.eckcm_events.name_ko : reg.eckcm_events.name_en}
              </CardTitle>
              <Badge variant={statusVariant[reg.status] ?? "secondary"}>
                {reg.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">{t("registration.dates")}</span>
              <span>
                {reg.start_date} ~ {reg.end_date}
              </span>
              <span className="text-muted-foreground">{t("registration.nights")}</span>
              <span>{reg.nights_count}</span>
              {reg.confirmation_code && (
                <>
                  <span className="text-muted-foreground">Code</span>
                  <span className="font-mono font-medium">
                    {reg.confirmation_code}
                  </span>
                </>
              )}
              <span className="text-muted-foreground">{t("common.total")}</span>
              <span className="font-medium">
                ${(reg.total_amount_cents / 100).toFixed(2)}
              </span>
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(reg.created_at).toLocaleDateString("en-US")}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function RegistrationHistory({
  registrations,
}: {
  registrations: Registration[];
}) {
  const { t, locale } = useI18n();
  const myRegistrations = registrations.filter(
    (reg) => reg.registration_type !== "others"
  );
  const othersRegistrations = registrations.filter(
    (reg) => reg.registration_type === "others"
  );
  const hasBothTabs = othersRegistrations.length > 0;

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t("registrations.title")}</h1>
      </div>

      {!hasBothTabs ? (
        <RegistrationList registrations={registrations} locale={locale} t={t} />
      ) : (
        <Tabs defaultValue="my">
          <TabsList className="w-full">
            <TabsTrigger value="my" className="flex-1">
              {t("registrations.myRegistration", { count: myRegistrations.length })}
            </TabsTrigger>
            <TabsTrigger value="others" className="flex-1">
              {t("registrations.registeredForOthers", { count: othersRegistrations.length })}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="my" className="mt-4">
            <RegistrationList registrations={myRegistrations} locale={locale} t={t} />
          </TabsContent>
          <TabsContent value="others" className="mt-4">
            <RegistrationList registrations={othersRegistrations} locale={locale} t={t} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
