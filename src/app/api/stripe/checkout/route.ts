import { NextRequest, NextResponse } from "next/server";
import { getAuthedBuilder } from "@/lib/auth";
import { createCreditCheckout, stripeEnabled } from "@/lib/billing";

export async function POST(req: NextRequest) {
  if (!stripeEnabled()) return NextResponse.json({ error: "Billing not configured" }, { status: 400 });
  const { slug, pack } = await req.json();
  const builder = await getAuthedBuilder(slug);
  if (!builder) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  try {
    const url = await createCreditCheckout(builder.id, slug, String(pack));
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Checkout failed" }, { status: 400 });
  }
}
