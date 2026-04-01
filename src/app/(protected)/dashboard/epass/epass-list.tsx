"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, QrCode, Copy, Check, AlertTriangle, MessageSquare, Share2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

interface EPassToken {
  id: string;
  token: string;
  is_active: boolean;
  created_at: string;
  person_id: string;
  registration_id: string;
  participant_code: string | null;
  qr_value: string | null;
  eckcm_people: {
    first_name_en: string;
    last_name_en: string;
    display_name_ko: string | null;
    gender: string;
    birth_date: string;
    phone: string | null;
  };
  eckcm_registrations: {
    confirmation_code: string | null;
    status: string;
    start_date: string;
    end_date: string;
    event_id: string;
    registration_type: string | null;
    eckcm_events: {
      name_en: string;
      name_ko: string | null;
      year: number;
    };
  };
}

function getMealCategory(birthDate: string, eventDate: string): string {
  const birth = new Date(birthDate);
  const ref = new Date(eventDate);
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  if (age >= 11) return "adult";
  if (age >= 5) return "youth";
  return "free";
}

function buildEPassSlug(firstName: string, lastName: string, token: string): string {
  const name = `${firstName}${lastName}`.replace(/[^a-zA-Z0-9]/g, "");
  return `${name}_${token}`;
}

function getEPassUrl(slug: string) {
  return `${window.location.origin}/epass/${slug}`;
}

function CopyLinkButton({ slug }: { slug: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await navigator.clipboard.writeText(getEPassUrl(slug));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="default"
      size="sm"
      className="h-8 gap-1.5 text-xs font-semibold"
      onClick={handleCopy}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" /> {t("epass.copied")}
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> {t("epass.copy")}
        </>
      )}
    </Button>
  );
}

function toE164(phone: string): string {
  return phone.replace(/[^+\d]/g, "");
}

function ShareButtons({ slug, personName, phone, eventYear }: { slug: string; personName: string; phone: string | null; eventYear: number }) {
  const { t } = useI18n();
  const [origin, setOrigin] = useState("");
  const sharingRef = useRef(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!origin) return null;

  const epassUrl = `${origin}/epass/${slug}`;
  const smsBody = encodeURIComponent(t("epass.smsBody", { year: eventYear, name: personName, url: epassUrl }));
  const smsRecipient = phone ? toE164(phone) : "";
  const smsHref = smsRecipient
    ? `sms:${smsRecipient}?&body=${smsBody}`
    : `sms:?&body=${smsBody}`;

  const shareTitle = t("epass.shareTitle", { year: eventYear, name: personName });

  async function handleShare() {
    if (sharingRef.current) return;
    sharingRef.current = true;
    try {
      await navigator.share({
        title: shareTitle,
        text: shareTitle,
        url: epassUrl,
      });
    } catch {
      // user cancelled or share failed
    } finally {
      sharingRef.current = false;
    }
  }

  return (
    <>
      {phone && (
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
          <a href={smsHref}>
            <MessageSquare className="h-3.5 w-3.5" /> {t("epass.send")}
          </a>
        </Button>
      )}
      {typeof navigator !== "undefined" && !!navigator.share && (
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleShare}>
          <Share2 className="h-3.5 w-3.5" /> {t("epass.share")}
        </Button>
      )}
    </>
  );
}

