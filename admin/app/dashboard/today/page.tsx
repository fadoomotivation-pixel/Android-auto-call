/**
 * /dashboard/today moved to /dashboard/actions.
 *
 * The page was called "Today" for about an hour before the name was found to
 * be wrong: its top row is routinely a thirty-day-old site visit, and "Today"
 * promises work that arrived this morning. Anyone who bookmarked it in that
 * window — or has it open in a tab right now — lands here.
 */
import { redirect } from "next/navigation";

export default function TodayMoved() {
  redirect("/dashboard/actions");
}
