import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FancyMDPrinter — GFM Live Previewer & PDF/PNG Exporter",
  description:
    "Upload a folder of Markdown files or import one from a URL, and get real-time GitHub-Flavored Markdown preview with PDF and PNG export — all in your browser.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
