import type { Metadata } from "next";
import { Geist_Mono, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Author App",
  description: "The creative home base for your books -- write, organize, sprint with friends, and format for publication, all in one place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* "Warm Industrial" site-wide texture -- see globals.css. Purely
            decorative, sits behind every page's real content. */}
        <div className="bg-grid-lines" aria-hidden="true">
          <div className="bg-grid-lines__inner">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} />
            ))}
          </div>
        </div>
        <div className="bg-noise" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
