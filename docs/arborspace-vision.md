# ArborSpace — Vision & Direction

*Source document for pitch-deck authoring. Read time: ~5 minutes.*

---

## 1. The one-line pitch

**ArborSpace turns institutional judgment into a durable working tool** — the register, the rules of thumb, and the decision-record for a firm whose product is expert opinion on complex objects (deals, assets, engagements).

Not another dashboard. Not another PDF folder. A system that codifies what your senior people already know and helps every junior engineer, PM, and partner inherit that memory the first day they open it.

---

## 2. Who it's for

**Primary buyer**: a senior partner or function head at a firm where the deliverable is expert judgment — project-finance Independent Engineer practices, technical DD advisors, M&A DD houses, lender-side technical advisors, engineering consultancies with reusable methodology.

**Daily user**: engineers, project managers, and partners who currently juggle SharePoint folders, Excel trackers, and email threads. They want to spend their time on judgment, not filing.

**Broader market horizon**: any expert-services firm — insurance underwriting, credit review, litigation support, ESG diligence, corporate development — where the same conceptual model applies: complex objects + expert rules + repeatable decisions.

---

## 3. The core insight — three layers

Adapted from Palantir's proven Data → Logic → Actions frame, delivered as a **finished vertical tool** instead of a platform-you-build.

| Layer | ArborSpace | What it lets a user do |
|---|---|---|
| **Data** | Register of assets, deals, parties, findings, documents — with typed relationships and class-driven attribute schemas | *"Show me every lender we've worked with in the last five years and every deal they touched"* |
| **Logic** | Declarative rules that encode expert thresholds and known lender/sponsor patterns | *"Whenever an engagement involves IDB Invest, remind me about their E&S guardrails"* |
| **Actions** | Proposals surfaced to a human, decisions captured, outcomes fed forward as precedents | *"Look at how the team decided the last five times this rule fired"* |

**The moat is the loop, not the layer.** Every decision becomes tomorrow's precedent.

---

## 4. Architecture — three federated apps

Deliberately **not a monolith**. Three independent apps talking over HTTP, no shared databases, each owning its domain:

- **Asset Registry (port 5177)** — the register itself: assets, classes, links, attributes, connectors, rules.
- **Knowledge / Findings (port 5178)** — observations, proposals, decisions with lifecycle. The inbox.
- **Document Store (port 3001/5173)** — long-form authored documents (ProseMirror). Attached to findings and assets.

Any app can be swapped, replaced, or run standalone. This is what makes ArborSpace deployable in restrictive environments where one big platform is a non-starter.

---

## 5. What's built today

A running product, not slideware. Currently deployed as a demo at `localhost:5177`.

**Data layer** — solid and demonstrable:
- 50+ assets across two verticals (Lummus industrial equipment, LCI project finance, DD engagements) — pumps, motors, meters, sponsors, lenders, external advisors, engagements, IERs.
- 29 asset classes across 10 families, editable via admin UI.
- Class-driven attribute schemas with 9 field types (text, number, date, select, boolean, list, object, ref, array_ref).
- Typed cross-references between assets (`participates_in`) alongside the containment tree.
- Version chains for IERs and methodologies. Confidentiality per asset. Documents (uploaded + linked from external stores). Full search across all JSONB.
- Cross-app knowledge integration: findings on any asset, precedents from Group history, all served from a separate Knowledge database.

**Interaction layer**:
- `/graph` — Cytoscape.js visualisation of the register with typed edges.
- `/tree` — recursive containment tree.
- `Cmd-K` command palette — search assets, types, and connectors from anywhere.
- Per-asset detail page with Findings, Precedents, Version history, and Related-entities panels.

---

## 6. What's next — the transformation (v3.3)

The next release turns ArborSpace from a beautifully-shaped register into a system that **reasons over itself**.

**Rules engine on the asset side**:
- A `/asset-rules` admin UI where senior engineers author policies once (*"any pump with less than 1 year of life left is critical"*, *"any deal involving IDB Invest attaches their E&S checklist"*, *"any IER at v1.0-final without a lender sign-off is a blocker"*).
- Rules evaluate on every asset write (or on demand across the whole register). When they match, they emit **proposals** — findings with type `proposal`, status `raised`, linked to the triggering asset.

**Proposals inbox on the knowledge side**:
- Every rule-emitted proposal shows up in the Knowledge app's findings inbox.
- A human reviews, accepts, or rejects. That decision is captured with a lifecycle timestamp and reviewer identity.
- Accepted or rejected proposals become **precedents** the same rule surfaces the next time it fires on a similar asset. The Palantir "what have we done in similar situations" panel already exists (shipped in v2.3).

**Effort**: ~1.5 days end-to-end. See `docs/v3.3-spec.md` for the technical plan.

