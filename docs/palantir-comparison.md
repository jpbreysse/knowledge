# ArborSpace vs Palantir Foundry

*Competitive positioning source document. Read time: ~8 minutes. Deck-ready sections marked.*

---

## Executive summary — the one-line story

**Palantir proved the ontology-first architecture is worth billions. We deliver it as a finished vertical tool for one team, on your own servers — instead of a two-year enterprise platform build.**

Same conceptual spine, flipped every commercial dimension. This isn't "cheaper Palantir." It's Palantir's *validated architecture* delivered as *a working product* for a specific vertical.

---

## Section 1 — What Palantir got right *(deck-ready)*

We open with genuine respect. This is not marketing. Palantir spent a decade in defense, healthcare, financial services, and industrials proving these ideas at the highest stakes:

- **Ontology-as-decisions**, not just data. Their Ontology "is designed to represent the decisions in an enterprise, not simply the data." That reframes an entire category away from dashboards.
- **Data → Logic → Actions**. A clean three-word architecture that maps to every enterprise decision.
- **AI proposes, human decides**. Their AI agents "create proposals surfaced to an operator for a decision." Zero autonomous actions.
- **Similar situations retrieval**. Every decision is put in the context of past choices, so lessons learned compound.
- **Outcome capture feeds forward**. Actions that manifest in the world capture back into the Ontology.

**Buyers who deeply believe in the Palantir frame are pre-sold on ours.** We don't have to educate the market — Palantir has already done that.

---

## Section 2 — Concept-by-concept alignment *(deck-ready)*

Every capability that matters, mapped side-by-side.

| Concept | Palantir Foundry | ArborSpace |
|---|---|---|
| **Ontology of objects** | Object types (Foundry Objects) | `asset_class` — 29+ classes across 10 families, editable via admin UI |
| **Typed relationships** | Object links | `entity_link` table + `array_ref` fields |
| **Attributes** | Object properties | JSONB attributes per asset, class-declared field schema |
| **Guardrail rules** | Foundry Logic / OSDK Functions | `asset_rule` table with JSONLogic conditions *(v3.3)* |
| **Human-decides workflow** | AIP action reviews | Proposals inbox — findings with `type='proposal'`, `status='raised'` |
| **Similar-situations retrieval** | Ontology contextualisation | `PrecedentsPanel` — already shipped in v2.3 |
| **Outcome capture** | Actions that update the Ontology | Finding lifecycle (`raised → reviewed → accepted → mitigated → closed`) with reviewer and timestamps |
| **Semantic search** | AIP embeddings | LLM-assist retrieval layer *(v4.0)* |
| **Rule authoring** | Foundry Pipeline Builder, Functions, OSDK | JSONLogic UI + plain-English draft via LLM assist *(v4.0)* |
| **Cross-source integration** | Foundry pipelines, model adapters | Connector registry — HTTP calls to external stores, no shared FKs |
| **Governance & audit** | Foundry granular permissioning | `asset_history` audit trail + `kn_audit_log` on the Knowledge side |

**Every conceptual slot Palantir sells against, we have or have on the near roadmap.**

---

## Section 3 — Where we diverge *(deck-ready)*

The four strategic wedges. Each one is visible in Palantir's own docs.

### 3.1 Built-it-yourself vs delivered

Palantir Foundry arrives **empty**. Your engineers (or a Palantir Bootcamp squad) then spend 6–18 months building object types, wiring pipelines, authoring Functions, standing up Workshop apps. The value emerges when the platform is finally shaped — usually two funding cycles later.

ArborSpace arrives with the vertical **already shaped**: 29 asset classes for industrial equipment and project finance DD, seeded reference data, working rules, a proposals inbox, precedents retrieval, cross-app connectors. First real proposal fires the day after install.

> *"Palantir is the kit. ArborSpace is the thing, on day one."*

### 3.2 Cloud-mesh vs on-prem sovereign

Palantir's AIP Mesh and Apollo deployment infrastructure is **cloud-first** and requires their control plane. Data flows through their environment; audits happen against their systems; regulatory conversations become three-party negotiations.

ArborSpace runs on a **single machine or a Swiss-hosted server**. Three peer apps + Postgres + Docker. Open-source-friendly stack (SvelteKit, Postgres, ProseMirror). Air-gap-compatible. No data leaves the customer's walls.

For a Geneva-based family office, a Swiss private bank, a defence-adjacent engineering firm, a European regulator — this is the deciding factor.

### 3.3 Enterprise platform vs the team's tool

Palantir lands as a **$3M–$50M+ ACV enterprise program**. Procurement engagement, board approval, land-and-expand across departments. The buyer is a CIO or Chief Data Officer.

ArborSpace lands as **one desk's working tool**. The buyer is a function head, senior partner, or head-of-DD who can approve it directly. Priced like a specialised contractor, not a platform. Purchase cycle: weeks, not quarters.

**For a function head who can't get Palantir approved in 18 months, ArborSpace is available in 18 days.**

### 3.4 Horizontal breadth vs vertical depth

Palantir's Ontology can model **anything**. That's a strength for a $10B corporation and a weakness for a specialist firm — because "anything" means "start from scratch."

ArborSpace ships **shaped for DD and project-finance IE work**. The taxonomy, the reference classes, the seeded rules, the proposal patterns — all already there. If your business is DD, engineering advisory, or lender-side technical review, you skip 12 months of platform shaping.

---

## Section 4 — Commercial comparison *(deck-ready)*

