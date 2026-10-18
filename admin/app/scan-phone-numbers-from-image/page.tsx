import { IntentView } from "@/app/components/IntentView";
import { intentMetadata } from "@/lib/seo/intentMeta";

export const metadata = intentMetadata("scan-phone-numbers-from-image", false);
export default function Page() {
  return <IntentView slug="scan-phone-numbers-from-image" hi={false} />;
}
