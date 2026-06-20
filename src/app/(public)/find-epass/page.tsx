"use client";

import { useState } from "react";
import Link from "next/link";
import { QrCode, Loader2, ArrowLeft, Search } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BirthDatePicker } from "@/components/shared/birth-date-picker";
import { Toolbar } from "@/components/shared/toolbar";
import { useI18n } from "@/lib/i18n/context";
import { filterName } from "@/lib/utils/field-helpers";

export default function FindEPassPage() {
  const { t } = useI18n();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [year, setYear] = useState<number | undefined>();
  const [month, setMonth] = useState<number | undefined>();
  const [day, setDay] = useState<number | undefined>();
  const [code, setCode] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const birthComplete = !!year && !!month && !!day;
  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    birthComplete &&
    code.trim().length > 0 &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !year || !month || !day) return;

    setSubmitting(true);
    setError(null);

    const birthDate = `${year}-${String(month).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;

    try {
      const res = await fetch("/api/epass/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          birthDate,
          code,
        }),
      });

      if (res.status === 404) {
        setError(t("findEpass.notFound"));
        setSubmitting(false);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        setError(t("findEpass.error"));
        setSubmitting(false);
        return;
      }

      // Found — full-navigate to the public e-pass page. Keep the spinner on
      // until the browser leaves this page.
      window.location.href = data.url as string;
    } catch {
      setError(t("findEpass.error"));
      setSubmitting(false);
    }
  };

  return (
    <div className="home-gradient flex min-h-screen flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <Toolbar />
      </div>

      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <QrCode className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">{t("findEpass.title")}</CardTitle>
          <CardDescription>{t("findEpass.description")}</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Legal name — English, uppercase, exactly as registered.
                Reuses the registration form's filterName + profile.* labels. */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="firstName">
                    {t("profile.firstNameLegal")}{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    autoComplete="given-name"
                    placeholder={t("profile.firstNamePlaceholder")}
                    value={firstName}
                    onChange={(e) => setFirstName(filterName(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lastName">
                    {t("profile.lastNameLegal")}{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="lastName"
                    autoComplete="family-name"
                    placeholder={t("profile.lastNamePlaceholder")}
                    value={lastName}
                    onChange={(e) => setLastName(filterName(e.target.value))}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("findEpass.nameHint")}
              </p>
            </div>

            {/* Date of birth */}
            <BirthDatePicker
              year={year}
              month={month}
              day={day}
              onYearChange={setYear}
              onMonthChange={setMonth}
              onDayChange={setDay}
            />

            {/* Confirmation code */}
            <div className="space-y-2">
              <Label htmlFor="code">
                {t("findEpass.code")}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="code"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))
                }
                className="text-center font-mono text-lg uppercase tracking-wider"
              />
              <p className="text-xs text-muted-foreground">
                {t("findEpass.codeHint")}
              </p>
            </div>

            {error && (
              <p className="text-center text-sm text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={!canSubmit}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("findEpass.searching")}
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  {t("findEpass.submit")}
                </>
              )}
            </Button>
          </form>

          <p className="mt-5 border-t pt-4 text-center text-sm text-muted-foreground">
            {t("findEpass.troublePrefix")}{" "}
            <Link
              href="/support"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("findEpass.supportLink")}
            </Link>
          </p>
        </CardContent>
      </Card>

      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t("findEpass.backToHome")}
      </Link>
    </div>
  );
}
