import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Infinigen-R3F | Procedural Generation Engine",
  description: "TypeScript port of Princeton's Infinigen procedural generation system for React Three Fiber",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
