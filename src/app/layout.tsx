import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vermietungs-Dashboard",
  description: "Ferienwohnungs-Management mit Smoobu-Integration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
