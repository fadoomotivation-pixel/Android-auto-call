import type { Metadata } from "next";
import { ToolFrame } from "../ToolFrame";
import { ScriptGenerator } from "./Script";

export const metadata: Metadata = {
  title: { absolute: "Real Estate Call Script Generator (free, Hinglish + English) · Call Pro AI" },
  description: "Free call script generator for property telecallers: first call, follow-up and site visit confirmation scripts in Hinglish or English, filled with your project details.",
  alternates: { canonical: "/tools/call-script-generator" },
};

const FAQ = [
  { q: "Does this use AI?", a: "No. It fills tested templates with your details in your browser. Nothing you type is sent anywhere." },
  { q: "Which scripts can I make?", a: "A first call to a new lead, a follow-up call and a site visit confirmation call, in Hinglish or English." },
  { q: "Should telecallers read it word for word?", a: "No. Use it as a guide: ask the questions in order, listen, and always end with an exact next step and time." },
];

export default function Page() {
  return (
    <ToolFrame slug="call-script-generator" name="Call script generator" lead="This free tool writes a real-estate call script from your project details, in Hinglish or English. It runs in your browser, and nothing you type is sent anywhere." faq={FAQ}>
      <ScriptGenerator />
    </ToolFrame>
  );
}
