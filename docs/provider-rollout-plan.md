# Provider Rollout Plan

## Rollout Principle

Choose the lowest-risk ingestion path per provider. Do not force Worker-native fetching when the provider is clearly better handled by external ingestion.

## Keells

- classification: `external-ingest`
- current evidence: this repo already avoids live Keells fetching and supports imported snapshot mode; a working Keells Puppeteer provider exists outside this repo
- recommended extraction method: Puppeteer/browser automation in the external environment, followed by transform into the snapshot contract used here
- main risks: region variance, challenge pages, Worker fetch instability, DOM drift in browser extraction
- recommended cadence: every 6-12 hours initially
- next short iteration: replace the checked-in sample import with a repeatable snapshot handoff from the external Keells job into the Worker read path

## Cargills

- classification: `needs investigation`
- current evidence: the implementation brief suggests likely client-rendered pages and possible frontend JSON/XHR hydration, but this repo contains no Cargills adapter yet
- recommended extraction method: inspect browser network calls first; prefer stable public JSON/XHR if present, otherwise inspect embedded page state before considering DOM parsing
- main risks: hidden API shape changes, JS-heavy rendering, partial product data, rate limiting
- recommended cadence: every 6-12 hours if a stable public endpoint is found
- next short iteration: validate whether a normal browser session exposes a usable public API or embedded JSON for a curated meat subset

## Glomark

- classification: `likely Worker-native`
- current evidence: the implementation brief describes Glomark as the easiest apparent public source, but that has not been validated in this repo yet
- recommended extraction method: start from a small curated set of public product or category pages; extract visible title, price, size text, stock, and canonical URL
- main risks: HTML drift, ambiguous pack-size text, category-page inconsistency
- recommended cadence: every 6 hours initially, possibly more often later if the source remains stable
- next short iteration: build a minimal Glomark adapter for 5-15 meat products and verify that Worker fetches return stable public HTML

## Future Supermarket Template

For each new provider, fill in this checklist before implementation:

- classification: `likely Worker-native`, `external-ingest`, or `needs investigation`
- public access check: can a Worker fetch the needed public data without login, challenge pages, or region failures?
- preferred extraction method: public JSON/API, embedded JSON, simple HTML extraction, or external browser automation
- normalized fields available: name, URL, displayed price, stock, pack size text, source product ID
- key risks: bot protection, region variance, unstable markup, sparse metadata
- initial cadence: usually 6-12 hours until stability is proven
- stop condition: if Worker-native access is unreliable, move the provider to external ingestion instead of overbuilding around bypasses

## Recommended Near-Term Order

1. Keep Keells on the external ingest path and wire its snapshots cleanly into the Worker read layer.
2. Investigate Glomark as the first Worker-native provider.
3. Investigate Cargills after Glomark proves the Worker-native pattern.
4. Standardize provider snapshot storage and freshness reporting once at least two providers are active.
