import Link from "next/link";
import {
  FileSearch,
  Quote,
  GitCompare,
  Lock,
  ShieldCheck,
  KeyRound,
  Users,
  ScrollText,
  Send,
  Mail,
} from "lucide-react";
import { cookies } from "next/headers";
import MatrixHero from "@/components/MatrixHero";
import StackedCube from "@/components/StackedCube";
import HeaderAuthControls from "@/components/HeaderAuthControls";
import { ensureSchema } from "@/lib/db";
import { SESSION_COOKIE, getUserByToken } from "@/lib/auth";

export default async function Home() {
  await ensureSchema();
  const token = cookies().get(SESSION_COOKIE)?.value;
  const user = await getUserByToken(token);
  const contactEmail = process.env.CONTACT_EMAIL?.trim() || null;

  return (
    <main className="bg-grain relative min-h-screen overflow-hidden bg-ink-950">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-0 h-[32rem] w-[32rem] rounded-full bg-saffron-500/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 h-[28rem] w-[28rem] rounded-full bg-matrix-500/10 blur-3xl"
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-12">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 grid-cols-2 grid-rows-2 gap-[2px]">
            <span className="rounded-[2px] bg-saffron-500" />
            <span className="rounded-[2px] bg-matrix-500" />
            <span className="rounded-[2px] bg-matrix-500" />
            <span className="rounded-[2px] bg-saffron-500" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-neutral-100">
            BharatMatrix
          </span>
        </div>
        <nav
          aria-label="Sections"
          className="hidden items-center gap-7 text-[13px] text-neutral-400 md:flex"
        >
          <a href="#what" className="hover:text-neutral-100">What it does</a>
          <a href="#security" className="hover:text-neutral-100">Security</a>
          <a href="#telegram" className="hover:text-neutral-100">Telegram</a>
          <a href="#contact" className="hover:text-neutral-100">Contact</a>
        </nav>
        <HeaderAuthControls email={user?.email ?? null} />
      </header>

      <section className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 pb-24 pt-10 md:grid-cols-2 md:gap-8 md:px-12 md:pt-20">
        {/* The template's stacked block, behind the hero content */}
        <div className="pointer-events-none absolute -top-6 right-0 -z-10 hidden opacity-80 md:block">
          <StackedCube size={320} />
        </div>
        <div>
          <h1 className="text-[2.75rem] font-semibold leading-[1.08] tracking-tight text-neutral-50 md:text-5xl">
            Read every document.
            <br />
            Trust every answer.
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-neutral-400">
            Upload a company&apos;s annual reports, investor decks and audit
            reports. Ask questions across all of them at once. Every answer
            BharatMatrix gives you points back to the exact sentence and page
            it came from — and flags it the moment any of your documents
            disagree with each other.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Link
              href={user ? "/workspace" : "/signup"}
              className="rounded-full bg-saffron-500 px-5 py-2.5 text-[13px] font-medium text-onaccent transition-colors hover:bg-saffron-400"
            >
              {user ? "Open workspace" : "Get started"}
            </Link>
            <span className="text-[13px] text-neutral-500">
              No finance background required.
            </span>
          </div>

          <dl className="mt-14 grid grid-cols-3 gap-6 border-t border-ink-700 pt-6">
            <div>
              <dt className="text-[12px] text-neutral-500">Evidence</dt>
              <dd className="mt-1 text-[13px] text-neutral-300">
                Source quote + page, every cell
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-neutral-500">Contradictions</dt>
              <dd className="mt-1 text-[13px] text-neutral-300">
                Flagged across documents
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-neutral-500">Verification</dt>
              <dd className="mt-1 text-[13px] text-neutral-300">
                Checked before you see it
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex items-center">
          <MatrixHero />
        </div>
      </section>
      {/* What it does */}
      <section id="what" className="relative z-10 mx-auto max-w-6xl scroll-mt-8 px-6 py-20 md:px-12">
        <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-neutral-50">
          Questions across every document, answered with proof
        </h2>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-neutral-400">
          Annual reports, investor decks and audits are long and they rarely
          agree with each other. BharatMatrix reads them together so you
          don&apos;t have to.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            { icon: FileSearch, title: "Ask once, search everything", body: "One question runs across all the documents you uploaded, including the tables and numbers inside them." },
            { icon: Quote, title: "Every answer shows its source", body: "You get the exact sentence and page behind each answer. If it can't be found in your documents, it says so instead of guessing." },
            { icon: GitCompare, title: "Spots documents that disagree", body: "Put the same question to every document in a grid and see where two of them give different answers." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-ink-700 bg-ink-900/40 p-6">
              <Icon className="h-5 w-5 text-saffron-500" />
              <h3 className="mt-4 text-[15px] font-semibold text-neutral-100">{title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-neutral-400">{body}</p>
            </div>
          ))}
        </div>

        <ol className="mt-14 grid gap-8 border-t border-ink-700 pt-10 md:grid-cols-3">
          {[
            ["Upload", "Add PDFs and wait for each to show ready."],
            ["Ask", "Type a question in plain English, on the web or in Telegram."],
            ["Check", "Open the quoted passage and confirm it yourself."],
          ].map(([t, b], i) => (
            <li key={t} className="flex gap-4">
              <span className="font-mono text-[13px] text-matrix-500">{i + 1}</span>
              <div>
                <p className="text-[14px] font-medium text-neutral-100">{t}</p>
                <p className="mt-1 text-[13.5px] text-neutral-400">{b}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Security */}
      <section id="security" className="relative z-10 border-y border-ink-700 bg-ink-900/30">
        <div className="mx-auto max-w-6xl scroll-mt-8 px-6 py-20 md:px-12">
          <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-neutral-50">
            Your documents stay yours
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-neutral-400">
            Financial documents are sensitive. Access is limited by design, and
            the limits apply to our own team too.
          </p>
          <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
            {[
              { icon: Lock, title: "Private to your account", body: "Only you can see your documents, questions and answers. Other users never can." },
              { icon: KeyRound, title: "Protected sign-in", body: "Repeated failed attempts are blocked, passwords are checked for strength, and you can sign in with Google. Changing your password signs out your other devices." },
              { icon: Users, title: "Files need two approvals", body: "Administrators can review conversations to support the service, but opening anyone's uploaded files takes approval from two administrators at once." },
              { icon: ScrollText, title: "Every admin action is logged", body: "What an administrator looks at is recorded and reviewable, and admin sessions expire quickly." },
              { icon: ShieldCheck, title: "Answers are verified", body: "Quoted evidence is checked against your original text before it reaches you." },
              { icon: Lock, title: "Encrypted connection", body: "Everything between your browser and BharatMatrix travels over HTTPS." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-matrix-500" />
                <div>
                  <h3 className="text-[14.5px] font-semibold text-neutral-100">{title}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-neutral-400">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Telegram */}
      <section id="telegram" className="relative z-10 mx-auto max-w-6xl scroll-mt-8 px-6 py-20 md:px-12">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <Send className="h-6 w-6 text-saffron-500" />
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-neutral-50">
              Ask from your phone
            </h2>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-neutral-400">
              Link your Telegram once with a short code from your account, then
              message the bot a question anywhere. You get the same answer and
              the same quoted source, and the chat appears in your history.
            </p>
            <Link
              href={user ? "/telegram" : "/signup"}
              className="mt-7 inline-block rounded-full border border-ink-700 px-5 py-2.5 text-[13px] font-medium text-neutral-200 transition-colors hover:border-saffron-500 hover:text-saffron-400"
            >
              {user ? "Connect Telegram" : "Create an account to connect"}
            </Link>
          </div>
          <div className="rounded-2xl border border-ink-700 bg-ink-900/40 p-5">
            <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-ink-800 px-4 py-2.5 text-[13.5px] text-neutral-100">
              What was the total debt at year end?
            </div>
            <div className="mt-3 max-w-[90%] rounded-2xl rounded-bl-sm border border-ink-700 px-4 py-3 text-[13.5px] text-neutral-300">
              Total borrowings were ₹4,210 crore.
              <p className="mt-2 text-[12px] text-matrix-400">✅ grounded · Annual report, p. 84</p>
            </div>
            <p className="mt-3 text-center text-[11.5px] text-neutral-600">Illustration</p>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="relative z-10 mx-auto max-w-6xl scroll-mt-8 px-6 pb-24 pt-4 md:px-12">
        <div className="rounded-2xl border border-ink-700 bg-ink-900/40 p-8 md:p-10">
          <Mail className="h-5 w-5 text-saffron-500" />
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-50">
            Contact us
          </h2>
          <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-neutral-400">
            Questions, feedback, or a request to remove your data? Write to us
            and we&apos;ll reply.
          </p>
          {contactEmail ? (
            <a
              href={`mailto:${contactEmail}`}
              className="mt-6 inline-block rounded-full bg-saffron-500 px-5 py-2.5 text-[13px] font-medium text-onaccent hover:bg-saffron-400"
            >
              {contactEmail}
            </a>
          ) : (
            <p className="mt-6 text-[13px] text-neutral-500">
              Contact details will be published here soon.
            </p>
          )}
        </div>
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 text-[12px] text-neutral-600">
          <span>© {new Date().getFullYear()} BharatMatrix</span>
          <Link href="/admin/login" className="hover:text-neutral-300">Admin</Link>
        </footer>
      </section>
    </main>
  );
}
