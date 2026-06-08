# Publishing SalesAutoCall to Google Play

> ⚠️ **Read this first — policy risk.** SalesAutoCall uses the `CALL_PHONE`
> permission to place calls automatically. Google Play's
> [Phone/SMS permissions policy](https://support.google.com/googleplay/android-developer/answer/10208820)
> and the [Stalkerware/auto-dialer guidance](https://support.google.com/googleplay/android-developer/answer/9888379)
> restrict apps whose core purpose is automated/robo dialing. Approval is **not
> guaranteed**. If this is only for your own sales team, prefer the internal
> route in [§5](#5-internal-distribution-alternative-recommended-for-teams).

---

## 0. One-time setup
- A **Google Play Console** account — one-time **$25 USD**, plus identity &
  (for orgs) D-U-N-S verification, which can take a few days.
- **Android Studio** installed to produce the signed bundle.

## 1. Generate an upload key & signed bundle
Create the upload keystore once and **keep it forever**:

```bash
keytool -genkey -v -keystore salesautocall-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Put the credentials in `android/keystore.properties` (copy from
`keystore.properties.example`). Then build the **App Bundle**:

```bash
cd android
./gradlew bundleRelease
# output: app/build/outputs/bundle/release/app-release.aab
```

(Or in Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle**.)

> **Use Play App Signing** (default for new apps). Google holds the final signing
> key; your `.jks` is just the *upload* key. If you ever lose the upload key, it
> can be reset — much safer.

## 2. Create the app in Play Console
- **All apps → Create app**: name "SalesAutoCall", default language, **App**, Free.
- Complete **App content**:
  - **Privacy policy URL** — host `PRIVACY_POLICY.md` somewhere public (e.g. the
    Vercel admin site at `/privacy`, or a GitHub Pages link) and paste the URL.
  - **Data safety** — answers prepared in [§4](#4-data-safety-form-answers).
  - **App access** — provide test admin + salesperson logins so reviewers can sign in.
  - **Content rating** questionnaire.
  - **Target audience** — adults / business; not for children.

## 3. Permissions declaration (the critical one)
In **App content → Sensitive app permissions / Permissions declaration**, declare
why `CALL_PHONE` (and `READ_PHONE_STATE`) are used. Suggested wording:

> SalesAutoCall is a B2B sales-productivity tool used by a company's own sales
> agents on managed devices. The core, user-initiated feature is dialing a
> pre-imported list of business contacts. `CALL_PHONE` places each outbound call;
> `READ_PHONE_STATE` detects when a call ends so the agent can be presented with
> the next contact and the call can be logged. The app does not read, record, or
> upload call content, and it skips any contact marked Do-Not-Call. Calling is
> started explicitly by the agent and can be stopped at any time.

> 💡 To improve approval odds, consider shipping the Play build as **tap-to-confirm
> each call** rather than fully unattended dialing (a small change in
> `DialerScreen`/`AutoDialerService`). Keep full auto-dial for the internal build.

## 4. Data safety form answers
The app collects/stores, **linked to the user**:
- **Personal info**: names, phone numbers, email addresses (the imported
  contacts) and the salesperson's own name/phone/email.
- **App activity**: call logs (timestamp, duration, outcome) the agent generates.

Declare:
- Data is **collected** and **transferred off device** (to Supabase cloud). ✔
- Data is **encrypted in transit** (HTTPS/TLS). ✔
- Users (admins) can **request deletion** — give a contact email / in-app path.
- Not shared with third parties for advertising.

## 5. Internal distribution alternative (recommended for teams)
If the app is only for your own agents, skip public Play review:
- **Play Console → Internal testing**: upload the `.aab`, add testers by email,
  share the opt-in link. Up to 100 testers, available in minutes, **no policy
  review of the production track**.
- **Managed Google Play / MDM** (Intune, Scalefusion, Esper): publish as a
  **private app** to your organization only.
- **Direct sideload**: build a signed `.apk` (`./gradlew assembleRelease`) and
  install via MDM or a download link. No Play account needed.

## 6. Roll out
Internal testing → Closed testing → Open testing → **Production**. Bump
`versionCode` in `app/build.gradle.kts` for every upload.
