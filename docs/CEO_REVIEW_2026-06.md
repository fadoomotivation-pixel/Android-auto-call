# CEO Review & Execution Roadmap — June 2026

> A blunt, evidence-based product/strategy review written after a full audit of the
> live system (Supabase project `SalesAutoCall`), the Android app, the admin web, and
> all 35 migrations / 18 edge functions. This is the **"what to build, what to cut,
> and in what order"** companion to `STRATEGY.md`. Where the two disagree, the
> disagreement is called out explicitly below (see "Assumptions the live data
> disproved").

---

## 1. The one truth that matters most

**The core loop was 100% broken in production and nobody knew.**
At audit time the live DB had **67 calls, 0 successful recordings, 0 AI summaries — ever.**
Root cause: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` were never set as Supabase Edge
Function secrets, so every Drive upload failed silently and the failure reason was
swallowed. `GROQ_API_KEY` *was* set, so summaries would have worked the moment a
recording landed — but none ever did.

This is the company's #1 risk and it is a **process** problem, not a feature problem:
**features are declared "done" without end-to-end verification against the live
system.** We were on migration `0035` while migration `0010`'s feature had never once
worked. Until "done" means "verified against the live project," every new feature is
probably also half-wired.

**Operating rule adopted (see `CONFIGURATION.md`): a feature is not "done" until it has
been verified end-to-end against the live Supabase project, with the evidence written
down.**

---

## 2. Assumptions the live data disproved

`STRATEGY.md` names our **wedge #1** as: *"natively intercept + log Android SIM calls …
bypassing expensive cloud telephony entirely."* The live evidence contradicts this:

- Of 67 calls, **65 were `recording_source = 'sip'`** (cloud), only 2 were `sim`.
- **Zero** SIM recordings succeeded; the SIM path's rows are permanently stuck.
- Android 10+ structurally blocks third-party capture of the in-call voice stream.
  `SimRecorder`'s `VOICE_CALL → VOICE_RECOGNITION → MIC` fallback ladder is a losing
  battle that yields silence or one-sided audio on most Indian OEM builds.

**Reframed wedge:** the moat is the **in-app SIP softphone with server-side recording +
free AI summarization**, not SIM interception. SIM *dialing* stays as a no-recording
fallback. SIM *recording* should be retired. (This is a real strategic change from
`STRATEGY.md` and should be reconciled there once agreed.)

---

## 3. What's genuinely good — protect and double down

| Asset | Why it's a real moat |
|---|---|
| In-app SIP softphone (Linphone): two-way audio, background watchdog, OEM-autostart, boot receiver | The hard part, and it's built. Competitors deep-link to the system dialer. |
| Real-estate-shaped pipeline: New→Contacted→Interested→**Site Visit**→Proposal→Closed + temperature, budget, territory, multi-project interest | Strong domain fit. "Site Visit" as a first-class stage is correct. |
| Facebook lead ingestion + WhatsApp Cloud API (2-way inbox) | Exactly the right channels for Indian real estate. |
| Free AI summary pipeline (Groq Whisper + Llama) | Modern, ~₹0/run. Right idea — now actually wired. |
| Attendance (selfie + GPS, auto punch-out) | Fits Indian field-sales management reality. |
| Content trust layer (track brochure shares/opens) | Underrated buying-intent signal. |
| Multi-tenant + platform/super-admin | Built to resell from day one. |

---

## 4. What to CUT (bloat / dead weight)

**Android**
- **SIM call recording (`SimRecorder`)** — retire. Keep SIM dialing without recording.
- **In-app AI assistant chat (`assistant-chat`)** — a telecaller doesn't chat with a bot
  mid-shift. Cut, or narrow to "summarize this lead's history."

**Admin web — four overlapping manager-analytics surfaces exist:**
- `reports` (ReportBuilder) + `coach` (CoachPanel) + `manager-digest` + the
  `business-analyst-agent`/`sales-head-agent` agents all answer "insights for managers."
  **Consolidate to ONE.** This is the worst duplication in the product.
- **The two AI "agents" + their dashboard** — park until the spine works. The fake cost
  meter and mock data show it isn't real yet. This is resume-driven development.

**Backend / telephony**
- **Dual+ calling backends** (UrOperator SIP + self-hosted PBX `pbx-cdr` + SIM + a
  possible GSM gateway) multiply the exact audio bugs we fought across #108–#112.
  **Pick one primary backend and make it bulletproof.**

---

## 5. What's MISSING that real-estate sales actually needs

### 🔥 Flagship (build next): Speed-to-lead
For Facebook leads the deal is won or lost in the **first 60 seconds**. The plumbing
(`facebook-webhook`, `lead-capture`, `lead-reactivation`) is ~70% there. Finish the loop:
**lead arrives → auto-assign by territory/round-robin → push + auto-ring the rep with the
lead on screen → one-tap call → auto-logged + summarized.** Highest ROI in the product.

### 🧱 The real-estate spine (turns a "dialer + CRM skin" into a sales OS)
1. **Inventory / unit management** — towers, units, floor plans, price lists, live
   availability. Reps must quote price + availability *on the call*. "Projects" today is a
   label, not inventory.
2. **Site-visit lifecycle** — customer confirmation (WhatsApp), visit-done → feedback,
   no-show handling, post-visit cadence. Visits are where deals close.
3. **Booking / deal object** — token amount, agreement, registration, **payment
   milestones**, broker commission. The pipeline currently ends at "Closed" and stops.
4. **Follow-up cadence engine** — sequences (D0 call → D1 WhatsApp brochure → D3 call …)
   that auto-create the next task. Discipline is the product.

### 📈 Unfair-advantage plays
5. **Marketing ROI loop** — we run Meta ads *and* ingest the leads. Close
   **ad-spend → lead → call → site visit → booking, per campaign.** Almost nobody does this
   end-to-end; it's a potential wedge.
6. **Channel-partner / broker management** — CP onboarding, attribution, commission.
   Indian real estate runs on this.

### ⚖️ Before scaling call volume
7. **DLT / DND compliance + call QA scoring** (extend the AI summary into
   script-adherence + talk-ratio). A legal landmine in India, not optional.

---

## 6. Sequenced plan (do them in this order)

- **Phase 0 — Stabilize & instrument (now).** Adopt "verified-against-live or not done."
  Stand up a health board: % calls recorded, % summarized, % leads called within 5 min,
  % follow-ups completed on time. *Manage what you currently don't measure.*
- **Phase 1 — One calling backend + bulletproof recording/summary spine.** Standardize on
  cloud/SIP with **server-side** recording. Retire SIM recording. This permanently fixes
  recordings, audio, and summaries.
- **Phase 2 — Ship Speed-to-lead** (the flagship).
- **Phase 3 — Build the spine:** inventory → live quote → site-visit lifecycle → booking →
  payment milestones.
- **Phase 4 — Consolidate analytics to one surface; close the marketing-ROI loop; add
  DLT/DND compliance.**

---

## 7. Verdict

This is not a toy — there is a real product and a real moat (embedded softphone +
FB/WhatsApp + real-estate pipeline). But today it is **wide, shallow, and partially
wired.** The path to a fundable, sellable "real-estate sales OS" is the opposite of what
got us here: **stop widening, start deepening.** Harden the calling + recording spine, win
speed-to-lead, build inventory→site-visit→booking, and ruthlessly cut the AI-gimmick
surface area. Fifty features that each work 70% of the time is, in CRM terms, a churn
machine.
