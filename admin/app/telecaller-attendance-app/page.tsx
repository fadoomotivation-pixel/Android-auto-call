import { IntentView } from "@/app/components/IntentView";
import { intentMetadata } from "@/lib/seo/intentMeta";

export const metadata = intentMetadata("telecaller-attendance-app", false);
export default function Page() {
  return <IntentView slug="telecaller-attendance-app" hi={false} />;
}
