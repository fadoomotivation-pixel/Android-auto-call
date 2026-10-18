import { IntentView } from "@/app/components/IntentView";
import { intentMetadata } from "@/lib/seo/intentMeta";

export const metadata = intentMetadata("real-estate-crm-for-brokers", false);
export default function Page() {
  return <IntentView slug="real-estate-crm-for-brokers" hi={false} />;
}
