import { IntentView } from "@/app/components/IntentView";
import { intentMetadata } from "@/lib/seo/intentMeta";

export const metadata = intentMetadata("facebook-lead-crm", false);
export default function Page() {
  return <IntentView slug="facebook-lead-crm" hi={false} />;
}
