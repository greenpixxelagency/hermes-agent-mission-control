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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" className="dark">
      <body className="bg-[#0a0a0a] text-white min-h-screen">
        <ConditionalLayout>{children}</ConditionalLayout>
      </body>
    </html>
  );
}
