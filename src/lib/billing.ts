import Stripe from "stripe";
import { APP_URL, CREDIT_PACKS } from "./config";
import { prisma } from "./db";

export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;

export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export async function createCreditCheckout(builderId: string, slug: string, packId: string) {
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) throw new Error("Unknown pack");
  const price = process.env[pack.priceEnv];
  if (!price) throw new Error(`Missing ${pack.priceEnv}`);
  const stripe = stripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price, quantity: 1 }],
    success_url: `${APP_URL}/b/${slug}/dashboard?purchased=1`,
    cancel_url: `${APP_URL}/b/${slug}/dashboard`,
    metadata: { builderId, credits: String(pack.credits), packId: pack.id },
  });
  return session.url!;
}

/** Idempotent: a Stripe session only ever grants credits once. */
export async function fulfillCheckout(session: Stripe.Checkout.Session) {
  const builderId = session.metadata?.builderId;
  const credits = Number(session.metadata?.credits ?? 0);
  if (!builderId || !credits) return;
  const existing = await prisma.creditPurchase.findUnique({ where: { stripeSessionId: session.id } });
  if (existing) return;
  await prisma.$transaction([
    prisma.creditPurchase.create({
      data: { builderId, credits, amountCents: session.amount_total ?? 0, stripeSessionId: session.id },
    }),
    prisma.builder.update({ where: { id: builderId }, data: { credits: { increment: credits } } }),
  ]);
}
