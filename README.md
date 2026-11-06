# PlanWalk

White-label web app for custom home builders. A builder's clients upload a blueprint, house photos, or a written description; Claude extracts the floor plan into structured geometry; the client corrects it in a 2D editor; then they walk through the home in a first-person 3D viewer in the browser, share a link, or download a GLB model.

The product name is a placeholder. Change it with `NEXT_PUBLIC_PRODUCT_NAME`.

## How it works

1. **Upload** at `/b/<builder-slug>`. Blueprint pages (PDF or image, one page per story), house photos, or a text description. PDFs are rendered to images in the browser, so the server never needs PDF tooling.
2. **Extract** in `src/lib/ai/extract.ts`. Claude (`claude-opus-5-5` by default, structured output) returns walls, doors, windows, rooms, scale, and a list of assumptions. Blueprint sheets are extracted one at a time so large homes fit. Without an `ANTHROPIC_API_KEY` the app runs in demo mode and returns a built-in sample plan.
3. **Review** in `src/components/PlanEditor.tsx`. SVG editor over the original drawing: drag wall endpoints, add or move doors and windows, draw rooms, set the scale from a known dimension, add stories, pick roof and colors. Undo with Ctrl+Z.
4. **Walk through** in `src/components/Walkthrough.tsx`. three.js scene built procedurally from the plan (`src/lib/three/buildHouse.ts`): walls with cut openings, door leaves, glass windows, per-room flooring, ceilings, roof, floor labels. First-person WASD with wall collision, dollhouse orbit mode, floor switcher, screenshot, GLB export, share link.
5. **Share** at `/view/<shareId>`: public, branded, viewer-only.

The plan format is defined once in `src/lib/plan/schema.ts` (zod) and used by the extractor, editor, viewer, and API.

## Selling it

- `/admin` (password from `ADMIN_PASSWORD`) creates builders: name, slug, colors, starting credits. Each builder gets a private dashboard link containing their access key.
- Builder dashboard at `/b/<slug>/dashboard`: client projects, branding (logo, colors, tagline, welcome text, contact), and credit purchases.
- Each generated home consumes one credit. Edits and walkthroughs are free. Credit packs are sold through Stripe Checkout when `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the two `STRIPE_PRICE_CREDITS_*` price IDs are set. The webhook at `/api/stripe/webhook` grants credits idempotently.
- Subdomain white-labeling: set `NEXT_PUBLIC_ROOT_DOMAIN=planwalk.example.com` and point `*.planwalk.example.com` at the app; `acme.planwalk.example.com` serves `/b/acme`.

## Run locally

```bash
cp .env.example .env        # set ADMIN_PASSWORD, and ANTHROPIC_API_KEY for real extraction
npm install                 # also generates the Prisma client
npm run db:push             # creates data/app.db (SQLite)
npm run db:seed             # creates the "demo" builder and prints its dashboard link
npm run dev                 # http://localhost:3000
```

Visit `/b/demo` to try the client flow, `/admin` to manage builders.

## Deploy (Vercel)

1. Database: change `provider` in `prisma/schema.prisma` to `postgresql` and set `DATABASE_URL` to a Postgres URL (Neon, Supabase, Vercel Postgres). Run `npx prisma db push` once against it.
2. Uploads: add Vercel Blob to the project; `BLOB_READ_WRITE_TOKEN` switches storage from local disk to Blob automatically.
3. Set `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`, `NEXT_PUBLIC_APP_URL`, and the Stripe variables.
4. Extraction runs in a background `after()` task from the upload request; `maxDuration` is 300 s on those routes, which needs the Pro plan or a self-hosted Node server (`npm run build && npm start`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Prisma generate + production build (includes type check and lint) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Sync the database schema |
| `npm run db:seed` | Create the demo builder |

## Project layout

```
prisma/schema.prisma          Builder, Project, ProjectImage, CreditPurchase
src/lib/plan/                 FloorPlan schema, geometry helpers, demo sample
src/lib/ai/                   Claude extraction (blueprint / photos / text) and the runner
src/lib/three/                Procedural textures and plan -> 3D builder
src/lib/{db,storage,auth,billing,config}.ts
src/components/               StartProject, PlanEditor, Walkthrough, ProjectWorkspace
src/app/                      Landing, /admin, /b/[slug]/..., /view/[shareId], /api/...
src/middleware.ts             Optional subdomain -> /b/[slug] rewrite
```

## Roadmap ideas

- Furniture presets per room type, and a material picker inside the walkthrough.
- Stairs geometry between stories (today each story is a separate level you switch between).
- Photoreal exterior renders from the GLB via an image model, and Gaussian-splat captures from photo sets.
- Email the share link to the client (the email is already captured on the project).
