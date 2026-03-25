import Link from "next/link";
import { ArrowLeft, Mail, Phone, HelpCircle, CreditCard, QrCode, UserPlus } from "lucide-react";
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

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Dashboard
      </Link>

      <h1 className="mb-2 text-3xl font-bold">Support Center</h1>
      <p className="mb-8 text-muted-foreground">
        Find answers to common questions or get in touch with us.
      </p>

      {/* Quick Help Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <UserPlus className="mb-1 h-5 w-5 text-primary" />
            <CardTitle className="text-base">Registration</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Help with signing up and event registration
            </CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CreditCard className="mb-1 h-5 w-5 text-primary" />
            <CardTitle className="text-base">Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Questions about fees, receipts, and refunds
            </CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <QrCode className="mb-1 h-5 w-5 text-primary" />
            <CardTitle className="text-base">E-Pass</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Issues with your digital event pass
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      {/* FAQ */}
      <h2 className="mb-4 text-xl font-semibold">Frequently Asked Questions</h2>
      <Accordion type="single" collapsible className="mb-8">
        <AccordionItem value="register">
          <AccordionTrigger>How do I register for an event?</AccordionTrigger>
          <AccordionContent>
            Sign in to your account and go to the Dashboard. You will see active
            events listed with a &quot;Register Now&quot; button. Follow the
            steps to complete your registration.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="register-others">
          <AccordionTrigger>
            Can I register on behalf of someone else?
          </AccordionTrigger>
          <AccordionContent>
            Yes. On the Dashboard, click &quot;Register for Someone Else&quot;
            under the event. The registration will be linked to your account,
            but the participants you add will be registered separately.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="epass">
          <AccordionTrigger>How do I access my E-Pass?</AccordionTrigger>
          <AccordionContent>
            After completing registration, go to the E-Pass section from your
            Dashboard. You can also access your E-Pass directly from the link
            sent to your email. Show the QR code at check-in.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="receipt">
          <AccordionTrigger>Where can I find my receipt?</AccordionTrigger>
          <AccordionContent>
            Go to the Receipts section from your Dashboard to view and download
            receipts for all your registrations.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="edit">
          <AccordionTrigger>
            Can I edit my registration after submitting?
          </AccordionTrigger>
          <AccordionContent>
            Please contact our support team for any changes to your registration
            after submission.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="cancel">
          <AccordionTrigger>How do I cancel my registration?</AccordionTrigger>
          <AccordionContent>
            To cancel a registration, please contact our support team directly.
            Refund policies vary by event.
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Contact */}
      <h2 className="mb-4 text-xl font-semibold">Contact Us</h2>
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Email</p>
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
              <p className="text-sm font-medium">General Inquiries</p>
              <p className="text-sm text-muted-foreground">
                For general questions, please email us and we will respond as
                soon as possible.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
