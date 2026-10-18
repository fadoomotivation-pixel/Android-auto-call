import { notFound } from "next/navigation";
import { IntentView } from "@/app/components/IntentView";
import { intentMetadata } from "@/lib/seo/intentMeta";
import { HI_INTENT_SLUGS } from "@/lib/seo/intentSlugs";

export const dynamicParams = false;
export function generateStaticParams() { return HI_INTENT_SLUGS.map((intent) => ({ intent })); }
export function generateMetadata({ params }: { params: { intent: string } }) { return intentMetadata(params.intent, true); }
export default function Page({ params }: { params: { intent: string } }) {
  if (!HI_INTENT_SLUGS.includes(params.intent)) notFound();
  return <IntentView slug={params.intent} hi />;
}
