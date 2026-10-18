import type { City } from "./cities";
import { getCity } from "./cities";

// Text for a city page, in English or Hindi. Shared steps describe how the app
// really works; the city note, tip, languages and nearby cities make each page
// specific. Only true, qualitative statements.
export function cityPage(c: City, hi: boolean) {
  const nearby = c.nearby.map(getCity).filter(Boolean) as City[];
  if (!hi) {
    return {
      title: `Real Estate CRM in ${c.name}: free calling CRM for telecallers`,
      description: `Free calling CRM for real-estate teams in ${c.name}, ${c.state}. Android auto-dialer, Meta lead sync, Follow Ups, call recording with AI coaching and GPS site visits. No card, no trial.`,
      h1: `Real estate CRM in ${c.name}`,
      lead: `Call Pro AI is a free calling CRM for real-estate teams in ${c.name}. Your telecallers call every lead from an Android app with an auto-dialer, and you see calls, follow-ups and site visits on a web dashboard.`,
      market: `The ${c.name} market`,
      note: c.noteEn,
      langLine: `Buyers here usually speak ${c.lang}. The AI coach writes call tips in simple Hinglish, and you can keep your own scripts in any language.`,
      tipTitle: `A calling tip for ${c.name}`,
      tip: c.tipEn,
      stepsTitle: `How a ${c.name} team uses it`,
      steps: [
        ["Leads come in", "Facebook and Instagram lead forms sync in, or import Excel or CSV, or scan a printed list with the phone camera."],
        ["Telecallers call", "The Android app works through Call now with the auto-dialer, on the telecaller's own SIM."],
        ["Nothing is forgotten", "Every callback lands in Follow Ups as Overdue, Today or Upcoming."],
        ["Visits are real", `Site visits in and around ${c.name} are checked with the phone's GPS.`],
        ["You see the day", "The owner dashboard shows calls, connects, visits and bookings per telecaller."],
      ],
      faq: [
        { q: `Is Call Pro AI free for teams in ${c.name}?`, a: "Yes. Call Pro AI is free to use for the whole team, with no card and no trial period." },
        { q: `Can my ${c.name} telecallers use their own phones?`, a: "Yes. Telecallers install the Android app on their own phone and call on their own SIM. Owners use the web dashboard in any browser." },
        { q: "Does it work with Meta lead ads?", a: "Yes. Facebook and Instagram lead-form leads come into the CRM automatically and land in the Call now list." },
        { q: `Can I track site visits in ${c.name}?`, a: "Yes. Telecallers and site staff check in at the site, and the visit is verified with the phone's location." },
      ],
      nearbyTitle: "Nearby cities",
      nearby: nearby.map((n) => ({ href: `/real-estate-crm/${n.slug}`, label: `Real estate CRM ${n.name}` })),
      other: { href: `/hi/real-estate-crm/${c.slug}`, label: "हिंदी में पढ़ें" },
      cta: "Create your company free",
      ctaSub: `Set up in a few minutes and invite your ${c.name} telecallers with your company code.`,
      crumbs: [{ name: "Home", path: "/" }, { name: "Real estate CRM", path: "/real-estate-crm" }, { name: c.name, path: `/real-estate-crm/${c.slug}` }],
    };
  }
  return {
    title: `${c.nameHi} में रियल एस्टेट CRM: टेलीकॉलर के लिए फ़्री calling CRM`,
    description: `${c.nameHi}, ${c.stateHi} की रियल एस्टेट टीमों के लिए फ़्री calling CRM। Android auto-dialer, Meta lead sync, Follow Ups, call recording और AI coach, GPS site visit। कोई card नहीं, कोई trial नहीं।`,
    h1: `${c.nameHi} में रियल एस्टेट CRM`,
    lead: `Call Pro AI ${c.nameHi} की रियल एस्टेट टीमों के लिए एक फ़्री calling CRM है। आपके telecaller Android app के auto-dialer से हर lead को call करते हैं, और आप web dashboard पर calls, follow-ups और site visits देखते हैं।`,
    market: `${c.nameHi} का बाज़ार`,
    note: c.noteHi,
    langLine: `यहाँ खरीदार आम तौर पर ${c.lang} बोलते हैं। AI coach आसान Hinglish में call tips देता है, और आप अपनी scripts किसी भी भाषा में रख सकते हैं।`,
    tipTitle: `${c.nameHi} के लिए एक calling tip`,
    tip: c.tipHi,
    stepsTitle: `${c.nameHi} की टीम इसे कैसे इस्तेमाल करती है`,
    steps: [
      ["Leads आती हैं", "Facebook और Instagram lead forms अपने-आप आती हैं, या Excel/CSV import करें, या छपी हुई list की फ़ोटो से scan करें।"],
      ["Telecaller call करते हैं", "Android app का auto-dialer Call now list से एक के बाद एक call लगाता है, telecaller के अपने SIM से।"],
      ["कुछ नहीं भूलता", "हर callback Follow Ups में Overdue, Today या Upcoming में दिखता है।"],
      ["Visit सच्ची", `${c.nameHi} और आसपास की site visit फ़ोन के GPS से check होती है।`],
      ["पूरा दिन दिखता है", "Owner dashboard पर हर telecaller की calls, connects, visits और bookings दिखती हैं।"],
    ],
    faq: [
      { q: `क्या ${c.nameHi} की टीमों के लिए Call Pro AI फ़्री है?`, a: "हाँ। Call Pro AI पूरी टीम के लिए फ़्री है, कोई card या trial नहीं।" },
      { q: `क्या ${c.nameHi} के telecaller अपना फ़ोन इस्तेमाल कर सकते हैं?`, a: "हाँ। Telecaller अपने फ़ोन पर Android app install करते हैं और अपने SIM से call करते हैं। Owner किसी भी browser में dashboard खोलते हैं।" },
      { q: "क्या यह Meta lead ads के साथ काम करता है?", a: "हाँ। Facebook और Instagram lead form की leads अपने-आप CRM में आती हैं और Call now list में दिखती हैं।" },
      { q: `क्या ${c.nameHi} में site visit track कर सकते हैं?`, a: "हाँ। Site पर check-in होता है और visit फ़ोन की location से verify होती है।" },
    ],
    nearbyTitle: "आसपास के शहर",
    nearby: nearby.map((n) => ({ href: `/hi/real-estate-crm/${n.slug}`, label: `${n.nameHi} रियल एस्टेट CRM` })),
    other: { href: `/real-estate-crm/${c.slug}`, label: "Read in English" },
    cta: "अपनी कंपनी फ़्री बनाएँ",
    ctaSub: `कुछ मिनट में setup करें और company code से अपने ${c.nameHi} के telecallers को जोड़ें।`,
    crumbs: [{ name: "होम", path: "/" }, { name: "रियल एस्टेट CRM", path: "/real-estate-crm" }, { name: c.nameHi, path: `/hi/real-estate-crm/${c.slug}` }],
  };
}
