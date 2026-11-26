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
  ChevronRight,
} from "lucide-react";
import { cookies } from "next/headers";
import MatrixHero from "@/components/MatrixHero";
import StackedCube from "@/components/StackedCube";
import HeaderAuthControls from "@/components/HeaderAuthControls";
import ThemeToggle from "@/components/ThemeToggle";
import Reveal from "@/components/Reveal";
import { ensureSchema } from "@/lib/db";
import { SESSION_COOKIE, getUserByToken } from "@/lib/auth";

function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <span className={`grid grid-cols-2 grid-rows-2 gap-[2px] ${className}`}>
      <span className="rounded-[3px] bg-saffron-500" />
      <span className="rounded-[3px] bg-matrix-500" />
      <span className="rounded-[3px] bg-matrix-500" />
      <span className="rounded-[3px] bg-saffron-500" />
    </span>
  );
}

const SECTION = "relative z-10 mx-auto max-w-6xl scroll-mt-20 px-6 md:px-12";
const H2 =
  "text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-neutral-50 sm:text-5xl";
const LEAD = "text-[1.05rem] leading-relaxed text-neutral-400 md:text-[1.2rem]";

export default async function Home() {
  await ensureSchema();
  const token = cookies().get(SESSION_COOKIE)?.value;
  const user = await getUserByToken(token);
  const contactEmail = process.env.CONTACT_EMAIL?.trim() || null;

  return (
    <main className="landing relative min-h-screen overflow-x-clip bg-ink-950">
      <header className="glass sticky top-0 z-30 border-b border-ink-700/50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 md:px-12">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark className="h-6 w-6" />
            <span className="text-[15px] font-semibold tracking-tight text-neutral-100">
              BharatMatrix
            </span>
          </Link>
          <nav
            aria-label="Sections"
            className="hidden items-center gap-8 text-[13px] text-neutral-400 md:flex"
          >
            <a href="#what" className="transition-colors hover:text-neutral-50">What it does</a>
            <a href="#security" className="transition-colors hover:text-neutral-50">Security</a>
            <a href="#telegram" className="transition-colors hover:text-neutral-50">Telegram</a>
            <a href="#contact" className="transition-colors hover:text-neutral-50">Contact</a>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <HeaderAuthControls email={user?.email ?? null} />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 px-6 pb-20 pt-16 md:px-12 md:pb-28 md:pt-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(55%_60%_at_50%_0%,rgba(255,159,28,0.11),transparent)]"
        />
        {/* The template's stacked block, turning slowly behind the hero */}
        <div className="pointer-events-none absolute -right-8 top-10 -z-10 hidden opacity-60 min-[1360px]:block">
          <StackedCube size={240} />
        </div>

        <div className="mx-auto max-w-4xl text-center">
          <h1 className="rise text-[2.75rem] font-semibold leading-[1.04] tracking-[-0.035em] text-neutral-50 sm:text-6xl md:text-[5.25rem]">
            Read every document.
            <br />
            <span className="text-neutral-500">Trust every answer.</span>
          </h1>
          <p
            className={`rise mx-auto mt-7 max-w-2xl ${LEAD}`}
            style={{ animationDelay: "120ms" }}
          >
            Upload a company&apos;s annual reports, investor decks and audit
            reports. Ask questions across all of them at once. Every answer
            BharatMatrix gives you points back to the exact sentence and page
            it came from — and flags it the moment any of your documents
            disagree with each other.
          </p>
          <div
            className="rise mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4"
            style={{ animationDelay: "240ms" }}
          >
            <Link
              href={user ? "/workspace" : "/signup"}
              className="rounded-full bg-saffron-500 px-7 py-3 text-[15px] font-medium text-onaccent shadow-[0_8px_24px_-8px_rgba(255,159,28,0.6)] transition-all hover:brightness-110 active:scale-[0.98]"
            >
              {user ? "Open workspace" : "Get started"}
            </Link>
            <a
              href="#what"
              className="group flex items-center gap-1 text-[15px] font-medium text-matrix-400 transition-colors hover:text-neutral-50"
            >
              See how it works
              <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </a>
          </div>
          <p
            className="rise mt-5 text-[13px] text-neutral-500"
            style={{ animationDelay: "320ms" }}
          >
            No finance background required.
          </p>
        </div>

        <div
          className="rise mx-auto mt-16 max-w-5xl md:mt-20"
          style={{ animationDelay: "420ms" }}
        >
          <MatrixHero />
        </div>

        <Reveal className="mx-auto mt-20 max-w-5xl">
          <dl className="grid grid-cols-1 gap-8 border-t border-ink-700 pt-10 text-center sm:grid-cols-3 sm:gap-6">
            {[
              ["Evidence", "Source quote + page, every cell"],
              ["Contradictions", "Flagged across documents"],
              ["Verification", "Checked before you see it"],
            ].map(([dt, dd]) => (
              <div key={dt}>
                <dt className="text-[13px] text-neutral-500">{dt}</dt>
                <dd className="mt-1.5 text-[1.05rem] font-medium leading-snug tracking-tight text-neutral-100">
                  {dd}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </section>

      {/* What it does */}
      <section id="what" className={`${SECTION} py-24 md:py-32`}>
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className={H2}>Questions across every document, answered with proof</h2>
          <p className={`mt-5 ${LEAD}`}>
            Annual reports, investor decks and audits are long and they rarely
            agree with each other. BharatMatrix reads them together so you
            don&apos;t have to.
          </p>
        </Reveal>
        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {[
            { icon: FileSearch, title: "Ask once, search everything", body: "One question runs across all the documents you uploaded, including the tables and numbers inside them." },
            { icon: Quote, title: "Every answer shows its source", body: "You get the exact sentence and page behind each answer. If it can't be found in your documents, it says so instead of guessing." },
            { icon: GitCompare, title: "Spots documents that disagree", body: "Put the same question to every document in a grid and see where two of them give different answers." },
          ].map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 90} className="h-full">
              <div className="lift h-full rounded-[1.75rem] border border-ink-700 bg-ink-900 p-8">
                <span className="grid h-11 w-11 place-items-center rounded-[1rem] bg-ink-800">
                  <Icon className="h-5 w-5 text-saffron-500" />
                </span>
                <h3 className="mt-6 text-[1.2rem] font-semibold leading-snug tracking-tight text-neutral-50">
                  {title}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-neutral-400">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <ol className="mt-20 grid gap-10 border-t border-ink-700 pt-12 md:grid-cols-3">
          {[
            ["Upload", "Add PDFs and wait for each to show ready."],
            ["Ask", "Type a question in plain English, on the web or in Telegram."],
            ["Check", "Open the quoted passage and confirm it yourself."],
          ].map(([t, b], i) => (
            <li key={t}>
              <Reveal delay={i * 90} className="flex gap-5">
                <span className="text-4xl font-semibold leading-none tracking-tight text-matrix-400">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[1.1rem] font-semibold tracking-tight text-neutral-50">{t}</p>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-400">{b}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* Security */}
      <section id="security" className="relative z-10 scroll-mt-20 border-y border-ink-700 bg-ink-900">
        <div className="mx-auto max-w-6xl px-6 py-24 md:px-12 md:py-32">
          <Reveal className="mx-auto max-w-3xl text-center">
            <h2 className={H2}>Your documents stay yours</h2>
            <p className={`mt-5 ${LEAD}`}>
              Financial documents are sensitive. Access is limited by design,
              and the limits apply to our own team too.
            </p>
          </Reveal>
          <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Lock, title: "Private to your account", body: "Only you can see your documents, questions and answers. Other users never can." },
              { icon: KeyRound, title: "Protected sign-in", body: "Repeated failed attempts are blocked, passwords are checked for strength, and you can sign in with Google. Changing your password signs out your other devices." },
              { icon: Users, title: "Files need two approvals", body: "Administrators can review conversations to support the service, but opening anyone's uploaded files takes approval from two administrators at once." },
              { icon: ScrollText, title: "Every admin action is logged", body: "What an administrator looks at is recorded and reviewable, and admin sessions expire quickly." },
              { icon: ShieldCheck, title: "Answers are verified", body: "Quoted evidence is checked against your original text before it reaches you." },
              { icon: Lock, title: "Encrypted connection", body: "Everything between your browser and BharatMatrix travels over HTTPS." },
            ].map(({ icon: Icon, title, body }, i) => (
              <Reveal key={title} delay={(i % 3) * 80} className="h-full">
                <div className="h-full rounded-[1.375rem] border border-ink-700 bg-ink-950 p-7">
                  <Icon className="h-5 w-5 text-matrix-500" />
                  <h3 className="mt-5 text-[1.05rem] font-semibold tracking-tight text-neutral-50">{title}</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-neutral-400">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Telegram */}
      <section id="telegram" className={`${SECTION} py-24 md:py-32`}>
        <div className="grid items-center gap-14 md:grid-cols-2 md:gap-20">
          <Reveal>
            <Send className="h-6 w-6 text-saffron-500" />
            <h2 className={`mt-5 ${H2}`}>Ask from your phone</h2>
            <p className={`mt-5 max-w-md ${LEAD}`}>
              Link your Telegram once with a short code from your account, then
              message the bot a question anywhere. You get the same answer and
              the same quoted source, and the chat appears in your history.
            </p>
            <Link
              href={user ? "/telegram" : "/signup"}
              className="mt-8 inline-flex items-center gap-1.5 rounded-full border border-ink-600 px-6 py-2.5 text-[14px] font-medium text-neutral-100 transition-colors hover:border-saffron-500 hover:text-saffron-400"
            >
              {user ? "Connect Telegram" : "Create an account to connect"}
            </Link>
          </Reveal>
          <Reveal delay={120}>
            <div className="mx-auto max-w-sm rounded-[2rem] border border-ink-700 bg-ink-900 p-6 shadow-[0_40px_90px_-36px_rgb(0_0_0/0.5)]">
              <div className="ml-auto max-w-[82%] rounded-[1.25rem] rounded-br-md bg-saffron-500 px-4 py-2.5 text-[14px] text-onaccent">
                What was the total debt at year end?
              </div>
              <div className="mt-3 max-w-[92%] rounded-[1.25rem] rounded-bl-md bg-ink-800 px-4 py-3 text-[14px] text-neutral-200">
                Total borrowings were ₹4,210 crore.
                <p className="mt-2 text-[12px] text-matrix-400">✅ grounded · Annual report, p. 84</p>
              </div>
              <p className="mt-5 text-center text-[11.5px] text-neutral-600">Illustration</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className={`${SECTION} pb-24 md:pb-32`}>
        <Reveal>
          <div className="rounded-[1.75rem] border border-ink-700 bg-ink-900 px-8 py-14 text-center md:px-16 md:py-20">
            <Mail className="mx-auto h-6 w-6 text-saffron-500" />
            <h2 className="mt-5 text-[2rem] font-semibold tracking-[-0.03em] text-neutral-50 md:text-4xl">
              Contact us
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[1.05rem] leading-relaxed text-neutral-400">
              Questions, feedback, or a request to remove your data? Write to us
              and we&apos;ll reply.
            </p>
            {contactEmail ? (
              <a
                href={`mailto:${contactEmail}`}
                className="mt-8 inline-block rounded-full bg-saffron-500 px-7 py-3 text-[15px] font-medium text-onaccent transition-all hover:brightness-110 active:scale-[0.98]"
              >
                {contactEmail}
              </a>
            ) : (
              <p className="mt-8 text-[14px] text-neutral-500">
                Contact details will be published here soon.
              </p>
            )}
          </div>
        </Reveal>
      </section>

      <footer className="relative z-10 border-t border-ink-700">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 text-[12.5px] text-neutral-500 md:flex-row md:items-center md:justify-between md:px-12">
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-4 w-4" />
            <span>© {new Date().getFullYear()} BharatMatrix</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            <a href="#what" className="transition-colors hover:text-neutral-100">What it does</a>
            <a href="#security" className="transition-colors hover:text-neutral-100">Security</a>
            <a href="#telegram" className="transition-colors hover:text-neutral-100">Telegram</a>
            <a href="#contact" className="transition-colors hover:text-neutral-100">Contact</a>
            <Link href="/admin/login" className="transition-colors hover:text-neutral-100">Admin</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
