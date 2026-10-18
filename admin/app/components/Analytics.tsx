import Script from "next/script";

// GA4, only when NEXT_PUBLIC_GA4_ID is set. Renders nothing otherwise.
export function Analytics() {
  const id = process.env.NEXT_PUBLIC_GA4_ID;
  if (!id || !/^G-[A-Z0-9]+$/i.test(id)) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga4" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`}
      </Script>
    </>
  );
}
