import { IntentView } from "@/app/components/IntentView";
import { intentMetadata } from "@/lib/seo/intentMeta";

export const metadata = intentMetadata("telecaller-crm", false);
export default function Page() {
  return <IntentView slug="telecaller-crm" hi={false} />;
}
