import { IntentView } from "@/app/components/IntentView";
import { intentMetadata } from "@/lib/seo/intentMeta";

export const metadata = intentMetadata("whatsapp-crm-real-estate", false);
export default function Page() {
  return <IntentView slug="whatsapp-crm-real-estate" hi={false} />;
}