| Dimension | Palantir Foundry + AIP | ArborSpace |
|---|---|---|
| **First-year ACV** | $3M – $50M+ | Small-team pricing (order of magnitude cheaper) |
| **Time to first real proposal** | 6–18 months | Days to weeks |
| **Consulting overhead required** | Palantir Bootcamps + system integrators | Zero — arrives finished |
| **Buyer archetype** | CDO / CIO with board mandate | Function head with signing authority |
| **Deployment posture** | Cloud (Apollo) or hybrid | Single-tenant on-prem or Swiss-hosted |
| **Data sovereignty** | Requires their control plane | Never leaves your walls |
| **Vendor lock-in** | Very high (proprietary platform) | Low (open-source stack, portable data) |
| **Regulatory conversations** | Three-way (customer + Palantir + regulator) | Two-way (customer + regulator) |

---

## Section 5 — The killer pitch line *(cover-slide candidate)*

> **"Palantir proved the ontology is the right idea. We deliver it as a finished tool for one team — on your own servers — with the rules for DD already wired between the register, the rules engine, and the findings inbox. The category leader spent billions proving the shape. We ship it Tuesday."**

Every clause is defensible. Every clause aligns with what Palantir themselves publicly claim as their strengths.

---

## Section 6 — Handling objections

Six real questions a sophisticated buyer will ask, and how to answer without overreaching.

### "Palantir has decades of R&D — you can't match their platform."

*"Correct. We're not trying to. We're delivering the specific architectural pattern they proved — the ontology-as-decisions frame — as a finished product for one vertical. Where they optimise for platform breadth, we optimise for time-to-value on a specific problem."*

### "What about scale? Palantir runs global deployments."

*"Palantir runs at the scale of a $10B corporation's operations. Your DD practice is 30 engineers, 40 mandates a year, 200 findings a month. The dataset fits comfortably on a laptop. Scale isn't the constraint — expert judgment is. Our design optimises for the actual bottleneck."*

### "Palantir has AIP. What's your AI story?"

*"Same architectural pattern: AI proposes, human decides. LLM assist is an opt-in layer on our roadmap for v4.0 — plain-English rule authoring, semantic retrieval, document extraction. Never as the decider. The domain model works with the LLM off, which is the correct governance posture. Palantir's AIP is a platform tenancy; ours is a hired assistant to the human."*

### "How do we know this won't just be a workflow app in six months?"

*"Because the ontology is the substrate, not a feature. Every capability — findings, rules, proposals, precedents — is built on the same class-driven object model. Adding a new vertical means adding class definitions, not rewriting the app. That's the Palantir pattern; we inherit it structurally."*

### "Can we hire consultants to help us set this up?"

*"You don't need to. The vertical is pre-shaped for DD and IE work. On day one, three or four rules are seeded, precedents work against the demo data, and the inbox is live. You'd only need consulting help if you want to codify custom rules from your senior partners' expertise — and even that is a one-day workshop, not a six-month engagement."*

### "What if we outgrow it?"

*"The architecture is three independent apps talking over HTTP. If one component isn't enough, replace it — swap the Knowledge app for your own findings system, or add a data warehouse alongside. Nothing is tightly coupled. This is architecturally the opposite of Palantir's lock-in."*

---

## Section 7 — Buyer archetypes *(useful for sales team)*

Who chooses each, and why.

| Buyer type | Chooses Palantir | Chooses ArborSpace |
|---|---|---|
| $10B corporation, CDO with $20M budget, 18-month horizon | ✓ | |
| Defence prime, cloud-approved, global data-integration mandate | ✓ | |
| Small-to-mid specialist firm, function head decision-maker | | ✓ |
| Swiss private bank, sovereignty non-negotiable | | ✓ |
| IE practice, 30 engineers, wants a tool working next month | | ✓ |
| Regulator-facing DD firm needing structured audit trail | | ✓ |
| Sovereign wealth fund's DD team | | ✓ |
| Family office corporate development team | | ✓ |
| Global energy major's asset-integrity function | Both plausible | Both plausible |

**The overlap is narrower than it looks.** Palantir wins when the buyer has enterprise scale, enterprise budget, and enterprise time. ArborSpace wins when the buyer is a function that needs to work now.

---

## Section 8 — Talking-point summary card

For the sales team to memorise. Six lines, delivered exactly:

1. *"Palantir's Ontology idea is the right idea. Ask any of their customers — the ones with results."*
2. *"They deliver it as a platform. We deliver it as a finished tool. Both work; they solve different problems."*
3. *"We're not trying to be Palantir at your scale. We're being Palantir at your team's scale."*
4. *"Their AI proposes and a human decides. Ours does the same. Both correct. Different price point."*
5. *"You can have it running on your own hardware next week. Not next year."*
6. *"If you outgrow us, three federated apps means you swap components, not the whole stack."*

---

## Appendix — Where Palantir's own docs help us

Language directly lifted from their public materials that maps to ArborSpace verbatim:

- *"The Ontology is designed to represent the decisions in an enterprise, not simply the data."* → matches our positioning: assets/rules/findings model decisions.
- *"AI agents create proposals surfaced to an operator for a decision."* → matches the proposals inbox.
- *"Data — the relevant facts. Logic — the guardrails. Actions — how a decision manifests in the world."* → same three layers, same order, delivered on our stack.

**We don't have to educate the market. Palantir has done that for us. We just have to say: *the same thing, for the team that needs it now.***
