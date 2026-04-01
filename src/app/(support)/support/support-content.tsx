"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, MessageSquare, Copy, Check } from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";

const messageContacts = [
  {
    id: "reg-ko",
    label: { en: "Registration (Korean)", ko: "등록 문의 (한국어)" },
    phone: "2402334441",
    body: "안녕하세요, ECKCM 등록 관련 문의드립니다.\n이름:\n문의 내용:",
  },
  {
    id: "reg-en",
    label: { en: "Registration (English)", ko: "등록 문의 (English)" },
    phone: "2402334441",
    body: "Hi, I have a question regarding ECKCM registration:\nName:\nQuestion:",
  },
  {
    id: "em",
    label: { en: "EM", ko: "EM" },
    phone: "2035509209",
    body: "Hi, I have a question regarding ECKCM EM:\nName:\nQuestion:",
  },
  {
    id: "hansamo",
    label: { en: "한사모", ko: "한사모" },
    phone: "9519661889",
    body: "안녕하세요, ECKCM 한사모 관련 문의드립니다.\n이름:\n문의 내용:",
  },
];

const EMAIL = "myeckcm@gmail.com";

export function SupportContent({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { t, locale } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = async () => {
    await navigator.clipboard.writeText(EMAIL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getSmsUrl = (phone: string, body: string) => {
    return `sms:+1${phone}?&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        {isLoggedIn && (
          <Button variant="outline" size="icon" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
        )}
        <h1 className="text-3xl font-bold">{t("support.title")}</h1>
      </div>
      <p className="mb-8 text-muted-foreground">
        {t("support.subtitle")}
      </p>

      {/* Contact - Message & Email */}
      <div className="mb-8 space-y-4">
        {/* Message */}
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">{t("support.textUs")}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {messageContacts.map((contact) => (
                <Button
                  key={contact.id}
                  variant="outline"
                  className="h-auto justify-start py-3"
                  asChild
                >
                  <a href={getSmsUrl(contact.phone, contact.body)}>
                    <MessageSquare className="mr-2 h-4 w-4 shrink-0" />
                    <span>{contact.label[locale as "en" | "ko"]}</span>
                  </a>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Email */}
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">{t("support.emailUs")}</h2>
            </div>
            <Button
              variant="outline"
              className="h-auto py-3"
              onClick={handleCopyEmail}
            >
              {copied ? (
                <Check className="mr-2 h-4 w-4 text-green-500" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              <span>{EMAIL}</span>
              {copied && (
                <span className="ml-2 text-xs text-green-500">
                  {t("support.copied")}
                </span>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* FAQ */}
      <h2 className="mb-4 text-xl font-semibold">{t("support.faq")}</h2>
      <Accordion type="single" collapsible>
        <AccordionItem value="register">
          <AccordionTrigger>{t("support.faqRegister")}</AccordionTrigger>
          <AccordionContent>{t("support.faqRegisterAnswer")}</AccordionContent>
        </AccordionItem>
        <AccordionItem value="register-others">
          <AccordionTrigger>{t("support.faqRegisterOthers")}</AccordionTrigger>
          <AccordionContent>{t("support.faqRegisterOthersAnswer")}</AccordionContent>
        </AccordionItem>
        <AccordionItem value="epass">
          <AccordionTrigger>{t("support.faqEpass")}</AccordionTrigger>
          <AccordionContent>{t("support.faqEpassAnswer")}</AccordionContent>
        </AccordionItem>
        <AccordionItem value="receipt">
          <AccordionTrigger>{t("support.faqReceipt")}</AccordionTrigger>
          <AccordionContent>{t("support.faqReceiptAnswer")}</AccordionContent>
        </AccordionItem>
        <AccordionItem value="edit">
          <AccordionTrigger>{t("support.faqEdit")}</AccordionTrigger>
          <AccordionContent>{t("support.faqEditAnswer")}</AccordionContent>
        </AccordionItem>
        <AccordionItem value="cancel">
          <AccordionTrigger>{t("support.faqCancel")}</AccordionTrigger>
          <AccordionContent>{t("support.faqCancelAnswer")}</AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
