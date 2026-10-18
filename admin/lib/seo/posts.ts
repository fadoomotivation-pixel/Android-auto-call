// Blog posts as data. Honest, practical, no made-up statistics, no competitor
// names. Hinglish where a telecaller would naturally say it.
export type Section = { h?: string; p?: string[]; list?: string[] };
export type Post = {
  slug: string; title: string; description: string; group: string;
  date: string; minutes: number; sections: Section[]; related: string[];
};

export const GROUPS = ["Meta leads", "Telecaller team", "Follow-up and site visits", "Tools and how-to"] as const;

export const POSTS: Post[] = [
  {
    slug: "call-meta-leads-same-day",
    title: "Meta lead aaya? Call it the same day. Here is why, and how",
    description: "A Facebook or Instagram lead remembers your ad for a short time. A simple same-day calling routine for real-estate telecallers.",
    group: "Meta leads", date: "2026-10-18", minutes: 4, related: ["send-site-visits-back-to-meta", "telecaller-daily-routine"],
    sections: [
      { p: ["When someone fills a lead form on Facebook or Instagram, they were interested for a moment. They saw a photo, a price or a location they liked. That moment fades. By tomorrow they have seen ten other ads, and when you call they may say \"maine kab form bhara?\"", "So the best time to call a Meta lead is the same day, and the sooner the better. This is not a magic rule. It is just how memory works."] },
      { h: "A same-day routine that works", list: [
        "Keep new Meta leads at the top of the list. In Call Pro AI they land in Call now on their own.",
        "Call new leads first, before old follow-ups that can wait an hour.",
        "First line: name the ad. \"Namaste, aapne Instagram par Shree Kunj plots ka form bhara tha.\" They remember faster.",
        "If they do not pick up, try again later the same day, then the next morning. Do not mark them dead after one ring.",
        "If they are busy, book an exact callback time, not \"baad mein\".",
      ] },
      { h: "What to ask on the first call", list: ["Budget range", "Which area or project", "For self-use or investment", "When they can visit the site"], p: ["Write the answers in the lead note. The next person who calls should never ask the same question twice."] },
      { h: "What not to do", list: ["Do not read the whole brochure on the first call.", "Do not push a site visit before you know the budget.", "Do not send ten WhatsApp messages. One clear message with the location and a visit time is enough."] },
      { h: "The short version", p: ["Same day, name the ad, ask four questions, book an exact next step. Do this for every lead and your ad money works harder."] },
    ],
  },
  {
    slug: "send-site-visits-back-to-meta",
    title: "How to tell Meta which leads became site visits (in plain words)",
    description: "Meta can only find better buyers if it learns which leads turned into site visits and bookings. What the Conversions API does, without jargon.",
    group: "Meta leads", date: "2026-10-18", minutes: 4, related: ["call-meta-leads-same-day", "site-visit-no-show"],
    sections: [
      { p: ["Meta's ads system learns from what you tell it. If you only tell it \"someone filled a form\", it finds more people who fill forms, including people who never pick up. If you tell it \"this lead came for a site visit\" and \"this lead booked\", it can look for more people like them."] },
      { h: "What the Conversions API is", p: ["The Conversions API (often called CAPI) is Meta's way for your CRM to send events back to Meta from a server. An event is a simple message like \"lead X reached site visit\". Meta matches it to the original lead form, so the ad learns."] },
      { h: "Which events to send", list: ["Site visit done", "Booking or token paid"], p: ["Keep it to the steps that really mean a buyer. Sending every small status change adds noise."] },
      { h: "What you need", list: ["Leads that came from Meta lead forms", "A CRM that records each lead's stage honestly", "The CRM connected to your Meta business and pixel or dataset"] },
      { h: "How Call Pro AI does it", p: ["When a Meta lead's stage moves to site visit or booking in Call Pro AI, it can send that event back to Meta. The owner connects Meta once from the admin dashboard."] },
      { h: "The short version", p: ["Tell Meta about the leads that matter, not just the forms. Honest stages in your CRM are what make this work, so make sure telecallers update the stage after every call."] },
    ],
  },
  {
    slug: "telecaller-daily-routine",
    title: "A real-estate telecaller's day that gets site visits",
    description: "A simple daily routine for property telecallers: what to call first, when to follow up, and how to end the day with nothing pending.",
    group: "Telecaller team", date: "2026-10-18", minutes: 5, related: ["buyer-objections-replies", "call-meta-leads-same-day"],
    sections: [
      { p: ["Most telecallers do not fail because they talk badly. They fail because the day has no order. Old leads, new leads and callbacks all get mixed, and the important ones get missed. Here is a simple order that works."] },
      { h: "Morning: start the day", list: ["Check in for attendance.", "Open Follow Ups and look at Overdue first. These are promises you already made.", "Then call new leads that came in since yesterday evening."] },
      { h: "Late morning to afternoon: the main calling block", list: ["Work through Call now with the auto-dialer, one lead after another.", "After every call, choose what happened and set the next step right away. Do not keep it in your head.", "Book site visits with a date and time, and send the location on WhatsApp."] },
      { h: "Evening: the follow-up block", list: ["Call the people who said \"shaam ko call karna\". Many working buyers pick up only after office.", "Call today's callbacks before you leave."] },
      { h: "Before you leave", list: ["Overdue should be empty or have a reason for each lead.", "Tomorrow's site visits are confirmed with a reminder message."] },
      { h: "Small habits that help", list: ["Smile on the phone. It changes your voice.", "Use the buyer's name.", "Keep notes short and useful: budget, area, family, visit date.", "Read the coach tip after a call and try it on the next one."] },
    ],
  },
  {
    slug: "buyer-objections-replies",
    title: "Common property buyer objections and calm replies (Hindi + English)",
    description: "What to say when a buyer says it is too costly, they will think, or they are just looking. Simple, respectful replies for telecallers.",
    group: "Telecaller team", date: "2026-10-18", minutes: 5, related: ["telecaller-daily-routine", "site-visit-no-show"],
    sections: [
      { p: ["An objection is not a no. Usually it means the buyer needs one more piece of information, or more trust. Stay calm, agree first, then give one useful fact or a small next step. Here are replies you can adapt to your project."] },
      { h: "\"Bahut mehenga hai\" (It's too costly)", p: ["\"Ji, budget sabse important hai. Aapka comfortable budget kitna hai? Usi range mein main aapko best option batata hoon.\" Then offer a smaller plot or flat, or explain the payment plan. Never argue about the price."] },
      { h: "\"Sochke batata hoon\" (I'll think about it)", p: ["\"Bilkul, sochna chahiye. Kya main Sunday ko 11 baje call karoon, ya aap site dekh ke decide karenge?\" Always end with an exact time."] },
      { h: "\"Abhi bas dekh rahe hain\" (Just looking)", p: ["\"Achha hai, dekhna hi pehla step hai. Main aapko location aur photos WhatsApp kar deta hoon. Agar pasand aaye toh site visit fix kar lenge.\""] },
      { h: "\"Family se baat karni hai\" (Need to ask family)", p: ["\"Zaroor. Kya family ke saath site visit plan karein? Sabko ek saath dekh ke decide karna aasaan hota hai.\""] },
      { h: "\"Busy hoon\" (I'm busy)", p: ["\"Sorry, main 1 minute bhi nahi loonga. Aapko kab call karoon, aaj shaam 7 baje?\" Book it and call exactly then."] },
      { h: "Rules that work with every objection", list: ["Agree first: \"ji bilkul\".", "Ask one question, then listen.", "Give one fact, not a speech.", "End with a date and time.", "Write the objection in the note so the next call starts from there."] },
    ],
  },
  {
    slug: "site-visit-no-show",
    title: "Site visit no-show: 6 simple ways to reduce it",
    description: "Buyers book a site visit and then do not come. Six practical steps telecallers can take before the visit day.",
    group: "Follow-up and site visits", date: "2026-10-18", minutes: 4, related: ["buyer-objections-replies", "telecaller-daily-routine"],
    sections: [
      { p: ["A booked site visit that does not happen is costly: the site team waits, the buyer goes cold, and the day is lost. You cannot stop every no-show, but these steps help."] },
      { h: "1. Book an exact time, not a day", p: ["\"Sunday 11 baje\" is a plan. \"Sunday ko aayenge\" is a wish."] },
      { h: "2. Send the location right away", p: ["Send a WhatsApp with the map pin, the time and your name as soon as the call ends."] },
      { h: "3. Confirm the day before", p: ["Call or message the evening before: \"Kal 11 baje milte hain, main site par rahunga.\" If they hesitate, move the visit instead of losing it."] },
      { h: "4. Ask who is coming", p: ["If the decision maker is a parent or spouse, invite them too. A visit without the decision maker often ends in \"family se baat karke batate hain\"."] },
      { h: "5. Offer help with travel", p: ["Some buyers do not come because the site is far or hard to find. Offer pickup if your company does it, or share clear directions."] },
      { h: "6. Call on the day", p: ["A short call an hour before (\"aap nikal gaye?\") reminds them and shows you are waiting."] },
      { h: "Track it honestly", p: ["Mark the visit as done only when the buyer is really at the site. In Call Pro AI the visit check-in uses the phone's location, so the owner sees real visits."] },
    ],
  },
  {
    slug: "scan-printed-lead-list",
    title: "How to turn a printed lead list into a call list (Scan list)",
    description: "Got a paper list, a register page or a screenshot of numbers? How to turn it into leads you can auto-dial, step by step.",
    group: "Tools and how-to", date: "2026-10-18", minutes: 3, related: ["telecaller-daily-routine", "call-meta-leads-same-day"],
    sections: [
      { p: ["Many teams still get leads on paper: a register from a site event, a printed list, or a screenshot on WhatsApp. Typing them in one by one takes hours and adds mistakes. Scan list in the Call Pro AI Android app reads the names and numbers for you."] },
      { h: "Step by step", list: [
        "Open Leads and tap the scan icon, or open Scan list from the menu.",
        "Choose Camera to take a photo, Photo to pick a screenshot, or Paste for text copied from WhatsApp or Excel.",
        "The phone reads the list. The text is read on the phone itself, and the photo is not uploaded.",
        "Check the review screen. Numbers already in the CRM, duplicates in the list and invalid numbers are flagged. Edit a name or remove a row if needed.",
        "Tap Add to Call now. The leads are created and you can start the auto-dialer.",
      ] },
      { h: "Tips for a clean scan", list: ["Use good light and hold the phone straight.", "Keep one list per photo.", "For a long register, take one photo per page."] },
      { h: "Is it free?", p: ["Yes. Scan list is part of Call Pro AI, which is free to use, with no limit on scans."] },
    ],
  },
  {
    slug: "call-facebook-leads-fast",
    title: "How to call Facebook leads fast (a simple setup for real-estate teams)",
    description: "A plain setup so Facebook and Instagram leads get a call the same day: no sheet copying, a clear first-call order and exact callbacks.",
    group: "Meta leads", date: "2026-10-18", minutes: 4, related: ["call-meta-leads-same-day", "send-site-visits-back-to-meta"],
    sections: [
      { p: ["Most teams lose time on Facebook leads before anyone even dials. The lead sits in a Google Sheet or an email, someone copies it, someone else assigns it, and by evening the buyer has forgotten the ad. Calling fast is mostly about removing those steps."] },
      { h: "1. Stop copying leads by hand", p: ["Connect your Meta lead forms to your CRM, so each new lead appears in the telecaller's list by itself. In Call Pro AI, new Meta leads land in Call now."] },
      { h: "2. Fix the calling order", list: ["New leads from today first", "Then follow-ups due today", "Then older leads to win back"], p: ["Write this order on the wall. When everyone follows the same order, new leads never wait behind old ones."] },
      { h: "3. Let the phone do the dialing", p: ["An auto-dialer removes the gap between calls: the telecaller marks the result and the next call starts. Fewer gaps mean new leads get reached sooner."] },
      { h: "4. Never end a call without a time", p: ["\"Baad mein call karna\" is not a follow-up. Ask \"Sunday 11 baje theek rahega?\" and save that exact time."] },
      { h: "5. Check it every evening", p: ["The owner or team lead should look at one thing each evening: which of today's new leads were not called yet. Call them first tomorrow morning."] },
    ],
  },
  {
    slug: "track-telecaller-performance",
    title: "How to track telecaller performance without micromanaging",
    description: "Five simple numbers a real-estate team lead can check daily: calls, connects, follow-ups done on time, site visits booked and visits done.",
    group: "Telecaller team", date: "2026-10-18", minutes: 5, related: ["telecaller-daily-routine", "buyer-objections-replies"],
    sections: [
      { p: ["You do not need to listen to every call to know how your team is doing. A few honest numbers, checked at the same time every day, tell you most of the story."] },
      { h: "The five numbers", list: ["Calls made", "Connects: calls where the buyer actually spoke", "Follow-ups done on time vs overdue", "Site visits booked", "Site visits done"], p: ["Calls show effort. Connects show list quality and timing. Overdue follow-ups show discipline. Visits show results."] },
      { h: "How to read them", list: ["Many calls, few connects: the list is old or the calling times are wrong. Try evenings.", "Good connects, few visits: work on the pitch and objection replies.", "Many overdue follow-ups: the telecaller has too many leads, or is not starting the day with Follow Ups.", "Visits booked but not done: confirm every visit the day before."] },
      { h: "Coach, do not shout", p: ["Pick one number per person per week. Listen to two of their recorded calls together, if your phones allow recording, and agree on one change. Small fixes repeated daily beat a big meeting once a month."] },
      { h: "Where to see it", p: ["In Call Pro AI the owner dashboard shows calls, connects, follow-ups, site visits and bookings per telecaller, plus attendance. Use whatever tool you have, but check the same numbers every day."] },
    ],
  },
  {
    slug: "choose-free-crm-real-estate-telecallers",
    title: "Choosing a free CRM for real-estate telecallers in India: a checklist",
    description: "What to check before you pick a free CRM for a property calling team: dialing, follow-ups, Meta leads, recording limits, the hidden-cost questions and what to test in week one.",
    group: "Tools and how-to", date: "2026-10-18", minutes: 5, related: ["track-telecaller-performance", "call-facebook-leads-fast"],
    sections: [
      { p: ["\"Free\" can mean many things: a short trial, a free plan with key features locked, or truly free. Before you move your team, check these points. We build Call Pro AI, so we note our own answers too, honestly, limits included."] },
      { h: "1. Is it really free?", list: ["Is there a trial that ends?", "Are calling, follow-ups or users locked behind a paid plan?", "Is a card needed to sign up?"], p: ["Call Pro AI: free (₹0), no trial and no card."] },
      { h: "2. Does it fit how telecallers work?", list: ["Does the app tell the telecaller whom to call next?", "Is there an auto-dialer?", "Can a callback be booked for an exact time?"], p: ["Call Pro AI: an Android app with Call now, an auto-dialer and Follow Ups. There is no iPhone telecaller app yet."] },
      { h: "3. Do Meta leads arrive by themselves?", p: ["If leads still travel through a sheet, you lose hours. Call Pro AI pulls Meta lead-form leads automatically. Other portals need an Excel/CSV import."] },
      { h: "4. Ask honestly about call recording", p: ["Recording depends on the phone and its dialer. Any honest tool should tell you this. Test on your team's actual phones in week one."] },
      { h: "5. Can the owner see the day?", p: ["Calls, connects, overdue follow-ups and site visits per telecaller should be visible without asking anyone."] },
      { h: "What to test in week one", list: ["Add 50 real leads and call them all with the app", "Book callbacks and check they come back on time", "Try recording on each phone model you use", "Check the owner view every evening"] },
    ],
  },
  {
    slug: "record-sales-calls-android",
    title: "How to record sales calls automatically on Android (and why some phones can't)",
    description: "An honest guide to automatic call recording for real-estate sales teams on Android: what works, what depends on the phone, and how to tell buyers.",
    group: "Tools and how-to", date: "2026-10-18", minutes: 4, related: ["track-telecaller-performance", "buyer-objections-replies"],
    sections: [
      { p: ["Recorded calls are the best coaching tool a sales team has. But on Android, whether a call can be recorded automatically depends on the phone, not only on the app."] },
      { h: "Why it depends on the phone", p: ["Android limits apps from recording calls directly. On many phones, the phone's own dialer can record calls, and a CRM can then pick up that recording. Some dialers do not offer recording at all, and on those phones no app can record reliably."] },
      { h: "How to check your team's phones", list: ["Open the phone's own dialer settings and look for call recording", "If it is there, turn on automatic recording", "Make a test call and check the recording is saved", "Repeat on each phone model in your team"] },
      { h: "How Call Pro AI handles it", p: ["On phones that allow recording, the recording is attached to the lead and the app writes a short summary and a coaching tip. On phones that do not, the call is still logged on the lead, just without audio."] },
      { h: "Tell buyers", p: ["Let buyers know calls may be recorded, as your local rules require. A short line at the start of the call is enough."] },
      { h: "Use recordings for coaching", p: ["Do not just store them. Once a week, listen to two calls with each telecaller and agree on one thing to change."] },
    ],
  },
];

export const getPost = (slug: string) => POSTS.find((p) => p.slug === slug);
