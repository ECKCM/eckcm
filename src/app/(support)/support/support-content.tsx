"use client";

import Link from "next/link";
import { ArrowLeft, Mail, HelpCircle, CreditCard, QrCode, UserPlus } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";

export function SupportContent({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { t } = useI18n();

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

      {/* Quick Help Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <UserPlus className="mb-1 h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t("support.registration")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              {t("support.registrationDesc")}
            </CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CreditCard className="mb-1 h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t("support.payments")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              {t("support.paymentsDesc")}
            </CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <QrCode className="mb-1 h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t("support.epass")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              {t("support.epassDesc")}
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      {/* FAQ */}
      <h2 className="mb-4 text-xl font-semibold">{t("support.faq")}</h2>
      <Accordion type="single" collapsible className="mb-8">
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

      {/* Contact */}
      <h2 className="mb-4 text-xl font-semibold">{t("support.contactUs")}</h2>
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{t("support.email")}</p>
              <a
                href="mailto:support@eckcm.org"
                className="text-sm text-primary hover:underline"
              >
                support@eckcm.org
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <HelpCircle className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{t("support.generalInquiries")}</p>
              <p className="text-sm text-muted-foreground">
                {t("support.generalInquiriesDesc")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
