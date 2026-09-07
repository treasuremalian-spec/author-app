import Link from "next/link";

// A real, plain-language Terms of Service page (author request, 2026-09-07,
// alongside the Privacy Policy). Reflects the app as it actually exists
// today -- an invite/beta-stage product with no live billing yet -- not a
// generic template with placeholder features.
//
// This is a Claude-drafted starting point, not legal advice -- it should
// get a real lawyer's review before it's presented to anyone as binding,
// especially once billing (Stripe) is added and the user base grows past
// friends-and-family beta. See project memory security_notes.md.

const EFFECTIVE_DATE = "September 7, 2026";
const CONTACT_EMAIL = "TheWriteHERsCorner@gmail.com";
const OPERATOR_NAME = "WriteHERs Corner";
const GOVERNING_STATE = "New York";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-muted/20 px-6 py-12">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <Link href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
            &larr; Back
          </Link>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">
            Effective {EFFECTIVE_DATE}. By creating an account or using this app, you&apos;re agreeing to
            these terms with {OPERATOR_NAME} (&quot;we,&quot; &quot;us&quot;).
          </p>
        </div>

        <Section title="This is an early-stage beta">
          <p>
            This app is currently in a private, invite-stage beta. Features may change, break, or be
            removed without much notice, and we can&apos;t guarantee 100% uptime or that your data will
            never be lost -- though we take reasonable care to prevent that (regular backups, careful
            testing before changes ship). Please don&apos;t treat this as your only copy of anything
            irreplaceable; keep your own backup of work that matters to you.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            You&apos;re responsible for keeping your login credentials secure and for what happens under
            your account. Tell us right away if you think someone else has accessed it.
          </p>
          <p>You must be at least 13 years old to use this app.</p>
        </Section>

        <Section title="Your content stays yours">
          <p>
            You own everything you write, upload, or create here -- your manuscripts, characters,
            worldbuilding notes, and images. We don&apos;t claim any ownership over it. We need a limited
            license to store, back up, and display your content back to you (and to anyone you explicitly
            share it with) purely so the app can function -- nothing more.
          </p>
          <p>
            You&apos;re responsible for making sure you have the right to upload whatever you upload
            (for example, images you didn&apos;t create yourself).
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>Please don&apos;t use this app to:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Upload content that&apos;s illegal, or that infringes someone else&apos;s copyright or other rights.</li>
            <li>Harass, threaten, or abuse other users (including in sprint chat).</li>
            <li>Attempt to access another user&apos;s account or content without permission, or otherwise try to break, probe, or overload the app.</li>
            <li>Use the app to build a competing product by scraping or copying its content or code.</li>
          </ul>
          <p>We may suspend or terminate an account that violates these terms.</p>
        </Section>

        <Section title="No paid subscription yet">
          <p>
            There is no paid tier live at the moment -- everyone in this beta is on a free plan. If and
            when paid plans launch, pricing, billing terms, and a payment processor&apos;s own terms will
            be presented clearly before you&apos;re ever charged, and this page will be updated.
          </p>
        </Section>

        <Section title="Ending your account">
          <p>
            You can ask us to delete your account and content at any time by emailing{" "}
            <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            . We may also suspend or end an account that violates these terms or is inactive for an
            extended period, with notice where practical.
          </p>
        </Section>

        <Section title="“As is,” and limits on our liability">
          <p>
            This app is provided &quot;as is,&quot; without warranties of any kind. To the fullest extent
            the law allows, {OPERATOR_NAME} isn&apos;t liable for indirect, incidental, or consequential
            damages arising from your use of the app, including loss of data or content -- which is why we
            recommend keeping your own backup of anything irreplaceable, especially during this beta
            period.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            We may update these terms as the app grows. If a change is significant, we&apos;ll do our best
            to let you know directly. Continuing to use the app after a change means you accept the
            updated terms.
          </p>
        </Section>

        <Section title="Governing law">
          <p>These terms are governed by the laws of the State of {GOVERNING_STATE}, without regard to conflict-of-law principles.</p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about these terms? Email{" "}
            <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <p className="border-t border-border pt-4 text-xs text-muted-foreground">
          See also our <Link href="/privacy" className="underline-offset-4 hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
