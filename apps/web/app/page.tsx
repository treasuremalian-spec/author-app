import Link from "next/link";
import { BookOpen, FileDown, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const navLinks = [
  { label: "Write", href: "#write" },
  { label: "Together", href: "#together" },
  { label: "Publish", href: "#publish" },
];

const rows = [
  {
    index: "01",
    title: "Write & organize",
    body: "A structured manuscript editor -- Book, Part, Chapter, Scene -- with drag-and-drop, autosave, and a story bible for characters, worlds, and plot.",
    icon: BookOpen,
  },
  {
    index: "02",
    title: "Write with friends",
    body: "See who's online and sprint together in real time. Only word counts are ever shared -- your manuscript stays yours.",
    icon: Users,
  },
  {
    index: "03",
    title: "Format & publish",
    body: "Design a beautiful interior, then export a real EPUB and print-ready PDF without leaving your workspace.",
    icon: FileDown,
  },
];

const marqueeWords = ["WRITE", "ORGANIZE", "SPRINT", "FORMAT", "PUBLISH"];

export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 h-20 border-b border-border bg-background/80 backdrop-blur-[10px]">
        <div className="relative mx-auto flex h-full w-full max-w-[1600px] items-center justify-between px-6">
          <nav className="hidden items-center gap-8 sm:flex">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/"
            className="static whitespace-nowrap text-xl sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"
          >
            <span className="font-display italic">Author</span>{" "}
            <span className="font-sans font-black uppercase tracking-tight">
              App
            </span>
          </Link>

          <Button
            variant="outline"
            size="sm"
            asChild
            className="border-foreground text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-foreground hover:text-background"
          >
            <Link href="/sign-up">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* Split hero -- 7/5 columns */}
        <section className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-10 px-6 py-16 sm:py-24 lg:grid-cols-12 lg:gap-6 lg:py-28">
          <div className="flex flex-col justify-center lg:col-span-7">
            <span className="mb-8 inline-flex w-fit items-center gap-2 border border-border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-success" />
              Available for beta writers
            </span>

            <h1 className="text-6xl font-black uppercase leading-[0.9] tracking-[-0.03em] sm:text-8xl lg:text-9xl">
              <span className="stroke-text block">The writing</span>
              <span className="block">space built</span>
              <span className="font-display block italic text-accent">
                for authors.
              </span>
            </h1>

            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              <span>Manuscript editor</span>
              <span>Story bible</span>
              <span>EPUB + print export</span>
            </div>

            <p className="mt-8 max-w-md text-base text-muted-foreground">
              Plan your story, draft your manuscript, sprint with your
              writing friends, and format your finished book for
              publication -- all in one place that actually feels good to
              open.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-6">
              <Button
                size="lg"
                asChild
                className="text-[11px] font-bold uppercase tracking-[0.15em]"
              >
                <Link href="/sign-up">Start writing</Link>
              </Button>
              <Link
                href="/login"
                className="text-xs font-bold uppercase tracking-[0.15em] underline decoration-1 underline-offset-4 transition-colors hover:text-accent"
              >
                I already have an account
              </Link>
            </div>
          </div>

          <div className="relative min-h-[420px] lg:col-span-5">
            <div className="absolute inset-0 border border-border bg-card p-5">
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden border border-border bg-foreground">
                <BookOpen
                  className="size-24 text-background/15"
                  strokeWidth={1}
                />

                <div className="absolute bottom-4 left-4 right-4 border border-background/20 bg-background/10 p-4 backdrop-blur-md">
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.15em] text-background">
                    <span>Manuscript</span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-success" />
                      Drafting
                    </span>
                  </div>
                  <div className="mt-3 space-y-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-background/70">
                    <div className="flex justify-between">
                      <span>Words</span>
                      <span>82,140</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Chapter</span>
                      <span>14 / 22</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sprint</span>
                      <span>Live</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Marquee ticker */}
        <div className="overflow-hidden border-y border-border bg-card py-6">
          <div className="marquee-track">
            {[0, 1].map((rep) => (
              <div key={rep} className="flex shrink-0 items-center">
                {marqueeWords.map((w, i) => (
                  <span key={`${rep}-${w}`} className="flex items-center">
                    <span
                      className={
                        i % 2 === 0
                          ? "stroke-text px-6 text-5xl font-black uppercase sm:text-7xl"
                          : "font-display px-6 text-5xl italic sm:text-7xl"
                      }
                    >
                      {w}
                    </span>
                    <Star className="size-5 shrink-0 fill-accent text-accent" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Hover-reveal feature rows */}
        <section id="write" className="mx-auto w-full max-w-[1600px] px-6">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <div
                key={row.index}
                id={row.index === "02" ? "together" : row.index === "03" ? "publish" : undefined}
                className="group relative flex min-h-[220px] items-center gap-8 overflow-hidden border-b border-border py-10 sm:min-h-[280px]"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {row.index}
                </span>

                <div className="relative z-10 max-w-2xl flex-1">
                  <h3 className="font-display text-3xl italic transition-all duration-300 ease-[var(--ease-industrial)] group-hover:font-sans group-hover:font-black group-hover:not-italic group-hover:uppercase group-hover:tracking-tight sm:text-5xl">
                    {row.title}
                  </h3>
                  <p className="mt-3 max-w-lg text-sm text-muted-foreground">
                    {row.body}
                  </p>
                </div>

                <div className="pointer-events-none absolute inset-y-0 right-0 flex w-[45%] items-center justify-center border-l border-border bg-foreground [clip-path:inset(0_0_0_100%)] transition-[clip-path] duration-500 ease-[var(--ease-industrial)] group-hover:[clip-path:inset(0_0_0_0)] max-lg:hidden">
                  <Icon className="size-16 text-background/25" strokeWidth={1} />
                </div>

                <div className="pointer-events-none absolute right-8 top-1/2 flex size-14 -translate-y-1/2 items-center justify-center rounded-full border border-foreground bg-background text-[10px] font-bold uppercase tracking-[0.1em] opacity-0 transition-opacity duration-300 group-hover:opacity-100 max-lg:hidden">
                  View
                </div>
              </div>
            );
          })}
        </section>

        {/* Pull quote / secondary CTA */}
        <section className="mx-auto w-full max-w-[1600px] border-b border-border px-6 py-20 text-center">
          <p className="font-display mx-auto max-w-xl text-2xl italic sm:text-3xl">
            &ldquo;The writing space built for authors, not office
            workers.&rdquo;
          </p>
          <div className="mt-8 flex justify-center">
            <Button
              size="lg"
              asChild
              className="text-[11px] font-bold uppercase tracking-[0.15em]"
            >
              <Link href="/sign-up">Start writing</Link>
            </Button>
          </div>
        </section>
      </main>

      {/* Massive footer */}
      <footer className="relative overflow-hidden border-t border-border bg-foreground text-background">
        <div className="relative z-10 mx-auto w-full max-w-[1600px] px-6 pt-16">
          <Link href="/sign-up" className="group inline-block">
            <span className="font-display border-b border-background/30 pb-1 text-4xl italic transition-colors group-hover:border-accent group-hover:text-accent sm:text-6xl">
              Start writing today
            </span>
          </Link>

          <div className="mt-16 flex flex-wrap gap-8 border-t border-background/15 pt-8 font-mono text-[10px] uppercase tracking-[0.15em] text-background/60">
            <Link href="/login" className="transition-colors hover:text-background">
              Log in
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-background">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-background">
              Terms
            </Link>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none relative mt-4 select-none overflow-hidden whitespace-nowrap text-center font-black uppercase leading-none"
          style={{
            fontSize: "20vw",
            WebkitTextStroke: "1px var(--background)",
            color: "transparent",
            opacity: 0.12,
          }}
        >
          Author App
        </div>

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-t border-background/15 px-6 py-4 font-mono text-[10px] uppercase tracking-[0.15em] text-background/50">
          <span className="flex items-center gap-2">
            <span className="size-1.5 animate-pulse rounded-full bg-success" />
            System operational
          </span>
          <span>&copy; {new Date().getFullYear()} Author App -- private beta</span>
        </div>
      </footer>
    </div>
  );
}
