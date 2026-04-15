# Product Brief

## Summary

Build a Sri Lankan grocery price comparison app that exposes a small, reliable view of supermarket pricing data, starting with meat and expanding provider by provider.

## Problem

Sri Lankan grocery shoppers who compare supermarkets manually have to search multiple storefronts, interpret inconsistent pack sizes, and mentally normalize prices across grams, kilograms, and per-pack listings. That makes simple price comparison slow and error-prone.

## Users

- price-sensitive household shoppers comparing common grocery items
- operators who maintain ingestion jobs and need clear source health/freshness signals
- future frontend consumers of a simple normalized comparison API

## Scope

Initial scope:

- public read API for normalized grocery product snapshots
- normalized pricing fields, including `price_per_kg_lkr` where weight is available
- provider-specific ingestion paths chosen by operational reality, not by a single scraping pattern
- freshness and `source_status` metadata per provider snapshot

Current repo scope today:

- one Cloudflare Worker
- one `GET /api/products` endpoint
- one normalized product schema
- Keells meat data only
- imported snapshot mode plus seeded fallback mode

## Value

- faster comparison across stores without opening multiple supermarket sites
- consistent normalization of pack sizes and unit economics
- resilient architecture that can still ship useful data when some providers cannot be fetched from Workers

## Constraints

- keep extraction respectful and limited to public, unauthenticated data
- do not rely on anti-bot evasion or brittle infrastructure-heavy scraping
- some providers may be region-blocked, challenge-protected, or highly JS-driven from Cloudflare Workers
- this repo currently has no KV, D1, R2, or frontend
- unknowns must stay marked as unknown until validated

## Current Status

- this repo currently proves a narrow Keells slice: schema, normalization, import validation, seeded fallback, and Worker read API
- a working Keells provider exists outside this repo via Puppeteer
- that external Keells path should be treated as the current practical ingestion route for Keells until a Cloudflare-native path is proven safe and reliable

## Non-Goals

- full-site crawling across all supermarkets
- checkout, cart, auth, or user accounts
- guaranteed real-time prices
- historical analytics in this iteration
- forcing every provider through the same runtime when different ingestion paths are more practical
