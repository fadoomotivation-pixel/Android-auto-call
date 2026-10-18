import { IntentView } from "@/app/components/IntentView";
import { intentMetadata } from "@/lib/seo/intentMeta";

export const metadata = intentMetadata("call-recording-crm", false);
export default function Page() {
  return <IntentView slug="call-recording-crm" hi={false} />;
}
