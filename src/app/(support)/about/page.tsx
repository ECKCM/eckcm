"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const teamMembers = [
  {
    name: { en: "Scott Kim", ko: "김찬영" },
    role: "aboutPO" as const,
    church: { en: "Washington-Spencerville Church", ko: "워싱턴 스펜서빌 교회" },
    phone: "19519661889",
  },
  {
    name: { en: "Jin Kim", ko: "김진권" },
    role: "aboutPM" as const,
    church: { en: "Maryland Central Church", ko: "메릴랜드 중앙 교회" },
  },
  {
    name: { en: "David Kim", ko: "김동현" },
    role: "aboutAdvisor" as const,
    church: { en: "Washington-Spencerville Church", ko: "워싱턴 스펜서빌 교회" },
  },
  {
    name: { en: "Don Kim", ko: "김동성" },
    role: "aboutQA" as const,
    church: { en: "Collegedale Church", ko: "칼레지데일 교회" },
  },
  {
    name: { en: "Hyunhwa Lee", ko: "이현화" },
    role: "aboutQA" as const,
    church: { en: "Collegedale Church", ko: "칼레지데일 교회" },
  },
  {
    name: { en: "John Kim", ko: "김종필" },
    role: "aboutQA" as const,
    church: { en: "Orlando Central Church", ko: "올랜도 중앙 교회" },
  },
  {
    name: { en: "Soonja Shin", ko: "신순자" },
    role: "aboutQA" as const,
    church: { en: "Collegedale Church", ko: "칼레지데일 교회" },
  },
  {
    name: { en: "Shelly Park", ko: "이서연" },
    role: "aboutQA" as const,
    church: { en: "Collegedale Church", ko: "칼레지데일 교회" },
  },
  {
    name: { en: "Julie Kim", ko: "김희애" },
    role: "aboutQA" as const,
    church: { en: "Cerritos Church", ko: "세리토스 교회" },
  },
];

export default function AboutPage() {
  const { t, locale } = useI18n();
  const lang = locale as "en" | "ko";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="outline" size="icon" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">{t("support.aboutTitle")}</h1>
      </div>
      <p className="mb-8 text-muted-foreground">
        {t("support.aboutDescription")}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {teamMembers.map((member) => {
          const content = (
            <CardContent className="pt-4 pb-4">
              <p className="font-semibold">{member.name[lang]}</p>
              <p className="text-sm text-primary">
                {t(`support.${member.role}`)}
              </p>
              <p className="text-xs text-muted-foreground">
                {member.church[lang]}
              </p>
            </CardContent>
          );

          if (member.phone) {
            return (
              <a key={member.name.en} href={`sms:+${member.phone}`}>
                <Card className="transition-colors hover:bg-muted/50 cursor-pointer">
                  {content}
                </Card>
              </a>
            );
          }

          return <Card key={member.name.en}>{content}</Card>;
        })}
      </div>

      <p className="mt-10 text-center text-sm italic text-muted-foreground">
        {t("support.aboutSoliDeoGloria")}
      </p>
    </div>
  );
}
