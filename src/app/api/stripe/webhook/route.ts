import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { fulfillCheckout, stripeClient, stripeEnabled } from "@/lib/billing";

export async function POST(req: NextRequest) {
  if (!stripeEnabled() || !process.env.STRIPE_WEBHOOK_SECRET) return NextResponse.json({ error: "Billing not configured" }, { status: 400 });
  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return NextResponse.json({ error: `Bad signature: ${e instanceof Error ? e.message : e}` }, { status: 400 });
  }
  if (event.type === "checkout.session.completed") {
    await fulfillCheckout(event.data.object as Stripe.Checkout.Session);
  }
  return NextResponse.json({ received: true });
}