function EPassCardList({
  tokens,
  myPersonIds,
  isMyPass,
  getCardStyle,
  onCardClick,
}: {
  tokens: EPassToken[];
  myPersonIds: string[];
  isMyPass: (t: EPassToken) => boolean;
  getCardStyle: (t: EPassToken) => string;
  onCardClick: (t: EPassToken, e: React.MouseEvent) => void;
}) {
  const { t, locale } = useI18n();

  const mealLabel: Record<string, string> = {
    adult: "General",
    youth: "Youth",
    free: "Free",
  };

  if (tokens.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t("epass.noEPassYet")}
        </CardContent>
      </Card>
    );
  }

  // Sort: my passes first, then others
  const sorted = [...tokens].sort((a, b) => {
    const aIsMine = isMyPass(a) ? 0 : 1;
    const bIsMine = isMyPass(b) ? 0 : 1;
    return aIsMine - bIsMine;
  });

  return (
    <div className="space-y-4">
      {sorted.map((token) => {
        const person = token.eckcm_people;
        const reg = token.eckcm_registrations;
        const event = reg.eckcm_events;
        const displayName =
          person.display_name_ko ??
          `${person.first_name_en} ${person.last_name_en}`;
        const meal = getMealCategory(person.birth_date, reg.start_date);
        const eventName = locale === "ko" && event.name_ko ? event.name_ko : event.name_en;
        const slug = buildEPassSlug(
          person.first_name_en,
          person.last_name_en,
          token.token
        );

        return (
          <Card key={token.id} className={`hover:bg-accent/50 transition-colors ${getCardStyle(token)}`}>
            <Link
              href={`/dashboard/epass/${token.id}`}
              onClick={(e) => onCardClick(token, e)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{displayName}</CardTitle>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={token.is_active ? "default" : "secondary"}>
                      {token.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {(person.gender === "MALE" || person.gender === "FEMALE") && (
                      <Badge
                        variant="outline"
                        className={
                          person.gender === "MALE"
                            ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
                            : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
                        }
                      >
                        {person.gender === "MALE" ? "Male" : "Female"}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={
                        meal === "adult"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : meal === "youth"
                            ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : "border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300"
                      }
                    >
                      {mealLabel[meal] ?? meal}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>{eventName}</p>
                    {token.participant_code && (
                      <p className="font-mono font-medium text-foreground">
                        {token.participant_code}
                      </p>
                    )}
                  </div>
                  <QrCode className="h-10 w-10 text-muted-foreground" />
                </div>
              </CardContent>
            </Link>
            <div className="px-6 pb-3 flex items-center justify-end flex-wrap gap-2 border-t pt-2">
              <CopyLinkButton slug={slug} />
              <ShareButtons slug={slug} personName={`${person.first_name_en} ${person.last_name_en}`} phone={person.phone} eventYear={event.year} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export function EPassList({ tokens, myPersonIds }: { tokens: EPassToken[]; myPersonIds: string[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [warningToken, setWarningToken] = useState<EPassToken | null>(null);
  const [dialogCopied, setDialogCopied] = useState(false);

  function isMyPass(token: EPassToken) {
    return myPersonIds.includes(token.person_id);
  }

  function getCardStyle(token: EPassToken): string {
    if (isMyPass(token)) return "";
    return "opacity-60";
  }

  function handleCardClick(token: EPassToken, e: React.MouseEvent) {
    if (!isMyPass(token)) {
      e.preventDefault();
      setWarningToken(token);
    }
  }

  function handleDialogOpen() {
    if (warningToken) {
      router.push(`/dashboard/epass/${warningToken.id}`);
      setWarningToken(null);
    }
  }

  async function handleDialogCopyLink() {
    if (!warningToken) return;
    const person = warningToken.eckcm_people;
    const slug = buildEPassSlug(person.first_name_en, person.last_name_en, warningToken.token);
    const url = `${window.location.origin}/epass/${slug}`;
    await navigator.clipboard.writeText(url);
    setDialogCopied(true);
    setTimeout(() => {
      setDialogCopied(false);
      setWarningToken(null);
    }, 1000);
  }

  const myTokens = tokens.filter(
    (tk) => tk.eckcm_registrations.registration_type !== "others"
  );
  const othersTokens = tokens.filter(
    (tk) => tk.eckcm_registrations.registration_type === "others"
  );
  const hasBothTabs = othersTokens.length > 0;

  const cardListProps = { myPersonIds, isMyPass, getCardStyle, onCardClick: handleCardClick };

  const warningName = warningToken
    ? `${warningToken.eckcm_people.first_name_en} ${warningToken.eckcm_people.last_name_en}`
    : "";

  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">{t("epass.title")}</h1>
      </div>

      {tokens.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("epass.noEPassComplete")}
          </CardContent>
        </Card>
      ) : !hasBothTabs ? (
        <EPassCardList tokens={tokens} {...cardListProps} />
      ) : (
        <Tabs defaultValue="my">
          <TabsList className="w-full">
            <TabsTrigger value="my" className="flex-1">
              {t("epass.myRegistration", { count: myTokens.length })}
            </TabsTrigger>
            <TabsTrigger value="others" className="flex-1">
              {t("epass.registeredForOthers", { count: othersTokens.length })}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="my" className="mt-4">
            <EPassCardList tokens={myTokens} {...cardListProps} />
          </TabsContent>
          <TabsContent value="others" className="mt-4">
            <EPassCardList tokens={othersTokens} {...cardListProps} />
          </TabsContent>
        </Tabs>
      )}

      {/* Warning dialog for viewing another person's E-Pass */}
      <Dialog open={!!warningToken} onOpenChange={(open) => !open && setWarningToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t("epass.notYourEPass")}
            </DialogTitle>
            <DialogDescription>
              {t("epass.notYourEPassDesc", { name: warningName })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" className="gap-1.5" onClick={handleDialogCopyLink}>
              {dialogCopied ? (
                <>
                  <Check className="h-4 w-4" /> {t("epass.copied")}
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> {t("epass.copyLink")}
                </>
              )}
            </Button>
            <Button onClick={handleDialogOpen}>{t("epass.open")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
