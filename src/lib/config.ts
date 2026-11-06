export const PRODUCT_NAME = process.env.NEXT_PUBLIC_PRODUCT_NAME || "PlanWalk";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
export const DEMO_MODE = !process.env.ANTHROPIC_API_KEY;
export const CREDIT_PACKS = [
  { id: "10", credits: 10, priceEnv: "STRIPE_PRICE_CREDITS_10", label: "10 model credits", usd: 49 },
  { id: "50", credits: 50, priceEnv: "STRIPE_PRICE_CREDITS_50", label: "50 model credits", usd: 199 },
] as const;
