# Implementation Brief

> **Note:** This file was the original planning document. The project vision has since been expanded. See the updated docs:
>
> - [Product Brief](docs/product-brief.md) -- vision, problem, users, scope
> - [PRD](docs/prd.md) -- detailed requirements, API spec, milestones
> - [Architecture](docs/architecture-big-picture.md) -- system design, ingestion strategies, schema
> - [Provider Rollout](docs/provider-rollout-plan.md) -- per-store implementation plan
> - [Keells Provider](docs/keells-provider.md) -- Keells API docs and capture automation

## Current State

The repo currently has:

- A working Cloudflare Worker serving `GET /api/products`
- Keells automated capture via Puppeteer + stealth (80 meat products)
- Normalization logic for pack sizes and unit pricing
- Import validation and seeded fallback

## What's Next

1. **Glomark adapter** -- Worker-native HTML fetch (server-rendered, no bot protection)
2. **Cargills adapter** -- Worker-native POST API (needs validation) or Puppeteer fallback
3. **KV storage** -- replace checked-in JSON with Cloudflare KV snapshots
4. **Frontend** -- comparison website with unit price sorting
5. **Local cron** -- automated Keells capture + push to cloud
