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
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create your author account</CardTitle>
          <CardDescription>
            You're joining a private beta -- welcome in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {params["check-email"] ? (
            <p className="rounded-lg bg-secondary p-3 text-sm text-secondary-foreground">
              Check your email for a confirmation link to finish setting up
              your account.
            </p>
          ) : (
            <form action={signUp} className="space-y-4">
              {params.error && (
                <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {params.error}
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full">
                Create account
              </Button>
            </form>
          )}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
