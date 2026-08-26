import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ConditionalLayout } from "@/components/conditional-layout";


export const metadata: Metadata = {
  title: "RogerOS — Green Pixxel",
  description: "RogerOS by Green Pixxel",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const themeBootstrap = `(function(){try{var saved=localStorage.getItem('rogeros-theme');var theme=saved==='light'||saved==='dark'?saved:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var root=document.documentElement;root.dataset.theme=theme;root.classList.toggle('dark',theme==='dark');root.style.colorScheme=theme;}catch(_){document.documentElement.dataset.theme='dark';document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body className="min-h-screen">
        <ConditionalLayout>{children}</ConditionalLayout>
      </body>
    </html>
  );
}
