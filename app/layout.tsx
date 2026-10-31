import AppNav from "@/components/AppNav";
import { pageMetadata } from "@/lib/sidebar-config";
import "./globals.css";

// The root route is the Issues page.
export const metadata = pageMetadata("/");

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full" data-theme="light" suppressHydrationWarning>
      <head>
        {/* Apply the saved (or system) theme before first paint to avoid a flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="flex min-h-full">
        <AppNav />
        <div className="min-w-0 flex-1">{children}</div>
      </body>
    </html>
  );
}
