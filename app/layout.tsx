import type { Metadata } from "next";
import AppNav from "@/components/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Issue Tracker",
  description: "Track, manage, and resolve reported issues.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">
        <AppNav />
        {children}
      </body>
    </html>
  );
}
