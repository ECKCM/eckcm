import { NextResponse } from "next/server";

/**
 * Serves the Apple Pay domain verification file required by Stripe.
 * Must be accessible at /.well-known/apple-developer-merchantid-domain-association
 *
 * After deploying, register the domain in Stripe Dashboard:
 * Settings → Payment Methods → Apple Pay → Add new domain
 */
export async function GET() {
  try {
    const response = await fetch(
      "https://stripe.com/files/apple-pay/apple-developer-merchantid-domain-association"
    );

    if (!response.ok) {
      return new NextResponse("", { status: 404 });
    }

    const content = await response.text();
    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("", { status: 500 });
  }
}
