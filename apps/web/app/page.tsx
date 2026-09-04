import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const pillars = [
  {
    title: "Write & organize",
    body: "A structured manuscript editor -- Book, Part, Chapter, Scene -- with drag-and-drop, autosave, and a story bible for characters, worlds, and plot.",
  },
  {
    title: "Write with friends",
    body: "See who's online and sprint together in real time. Only word counts are ever shared -- your manuscript stays yours.",
  },
  {
    title: "Format & publish",
    body: "Design a beautiful interior, then export a real EPUB and print-ready PDF without leaving your workspace.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl font-semibold text-primary">
          Author App
        </span>
        <div className="flex items-center gap-3">
          <Button variant="ghost" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link href="/sign-up">Get started</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-6 py-16 text-center">
        <span className="mb-6 rounded-full bg-secondary px-4 py-1.5 text-sm font-medium text-secondary-foreground">
          Your whole book, one creative home
        </span>
        <h1 className="font-display max-w-3xl text-4xl font-semibold leading-tight text-balance sm:text-5xl">
          The writing space built for authors, not office workers
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Plan your story, draft your manuscript, sprint with your writing
          friends, and format your finished book for publication -- all in
          one place that actually feels good to open.
        </p>
        <div className="mt-8 flex gap-3">
          <Button size="lg" asChild>
            <Link href="/sign-up">Start writing</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">I already have an account</Link>
          </Button>
        </div>

        <div className="mt-20 grid gap-6 sm:grid-cols-3">
          {pillars.map((p) => (
            <Card key={p.title} className="text-left">
              <CardContent className="pt-6">
                <h3 className="font-display text-lg font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 py-8 text-center text-sm text-muted-foreground">
        Author App -- currently in private beta.
      </footer>
    </div>
  );
}
