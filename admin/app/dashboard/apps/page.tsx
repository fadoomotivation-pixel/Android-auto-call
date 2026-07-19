// App downloads — every brand's latest APK, straight from the dashboard so
// nobody has to hunt for GitHub links. Version numbers are read live from each
// release channel's version.json at request time.
const REPO = "fadoomotivation-pixel/Android-auto-call";

const CHANNELS = [
  {
    brand: "Call Pro AI",
    emoji: "📞",
    tag: "android-latest",
    asset: "app-debug.apk",
    note: "Standard app — most companies use this one.",
  },
  {
    brand: "SN Developer",
    emoji: "🏗",
    tag: "android-sndeveloper",
    asset: "app-sndeveloper-debug.apk",
    note: "White-label build for SN Developers.",
  },
  {
    brand: "Manas Property",
    emoji: "🏠",
    tag: "android-manasproperty",
    asset: "app-manasproperty-debug.apk",
    note: "White-label build for Manas Property.",
  },
];

async function channelVersion(tag: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://github.com/${REPO}/releases/download/${tag}/version.json`,
      { cache: "no-store" },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { versionName?: string };
    return j.versionName ?? null;
  } catch {
    return null;
  }
}

export default async function AppsPage() {
  const versions = await Promise.all(CHANNELS.map((c) => channelVersion(c.tag)));

  return (
    <>
      <h2>App downloads</h2>
      <p className="subtitle">
        The latest Android app for every brand. Share a link on WhatsApp or open it on the
        phone — install once over the old app (data stays), after that the app updates itself.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}>
        {CHANNELS.map((c, i) => {
          const url = `https://github.com/${REPO}/releases/download/${c.tag}/${c.asset}`;
          return (
            <div key={c.tag} className="card" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ fontSize: 30 }}>{c.emoji}</div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 700 }}>
                  {c.brand}{" "}
                  {versions[i] && (
                    <span style={{ fontWeight: 400, opacity: 0.7, fontSize: 13 }}>v{versions[i]}</span>
                  )}
                </div>
                <div className="subtitle" style={{ margin: 0, fontSize: 13 }}>{c.note}</div>
              </div>
              <a
                className="primary"
                style={{ width: "auto", padding: "10px 18px", textDecoration: "none" }}
                href={url}
              >
                ⬇ Download APK
              </a>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginTop: 18, maxWidth: 640 }}>
        <div className="label">Install steps (first time on a phone)</div>
        <ol style={{ margin: "8px 0 0 18px", lineHeight: 1.8 }}>
          <li>Open the link on the phone and download the APK.</li>
          <li>Tap the downloaded file → allow &quot;Install unknown apps&quot; if asked → Install.</li>
          <li>It installs <strong>over</strong> the old app — login, leads and data stay.</li>
          <li>Done. From now on the app checks for updates itself and asks with one tap.</li>
        </ol>
      </div>
    </>
  );
}
