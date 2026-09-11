import Link from "next/link";
import { signUp } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ["check-email"]?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border px-6 py-6">
        <Link href="/" className="text-xl">
          <span className="font-display italic">Author</span>{" "}
          <span className="font-sans font-black uppercase tracking-tight">App</span>
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="w-full max-w-sm shadow-none">
          <CardHeader>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Private beta
            </span>
            <CardTitle className="text-2xl font-normal italic">Create your author account</CardTitle>
            <CardDescription>You&apos;re joining a private beta -- welcome in.</CardDescription>
          </CardHeader>
          <CardContent>
            {params["check-email"] ? (
              <p className="border border-border bg-secondary p-3 text-sm text-secondary-foreground">
                Check your email for a confirmation link to finish setting up
                your account.
              </p>
            ) : (
              <form action={signUp} className="space-y-4">
                {params.error && (
                  <p className="border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    {params.error}
                  </p>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                    Email
                  </Label>
                  <Input id="email" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                    Password
                  </Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" className="w-full text-xs font-bold uppercase tracking-[0.15em]">
                  Create account
                </Button>
              </form>
            )}
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-foreground underline-offset-4 hover:text-accent hover:underline">
                Log in
              </Link>
            </p>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              By creating an account, you agree to our{" "}
              <Link href="/terms" className="underline-offset-4 hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline-offset-4 hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
