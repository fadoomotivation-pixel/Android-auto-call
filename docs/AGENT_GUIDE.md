# Working agreement for the Call Pro AI codebase (read before every task)

You are working on **Call Pro AI** — an Android real-estate telecaller CRM
(Kotlin + Jetpack Compose) with a Next.js admin web app and a Supabase backend
(Postgres + edge functions). CallerDesk is the cloud-telephony provider.

There is **no device or emulator in CI** — the ONLY automated gate is the
`build` job in `.github/workflows/android.yml`, which **compiles** the app.
That means: **your #1 job is to not break the compile.** A change that "looks
right" but doesn't compile is a failed change. Read these rules before editing.

## The mistakes that have actually broken this repo — do not repeat them

1. **Missing imports after adding a Compose API.**
   PR #128 broke `main` with `Unresolved reference 'LaunchedEffect'` because the
   symbol was used but never imported. Kotlin does NOT auto-import. Every Compose
   function, operator, modifier extension, icon, and delegate you reference needs
   an explicit `import`. Before you finish: for every new symbol you typed,
   confirm there's a matching import line. Common ones people forget:
   `androidx.compose.runtime.LaunchedEffect`, `getValue`, `setValue`,
   `mutableStateOf`, `remember`, `collectAsState`, `androidx.activity.compose.BackHandler`.

2. **Editing UI you don't fully understand and "fixing" it blind.**
   If you don't know why a block is there, READ the whole composable and its
   callers first. Do not restructure layout you can't explain. State the change
   you're making and why, in one sentence, before you make it.

3. **Calling another file's `private` helpers.**
   Many composables are `private` to their file (`Avatar`, `ActionButton`,
   `openWhatsApp`, `FilterTab`, `STAGES`, `SETTABLE_STAGES`, etc.). You cannot
   call them from another file. Either (a) make a small LOCAL `private` helper in
   the file you're editing (see `LeadDetailScreen.kt`, which has its own
   `LeadAvatar`/`DetailAction`/`openWhatsAppLocal`), or (b) if it's genuinely
   shared, lift it to a shared file deliberately — don't just flip it to `public`.

4. **Using an experimental Compose API without opting in.**
   `FlowRow`/`FlowColumn` need `@OptIn(ExperimentalLayoutApi::class)` on the
   enclosing `@Composable`. `ExperimentalMaterial3Api` likewise. If you add one,
   add the annotation on the function that contains it.

## Architecture rules (how this app is wired)

- **MVVM, single source of truth.** There is one `AppState` data class exposed as
  a `StateFlow` from `MainViewModel`. Screens do
  `val app by vm.state.collectAsState()` to read, and call `vm.someAction(...)`
  to write. **Never** put network/DB/business logic inside a composable — add a
  method to `MainViewModel` and call it. State changes go through `vm`, not local
  mutable variables (local `remember` is only for transient UI like text fields).

- **Don't change a ViewModel method's signature without updating every caller.**
  e.g. `applyLead(contactId, status, temperature, budget, note, svProj, svAt,
  tokenAmount)` is called from multiple screens. If you add/remove a parameter,
  grep for every call site and fix it, or the build fails.

- **Notifications ring via channels that must already exist on the device.**
  A push or local notification on `channel_id = "X"` only makes a sound if a
  `NotificationChannel("X", …, IMPORTANCE_HIGH)` was created at app start
  (`SalesAutoCallApp` / `ensureChannel`). If you introduce a new channel, create
  it there too — otherwise Android 8+ silently drops the notification.

## Backend rules (Supabase)

- **Migrations:** add a numbered file under `supabase/migrations/` (next number)
  AND apply it. Keep the repo file and the live DB in sync.

- **Postgres gotcha that bit us:** a statement-level trigger that uses transition
  tables (`REFERENCING NEW TABLE …`) **cannot** also have a column list
  (`AFTER UPDATE OF col`). Trigger on the whole event and filter inside the
  function instead. (See `0041_bulk_assign_push_trigger.sql`.)

- **Edge functions + the MCP deploy bundler:** the deploy flattens the entrypoint
  to `source/index.ts`, so a multi-file function must import shared code as
  `./_shared/foo.ts` in the deployed copy, even though the repo keeps
  `../_shared/foo.ts`. Don't "fix" the repo path to match the deploy — they
  differ on purpose.

- **Server-to-server auth** for triggers calling edge functions uses the
  `service_role_key` Vault secret as a Bearer token (see `notify_hot_lead`).
  Reuse that pattern; don't invent a new auth path.

## Telephony facts (so you don't break call flow)

- CallerDesk "Normal" members: incoming calls ring the agent's **SIM directly**,
  not in-app. Call data enters the CRM through the **IVR webhook**
  (`callerdesk-webhook`), attributed by `DialWhomNumber → profiles.phone`.
- Outbound is `click_to_call_v2` (agent leg + customer leg, server-side
  deskphone). The old URO-operator / SIP settings were removed and are NOT
  coming back — do not reintroduce them.

## Workflow (how to ship like the rest of the team)

1. Branch off `main` (`claude/<short-topic>`), never commit straight to `main`.
2. Make the smallest change that solves the task. Match surrounding style,
   comment density, and naming.
3. Push and open a **draft PR** to `main`. Let the `build` check run.
4. **If the compile check is red, you are not done** — read the log, fix, push
   again. Green compile is the bar.
5. One logical change per PR. Don't bundle unrelated edits.

## Final self-check before you say "done"

- [ ] Every new symbol has an import.
- [ ] No cross-file calls to `private` members.
- [ ] Experimental APIs have `@OptIn`.
- [ ] Changed a `vm` method signature? Every caller updated.
- [ ] New notification channel? Created at app start.
- [ ] New migration applied AND committed.
- [ ] You can explain, in one sentence, every block you touched.
