// Placeholder for the Book Dashboard (built in the next phase). For now this
// just confirms sign-up -> onboarding -> logged-in-area works end to end.
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

export default function DashboardPlaceholder() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-2xl font-semibold">
        You're in! Your library is being built next.
      </h1>
      <p className="max-w-md text-muted-foreground">
        This is where your book library and dashboard will live. Onboarding
        and accounts are working -- the writing tools come in the next phase.
      </p>
      <form action={signOut}>
        <Button variant="outline" type="submit">
          Log out
        </Button>
      </form>
    </div>
  );
}
