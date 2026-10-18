import { IntentView } from "@/app/components/IntentView";
import { intentMetadata } from "@/lib/seo/intentMeta";

export const metadata = intentMetadata("free-real-estate-crm", false);
export default function Page() {
  return <IntentView slug="free-real-estate-crm" hi={false} />;
}
