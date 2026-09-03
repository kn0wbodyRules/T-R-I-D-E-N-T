import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/providers/Providers";
import TopNavWrapper from "@/components/layout/TopNavWrapper";
import TopoField from "@/components/ui/topo-field";

export const metadata: Metadata = {
  title: "TRIDENT",
  description: "Evidence-grade maritime SAR oil spill detection, backtrack drift modeling, and suspect attribution platform.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full print:h-auto print:block">
      <head>
        {/* Google Fonts: Climate Crisis & Alata */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Alata&family=Archivo+Black&family=Climate+Crisis:YEAR@1979&display=swap"
          rel="stylesheet"
        />
        {/* Google Material Symbols Outlined font for UI Icons */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
        {/* Leaflet CSS */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        />
        {/* Ensure pure White & Dodger Blue Theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                document.documentElement.classList.remove('dark');
                localStorage.removeItem('trident-theme');
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col print:h-auto print:block text-[#041527] selection:bg-[#005A9C] selection:text-white antialiased">
        <Providers>
          {/* Global Background */}
          <div className="fixed inset-0 pointer-events-none z-[0] opacity-60">
            <TopoField mode="light" density={1} speed={1.5} />
          </div>
          
          <div className="relative z-10 flex-1 flex flex-col w-full h-full">
            <TopNavWrapper />
            <main className="flex-1 flex flex-col print:block w-full relative">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
