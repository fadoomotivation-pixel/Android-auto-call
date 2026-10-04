/** Line icons for the admin shell. One stroke, one size, no emoji. */

export type IconName =
  | "layers" | "target" | "book" | "phone" | "mic" | "grid" | "zap" | "scan"
  | "chart" | "sliders" | "bell" | "route" | "chat" | "flag" | "link"
  | "library" | "building" | "spark" | "users" | "calendar" | "bot"
  | "download" | "radar" | "alert" | "pin" | "userPlus" | "contacts"
  | "trending" | "cloud" | "pulse" | "shield" | "menu" | "close" | "rows";

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {glyph(name)}
    </svg>
  );
}

function glyph(name: IconName) {
  switch (name) {
    case "grid":
      return (
        <>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </>
      );
    case "layers":
      return (
        <>
          <path d="M12 3.5 3.5 8 12 12.5 20.5 8 12 3.5Z" />
          <path d="M3.5 12 12 16.5 20.5 12" />
          <path d="M3.5 16 12 20.5 20.5 16" />
        </>
      );
    case "target":
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="1" />
        </>
      );
    case "book":
      return (
        <>
          <path d="M5 4.5h9.5A2.5 2.5 0 0 1 17 7v12.5H7.5A2.5 2.5 0 0 0 5 22V4.5Z" />
          <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H17" />
        </>
      );
    case "phone":
      return (
        <path d="M8 3.5h2.2l1.2 3-1.6 1a12 12 0 0 0 5.7 5.7l1-1.6 3 1.2V17a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 5 6.7 2 2 0 0 1 7 4.5" />
      );
    case "mic":
      return (
        <>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M6.5 11a5.5 5.5 0 0 0 11 0" />
          <path d="M12 16.5V21" />
          <path d="M8.5 21h7" />
        </>
      );
    case "zap":
      return <path d="M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8Z" />;
    case "scan":
      return (
        <>
          <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8" />
          <path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8" />
          <path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16" />
          <path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
          <path d="M4 12h16" />
        </>
      );
    case "chart":
      return (
        <>
          <path d="M4 19.5h16" />
          <path d="M7 16V10" />
          <path d="M12 16V6" />
          <path d="M17 16v-4" />
        </>
      );
    case "sliders":
      return (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
          <circle cx="8" cy="7" r="1.6" fill="var(--sidebar-bg, var(--bg))" />
          <circle cx="15" cy="12" r="1.6" fill="var(--sidebar-bg, var(--bg))" />
          <circle cx="10" cy="17" r="1.6" fill="var(--sidebar-bg, var(--bg))" />
        </>
      );
    case "bell":
      return (
        <>
          <path d="M6 16.5h12l-1.2-2V10a4.8 4.8 0 0 0-9.6 0v4.5L6 16.5Z" />
          <path d="M10 16.5a2 2 0 0 0 4 0" />
        </>
      );
    case "route":
      return (
        <>
          <circle cx="6" cy="6" r="2.2" />
          <circle cx="18" cy="18" r="2.2" />
          <path d="M8 7.2C12 7 14 9 15.2 12 16.2 15 16 16.2 16 16.2" />
        </>
      );
    case "chat":
      return (
        <path d="M5 6.5h14v9H8.5L5 18.5v-12Z" />
      );
    case "flag":
      return (
        <>
          <path d="M6 20.5V4" />
          <path d="M6 5h11l-2 3.2L17 11.5H6" />
        </>
      );
    case "link":
      return (
        <>
          <path d="M10 13.5a4 4 0 0 0 5.7.4l2.2-2.2a4 4 0 0 0-5.6-5.6L11 7.4" />
          <path d="M14 10.5a4 4 0 0 0-5.7-.4L6 12.3a4 4 0 0 0 5.6 5.6l1.3-1.3" />
        </>
      );
    case "library":
      return (
        <>
          <path d="M5 4.5h5.5v15H6.5A1.5 1.5 0 0 1 5 18V4.5Z" />
          <path d="M10.5 7H16v12.5h-4" />
          <path d="M16 9h3.2v10.2a1.3 1.3 0 0 1-1.3 1.3H16" />
        </>
      );
    case "building":
      return (
        <>
          <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
          <path d="M8 20.5v-3h8v3" />
          <path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01" />
        </>
      );
    case "spark":
      return (
        <path d="M12 3.5 13.4 9 19 10.5 13.4 12 12 17.5 10.6 12 5 10.5 10.6 9 12 3.5Z" />
      );
    case "users":
      return (
        <>
          <circle cx="9" cy="8" r="2.6" />
          <path d="M4.5 18.5c.6-2.6 2.4-4 4.5-4s3.9 1.4 4.5 4" />
          <circle cx="16.5" cy="9" r="2.1" />
          <path d="M16 14.6c1.6.3 2.8 1.4 3.4 3.4" />
        </>
      );
    case "calendar":
      return (
        <>
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 10h17" />
          <path d="M8 3.5V7M16 3.5V7" />
        </>
      );
    case "bot":
      return (
        <>
          <rect x="4" y="8" width="16" height="11" rx="3" />
          <path d="M12 8V5" />
          <circle cx="12" cy="4.2" r="1" />
          <path d="M9 13h.01M15 13h.01" />
        </>
      );
    case "download":
      return (
        <>
          <path d="M12 4v10" />
          <path d="m8 10 4 4 4-4" />
          <path d="M5 19.5h14" />
        </>
      );
    case "radar":
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <path d="M12 12 17 7" />
        </>
      );
    case "alert":
      return (
        <>
          <path d="M12 4.5 3.8 19h16.4L12 4.5Z" />
          <path d="M12 10v4" />
          <path d="M12 16.5h.01" />
        </>
      );
    case "pin":
      return (
        <>
          <path d="M12 21s6-5.2 6-10a6 6 0 0 0-12 0c0 4.8 6 10 6 10Z" />
          <circle cx="12" cy="11" r="1.8" />
        </>
      );
    case "userPlus":
      return (
        <>
          <circle cx="9" cy="8" r="2.6" />
          <path d="M3.8 18.5c.6-2.7 2.6-4.2 5.2-4.2 2.6 0 4.6 1.5 5.2 4.2" />
          <path d="M18 8.5v5" />
          <path d="M15.5 11H20.5" />
        </>
      );
    case "contacts":
      return (
        <>
          <rect x="6" y="3.5" width="12" height="17" rx="2" />
          <path d="M4 8h2M4 12h2M4 16h2" />
          <circle cx="12" cy="10" r="2" />
          <path d="M9.2 15.5c.5-1.4 1.5-2 2.8-2s2.3.6 2.8 2" />
        </>
      );
    case "trending":
      return (
        <>
          <path d="M4 16.5 9.5 11l3 3L20 7" />
          <path d="M14 7h6v6" />
        </>
      );
    case "cloud":
      return <path d="M7 18h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.5 1.6A3.5 3.5 0 0 0 7 18Z" />;
    case "pulse":
      return <path d="M3 12h4l2-5 3 10 2-5h7" />;
    case "shield":
      return <path d="M12 3.5 5 6.5v5.2c0 4.2 2.8 7.2 7 8.8 4.2-1.6 7-4.6 7-8.8V6.5L12 3.5Z" />;
    case "rows":
      return (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      );
    case "menu":
      return (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      );
    case "close":
      return (
        <>
          <path d="M6 6 18 18" />
          <path d="M18 6 6 18" />
        </>
      );
    default:
      return null;
  }
}
