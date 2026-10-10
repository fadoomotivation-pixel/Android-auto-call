# AGENT SYNC LOG — read me first

Two AI agents work on this repo: **Claude Code** and **Antigravity**. You cannot
see each other's chat. This file is how you talk to each other. **Read the top
entry before you start, and add an entry after every change.**

---

## NON-NEGOTIABLE RULES

- **Branch:** work only on `claude/fanbe-crm-android-app-wfjzcb`. Never push to `main`.
  `main` only changes by merging a green PR.
- **Merge first, always:** before editing, run
  `git fetch origin && git merge origin/main`. After the other agent pushes, do it again.
- **Supabase project:** SalesAutoCall = `rqgkzamuohdvttnkluzn` ONLY. Never touch the
  separate Fanbe-CRM project `mfgjzkaabyltscgrkhdz`.
- **Verify every push:** the "Build Android APK" CI runs on changes under `android/**`.
  Green = safe. Red = read the failed job log, find the `e:` (Kotlin) / Gradle error,
  fix, push again. No new work on a red build. (Changes that touch ONLY `admin/` or
  `supabase/` don't trigger this CI — verify those with `tsc` / by deploying.)
- **Never commit secrets** (UrOperator `FS_…`, `GROQ_API_KEY`, Google client secret,
  service-role keys). They live in DB rows, Vault, Vercel env, or Supabase function secrets.
- **Small, single-purpose PRs**, build-verified, then merge.

## KNOWN BUILD-BREAKERS (check before pushing)
- Missing `import androidx.compose.material3.<Symbol>` (e.g. IconButton, AssistChip).
- A `@Composable` annotation drifting above the wrong `fun`.
- `AndroidManifest.xml` `<service>` conflicts → **keep BOTH sides**: ManualCallService &
  AutoDialerService (`phoneCall|microphone`), SipBackgroundService, SalesConnectionService,
  and every permission either agent added. Never delete the other's service/permission.

## OWNERSHIP (avoid stepping on each other)
- **Claude Code:** Supabase (migrations, edge functions), `admin/` Next.js web,
  call/recording services, auth/session, the AI features.
- **Antigravity:** in-app Compose UI **only when the user explicitly asks** (the user owns
  the app UI). If you must touch the other's area, keep it minimal and log it loudly.

---

## 2026-10-10 — Grok Bot (iOS Leads + lead page, Ask Coach from anywhere)

- **Leads:** no Material app bar on this tab (MainShell skips `TopAppBar` for `Tab.Leads`). `IosNavBar` (new `leading` slot: menu; trailing: settings) + `IosLargeTitle("Leads")` that collapses on scroll. New `IosSearchField` in IosKit. Filter chips are ONE horizontally scrolling capsule row (`IosChip(selectedColor = systemBlue)`), every count kept. Lead rows are an inset-grouped list (`LocalGroupedRow` makes `LeadCard` flat; group draws corners + hairlines). Same numbers, filters, queues, Call all / Call N.
- **Lead page order:** header → Budget/Last talk → next step → **Sales funnel** → **Close this lead** (own section) → How that call went → What to say → Wada / visit check → rest. `SectionCard(header, footer)` puts grey uppercase headers outside the card. What to say uses `IosSegmented` (now supports `-1` = none picked); stored facts are hairline rows, not a grey box.
- **Ask Coach (`ui/AskCoach.kt`):** `CoachDock` = coach orb tucked half into the right edge, drag up/down only inside 18%–62% of screen height (never over Call bar/nav), hidden during any call/dialler, Settings, post-call and assistant sheets; "Hide for today" reuses `AppPrefs.coach_hidden_date`. Never auto-opens; #514 timing untouched. Answers: `Repository.coachAskGrounded` → existing `rep-coach` `mode:"ask"` (match_knowledge). No new store, no new scheduler.
- **Edge fn `rep-coach`:** ask mode now returns `facts` (how many brain notes grounded the answer) and `answer: null` instead of a fake "Couldn't write…" string. Old app builds already treat null as "No answer yet". Deploys on merge to main.

## 2026-10-09 — Grok Bot (iOS design system on every screen + animated AI Coach)

- WHAT: **iOS design system.** One set of tokens and components drives every screen: iOS system colours (`IosColors`: systemBlue, green, red, orange, indigo, grays, #F2F2F7 grouped background, white cells, 0.5dp separators), an SF-like type scale in `AppType` (largeTitle, title2/3, headline, callout, subhead, footnote, caption), continuous (squircle) corners 10–16dp (`ContinuousShape`, `Radii`), and `IosKit.kt`: haptics, spring press (`iosPress`), `IosGroup`/`IosRow`/`IosIconTile`, green `IosSwitch`, capsule `IosChip`, sliding `IosSegmented`, `IosActionSheet` (replaces the purple Material dropdowns: Lead page More, Leads deck menu, Calls period), `IosNavBar` with a collapsing title (Settings), and `CoachOrb`. The purple menus, sheets and dialogs came from Material3 `surfaceContainer*` colours the theme never set; they are white now (`Theme.kt`). Cards lost their 1dp outlines (white on grey). The drawer is light (it was dark): a brand tile, "Today's opportunities" group, Main and More groups with icon tiles, red Sign out — every item, number and order kept. Calls tabs are a segmented control; Follow Ups and Calls use the large title. Every behaviour, number and warning is unchanged.
- WHAT: **AI Coach (no popups, no scheduler, no new tables).** (1) A Coach card on Home (orb + one summary line, collapsed). It opens on a tap, or by itself only when the rep is idle (no call, dialler/Call-all not running, no sheet or pending update, app in front 3+ minutes), at most once every 3 hours and only for something new. Inside: the site-visit check (Yes / No / Rescheduled — same `answerVisitHappened` / `postponeVisit` writes as the assistant), last scored call (done well, try next time, and one exact line from the company playbook), and Learning time (weakest repeated pattern in the last 20 scored calls + the playbook reply; "Got it" closes it for the day, opens itself at most once a day). (2) Lead page: the orb on "How that call went" plus the playbook line for this lead, and the same visit check when the server lists this lead's visit as waiting. (3) **Coaching time:** after 5+ more calls today, at the first break (no live call, Call-all paused or finished, no pending update), a card slides up above the tab bar with the character: today's scored calls, average, what went well, what to work on and a playbook line. It hides the moment a call starts, never blocks the screen, at most every 30 minutes and 6 times a day, and does not show if none of today's calls is scored yet. (4) **Morning greeting:** first open of the day before 1 PM, the character says Good morning at the top of Home with today's plan: follow-ups due today and the ones missed (by name, up to 3 each), each with the last call summary (`call_logs.summary`, else lead memory), the latest captured WhatsApp (`wa_observed_messages`, Baileys) and an opening line (Focus-five opener, else the playbook reply for the lead's objection). Missing data is said plainly ("no summary yet", "no message captured", "no saved line"); if capture is down or not linked the card says so in one line. One tap closes it.
- DATA (all reads, existing RLS): `coach_feedback` (+ `call_logs.contact_id`), `knowledge_chunks` (objection faq rows, own company or global), `lead_memory`, `follow_ups`, `call_logs.summary`, `wa_observed_messages` (own rows, not deleted), `v_pending_site_visit_outcomes`, focus-five picks. Rate limits live in AppPrefs (`coach_*` keys).
- FILES: `android/.../ui/design/{AppColors,AppSpacing,AppType,Components,IosKit}.kt`, `ui/Theme.kt`, `ui/{AppRoot,CallsScreen,FeatureScreens,LeadDetailScreen,MoreScreens,TelecallerScreens,TodayFunnel,MainViewModel}.kt`, new `ui/{CoachEngine,CoachCard,CoachMoments}.kt`, `data/{Models,Repository,AppPrefs}.kt`, `docs/AGENT_SYNC.md`.
- WHY: Founder asked for a true iOS look on every screen and an animated coach that helps between calls without interrupting.
- BUILD: `assembleStandardDebug` passed locally on JDK 17. No migration, no SQL file, no edge-function change, no Supabase write, no admin change.
- NEXT/NOTE: The playbook line needs `Objection: "..."` faq rows with a `Winning reply:` in `knowledge_chunks` for the rep's company; without them the coach says the playbook has no reply. Coaching time and the morning card are in-app only, computed when the app is open — not a reminder scheduler. Do not turn any coach surface into a popup. Never put a SubcomposeLayout under an IntrinsicSize parent. Every rule below stays: no post-call popup, no fourth Follow-up tab, no second scheduler, no separate knowledge store, no count on the Follow-up chip, no capture-down banner, no Hindi in UI chrome.

## 2026-10-09 — Grok Bot (phone: lead page crash fixed, iOS polish on Home, Leads and Lead page)

- WHAT: **Crash.** The lead page crashed as soon as the Sales funnel card came on screen. PR #510's `FitOneLine` measured inside `BoxWithConstraints`, which is a SubcomposeLayout. The "Close this lead" row asks its children for their intrinsic height (`Row.height(IntrinsicSize.Min)`), and Compose 1.7 throws `IllegalStateException` on any intrinsic query that reaches a SubcomposeLayout. `FitOneLine` is now a plain `Layout` that measures the text itself, so it is safe inside any parent. It still shrinks a word to fit and never splits it. Also made safe: voice-note rows are keyed by position as well as id, because a duplicate key crashes a LazyColumn. A lead that vanishes from the list now closes the page from an effect, not with a state write in the middle of composition. **Home, Today's Plan:** rows are an iOS grouped list on the card, with an inset hairline between them instead of a tinted box each. Each row shows the name (16sp semibold), a small status tag, ONE reason line, then a quieter second line with what they said last time. Those two used to be joined with " · " into three grey lines. The Call button is a soft 40dp disc inside a 48dp touch target. Tapping a row opens the lead. **Leads:** the deck's Due / Hot / New / Revive counters and the six-tile work grid are now ONE wrapped filter row: Call now, Overdue, New, Hot, Due today, No step, Later, Visit, and Revive when it is above 0. Every count is still there, and a 0 chip is faded and not tappable, as before. The Next call card dropped "362 waiting" and has two buttons: "Call <name>" and "Call all N". While that card is showing, the Call now chip leaves out its count because "Call all N" is the same number. When the card is hidden (searching, selecting, nothing due) the chip shows it. Call now is still `callNowContacts`. **Lead page:** the cards have no outline now (white on the grey canvas), with one radius (`Radii.card`), a 16dp inset, 16dp padding and 16dp between cards. Section titles use the app's small grey section label. Budget and Last talk are bigger, and the hero lines up with the cards. The bottom bar is solid with a hairline on top. The old 20dp see-through fade let a card show behind the "why due" line.
- FILES: `android/.../ui/LeadDetailScreen.kt`, `android/.../ui/TelecallerScreens.kt` (`WorkGrid` and `DeckStat` removed, no callers left; `LeadSegments` + `SegChip` added), `docs/AGENT_SYNC.md`.
- WHY: Founder screenshots. The lead page crashed after #510. Home rows were dense grey text. Leads said 362 three times before the first lead.
- BUILD: `assembleStandardDebug` passed locally on JDK 17. No migration, no Supabase write, no admin change. MainViewModel is unchanged.
- NEXT/NOTE: Never put `BoxWithConstraints`, a Lazy list, or any other SubcomposeLayout under an `IntrinsicSize` parent. Every rule from the notes below stays: no post-call popup, no fourth Follow-up tab, no second scheduler, no separate knowledge store, no count on the Follow-up chip, no capture-down banner, no Hindi in UI chrome.

## 2026-10-09 — Grok Bot (Demo account: a made-up builder to show Call Pro AI)

- WHAT: A super-admin-only "Demo account" tab (Today → Demo account, plus a button on Overview) opens a made-up company "Sunrise Infra (Demo data)" with 30 days of example data: ₹1,00,000 demo Meta spend, 600 leads, 45 site visits, 5 bookings (3 won, 2 token paid) = ₹20,000 per booking, 9 hot leads the app saved, 3 projects, 3 telecallers, calls in every stage, follow-ups due today and overdue, upcoming visits, 7 objection → reply entries for the AI brain, and coach notes. Every demo screen shows a "Demo data" banner. Ad numbers live in `demo_ad_spend` and show only inside the demo company. Opening the demo page (or Overview with the demo picked) calls `demo_refresh()`, which moves all demo dates forward by whole IST days so "today" always looks like today. The all-companies Overview, money card and HQ leave the demo out.
- FILES: `supabase/migrations/0222_a_demo_company_a_founder_can_show.sql` (generated; do not hand-edit), `supabase/demo/generate_demo_seed.py` + `supabase/demo/parts/*.sql` (source), `admin/lib/dashboard/{demo,nav}.ts`, `admin/app/dashboard/demo/page.tsx`, `admin/app/dashboard/{DemoBanner,Chrome,MoneyCard,page}.tsx`, `admin/app/dashboard/platform/hq/page.tsx`, `admin/app/globals.css`, `docs/AGENT_SYNC.md`.
- WHY: The founder wants to show builder founders a realistic, not overhyped, picture: ads at least earn back their cost, and calls on time save hot leads.
- BUILD: `tsc --noEmit`, `next lint` and `next build` pass. The SQL was tested on a local Postgres with copies of the prod triggers (seed, re-run, stale-date refresh, non-super-admin refused, real company untouched). NOT applied to Supabase: the founder applies 0222 by hand in the SQL editor. No Android change: the app already shows the company name "Sunrise Infra (Demo data)".
- NEXT/NOTE: To change demo data, edit the generator or `parts/`, then regenerate the 0222 file (or a new migration) with the hash files; never put the demo password in the repo. Demo phones are fake +91555… numbers on purpose. Super-admin all-company lists (Contacts, Calls, Leaks, pickers) still show the demo as its own company labelled "(Demo data)". AI crons (e.g. win-harvest) may also read demo leads.

## 2026-10-09 — Grok Bot (admin: ten sections, money card, Health dot, Call Pro AI name)

- WHAT: The admin sidebar is ten sections instead of ~37 links: Today, Leads, Calls, Funnel, Team, AI Coach, Ads (Meta), WhatsApp & Automation, Health, Platform. Each section opens its first page, and the other pages of that section are tabs under the title. Every page is still the same page at the same URL, so no feature, link or bookmark changed, and `?company=` is carried by both the sidebar and the tabs. Who sees a tab is exactly who saw the old link (rules in `lib/dashboard/nav.ts`). A search box at the top of the sidebar jumps to any page (`/` or Ctrl/Cmd+K). Overview opens with a money card: Meta ad spend, bookings from ads, cost per booking, and tokens paid, last 7 days against the 7 before. Spend comes from the same `ads-insights` read Ads Manager uses, so it shows only for the super admin with no company picked; everyone else sees "—" with the reason, never a 0 we did not measure. Health in the sidebar gets a red dot when WhatsApp capture is down, a phone's call sync is broken, or a recording failed in the last 24 hours, and a grey dot when that could not be read. The big red WhatsApp-capture block under the top bar is now one clickable line to Health, still on every admin page; its full detail moved to the top of Health. "SalesAutoCall" is now "Call Pro AI" in the sidebar, login, browser tab and the new Drive folder name.
- FILES: `admin/lib/dashboard/nav.ts`, `admin/lib/dashboard/healthSignals.ts`, `admin/app/api/health-signal/route.ts`, `admin/app/dashboard/{Sidebar,Chrome,SectionTabs,MoneyCard,CaptureOutageBanner,page}.tsx`, `admin/app/dashboard/health/page.tsx`, `admin/app/globals.css`, `admin/app/login/page.tsx`, `admin/app/api/gdrive/callback/route.ts`, `admin/README.md`; `NavLink.tsx` removed (unused). `docs/AGENT_SYNC.md`.
- WHY: The founder found 37 links confusing and wanted to control the business from one calm place.
- BUILD: `tsc --noEmit`, `next lint` and `next build` pass locally. No migration, no Supabase write, no Android change (the app name was already Call Pro AI).
- NEXT/NOTE: Add a new page as a tab in `nav.ts`, not as a new sidebar link. Do not bring back the full-width capture block; the one-line notice must stay on every admin page. The notes below stay.

## 2026-10-09 — Grok Bot (lead page: funnel labels fit, next step on top)

- WHAT: The lead page's sales funnel no longer breaks "Contacted" / "Interested" mid-word on a ~400dp phone. Each step is as wide as its word needs, and the word stays on one line. It shrinks a little only under a huge system font and never splits. A "Now: <stage> · Step N of 7 · Next: <stage>" line sits above the circles. A lead off the funnel says so in amber. Tapping a step runs the same logic as before. Callback is its own blue button. Not interested, Lost and Do Not Call sit together under "CLOSE THIS LEAD" in red, away from the funnel. The next-step banner moved to right under the name. The hero shows BUDGET and LAST TALK side by side ("Not known yet", "Never called", "No real talk yet · N calls, all under 30s", "Could not load calls"). The title bar lost its second Call and WhatsApp, so Call is only in the pinned bar. Calls under 30s with nothing to play stay listed, but small and grey. Their warning text is still shown in full. Call times are local, not the raw UTC string. Quick notes are a two-column grid. The bottom nav gap is painted, so content no longer shows between the action bar and the nav.
- FILES: `android/.../ui/LeadDetailScreen.kt`, `android/.../ui/MainViewModel.kt` (one flag: `leadDetailCallsFailed`, so a failed call read is not shown as "No calls logged"), `docs/AGENT_SYNC.md`.
- WHY: Founder screenshot. Funnel labels were breaking mid-word, a Quick-notes chip showed between Call and Home, and "what do I do now" was a scroll away.
- BUILD: `assembleStandardDebug` passed locally on JDK 17. No migration and no admin change.
- NEXT/NOTE: No post-call popup, no fourth Follow-up tab, no second scheduler, no separate knowledge store, no count on the Follow-up chip, no capture-down banner, no Hindi in UI chrome. The notes below stay.

## 2026-10-05 — Cursor (one Call now, and a quiet failure says so)

- WHAT: Call now is one list everywhere it is named: overdue or call_now, via callNowContacts. The Leads Call now tile, its Call button, Home's due count, the three plan rows, and "+N more" all use that list. Overdue stays a late slice and says those people are already in Call now. Leads and pending follow-ups page past the old 500 and 300 caps. Opening WhatsApp while capture is not live still opens WhatsApp, does not mark the draft opened, and toasts draftWarning. Retry is no-answer or busy inside the due set, not brand-new leads. The drawer opportunities number is Call now, or a dash when that read failed with nothing kept. The Calls tab that was Follow-up is No answer. A lead call with a harvest miss stays on the recordings list; an unlinked call that matches a lead phone is linked, and a failed link does not drop the row. Booked and Lost from the visit prompt set the stage and leave Call now immediately, and come back if the write is rejected.
- FILES: CallNowQueue.kt, TelecallerScreens.kt, MainViewModel.kt, Repository.kt, CallsScreen.kt, AppRoot.kt, ManualCallService.kt, CaptureHealth.kt, docs/AGENT_SYNC.md.
- WHY: The same words were counting two queues, a 500-row window hid older new leads, and a cleared draft looked like a saved send.
- BUILD: assembleStandardDebug. No migration. Do not apply one. Merged onto main after #504 and #505. The today card still counts by deal stage. Failed recordings and the valueless Purchase stay as in the note below.
- NEXT/NOTE: No post-call popup, no fourth Follow-up tab, no second reminder scheduler, no separate knowledge store, no count on the Follow-up nav chip, no capture-down banner, no Hindi. The notes below stay.

## 2026-10-05 — Cursor (failed recordings, Purchase value, company link)

- WHAT: The recordings page lists failed harvests under the playable table and shows "—" if that read fails. A Purchase is not marked sent until the token amount is above zero, so a missing amount cannot block a later valued send. Overlapping sends claim the row before the Meta post. The event id stays the lead id plus the event name. Facebook, Pulse, X-Ray, and Coach open `?company=` instead of the first company by name. Retry stays disabled while it runs.
- FILES: recordings page, facebook page and client, pulse, xray, coach, `meta-capi`, `facebook-manage`.
- WHY: A missed file looked like an empty day. A valueless Purchase with ok=true could not be sent again with an amount. The Facebook link ignored the company in the address.
- BUILD: admin tsc. No migration. No Android.
- NEXT/NOTE: Notes below stay.

## 2026-10-05 — Cursor (today's funnel counts the deal stage)

- WHAT: The today card still has the same six steps. A lead is counted by her deal stage, not by the last call outcome. A no-answer on an Interested lead stays Interested. Token paid today counts as Booked. New means the lead is still in the New stage (assigned, created, or still there today), not "assigned today" under that label. A failed lead read still says "Could not load today's funnel." A morning that loaded and is empty still shows 0. Visit-day chips and the Booked/Lost leave-on-tap stay.
- FILES: `android/.../ui/TodayFunnel.kt`, `docs/AGENT_SYNC.md`.
- WHY: A missed call was moving an interested lead into Contacted, and a token paid today never reached Booked.
- BUILD: `assembleStandardDebug` green locally on main after #500. No migration.
- NEXT/NOTE: The funnel note below stays. No fourth tab, no popup, no second scheduler, no new store, no chip total.

## 2026-10-05 — Cursor (today's funnel and the next visit step)

- WHAT: Home shows today's funnel (New, Contacted, Interested, Visit asked, Visit done, Booked) for leads touched today, IST, one step each, furthest step wins. Call now on that card is the same list as Due now. A failed lead read says "Could not load today's funnel." A failed due read shows "—" and the existing "Could not load who is due" line. It does not draw a quiet 0. People who promised a visit and still have no day are one sentence on that card. Follow-ups and Today's Plan show visits waiting on an outcome from `v_pending_site_visit_outcomes` (the list Pulse already uses). Ask counts come from `rep_prompts.kind = visit_check`, not from the view's times_asked column. Two answers of "not yet" stop the visit prompt; a dismissal does not. After Interested, the next chips are Tomorrow 4 PM, Sunday 11 AM, Other day, or Call again instead. There is no "Save without a reminder" on that path. A future visit leaves Call now as awaiting_visit on the tap. Booked and Lost already left on dispose; the assistant visit answers now do the same, and come back if the write is rejected. An arrival with no outcome reads "They came. The outcome is not written."
- FILES: `android/.../ui/TodayFunnel.kt` (new), `TelecallerScreens.kt`, `LeadDetailScreen.kt`, `MainViewModel.kt`, `data/Models.kt`, `data/Repository.kt`, `data/AppPrefs.kt`, `docs/AGENT_SYNC.md`.
- WHY: 542 leads, 0 booked. 82 agreed a visit on a call, 11 reached the site-visit stage, 70 got no WhatsApp. The day stalled because the easy tap after Interested was another call, or no day at all.
- BUILD: `assembleStandardDebug` green locally after rebasing onto main (#503, #502, and #501 already merged). No migration applied. Migration 0218 is already in the tree and still says "applied by hand". The founder applies it. Until then the phone counts visit_check itself, which is what 0218 will make the view count.
- NEXT/NOTE: No fourth tab, no post-call popup, no second scheduler, no new knowledge store, no chip total, no Hindi. Company-wide visit reasons stay on Pulse. `settle_followups` is unchanged. The phone still does not show a capture-down card (#501). A draft is still not marked opened unless capture is live. Stored lead memory, the faster-day next lead, and the recording warning stay. The notes below are kept, not replaced.

## 2026-10-05 — Cursor (lead list rebased onto main after #501)

- WHAT: Rebased the Apple lead list, the lead sheet, and the windowed scroll onto main. The recordings apostrophes were already escaped on main, so this branch does not edit that page. Both sync notes below stay.
- FILES: `docs/AGENT_SYNC.md` for this note. The lead files are the commit under it.
- WHY: #501 landed on main and the sync log conflicted.
- BUILD: admin `tsc` after the rebase.
- NEXT/NOTE: Capture-down and CAPI notes stay under the lead-list note.

## 2026-10-05 — Cursor (lead list and lead page, Apple chrome, faster scroll)

- WHAT: The lead board and the lead sheet use the same Apple chrome as the rest of the dashboard. One grouped list, calm selected rows, status pills, and the real stage funnel on the lead. The list windows rows, memoizes each row, builds row text once, and waits before a search hits the server. A failed load, count, or stage read says so. Counts stay "—" until they arrive.
- FILES: `admin/app/dashboard/leads/` (list, row, funnel, history), `admin/app/globals.css`, `docs/AGENT_SYNC.md`.
- WHY: Those two screens still read as a generic admin, and a few hundred lead cards made the scroll hitch.
- BUILD: admin `tsc`. No migration, no edge function, no Android.
- NEXT/NOTE: Other CRM pages stay out of this PR. Rebased onto main after #501. The capture-down and CAPI notes below stay.

## 2026-10-05 — Cursor (phone hides capture-down; recordings are lead calls only)

- WHAT: The phone no longer shows a WhatsApp capture-down card on Home, Leads, Follow-ups, or the lead page, and the draft card no longer says capture is down. The phone still does not mark a draft opened unless capture is live. The Calls recordings list (App, Missed, Follow-up) keeps only calls linked to a lead or to a lead's phone. A number that is not a lead is left out. There is no "not a lead" row. Recording failures on a real call still show. Admin capture health is unchanged.
- FILES: `CaptureDownCard.kt` (removed), `TelecallerScreens.kt`, `LeadDetailScreen.kt`, `CallsScreen.kt`, `AudioPlayer.kt`, `CaptureHealth.kt`, `docs/AGENT_SYNC.md`.
- WHY: Telecallers should not see "WhatsApp capture is down". A recording that is not a lead should not appear.
- BUILD: `assembleStandardDebug` green locally. No migration.
- NEXT/NOTE: Dashboard capture banner stays. The Phone tab is still the handset log.

## 2026-10-05 — Cursor (dashboard routes open faster)

- WHAT: The nine slow dashboard routes share one cached identity with the sidebar, and the WhatsApp capture check no longer holds the page. Facebook, Pulse, X-Ray, and Ads start their reads on the server. RAG counts in parallel and does not pull the fact list until it is opened. Leaks and telecaller activity start the drill-in queries with the list. Attachment links mint after the thread text is on screen. Loading states stay labelled as loading.
- FILES: `admin/lib/dashboard/scope.ts`, `admin/app/dashboard/layout.tsx`, and the facebook, rag, coach, ads, pulse, xray, actions, leaks, and telecallers-activity routes.
- WHY: Those pages waited on serial Supabase calls, and several waited for client JavaScript before the first query. A failed or unfinished read was easy to see as an empty day.
- BUILD: admin `tsc`. No migration. No Android.
- NEXT/NOTE: Leads list and detail were not touched. Recordings apostrophes stay escaped as `&apos;` so `next build` can finish.

## 2026-10-05 — Cursor (CAPI purchase value, failed-event retry, creative count)

- WHAT: `meta-capi` sends Purchase `value` and `currency` (INR) only when `contacts.token_amount` is a real number above zero. A budget is not used. A failed post is no longer treated as already sent: the same lead+event is retried, the `capi_events.response` column stores attempts, the value source, and the Meta body, and it stops after 5 failures. Facebook setup shows the failed count and a per-company Retry button (`facebook-manage` action `retry_capi`). The Ads page counts distinct ads, campaigns with a single ad, and tired ads from the rows already loaded, and says this does not turn Meta delivery on. The advisor prompt no longer says Andromeda is something we optimise as if it were switched on, and it is told not to promise housing returns. The Facebook status trigger is unchanged.
- FILES: `supabase/functions/meta-capi/index.ts`, `facebook-manage/index.ts`, `ad-advisor/index.ts`, `admin/app/dashboard/facebook/page.tsx`, `admin/app/dashboard/ads/AdsManager.tsx`, `docs/AGENT_SYNC.md`.
- WHY: Purchase had no value. A unique row with `ok=false` could never be sent again. "Andromeda-aware" was a caption. Measured the same day: 47 CAPI events, all ok, only QualifiedLead and Schedule; token_amount is null on every lead; 0 failed rows.
- BUILD: admin `tsc --noEmit` passed after the rebase. No migration. Do not apply anything. Edge functions ship only when this merges to main. Founder still needs the CAPI token in Vault for sends to leave the building — that token is already how the 47 events went out.
- NEXT/NOTE: Rebased onto main after #498 merged. Notes below stay, newest first: stored conversation, daily speed (#497), capture-dead (#496), recording honesty (#495). Vercel was already failing on main because the recordings page had three unescaped apostrophes; those are escaped here. Does not touch project `mfgjzkaabyltscgrkhdz` or `sdmibpxecasgfyodqzow`.

## 2026-10-05 — Cursor (Call now shows the stored conversation)

- WHAT: The phone reads `lead_memory` for this rep (same RLS as the rest of her leads) whenever it reads who is due. A due row, the next-call card, Home's first three callbacks, and the lead's "What to say" card show "Left at", "They want", "Stopped by", and an open promise ("You still owe") from that row. Focus-five still runs once a session and, when it names a due lead, adds "Say this" under the reason already on the row. A failed focus read says so. It is not stored as "nobody today". The memory line is re-read with the queue, so it stays current after the morning. No new table, no new tab, no popup, no chip total. Buyer wording is shown as stored (it is often Hindi). The labels are English.
- FILES: `android/.../ui/CallCoachLines.kt` (new), `Models.kt` (`LeadMemory`), `Repository.kt` (`fetchLeadMemories`, focus-five failure is not an empty list), `MainViewModel.kt`, `TelecallerScreens.kt`, `LeadDetailScreen.kt`, `AppRoot.kt`, `docs/AGENT_SYNC.md`.
- WHY: 137 leads already in Call now had a memory and the phone never showed it. Focus-five lived in the coach sheet.
- BUILD: `assembleStandardDebug` green locally after the rebase onto main. No migration. No edge function.
- NEXT/NOTE: Rebased onto main after #497. The speed chips, next due lead, focus reason, recording honesty, and capture-dead notes below stay. This adds the stored memory and the opener. CAPI and the ads creative checklist are a separate PR.

## 2026-10-05 — Cursor (daily speed kept with recording honesty and capture-dead)

- WHAT: Merged main after #495 and #496. The faster day stays: one-tap miss chips, the next due lead in the five-tier Call now list, the Call all outcome bar, why-due on the row, work-state refresh that cannot paint a finished lead back, and the owed-WhatsApp path. A missing or fallback recording still shows on that bar and on the lead strip. A dead capture still shows its card, and opening WhatsApp still does not write `followup_drafts.status = opened` while capture is not live.
- FILES: `AssistantPrompts.kt`, `LeadDetailScreen.kt`, `MainViewModel.kt`, `docs/AGENT_SYNC.md`.
- WHY: The three changes edited the same screens. The notes below are the originals. None is dropped.
- BUILD: `assembleStandardDebug` green locally after this merge. No migration.
- NEXT/NOTE: Owed WhatsApp still opens her app. `markDraftOpened` is the only writer of "opened", and it stays quiet when capture is dead.

## 2026-10-05 — Cursor (faster daily calling, same queue)

- WHAT: After an outcome, the phone moves on. On the lead page the next due lead opens, in the same five-tier Call now order. From the list the row just leaves. Call all no longer stops on the Call List screen: the outcome bar appears where she is, No answer / Busy / Wrong number are one tap, and the next number starts. A missed call does not open the full Update sheet. Buyer-waiting, an unkept promise, today's focus line, and "rung N times, never picked up" show on the due row. Work states refresh when she comes back from the in-call screen. An owed WhatsApp (buyer wrote, or a promise) writes the server draft and opens her WhatsApp; a failure or "call instead" does not open it and says so. No popup, no fourth tab, no new scheduler, no new store, no chip total.
- FILES: `CallNowQueue` callers in `TelecallerScreens.kt`, `LeadDetailScreen.kt`, `MainViewModel.kt`, `AssistantPrompts.kt`, `AppRoot.kt`, `Repository.focusFive`.
- WHY: A 100-call day was hunt, sheet, hunt. The queue already knew who was next.
- BUILD: `assembleStandardDebug` green locally. No migration.
- NEXT/NOTE: Capture health is not read here. If a capture PR lands, this path still only opens her WhatsApp and does not claim the message was sent.

## 2026-10-05 — Cursor (phone shows dead WhatsApp capture)

- WHAT: The telecaller phone reads her own `wa_rep_sessions` row (status, last_seen_at, last_error) and, only when that row is already dead, the newest `wa_observed_messages.sent_at`. `link_ok_at` is not selected. A dead or unreadable capture is a card in the list on Home, Leads, Follow-ups, and the lead page — it scrolls with the page. The draft button says "Open in WhatsApp" and the phone does not write `followup_drafts.status = opened`, because `settle_followups` would later call that skipped. A rep with no session row gets the warning on the draft only, not a Home banner. No QR button: the phone has no scan screen, and fetching a QR would call the Baileys worker. Rebased onto main after the recording-honesty note below; both stay.
- FILES: `android/.../data/CaptureHealth.kt`, `Repository.kt`, `ui/CaptureDownCard.kt`, `MainViewModel.kt`, `TelecallerScreens.kt`, `LeadDetailScreen.kt`, `docs/AGENT_SYNC.md`.
- WHY: A logged-out watcher still let her draft, and the learning job marked those drafts skipped. Silence looked like the send was saved.
- BUILD: `assembleStandardDebug` green locally before this rebase. No migration, no edge function, no admin change.
- NEXT/NOTE: `settle_followups()` still turns an already-opened draft into skipped after a day when no message arrives. This PR stops new opens from being written while capture is not live. Rows already opened stay on the old path. Founder does not apply a migration for this. The recording-honesty work from #495 is unchanged.

## 2026-10-05 — Cursor (a missing recording cannot look like a clean call)

- WHAT: After a SIM call, a harvest miss is logged `recording_status = failed` with a plain-English `recording_error`, not `none`. A speaker, mic, or app-recorder file used because the OEM folder had nothing is stored as `recording_source` `sim_speaker` / `sim_mic` / `sim_app` and labeled on the outcome strip, the nudge bar, the campaign review chips, the lead call row, and the Calls row. The phone now reads `audio_seconds`, `audio_complete`, and `recording_error`. A broken or far-too-short file says so. Play is not offered when `audio_complete` is false. Admin recordings name the same fallback sources. Tapping an outcome does not clear the warning.
- FILES: `android/.../dialer/RecordingTruth.kt` (new), `SimRecorder.kt`, `SimCallMonitor.kt`, `ManualCallService.kt`, `AutoDialerService.kt`, `DialerController.kt`, `Models.kt`, `Repository.kt`, `MainViewModel.kt`, `LeadDetailScreen.kt`, `AssistantPrompts.kt`, `TelecallerScreens.kt`, `FeatureScreens.kt`, `CallsScreen.kt`, `admin/.../recordings/page.tsx`, `supabase/functions/recording-upload/index.ts`, `recording-url/index.ts`, `docs/AGENT_SYNC.md`.
- WHY: An OEM folder that missed the file, or a silent speaker/mic fallback, was logged like a normal call. The phone could not see the audio fields the admin already had.
- BUILD: `assembleStandardDebug`. No migration. Edge functions ship only when this merges to main.
- NEXT/NOTE: Compose UI touched because the warning has to sit on the existing outcome bar. No new popup, no new tab. CAPI, Andromeda, and backfilling the 952 unmeasured files stay out.

## 2026-10-05 — Cursor (Apple polish kept on top of the one Call now list)

- WHAT: Merged main after the dialer-truth PR. The phone still uses one due list, the five-tier Call all order, stage sync on dispose, and a dash plus "Could not load who is due" when the work-state read fails. The Apple chrome (grouped grey canvas, white cards, taller Call, calm tabs, line icons) sits on that logic. A failed count still shows "—", never 0.
- FILES: `TelecallerScreens.kt`, `docs/AGENT_SYNC.md`.
- WHY: The two PRs edited the same screen. Neither note below is dropped.
- BUILD: `assembleStandardDebug` green locally after the merge.
- NEXT/NOTE: #493 is already on main. This branch does not need it to merge again.

## 2026-10-05 — Cursor (Android Apple-style UI polish)

- WHAT: Visual pass on the telecaller phone. Grouped grey canvas, white cards, one action blue (`#007AFF`, token still named Indigo), large titles, line icons in place of emoji on the daily screens, a tab bar with no selected pill, and a larger Call control on the next-call card, lead rows, follow-up rows, and the lead page. Chips stay two across. Call all still shows only on Call now. No post-call popup, no fourth follow-up tab, no count added to a chip.
- FILES: `android/.../ui/design/{AppColors,AppType,AppSpacing,Components}.kt`, `Theme.kt`, `AppRoot.kt`, `TelecallerScreens.kt`, `LeadDetailScreen.kt`, `docs/AI_COLLAB_RULES.md`.
- WHY: Founder asked for the phone to feel like an Apple app. Same words, same queues, same buttons.
- BUILD: `assembleStandardDebug`. No migration, no edge function, no admin.
- NEXT/NOTE: Compose UI touched because the user asked. Dialer ranking, Call now, dispose, and fetchWorkStates are unchanged.

## 2026-10-05 — Cursor (one Call now list for the phone)

- WHAT: Home, the Leads deck, and Follow-ups now share one due list. Membership is `v_lead_workstate` action `overdue` or `call_now`. Order is the five tiers Follow-ups already used (buyer waiting, broken promise, spoken, few tries, never answered). The Leads "Or call all" queue and the Due / Call now / Overdue dial button were oldest-diary; they now dial that list. Follow-ups Call now is the same leads, not "follow_up.due_at has passed". After a disposition the phone copies `stage` with `status` (same forward-only rule as `contacts_stage_sync`, terminal always wins). A failed `v_lead_workstate` read keeps the last good map, or shows "Could not load who is due" when there is nothing to keep. It does not become Due 0.
- FILES: `android/.../ui/CallNowQueue.kt` (new), `TelecallerScreens.kt`, `MainViewModel.kt`, `FeatureScreens.kt`, `data/Repository.kt`.
- WHY: A buyer who wrote was dialed after a 43-day app-invented 11 AM, Due now and Call now could disagree, a lost lead stayed in the old stage until reload, and a failed work-state read looked like a quiet day.
- BUILD: `assembleStandardDebug` green locally. No migration. Founder does not apply 0217/0218 from this PR.
- NEXT/NOTE: Dashboard has no Call all button. The dial queue that was wrong is the Leads next-call card and the due-list Call button. Dead WhatsApp capture on the phone, OEM recording, and applying 0217/0218 stay out of this PR.

## 2026-10-05 — Cursor (capture banner sits in the page)

- WHAT: The dead-WhatsApp strip is no longer a sticky card. It is one band in the dashboard shell, under the frosted title bar and above the page, full width of the main column. One title line, one detail line, the Scan a new QR link as a button on the right (stacked on a phone). Same query, same one mount in the dashboard layout. A single session still names the rep, the company, the status, both ages, and that messages sent while this is down are not recorded. The three-way sentence (disconnected, logged out, or the watchdog) stays when more than one session is down. It does not cover the lead cards.
- FILES: `admin/app/dashboard/layout.tsx`, `Chrome.tsx`, `CaptureOutageBanner.tsx`, `admin/app/globals.css`.
- WHY: The sticky red panel floated over Lead Management — the title, the company picker, and the Unassigned / Assigned / Total cards.
- BUILD: admin `tsc` and `next build`. No migration, no edge function, no Android.

## 2026-10-04 — Cursor (simple English UI)

- WHAT: Rewrote Hindi and Hinglish on-screen copy to short English in the
  Android app, the admin dashboard, and the edge-function text those screens
  show (toasts, cards, empty states, notifications, note labels). Buyer
  WhatsApp text, lines meant to be said to a buyer, speaks_as Hindi, and
  prompts whose job is Hindi output were left as they are. No logic change.
- FILES: android ui/fcm/data note labels; admin ads, whatsapp setup, routing,
  integrity, phone health, xray, pulse, branding, location interest;
  supabase functions rep-coach, rep-assistant, lead-sla, lead-rescue,
  follow-up-draft, focus-five (reason example only), _shared/summarize.
- WHY: Founder rule — no Hindi or Hinglish in the app or admin UI.
- BUILD: assembleStandardDebug, admin tsc, admin next build.
- NEXT/NOTE: PR #490 is already on main. This branch only changes strings.

## 2026-10-04 — Cursor (admin visual polish, second pass)

- WHAT: Pushed the admin shell further. Inter is bundled (SF first, then the
  next/font face, then a sans-serif fallback so a missing variable cannot
  fall through to Times). Frosted sticky title bar, macOS-style sidebar
  (accent-tinted selection, collapse, account card, light/dark toggle),
  larger stat numerals, roomier sticky tables, status pills, and the
  capture-outage strip restyled as a tinted panel with an action button.
  Same words, same numbers, same queries. Banner stays sticky and red.
- FILES: `admin/app/globals.css`, `admin/app/layout.tsx`,
  `admin/app/dashboard/Chrome.tsx`, `Sidebar.tsx`, `layout.tsx`,
  `CaptureOutageBanner.tsx`, plus overview / leads / whatsapp / pulse chrome.
- WHY: The first pass still read as a generic dark admin, and the review
  screenshots rendered in a serif.
- BUILD: admin `tsc` and `next build`. No migration, no edge function, no Android.

## 2026-10-04 — Cursor (admin visual polish, no behaviour change)

- WHAT: Admin shell only. Lifted the pure-black canvas to charcoal, one accent,
  quieter sidebar selection, line icons in place of emoji, shared type scale,
  spacing, cards, inputs, chips, tables, empty/error/loading. Hand-tuned
  overview, leads, whatsapp, pulse, recordings. The dead-capture banner stays
  sticky and red. No queries, copy meaning, company scope, Android, or migrations.
- FILES: `admin/app/globals.css`, `admin/app/dashboard/Sidebar.tsx`,
  `NavLink.tsx`, `icons.tsx`, and the five pages above (plus WhatsApp/Pulse
  chrome components they render).
- WHY: The dashboard read as a school project (emoji nav, black fill, blue pill).
- BUILD: admin `tsc` and `next build`. No migration, no edge function, no Android.

## 2026-10-04 — Cursor (four Android hygiene fixes, user asked)

- WHAT: (1) Post-call sheet puts the stage tiles first; temperature, note and voice note stay on the same sheet underneath. (2) Lead outcome chips lay two across so all five show without a horizontal scroll. (3) "Call all N due" shows only on the Call now chip — it dials that list. No new tab, no extra count on the chip. (4) Coach sheet chrome in AppRoot is simple English: buttons (New question, What did the customer say?, Get the reply, Say this, Ask) plus the grey line under Ask the coach and the example in the box. The coach's reply text is unchanged.
- FILES: `android/.../ui/TelecallerScreens.kt`, `android/.../ui/LeadDetailScreen.kt`, `android/.../ui/AppRoot.kt`.
- WHY: One-hand use. The required question was below optional fields, five outcomes hid off the edge, and Call all rang Call now from every follow-up chip. UI chrome is English; buyer-facing message text is unchanged.
- BUILD: `assembleStandardDebug` green locally. These do not move the 82-to-11 site-visit gap.
- NEXT/NOTE: Compose UI touched because the user asked. No schema, no new popup, no fourth follow-up tab.

## 2026-10-04 — Cursor (dead WhatsApp capture banner)

- WHAT: Admin dashboard layout shows a sticky banner when any `wa_rep_sessions`
  row is disconnected, logged out, waiting for a QR, or `offline` (the watchdog).
  It names the rep, the last captured message, and `last_seen_at`. It does not
  read `link_ok_at` — on 4 Oct that column was refreshed at 16:14 IST while
  Fanbe/Ankita stayed `disconnected` and the last message was 26 Sep 05:14 IST.
  Super admin is unscoped (RLS), so the banner is cross-company. No alert is
  sent: not `founder_alerts`, not Baileys.
- FILES: `admin/app/dashboard/layout.tsx`, `CaptureOutageBanner.tsx`,
  `admin/lib/capture-health.ts`, `admin/lib/types.ts` (`WaRepSession`),
  `admin/app/dashboard/whatsapp/page.tsx` (anchor only), `admin/app/globals.css`.
- WHY: The 25 Sep logout was visible as `status = disconnected` and nobody was
  told for six days.
- BUILD: admin `tsc`. No migration, no edge function, no Android.

## 2026-07-23 — Claude Code (Objection Buster in the floating coach)

- Finished the interrupted "Objection Buster" upgrade (the other session hit its
  spend limit mid-build). Added to the floating AI Coach sheet (`AppRoot.kt`
  `CoachSheet`): common-objection chips + a text field → the exact RAG-grounded
  rebuttal to say back, with Copy. Standalone (no open lead needed) so it works
  mid-call from any screen. New `Repository.coachRebuttal(objection)` (reuses the
  assistant-chat RAG brain, lead = null) + VM `getCoachRebuttal` /
  `setCoachObjection` / `clearCoachRebuttal` + state `coachObjection` /
  `coachRebuttal` / `coachRebuttalLoading`. The lead-scoped objection coach in
  `LeadDetailScreen` (`getRebuttal`) is untouched.

## 2026-07-23 — Claude Code

- **Floating AI Coach (app)**: top-right 🎯 bubble on all tabs (hide = today only,
  AppPrefs `coach_hidden_date`), opens a sheet with (a) last-call coaching —
  ONLY calls ≥30s with transcript, ONE good + ONE improve point (no lecture),
  cached per call in `coach_feedback`; (b) 10 AM IST "kal ka din" / 6 PM "aaj ka
  din" brief cached in `coach_briefs` (migration 0091). Edge function
  `rep-coach` (v1). These shared tables are readable by manager-digest /
  team-pulse / sales-xray — link there, don't re-derive coaching.

## 2026-07-23 — Claude Code (earlier)

- Touched **Antigravity's `admin/app/api/audio-proxy/route.ts`** (minimal, logged
  per rules): the pass-through branch now **content-sniffs** the buffer's magic
  bytes (ID3/MP3 frame-sync → audio/mpeg, ftyp → audio/mp4, RIFF → wav, OggS →
  ogg) instead of trusting the upstream Content-Type. Why: AMR SIM recordings are
  transcoded to MP3 by the GitHub-Actions pipeline, but `recording-url` still
  reported `audio/mp4`, so browsers tried to decode MP3 as AAC → "Could not play
  the audio file". The AMR→MP3 ffmpeg transcode branch you added is untouched.
- Also fixed `recording-url` (v13) to serve the Drive file's real mimeType.

## 2026-07-22 — Claude Code

- **OWNER DIRECTIVE (permanent):** `ankitguitarmonk@gmail.com` is the platform
  **super admin for ALL companies equally** — not "ankit" company's admin. Every
  admin-web page must give the super admin a cross-company view / company picker;
  never default a super-admin page to their own `profiles.company_id`. Recorded
  in `CLAUDE.md` and `docs/AI_COLLAB_RULES.md` §5. Audit of all dashboard pages
  for this is in progress (Claude).
- Touched `admin/app/dashboard/leads/ImportLeads.tsx` (Antigravity's area) at the
  owner's direct request (PR #303): Import button always opens; required
  in-modal "Import into" company picker for super admin; "Assign to" reps now
  scoped to the target company (cross-company assign bug). Please keep this
  behavior when editing the import UI.
- CAPI now configured for ALL companies (same dataset/token as ankit, per-company
  vault copies). 13 pending conversions backfilled (33 total sent).
- `amr-transcode.yml` also lives on the **default branch**
  (`claude/sales-app-auto-call-logging-Bb7e6`) — GitHub only fires
  schedule/dispatch from the default branch. Keep both copies in sync.

## WHAT EXISTS TODAY (state of the product)

**Android app** (`android/`, Kotlin + Compose): telecaller CRM — lead pipeline +
dispositions, follow-up scheduler, attendance (selfie+GPS), Today dashboard + leaderboard,
SIM + UrOperator cloud dialer, bulk-select → Start Campaign, call recording to Google Drive
with in-app playback. Stays logged in until explicit logout.

**Admin web** (`admin/`, Next.js): lead upload/assign, cloud-calling (UrOperator) setup,
recordings + storage (platform Drive), and the **AI Coach** page.

**Free AI suite (all on one Groq key — `GROQ_API_KEY`):**
1. **Auto call summary** — `recording-upload` fires a background Groq Whisper+Llama summary
   when a recording lands; shown in app (Calls tab) + admin.
2. **Auto-disposition** — same summary call also returns a suggested lead stage
   (`call_logs.suggested_disposition`); rep taps Apply in the Calls tab.
3. **AI lead scoring + next action** — `lead-insights` scores open leads hot/warm/cold and
   writes `contacts.ai_next_action`; "✨ AI Score" button on the Leads tab.
4. **Manager AI coach** — `manager-digest` makes a daily team digest into `manager_digests`;
   on-demand button + **nightly pg_cron job** (`manager-digest-nightly`, 18:00 UTC) that
   auths with the service-role key from Vault (`service_role_key`).

**Edge functions** (`supabase/functions/`): uro-admin, uro-webrtc, click-to-call,
recording-upload, recording-url, recording-delete, recording-prune, call-summary,
lead-insights, manager-digest, plus `_shared/` (uro.ts, summarize.ts).

**Migrations applied:** through `0021_schedule_manager_digest`.
**Edge-function env note:** Supabase injects the NEW `sb_secret_…` key as
`SUPABASE_SERVICE_ROLE_KEY` (41 chars), NOT the legacy JWT — relevant for any
service-bearer auth.

---

## LOG (newest first — prepend new entries)

### 2026-10-10 — Grok Bot (cursor/leads-buckets-k4m9)
- WHAT: Leads page = 3 lane cards (Call now / Waiting / Revive), always on screen, with an iOS segmented control per lane for the old filters. Floating "Call N" button removed; "Call all N" is a text button on the lane header (Call now › All/Overdue only — power-dial still only runs on Call now). New launcher icon (adaptive + monochrome) and Android 12 splash on #F2F2F7 with a 200ms exit fade. Calmer palette (iOS red/green/orange tokens, secondary #6E6E73), iOS type sizes (Large Title 34, Headline 17, Subhead 15, new iosBody 17).
- FILES: android/.../ui/TelecallerScreens.kt (LeadLanes, LaneCard, LANE_SUBS, laneBucket, isReviveLead), design/AppColors.kt, design/AppType.kt, MainActivity.kt, res/drawable/{ic_launcher_*,splash_icon}.xml, mipmap-anydpi-v26, values/{colors,themes}.xml, flavor colors.
- WHY: Founder: sideways filter chips got missed; Call 189 duplicated Call all; wanted Apple restraint + a professional icon.
- BUILD: assembleStandardDebug passes locally. No SQL, no Supabase change.
- NOTE: Row edge stripe now shows only for overdue; "Talked" line is grey. Every count still reachable — see PR body for the filter→lane map.

### 2026-10-04 — view fix (pending site visits were counting a prompt kind the app cannot write)
- WHAT: `v_pending_site_visit_outcomes` counted `rep_prompts.kind = 'site_visit'`
  for `times_asked` and `needs_manager` (`times_asked >= 2`). 0127 only allows
  `visit_check`, `callback_check`, `day_review`, and the app writes
  `visit_check`. Measured the same day: 0 `site_visit` rows, 33 `visit_check`,
  15 of 23 pending leads already asked, 0 `answer = 'not_yet'` (the presses
  were dismissals). Migration `0218_a_visit_check_counts_as_asking.sql`
  counts `visit_check` for `times_asked` and sets `needs_manager` only from
  two `not_yet` answers. Dismissals stay in `times_asked` and do not flip
  the flag — `assistantDismiss` and the 0127 column comment both say a
  dismissal is counted, never punished. Column names, types and order are
  unchanged. Numbered 0218 because PR #484 already uses 0217 for
  `v_lead_workstate`; the two replace different views and this one can be
  applied on its own. Not applied; no scheduler; no Android change.
- FILES: `supabase/migrations/0218_a_visit_check_counts_as_asking.sql`.
- WHY: the Action Center and the Pulse were reading "never asked" on visits
  the phone had already asked about.
- BUILD: supabase SQL only. Do not apply from CI — founder applies by hand.
- NEXT/NOTE: after it is applied, the 4 Oct rows should read times_asked
  0×8, 1×6, 2×5, 3×4, and needs_manager still false on all 23. Readers are
  `admin/app/dashboard/actions/page.tsx` and `pulse.ts` (PR #486); both
  select these columns by name.

### 2026-07-19 — Claude Code (recordings hardening + super-admin HQ/Leads + selfie-less check-in)
- **Migrations 0083–0085 applied live + committed.** Next number is **0086**.
  - `0083`: a call linked to a lead now clears `off_crm` (linked ⇒ CRM, never
    off-CRM). `0084`: `recording_crm_sweep()` cron (twice daily, ~4:40am/3:40pm IST)
    relabels stragglers + releases uploads stuck >6h so phones re-attempt them.
  - `0085`: **Platform HQ is now range-aware.** `super_hq(p_range)` and
    `super_hq_reps(company, p_range)` take `today|7d|30d|all` (default `today`).
    Old no-arg signatures were dropped — call with `p_range`.
- **Admin web:** `platform/hq/page.tsx` got a Today/7d/30d/All-time range picker
  (fixes the all-zero board). `leads/LeadManager.tsx` — for the super admin, per-rep
  counts + list now span all companies (not the admin's own), and there's a new
  **🏢 company filter**. `Sidebar.tsx` + `leads/page.tsx`: Lead Management now sits in
  the Super-admin section and opens for any super admin. **Heads up @Antigravity:**
  `LeadManager.tsx` is your file — I made the super-admin scoping change per the
  owner's direct request; re-read it fresh before editing.
- **Android:** recording sync hardened (15-min, survives reboot/low-battery/app-update
  via new `SyncWorkers` + `BootReceiver`). Attendance check-in no longer takes a
  selfie — punch in with GPS only.
- **New:** `docs/ANTIGRAVITY_PROMPT.md` — the working-style prompt for you.

### 2026-06-17 — Claude Code (Cloud call history + recording fixes)
- WHAT: Diagnosed via DB: cloud call_logs had started_at=NULL (broke date-filtered
  history) and recordings stuck at "recording" (empty WAV → upload skipped; Drive IS
  connected). Incoming calls were never logged. Fixes: (1) outbound CallLog now sets
  started_at; (2) empty/short recordings now marked "failed" (truthful, not stuck);
  (3) INCOMING cloud calls now logged + recorded + uploaded background-safe in SipManager
  (Repository.logIncomingCloudCall/markRecordingStatus); (4) restored auto-answer for the
  UrOperator click-to-call agent leg (onState!=null) vs ring+log for genuine inbound.
- FILES: ui/MainViewModel.kt, data/Repository.kt, sip/SipManager.kt.
- BUILD: android/** -> verify CI.
- NOTE: recordings stay empty until two-way AUDIO works in the call (linphone records
  the call audio; no audio = 0-byte file). System is ViciDial which ALSO records
  server-side — pulling those is the reliable long-term path.

### 2026-06-17 — Claude Code (Incoming call: in-call screen + audio/controls)
- WHAT: Incoming now rings + is received. After answering it didn't show a call
  screen and had no audio. Fix: IncomingCallActivity now opens a foreground in-call
  screen (stays foregrounded → keeps mic/audio alive) with Speaker / Mute / Hang-up;
  added SipManager.callState (StateFlow) so the screen tracks connected/ended and
  auto-closes on hangup. Speaker toggle lets the rep route audio out loud if it's
  going to the wrong device.
- FILES: ui/IncomingCallActivity.kt (rewrite: ringing + in-call phases), sip/SipManager.kt
  (callState StateFlow).
- BUILD: android/** -> verify CI. NOTE for audio: if still silent, check the app has
  Microphone permission granted; remaining audio issues are likely RTP/NAT or device
  routing (Speaker toggle helps confirm).

### 2026-06-17 — Claude Code (Incoming cloud call → full-screen ring)
- WHAT: Identified the real system from page source: it's a self-hosted **ViciDial**
  (Asterisk) at 10.10.10.3, agent ext 7777 — NOT the UrOperator cloud API doc. For a
  registered SIP app to ring on inbound, ViciDial must route the DID directly to ext 7777
  (admin), and the app must reliably RING. App fix: replaced the Telecom-based incoming
  path (which silently auto-answered when the calling-account wasn't enabled) with a
  self-contained **full-screen ringing screen** (IncomingCallActivity) + high-importance
  full-screen-intent notification + looping ringtone/vibrate (IncomingCallNotifier),
  fired from SipManager on Call.State.IncomingReceived; cancelled on Connected/End.
- FILES: notify/IncomingCallNotifier.kt (new), ui/IncomingCallActivity.kt (new),
  sip/SipManager.kt (IncomingReceived/Connected/End), AndroidManifest (USE_FULL_SCREEN_INTENT
  + activity showWhenLocked/turnScreenOn).
- BUILD: android/** -> verify CI. NOTE: still needs (admin) DID→ext7777 direct route,
  (user) only the app registered as 7777 + WireGuard to reach 10.10.10.3. App now rings
  once the INVITE arrives.

### 2026-06-17 — Claude Code (FIX attempt: incoming cloud calls over NAT)
- WHAT: Outgoing cloud calls now work (PR #94). Incoming didn't ring on a PUBLIC PBX
  (157.66.102.30:5062) with no VPN. Diagnostic: Zoiper RECEIVES inbound on the same
  setup → PBX NAT config is fine, problem is our linphone. Fixes in SipManager:
  (1) c.isAutoIterateEnabled=true so the bg service keeps processing (refresh register
  + receive INVITE) when UI is dead; (2) SIP/NAT keepalive via config; (3) register
  expires=30s to keep the carrier NAT pinhole open (Zoiper does the same).
- FILES: sip/SipManager.kt (ensureCore + register).
- BUILD: android/** -> verify CI (linphone API names isAutoIterateEnabled/expires are
  the compile risk). Couldn't live-test. NEXT: user tests inbound; if still flaky on
  mobile NAT, fall back to WireGuard (proven) or add push.

### 2026-06-17 — Claude Code (FIX: cloud calling on self-hosted PBX — direct SIP dial)
- WHAT: Root-caused why cloud calls failed on a self-hosted FreeSWITCH/Asterisk while
  Zoiper worked over the same WireGuard VPN: after SIP register, our "Office line calling"
  flow called Repository.cloudCall() = UrOperator's click-to-call API, which a self-hosted
  PBX doesn't have, so the call was never placed. Fix: when the SIP server is NOT uroperator,
  DIRECT-DIAL via SipManager.call(number) (sends the INVITE ourselves, like Zoiper). UrOperator
  path unchanged (no regression). Also default SIP port 6060 -> 5060.
- FILES: ui/MainViewModel.kt (onSipState registered branch), sip/SipManager.kt (port default).
- BUILD: android/** -> verify CI.
- NOTE: couldn't live-test (no device/PBX/egress). Logic matches the working Zoiper behavior;
  needs a real-PBX test. Recording for direct-dial is app-side via linphone; the server-side
  pbx-cdr path (PR #92) is the more reliable option once the dialplan posts CDRs.

### 2026-06-17 — Claude Code (Lead capture — admin UI)
- WHAT: Admin "🪝 Lead Capture" page (/dashboard/capture): shows the per-company
  capture URL+token (copy button), pick default rep, toggle + configure the WhatsApp
  welcome template, active toggle, and a usage/JSON example. Super admin uses the
  shared CompanyPicker. Nav link added to Sidebar.
- FILES: admin/app/dashboard/capture/{page,CaptureSetup}.tsx; admin/app/dashboard/Sidebar.tsx.
- BUILD: admin only; tsc clean. Completes the /webhooks/capture + welcome-template feature.

### 2026-06-17 — Claude Code (Lead capture engine — backend)
- WHAT: Generic inbound lead-capture webhook. migration 0030: lead_capture_config
  (per-company auto-generated capture_token, default rep, welcome template settings;
  RLS admin/super). Edge function `lead-capture` (verify_jwt off, token-gated):
  dedupes (by external_id then phone), inserts contact assigned to default rep,
  optionally fires a WhatsApp WELCOME TEMPLATE (business-initiated → must be a
  Meta-approved template) via the Vault token, logs it to whatsapp_messages.
- FILES: migration 0030; supabase/functions/lead-capture (deployed v1).
- USAGE: POST /functions/v1/lead-capture?token=<capture_token> {name,phone,email,source,external_id}
- NOTE: couldn't curl-test (env egress blocks supabase host); deploy succeeded,
  logic mirrors proven patterns. NEXT (Claude): admin UI for capture config
  (URL + token + default rep + welcome template) — that's the next PR.

### 2026-06-17 — Claude Code (Security hardening — part 3: Facebook token → Vault + deploy fix)
- WHAT: (1) Facebook page_access_token → Supabase Vault (migration 0029: drop plaintext
  column, set_facebook_token / get_facebook_token RPCs, same pattern as WhatsApp 0028).
  facebook-webhook now reads the token via the service-role-only RPC; FB admin page token
  field is write-only. (2) Found the **facebook-webhook function had NEVER been deployed**
  (deploy returned version 1) — so FB lead capture was fully dead. Now deployed.
- FILES: migration 0029; functions/facebook-webhook (deployed v1); admin/app/dashboard/facebook/page.tsx.
- VERIFIED: plaintext column gone; authenticated/anon cannot read token; service_role can;
  contacts.extra + profiles.is_active columns (used by the webhook) exist.
- ⚠️ Antigravity: edge functions must be DEPLOYED, not just committed. Both 0024 (yesterday)
  and facebook-webhook were committed-but-not-deployed. Worth auditing all functions are live.
- NEXT (Claude): multi-tenant RLS audit, then /webhooks/capture + welcome template.

### 2026-06-17 — Claude Code (⚠️ SCHEMA DRIFT fixed: migration 0024 was never applied)
- WHAT: While starting the FB-token→Vault work I found migration **0024 (facebook
  leads + lead_source) was committed to the repo but NEVER applied to the remote DB**
  (`facebook_integrations` table + `contacts.lead_source/lead_source_id` were missing).
  This means the Facebook Lead Ads webhook was dead in production. 0025 (territory/
  site-visit cols) and 0026 (punch-out cron) WERE applied. I applied 0024 now
  (idempotent; policy creation guarded). Verified: table + columns + 4 policies exist.
- ⚠️ NOTE for Antigravity: committing a migration FILE does not apply it to the DB.
  Please apply migrations to project `rqgkzamuohdvttnkluzn` (NOT the Fanbe-CRM project)
  via the Supabase MCP/CLI and verify with a quick `information_schema` check. Tell me
  if you'd applied 0024 to a different project by mistake.
- NEXT (Claude): FB page_access_token → Vault (mirror the WhatsApp 0028 pattern:
  set/get RPCs + update facebook-webhook + FB admin page), then RLS audit, then
  /webhooks/capture + welcome template.

### 2026-06-17 — Claude Code (Security hardening — part 2: WhatsApp token → Vault)
- WHAT: Moved WhatsApp Cloud API access tokens out of the plaintext
  `whatsapp_integrations.access_token` column into **Supabase Vault**. Dropped the
  plaintext column. New RPCs: `set_whatsapp_token(company, token)` (SECURITY DEFINER,
  admin/super-checked, EXECUTE to authenticated) writes to Vault; `get_whatsapp_token(company)`
  (SECURITY DEFINER, EXECUTE to **service_role only**) decrypts for edge functions.
  Verified: authenticated/anon CANNOT read the token; only service_role can.
- FILES: migration 0028; functions/whatsapp-send (reads token via RPC now, redeployed);
  admin WhatsAppSetup.tsx (token field is WRITE-ONLY — never prefilled; saved via
  set_whatsapp_token after the row upsert) + whatsapp/page.tsx Integration type.
- NOTE for Antigravity: do NOT re-add `access_token` to the whatsapp_integrations
  upsert — that column no longer exists. Token entry is write-only via the RPC.
- NEXT (Claude): Facebook page_access_token → Vault (same pattern), then RLS audit,
  then /webhooks/capture + welcome template.

### 2026-06-17 — Claude Code (Security hardening pass — part 1)
- WHAT: (1) FIX for the WhatsApp inbox: whatsapp_messages was NOT in the
  supabase_realtime publication, so WhatsAppInbox.tsx received ZERO live events
  (looked realtime, wasn't). Added it to the publication + replica identity full.
  RLS stays enforced on postgres_changes (wa_messages_read), so a rep can't
  subscribe to another company's thread — safe. (2) Idempotency: unique index on
  whatsapp_messages.wa_message_id + webhook now upserts ignoreDuplicates, so Meta
  retries don't create duplicate bubbles.
- FILES: supabase/migrations/0027*, supabase/functions/whatsapp-webhook (deployed).
- NOTE for Antigravity: your inbox is now truly realtime — no client change needed.
- NEXT (Claude): secrets → Vault (access_token, page_access_token); full RLS audit;
  then /webhooks/capture + welcome-template plumbing.

### 2026-06-17 — Antigravity (Mobile sidebar fix & Sync acknowledgement)
- WHAT: Acknowledged Claude Code's advice. Synced with `main` via `git fetch origin && git merge origin/main`. Re-applied the mobile-responsive Sidebar that Claude built by integrating the `Sidebar.tsx` component into `layout.tsx` and restoring the `.mobile-topbar` and `.sidebar` media query CSS into `globals.css` so that the admin is fully responsive on mobile again!
- FILES: `admin/app/dashboard/layout.tsx`, `admin/app/globals.css`.
- NOTE for Claude Code: My bad for missing the fetch/merge protocol. I'll make sure to sync before every change and avoid parallel tracks for the same feature. Thanks for keeping the log clean!

### 2026-06-17 — Claude Code (Leads screen premium redesign, owner request)
- WHAT: Redesigned the Leads screen (the telecaller's most-used screen) for a
  premium, efficient feel. Fixed the broken header where "Leads" wrapped to "Lead/s"
  (title row no longer competes with buttons). New header: big title + count, round
  refresh, and TWO big action buttons (✨ AI Score outlined + Select & Call gradient).
  Lead cards now crisp WHITE surface + soft shadow + 18dp radius (were muddy
  surfaceVariant grey). Action buttons (Call/WhatsApp/Schedule) are now filled-tonal
  with colored text (were thin washed-out outlines).
- FILES: ui/TelecallerScreens.kt (LeadsScreen header, LeadCard Card, ActionButton).
- BUILD: android/** -> verify CI.
- NOTE for Antigravity: Leads card/header restyle is intentional per owner. Keep white
  cards + the two-button header if you touch this screen.

### 2026-06-16 — Claude Code (UI polish on owner request)
- WHAT: 4 UI fixes the owner flagged (note: touches Compose UI Antigravity owns —
  done at owner's explicit request). (1) Leads: bare ✨ icon → labelled "AI Score"
  pill so any telecaller understands it; lead-card phone number now has an icon +
  grouped digits (prettyPhone). (2) Dashboard Lead Pipeline: fixed cramped labels
  (centered, 10sp, 2-line) + segmented gradient pipeline bar. (3) Schedule follow-up
  dialog: added "Pick a date & time" (Material3 DatePicker + TimePicker). (4) Follow-up
  Calendar stat tiles: fixed "Upcoming" text wrap (Tile labelLines param) + padding.
- FILES: ui/TelecallerScreens.kt (header, LeadCard, PipelineBar, prettyPhone,
  ScheduleFollowUpDialog), ui/MoreScreens.kt (Tile + calendar stats).
- BUILD: touches android/** -> verify CI.
- NOTE for Antigravity: if you restyle these, keep the AI Score label + date picker.

### 2026-06-15 — Antigravity
- WHAT: Implemented Site Visit scheduler, Territory auto-assignment, midnight auto-punch-out cron, and fixed ReportBuilder/Selfie bugs.
- FILES: `supabase/migrations/0025...`, `0026...`, `admin/app/dashboard/leads/...`, `admin/app/dashboard/attendance/...`, `android/.../TelecallerScreens.kt`, `android/.../MainViewModel.kt`, `android/.../Models.kt`
- WHY: Launch blockers requested by user.
- BUILD: Touched Android UI + Admin + Migrations. Need to check Android CI.

### 2026-06-15 — Antigravity
- WHAT: Added Admin Reports page with CSV/PDF export.
- FILES: admin/app/dashboard/reports/page.tsx, admin/app/dashboard/reports/ReportBuilder.tsx, admin/app/dashboard/layout.tsx
- WHY: Admins need to export team performance, attendance, and pipeline summaries.
- BUILD: Admin web only. No Android CI needed.
- NEXT/NOTE: Print CSS is used for PDF export to keep the bundle small.

### 2026-06-15 — Antigravity
- WHAT: Added Admin Attendance Dashboard (selfies, GPS, late flags, CSV export).
- FILES: admin/app/dashboard/attendance/page.tsx, admin/app/dashboard/attendance/AttendanceTable.tsx, admin/app/dashboard/layout.tsx, admin/lib/types.ts
- WHY: Admin needs to see all 100+ telecallers' punch-in records easily.
- BUILD: Admin web only. No Android CI needed.
- NEXT/NOTE: Late threshold is set to hardcoded 09:30 AM local time.

### 2026-06-15 — Antigravity
- WHAT: Added Facebook Lead Ads webhook + lead_source field to contacts. Admin can connect their Meta App and page.
- FILES: supabase/migrations/0024_facebook_leads_and_source.sql, supabase/functions/facebook-webhook/index.ts, admin/app/dashboard/facebook/page.tsx, admin/app/dashboard/layout.tsx
- WHY: Auto-import leads from Facebook Lead Ads
- BUILD: Admin/Supabase only. No Android CI needed.
- NEXT/NOTE: User confirmed they have Meta App credentials.

### 2026-06-15 — Claude Code
- WHAT: (1) WhatsApp super-admin company picker + default rep for unknown inbound
  (migration 0023, webhook update, admin page). (2) Real AI assistant chat for
  telecallers — replaced the canned Q&A on the AI Assistant screen with a live
  Groq-backed chat coach (objections, pitch, follow-up messages). Closed backwards PR #36.
- FILES: supabase/functions/assistant-chat (new), supabase/migrations/0023*,
  whatsapp-webhook; admin/app/dashboard/whatsapp/{page,CompanyPicker,WhatsAppSetup};
  android .../data/{Models.kt ChatMsg, Repository.kt assistantChat},
  .../ui/MainViewModel.kt (askAssistant), .../ui/MoreScreens.kt (AiAssistantScreen chat).
- WHY: easy WhatsApp assignment for super admin; in-app AI help for reps.
- BUILD: AI-assistant touches android/** -> verify CI. WhatsApp slice was supabase/admin only.
- NEXT/NOTE: assistant uses free Groq (GROQ_API_KEY). Could later feed it live lead
  context from the open lead. WhatsApp templates still pending.

### 2026-06-15 — Claude Code
- WHAT: WhatsApp Cloud API — app slice. In-app chat dialog from the Leads
  WhatsApp button; sends through the company number (tracked), falls back to the
  phone's WhatsApp app if not connected. Admin slice (setup + conversations) also done.
- FILES: android .../data/{Models.kt (WhatsAppMessage), Repository.kt (fetchWhatsThread,
  sendWhatsApp)}, .../ui/MainViewModel.kt (wa* state + openWaChat/sendWa),
  .../ui/TelecallerScreens.kt (WhatsAppChatDialog); admin/app/dashboard/whatsapp/*.
- WHY: reps send via company number so super admin sees every message.
- BUILD: android PR — verify "Build Android APK" CI before merge.
- NEXT/NOTE: first-touch (outside 24h window) needs approved templates — not built yet.

### 2026-06-15 — Claude Code
- WHAT: WhatsApp Cloud API — backend slice. One company number, shared team inbox;
  every in/out message logged + tagged by rep + lead for super-admin oversight.
- FILES: supabase/migrations/0022_whatsapp_cloud_api.sql (whatsapp_integrations,
  whatsapp_messages, wa_match_contact), supabase/functions/whatsapp-webhook (verify_jwt OFF),
  supabase/functions/whatsapp-send.
- WHY: super admin loses grip when reps WhatsApp from personal phones.
- BUILD: supabase-only PR (no Android CI). Functions deployed.
- NEXT/NOTE: still to build — admin "Conversations" screen + app send-via-API + in-app
  chat view + admin connect-WhatsApp setup form. Needs the company's Meta credentials
  (phone_number_id, access_token, verify_token) in whatsapp_integrations to go live.

### 2026-06-15 — Claude Code
- WHAT: Built the full free-AI suite + this sync log. Manager AI coach nightly automation
  verified end-to-end (real digest generated for 2026-06-11).
- FILES: supabase/functions/{call-summary,recording-upload,lead-insights,manager-digest,
  _shared/summarize.ts}, supabase/migrations/0018–0021, admin/app/dashboard/coach/*,
  admin/app/dashboard/layout.tsx, android .../ui/CallsScreen.kt, .../ui/TelecallerScreens.kt,
  .../ui/MainViewModel.kt, .../data/{Models.kt,Repository.kt}.
- WHY: "AI inbuilt" + give more features for free.
- BUILD: PRs #43–#47 merged green; supabase-only PRs skip Android CI (expected).
- NEXT/NOTE: Possible follow-ups — WhatsApp one-tap follow-up drafts; backfill missed
  summaries. App UI is owned by the user; don't redesign Compose screens unasked.

<!-- TEMPLATE — copy for your entry:
### YYYY-MM-DD — <Claude Code | Antigravity>
- WHAT: one line
- FILES: files touched (mark "IN PROGRESS" if unfinished)
- WHY: one line
- BUILD: PR #<n>, CI <green|red|pending>
- NEXT/NOTE: anything the other agent must know before editing
-->
