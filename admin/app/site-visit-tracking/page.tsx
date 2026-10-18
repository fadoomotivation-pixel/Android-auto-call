import { IntentView } from "@/app/components/IntentView";
import { intentMetadata } from "@/lib/seo/intentMeta";

export const metadata = intentMetadata("site-visit-tracking", false);
export default function Page() {
  return <IntentView slug="site-visit-tracking" hi={false} />;
}
