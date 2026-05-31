import { PayByLinkClient } from "./pay-client";

/**
 * Public, login-free card-payment page for a SUBMITTED registration.
 * The random link token (issued by an admin) is the only credential.
 * See submitted-card-payment-link.design.md.
 */
export default async function PayByLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PayByLinkClient token={decodeURIComponent(token)} />;
}
