"use client";
import { useMemo, useState } from "react";
import { CopyBox, Field, Pick } from "../CopyBox";

type Stage = "first" | "followup" | "visit";
type Lang = "hinglish" | "english";

// Fixed templates filled with your details. No AI, nothing leaves the browser.
export function buildScript(o: { you: string; company: string; project: string; type: string; area: string; budget: string; stage: Stage; lang: Lang }) {
  const P = o.project || "our project", A = o.area || "the area", T = o.type || "plot", Y = o.you || "Rahul", C = o.company || "our company";
  const B = o.budget ? (o.lang === "hinglish" ? ` Aapka budget lagbhag ${o.budget} hai na?` : ` Your budget is around ${o.budget}, right?`) : "";
  if (o.lang === "hinglish") {
    if (o.stage === "first") return `Namaste, main ${Y} bol raha hoon ${C} se. Aapne ${P} ke ${T} ke liye enquiry ki thi, ${A} mein. Kya 2 minute baat kar sakte hain?

1. Zaroorat samjhein: "Aap khud rehne ke liye dekh rahe hain ya investment ke liye?"
2. Budget:${B || ` "Aapka comfortable budget kitna hai?"`}
3. Location: "${A} mein aapko kaunsi jagah sabse sahi lagti hai?"
4. Family: "Faisla aap akele lenge ya family ke saath?"
5. Agla kadam: "Site dekhne ke liye Sunday 11 baje ya Saturday 4 baje, kaunsa time theek rahega?"

Agar busy hain: "Koi baat nahi, aaj shaam 7 baje call karoon?"
End: "Main abhi WhatsApp par location aur details bhej raha hoon. Dhanyavaad!"`;
    if (o.stage === "followup") return `Namaste, main ${Y} ${C} se. Pichhli baar humne ${P} ke ${T} ke baare mein baat ki thi.

1. Yaad dilaayein: "Aapne kaha tha family se baat karke batayenge."
2. Poochhein: "Kya aapko koi sawal hai, price, payment plan ya location ke baare mein?"
3. Ek fact: project ki ek nayi ya kaam ki baat batayein, jaise possession, approval ya payment plan.
4. Agla kadam: "Ek baar site dekh lijiye, Sunday 11 baje kaisa rahega?"

Agar "abhi nahi": "Theek hai, main 15 din baad call karoon?" Aur exact date note karein.`;
    return `Namaste, main ${Y} ${C} se. Kal ${P} par aapki site visit hai, ${A} mein.

1. Confirm: "Aap kal kitne baje tak pahunchenge?"
2. Kaun aa raha hai: "Family se kaun kaun saath aayega?"
3. Location: "Main abhi location ka pin WhatsApp par bhej raha hoon."
4. Madad: "Rasta dhoondhne mein dikkat ho toh mujhe call kar lijiye."

End: "Main site par aapka intezaar karunga. Dhanyavaad!"`;
  }
  if (o.stage === "first") return `Hello, this is ${Y} from ${C}. You enquired about a ${T} at ${P} in ${A}. Do you have two minutes?

1. Need: "Are you buying to live in, or as an investment?"
2. Budget:${B || ` "What budget are you comfortable with?"`}
3. Location: "Which part of ${A} suits you best?"
4. Family: "Will you decide alone or with your family?"
5. Next step: "Would Sunday 11 am or Saturday 4 pm work for a site visit?"

If busy: "No problem. Can I call you at 7 pm today?"
Close: "I'm sending the location and details on WhatsApp now. Thank you!"`;
  if (o.stage === "followup") return `Hello, this is ${Y} from ${C}. We spoke last time about a ${T} at ${P}.

1. Remind: "You said you'd discuss it with your family."
2. Ask: "Any questions about the price, payment plan or location?"
3. One fact: share one useful update, such as possession, approval or the payment plan.
4. Next step: "Shall we fix a site visit, maybe Sunday at 11 am?"

If "not now": "Sure. Shall I call you in 15 days?" Note the exact date.`;
  return `Hello, this is ${Y} from ${C}. Your site visit to ${P} in ${A} is tomorrow.

1. Confirm: "What time will you reach?"
2. Who is coming: "Who from your family will join?"
3. Location: "I'm sending the location pin on WhatsApp now."
4. Help: "If you can't find the way, just call me."

Close: "I'll be waiting at the site. Thank you!"`;
}

export function ScriptGenerator() {
  const [s, set] = useState({ you: "", company: "", project: "", type: "plot", area: "", budget: "", stage: "first" as Stage, lang: "hinglish" as Lang });
  const up = (k: keyof typeof s) => (v: string) => set((o) => ({ ...o, [k]: v }));
  const text = useMemo(() => buildScript(s), [s]);
  return (
    <>
      <h2>Your details</h2>
      <div className="st-card st-pad">
        <Pick label="Call type" value={s.stage} onChange={up("stage")} options={[["first", "First call to a new lead"], ["followup", "Follow-up call"], ["visit", "Site visit confirmation"]]} />
        <Pick label="Language" value={s.lang} onChange={up("lang")} options={[["hinglish", "Hinglish"], ["english", "English"]]} />
        <Pick label="Property type" value={s.type as "plot"} onChange={up("type")} options={[["plot", "Plot"], ["flat", "Flat"], ["villa", "Villa"], ["house", "House"], ["shop", "Shop"]]} />
        <Field label="Your name" value={s.you} onChange={up("you")} placeholder="Rahul" />
        <Field label="Company" value={s.company} onChange={up("company")} placeholder="Your company" />
        <Field label="Project" value={s.project} onChange={up("project")} placeholder="Project name" />
        <Field label="Area / city" value={s.area} onChange={up("area")} placeholder="Mathura" />
        <Field label="Buyer's budget (optional)" value={s.budget} onChange={up("budget")} placeholder="₹40 lakh" />
      </div>
      <h2>Your script</h2>
      <CopyBox text={text} />
    </>
  );
}