---

## 7. Where an LLM adds value — carefully

The LLM is a **drafting and retrieval aid**, never the decision-maker. Six real uses:

1. **Author rules in plain English** — the senior engineer types *"flag any pump whose life dropped below 1 year"* → LLM emits the JSONLogic + title template.
2. **Draft the proposal body** — when a rule fires, LLM composes a recommendation grounded in the actual data + past precedents, ready for a human to refine.
3. **Retrieve by meaning** — search for *"cavitation damage"* finds findings that describe *impeller erosion*, not just literal-string matches.
4. **Summarise the graph** — *"Give me a briefing on Meridian Energy Holdings across all our engagements"* returns one paragraph the partner can read before a call.
5. **Mine rules from decisions** — the LLM notices the team has manually flagged the same pattern seven times → suggests it become a rule.
6. **Extract structure from documents** — a 200-page FEED report gets its scope, technology choices, and risk items lifted into structured fields the rules can then reason over.

**Never**: autonomous action, authoritative financial figures, chat-for-chat's-sake. The domain model works with the LLM off.

---

## 8. Positioning vs Palantir

Palantir sells the Ontology idea to Fortune 500 companies as a **platform** — arrive empty, spend 12–24 months and $3M+ hiring their bootcamps to fill it. Magnificent kit. Not a thing that does DD next Tuesday.

ArborSpace inherits the same conceptual spine (validated by billions of Palantir's sales) but flips every commercial dimension:

| Palantir | ArborSpace |
|---|---|
| Empty ontology; build it yourself | Pre-shaped for DD / IE / project finance |
| Cloud-first, requires their infrastructure | Runs on a laptop or a Swiss server — no data leaves your walls |
| $3M+ enterprise program, 12–24 months to first value | One-desk tool at contractor prices, working today |
| Land-and-expand via procurement | A partner can approve it directly |

**The pitch line**:

> *"Palantir proved the ontology is the right idea. We deliver it as a finished tool for one team — on your own servers — with the rules for DD already wired between the register, the rules engine, and the findings inbox. The category leader spent billions proving the shape. We ship it Tuesday."*

---

## 9. Six worked business scenarios

Concrete moments that make the pitch land:

1. **Pump running out of life** — engineer updates RUL to 0.5 year → rule fires → *critical* proposal → schedules refurb. Rule caught it; nobody had to remember the threshold.
2. **Lender with known behaviour** — new deal with IDB Invest as syndicate lead → rule attaches their E&S checklist proposal. Junior engineer inherits five deals' worth of memory.
3. **Sponsor risk pattern** — engagement with a "thin engineering capacity" sponsor → recommend supplementary FEED review. Pricing decision surfaces the risk before the mandate is priced.
4. **Missing sign-off** — IER marked v1.0-final without a lender counterparty recorded → *critical* blocker proposal. Compliance gate that used to be a checklist now runs on every save.
5. **Jurisdictional pattern** — pipeline in Peru → suggest indigenous consultation gate. Hard-won lesson from 2023 becomes an automatic reminder on every similar deal.
6. **Slipping commitment** — RFI response owed for 62 days → *medium* escalate proposal. Nothing quietly slides off the radar.

---

## 10. Roadmap horizon

| Release | Delivers | Effort |
|---|---|---|
| **v3.3** (next) | Rules engine + proposals inbox + rule-fired precedents | 1.5 days |
| **v3.4** | Accept-with-side-effect callback (accepting a proposal applies the change), bulk decision UI, structured builder for JSONLogic rules | 2–3 days |
| **v4.0** | LLM assist layer — rule authoring in plain English, semantic search, briefing summaries, document extraction | 1–2 weeks |
| **v4.1** | Multi-tenant, real auth, audit exports for regulators | 1–2 weeks |

Each release is standalone. Each one closes a specific gap. Nothing pretends to be more than it is.

---

## 11. What "success" looks like at a demo

A prospect should walk away thinking:

- *"This is Palantir's ontology, but I could actually deploy it."*
- *"I could see my senior partner writing three rules in an afternoon and having them fire on every mandate we take forward."*
- *"The junior engineers on our team would be productive faster with this."*
- *"The regulators would love the audit trail."*
- *"I don't need my IT department's approval — it runs on a laptop."*
- *"I'm not buying a platform. I'm buying a tool that starts working the moment we plug in our data."*

That's the entire pitch. Everything else is proof.

---

## Appendix — deployment posture

- Single-binary SvelteKit apps + PostgreSQL + one Docker container for the DB.
- Runs offline. No external API dependency in the core path (LLM assist is opt-in, can point to an on-premise model).
- Open-source-friendly licensing. Swiss-hostable. Air-gap-compatible.
- Sovereignty is not a feature — it's the architecture.
