"use client";
import { useMemo, useState } from "react";
import { CopyBox, Field, Pick } from "../CopyBox";

type Kind = "visit" | "followup" | "details" | "thanks";

export function buildWa(o: { kind: Kind; buyer: string; you: string; company: string; project: string; when: string; map: string }) {
  const N = o.buyer || "ji", Y = o.you || "Rahul", C = o.company || "our team", P = o.project || "our project";
  const M = o.map ? `\n📍 Location: ${o.map}` : "";
  const W = o.when || "Sunday, 11 am";
  switch (o.kind) {
    case "visit": return `Namaste ${N} 🙏\nYour site visit to ${P} is fixed for ${W}.${M}\nI'll meet you at the site. If anything changes, just reply here.\n— ${Y}, ${C}`;
    case "followup": return `Namaste ${N} 🙏\nThis is ${Y} from ${C}. We spoke about ${P}. Do you have any questions about the price, payment plan or location?\nWould ${W} work for a site visit?`;
    case "details": return `Namaste ${N} 🙏\nAs discussed, here are the details of ${P}.${M}\nI'm happy to explain the payment plan on a call. When is a good time?\n— ${Y}, ${C}`;
    case "thanks": return `Thank you for visiting ${P} today, ${N} 🙏\nIf you or your family have any questions, message me here anytime.\nShall I call you on ${W} to talk about the next step?\n— ${Y}, ${C}`;
  }
}

export function WaMaker() {
  const [s, set] = useState({ kind: "visit" as Kind, buyer: "", you: "", company: "", project: "", when: "", map: "" });
  const up = (k: keyof typeof s) => (v: string) => set((o) => ({ ...o, [k]: v }));
  const text = useMemo(() => buildWa(s), [s]);
  return (
    <>
      <h2>Your details</h2>
      <div className="st-card st-pad">
        <Pick label="Message" value={s.kind} onChange={up("kind")} options={[["visit", "Site visit invite"], ["followup", "Follow-up"], ["details", "Project details"], ["thanks", "Thank you after the visit"]]} />
        <Field label="Buyer's name" value={s.buyer} onChange={up("buyer")} placeholder="Sharma ji" />
        <Field label="Project" value={s.project} onChange={up("project")} placeholder="Project name" />
        <Field label="Day and time" value={s.when} onChange={up("when")} placeholder="Sunday, 11 am" />
        <Field label="Map link (optional)" value={s.map} onChange={up("map")} placeholder="https://maps.google.com/…" />
        <Field label="Your name" value={s.you} onChange={up("you")} placeholder="Rahul" />
        <Field label="Company" value={s.company} onChange={up("company")} placeholder="Your company" />
      </div>
      <h2>Your message</h2>
      <CopyBox text={text} wa />
    </>
  );
}
