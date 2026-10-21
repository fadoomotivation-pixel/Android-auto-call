import { TeleApp } from "../TeleApp";
export const metadata = { title: "Join your team" };
export default function Page({ searchParams }: { searchParams: { code?: string } }) {
  return <TeleApp start="join" code={(searchParams.code ?? "").toUpperCase().slice(0, 20)} />;
}
