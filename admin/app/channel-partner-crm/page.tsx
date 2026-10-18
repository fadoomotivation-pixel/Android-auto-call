import { IntentView } from "@/app/components/IntentView";
import { intentMetadata } from "@/lib/seo/intentMeta";

export const metadata = intentMetadata("channel-partner-crm", false);
export default function Page() {
  return <IntentView slug="channel-partner-crm" hi={false} />;
}
