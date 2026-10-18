import type { Metadata } from "next";
import { ToolFrame } from "../ToolFrame";
import { WaMaker } from "./Wa";

export const metadata: Metadata = {
  title: { absolute: "WhatsApp Template Maker for Real Estate (free) · Call Pro AI" },
  description: "Free WhatsApp message maker for property telecallers: site visit invite, follow-up, project details and thank-you messages. Copy or open in WhatsApp.",
  alternates: { canonical: "/tools/whatsapp-template-maker" },
};

const FAQ = [
  { q: "Is this a WhatsApp Business API template?", a: "No. It writes a ready message you can copy or open in WhatsApp and send yourself. It does not send anything for you." },
  { q: "Is anything sent to Call Pro AI?", a: "No. The message is made in your browser." },
  { q: "When should I send a site visit invite?", a: "Right after the call where the buyer agreed to visit, with the exact day, time and map link." },
];

export default function Page() {
  return (
    <ToolFrame slug="whatsapp-template-maker" name="WhatsApp template maker" lead="This free tool writes ready WhatsApp messages for property buyers: site visit invite, follow-up, project details and thank you. Copy it or open it straight in WhatsApp." faq={FAQ}>
      <WaMaker />
    </ToolFrame>
  );
}
