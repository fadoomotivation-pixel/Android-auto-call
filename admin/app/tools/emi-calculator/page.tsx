import type { Metadata } from "next";
import { ToolFrame } from "../ToolFrame";
import { EmiCalculator } from "./Emi";

export const metadata: Metadata = {
  title: { absolute: "Home Loan EMI Calculator (free) · Call Pro AI" },
  description: "Free home loan EMI calculator for property buyers in India. Enter price, down payment, rate and tenure to see the monthly EMI, total interest and total payment.",
  alternates: { canonical: "/tools/emi-calculator" },
};

const FAQ = [
  { q: "How is the EMI calculated?", a: "With the standard reducing-balance formula: EMI = P × r × (1 + r)^n ÷ ((1 + r)^n − 1), where P is the loan amount, r is the monthly interest rate and n is the number of months." },
  { q: "Is this the bank's final EMI?", a: "No. It is an estimate. The bank's sanctioned rate, processing fees and any rate changes will change the real EMI." },
  { q: "How do telecallers use it?", a: "Buyers often ask about the monthly payment on the first call. Work it out here and send it on WhatsApp right after the call." },
];

export default function Page() {
  return (
    <ToolFrame slug="emi-calculator" name="Home loan EMI calculator" lead="This free calculator shows the monthly EMI, total interest and total payment for a home loan. It runs in your browser, and nothing you type is sent anywhere." faq={FAQ}>
      <EmiCalculator />
    </ToolFrame>
  );
}
