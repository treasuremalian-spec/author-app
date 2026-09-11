import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// A real, plain-language Privacy Policy page (author request, 2026-09-07:
// "privacy... a policy, protecting everyone's information"). Written to
// describe what this app ACTUALLY does today, not an aspirational/generic
// template -- see the file-level comments in export-data.ts, docx-import.ts,
// and the Storage migrations for the real data flows this reflects.
//
// This is a Claude-drafted starting point, not legal advice -- it should
// get a real lawyer's review before it's presented to anyone as binding,
// especially once billing (Stripe) is added. See project memory
// security_notes.md for the info this was drafted from and what's still
// open. Update this page (and Stripe-specific language in it) when
// payments actually go live -- it currently accurately says there's no
// billing yet.

const EFFECTIVE_DATE = "September 11, 2026";
const CONTACT_EMAIL = "TheWriteHERsCorner@gmail.com";
const OPERATOR_NAME = "WriteHERs Corner";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg italic text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-2xl space-y-8">
        <Link
          href="/login"
          className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back
        </Link>

        <div className="space-y-2">
          <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Legal</span>
          <h1 className="font-display text-3xl italic text-foreground">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">
            Effective {EFFECTIVE_DATE}. {OPERATOR_NAME} operates this app (&quot;we,&quot; &quot;us&quot;). This
            page explains what information we collect, why, and what control you have over it -- in plain
            language, not legalese.
          </p>
        </div>

        <Section title="The short version">
          <p>
            Your manuscripts, characters, and notes are yours. We don&apos;t sell your data, we don&apos;t
            scan or use your writing to train any AI, and we don&apos;t give anyone -- including friends
            you connect with on this app -- access to your manuscript unless you explicitly share it with
            them. Word-count-only social features (like writing sprints) share numbers, never your actual
            text.
          </p>
        </Section>

        <Section title="What we collect">
          <p>Account information: your email address and password (handled securely by our authentication provider -- we never see or store your password in plain text), plus whatever you add to your author profile (display name, username, avatar).</p>
          <p>
            Your content: everything you write or upload inside the app -- manuscripts, chapters and
            scenes, characters, locations, story notes, cover images, and any images you insert into a
            manuscript.
          </p>
          <p>
            Usage &amp; activity data needed to run features you use: word-count totals (for progress
            tracking and writing sprints), online/writing/presence status if you use social features,
            friend requests and connections, sprint chat messages, and notifications.
          </p>
          <p>We do not currently collect payment information -- there is no paid subscription live yet. If that changes, this policy will be updated first, and payment details will always be handled directly by a licensed payment processor (e.g. Stripe), never stored on our own servers.</p>
        </Section>

        <Section title="How we use it">
          <p>
            To run the app: save and sync your writing across your devices, show your progress, power
            social features you opt into (friends, presence, sprints), and send you account-related
            emails (like confirming your email address).
          </p>
          <p>We do not use your manuscript content to train AI models, and we do not sell or rent your personal information to anyone.</p>
        </Section>

        <Section title="Who your data is shared with">
          <p>
            We use a small number of infrastructure providers to actually run the app -- they process
            data on our behalf, under their own security and privacy commitments, and don&apos;t use it
            for their own purposes:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium text-foreground">Supabase</span> -- authentication, our
              database, and file storage (covers, manuscript images, avatars).
            </li>
            <li>
              <span className="font-medium text-foreground">Vercel</span> -- hosting for the app itself.
            </li>
          </ul>
          <p>
            Other than these infrastructure providers, we share your account or content with a third
            party only if the law requires it, or if you explicitly direct us to (for example, by
            inviting a beta reader or editor to a project, once that feature exists).
          </p>
          <p>
            Friends you connect with on this app never automatically get access to your manuscripts --
            friendship and manuscript access are two entirely separate systems here. Sprint partners only
            ever see your word count, never your actual writing.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            We use exactly one cookie: a login session cookie set by our authentication provider
            (Supabase) that keeps you signed in as you move around the app. It&apos;s strictly
            necessary for the app to work -- without it, you&apos;d have to log in again on every
            page.
          </p>
          <p>
            We don&apos;t use any analytics, advertising, or tracking cookies, and we don&apos;t use
            cookies to build a profile of you or share your activity with advertisers. If that ever
            changes, we&apos;ll update this section and, where required, ask for your consent first.
          </p>
        </Section>

        <Section title="Your choices &amp; rights">
          <p>You can review and update your profile information directly in the app at any time.</p>
          <p>
            You can permanently delete your account and everything in it at any time from your
            profile page (look for &quot;Delete your account&quot; under the Danger Zone) -- this
            removes your projects, manuscripts, story bible entries, uploaded files, and your login
            itself, immediately and irreversibly. If you&apos;d rather we handle it for you, or you
            want a copy of your data first, email{" "}
            <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <Section title="Children's privacy">
          <p>This app is not directed to, and is not intended for use by, anyone under 13 years old.</p>
        </Section>

        <Section title="Data retention">
          <p>
            We keep your account and content for as long as your account is active, plus a reasonable
            period after a deletion request to complete the deletion across our systems and backups.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If this policy changes in a meaningful way, we&apos;ll update the effective date above and,
            where practical, let you know directly (for example, by email or an in-app notice).
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or your data? Email{" "}
            <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <p className="border-t border-border pt-4 text-xs text-muted-foreground">
          See also our <Link href="/terms" className="underline-offset-4 hover:underline">Terms of Service</Link>.
        </p>
      </div>
    </div>
  );
}
