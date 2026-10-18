import { IntentView } from "@/app/components/IntentView";
import { intentMetadata } from "@/lib/seo/intentMeta";

export const metadata = intentMetadata("follow-up-reminder-app", false);
export default function Page() {
  return <IntentView slug="follow-up-reminder-app" hi={false} />;
}
