import Link from "next/link";
import { cookies } from "next/headers";
import {
  ArrowRight,
  Send,
  Mail,
  Lock,
  KeyRound,
  Users,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import MatrixHero from "@/components/MatrixHero";
import ThemeToggle from "@/components/ThemeToggle";
import WireCube from "@/components/WireCube";
import { ensureSchema } from "@/lib/db";
import { SESSION_COOKIE, getUserByToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

function Mark({ size = 20 }: { size?: number }) {
  return (
    <span
      className="grid grid-cols-2 grid-rows-2 gap-[2px]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="rounded-[2px] bg-saffron-500" />
      <span className="rounded-[2px] bg-matrix-500" />
      <span className="rounded-[2px] bg-matrix-500" />
      <span className="rounded-[2px] bg-saffron-500" />
    </span>
  );
}

const SECURITY = [
  { icon: Lock, title: "Private to your account", body: "Only you can see your documents, questions and answers. Other users never can." },
  { icon: KeyRound, title: "Protected sign-in", body: "Repeated failed attempts are blocked, passwords are checked for strength, and you can sign in with Google. Changing your password signs out your other devices." },
  { icon: Users, title: "Files need two approvals", body: "Administrators can review conversations to support the service, but opening anyone's uploaded files takes approval from two administrators at once." },
  { icon: ScrollText, title: "Every admin action is logged", body: "What an administrator looks at is recorded and reviewable, and admin sessions expire quickly." },
  { icon: ShieldCheck, title: "Answers are verified", body: "Quoted evidence is checked against your original text before it reaches you." },
  { icon: Lock, title: "Encrypted connection", body: "Everything between your browser and BharatMatrix travels over HTTPS." },
];

export default async function Home() {
  await ensureSchema();
  const token = cookies().get(SESSION_COOKIE)?.value;
  const user = await getUserByToken(token);
  const contactEmail = process.env.CONTACT_EMAIL?.trim() || null;
  const startHref = user ? (user.isAdmin ? "/admin/history" : "/workspace") : "/signup";
  const startLabel = user ? (user.isAdmin ? "Open admin" : "Open workspace") : "Get started";

  return (
    <div className="bg-grain min-h-screen overflow-x-hidden bg-ink-950 text-neutral-100">
      {/* Nav */}
      <nav className="fixed top-0 z-50 w-full border-b border-ink-700 bg-ink-950/90 px-6 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Mark size={18} />
            <span className="text-[14px] font-bold uppercase tracking-[0.08em] text-neutral-50">
              BharatMatrix
            </span>
          </Link>
          <div className="hidden items-center gap-7 text-[13px] text-neutral-400 md:flex">
            <a href="#what" className="hover:text-neutral-100">What it does</a>
            <a href="#security" className="hover:text-neutral-100">Security</a>
            <a href="#telegram" className="hover:text-neutral-100">Telegram</a>
            <a href="#contact" className="hover:text-neutral-100">Contact</a>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <Link
                href={startHref}
                className="h-8 border border-neutral-100/40 px-3 text-[13px] leading-8 text-neutral-100 transition-colors hover:bg-neutral-100 hover:text-ink-950"
              >
                {startLabel}
              </Link>
            ) : (
              <>
                <Link href="/login" className="h-8 px-3 text-[13px] leading-8 text-neutral-300 transition-colors hover:text-neutral-50">
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="h-8 border border-neutral-100/40 px-3 text-[13px] leading-8 text-neutral-100 transition-colors hover:bg-neutral-100 hover:text-ink-950"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative px-6 pt-14">
        <div className="mx-auto max-w-[1200px]">
          <div className="relative flex items-center pb-16 pt-14 md:pt-16">
            <div className="relative z-[3] max-w-[560px] flex-1">
              <h1 className="text-[clamp(2.2rem,4.4vw,3.4rem)] font-medium leading-[1.06] tracking-[-0.035em] text-neutral-50">
                Read every document.
                <br />
                Trust every answer.
              </h1>
              <p className="mt-6 max-w-[440px] text-[15px] leading-relaxed text-neutral-400">
                Upload annual reports, investor decks and audits. Ask one
                question across all of them. Every answer points to the exact
                sentence and page, and flags it when your documents disagree.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Link
                  href={startHref}
                  className="group inline-flex items-center gap-2 bg-neutral-50 px-6 py-3 text-[14px] font-medium text-ink-950 transition-colors hover:bg-neutral-200"
                >
                  {startLabel}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a href="#what" className="text-[13px] text-neutral-400 hover:text-neutral-100">
                  See how it works
                </a>
              </div>
            </div>

            <div className="pointer-events-none absolute right-0 top-1/2 hidden -translate-y-1/2 md:block lg:right-8">
              <WireCube size={300} />
            </div>
          </div>

          {/* Product frame, cut off by a fade like the template */}
          <div className="relative">
            <div className="relative overflow-hidden rounded-t-xl border border-b-0 border-ink-700 bg-ink-900">
              <div className="flex min-h-[400px]">
                <div className="hidden w-[190px] shrink-0 flex-col gap-1 border-r border-ink-700 p-3 sm:flex">
                  <div className="mb-2 flex h-8 items-center gap-2 px-2">
                    <Mark size={14} />
                    <div className="h-2 w-16 rounded-full bg-neutral-100/15" />
                  </div>
                  <div className="h-px bg-ink-700" />
                  {["w-16", "w-20", "w-24", "w-14", "w-20"].map((w, i) => (
                    <div key={i} className={`flex h-7 items-center gap-2 rounded px-2 ${i === 1 ? "bg-ink-800" : ""}`}>
                      <div className="h-3 w-3 shrink-0 rounded bg-neutral-100/10" />
                      <div className={`h-1.5 ${w} rounded-full ${i === 1 ? "bg-neutral-100/30" : "bg-neutral-100/12"}`} />
                    </div>
                  ))}
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-center p-4 md:p-8">
                  <div className="w-full max-w-[640px]">
                    <MatrixHero />
                  </div>
                </div>
                <div className="hidden w-[270px] shrink-0 flex-col gap-4 border-l border-ink-700 p-4 lg:flex">
                  <div className="h-2 w-24 rounded-full bg-neutral-100/20" />
                  <p className="border-l-2 border-saffron-500 pl-3 text-[12px] italic leading-relaxed text-neutral-400">
                    &ldquo;Revenue from operations was ₹1,284.6 crore in the
                    quarter ended 30 September.&rdquo;
                  </p>
                  <p className="font-mono text-[11px] text-matrix-400">Results filing · page 3</p>
                  <div className="h-px bg-ink-700" />
                  <div className="space-y-2">
                    <div className="h-1.5 w-full rounded-full bg-neutral-100/10" />
                    <div className="h-1.5 w-4/5 rounded-full bg-neutral-100/10" />
                    <div className="h-1.5 w-2/3 rounded-full bg-neutral-100/10" />
                  </div>
                </div>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-ink-950 to-transparent" />
            </div>
          </div>
        </div>
      </section>

      <div className="w-full border-t border-ink-700" />

      {/* What it does */}
      <section id="what" className="scroll-mt-14 px-6 py-24">
        <div className="mx-auto max-w-[1200px]">
          <h2 className="max-w-[520px] text-[clamp(1.8rem,3vw,2.5rem)] font-medium leading-[1.15] tracking-[-0.03em] text-neutral-50">
            Fewer tabs.
            <br />
            More proof.
          </h2>
          <p className="mt-4 max-w-[460px] text-[14.5px] leading-relaxed text-neutral-400">
            Financial documents are long and they rarely agree with each other.
            BharatMatrix reads them together so you don&apos;t have to.
          </p>

          <div className="mt-14 border border-ink-700">
            <div className="grid grid-cols-1 md:grid-cols-3">
              {[
                {
                  title: "Ask once, search everything",
                  desc: "One question runs across every document you uploaded, including the tables and numbers inside them.",
                  graphic: "bars",
                },
                {
                  title: "Every answer shows its source",
                  desc: "You get the exact sentence and page behind each answer. If it can't be found, it says so instead of guessing.",
                  graphic: "flow",
                },
                {
                  title: "Spots when documents disagree",
                  desc: "Put the same question to every document in a grid and see where two of them give different answers.",
                  graphic: "chart",
                },
              ].map((f, i) => (
                <div
                  key={f.title}
                  className={`p-8 ${i < 2 ? "border-ink-700 md:border-r" : ""} ${i > 0 ? "border-t border-ink-700 md:border-t-0" : ""}`}
                >
                  <div className="mb-6 flex h-32 items-center justify-center rounded-lg border border-ink-700 bg-ink-900/40">
                    {f.graphic === "bars" && (
                      <div className="w-full space-y-2 px-6">
                        {["w-full bg-saffron-500", "w-3/4 bg-matrix-500", "w-1/2 bg-saffron-500/60", "w-1/4 bg-matrix-500/60"].map((c) => (
                          <div key={c} className={`h-2 rounded-full ${c}`} />
                        ))}
                      </div>
                    )}
                    {f.graphic === "flow" && (
                      <div className="flex w-full items-center justify-between px-8">
                        {["Question", "Passage", "Verified"].map((t, j) => (
                          <div key={t} className="flex flex-col items-center gap-2">
                            <div className={`h-8 w-8 rounded-full ${j === 2 ? "bg-matrix-500" : j === 1 ? "bg-saffron-500" : "bg-neutral-100/25"}`} />
                            <span className="text-[10.5px] text-neutral-500">{t}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {f.graphic === "chart" && (
                      <div className="flex h-20 w-full items-end gap-1.5 px-6">
                        {[40, 65, 45, 80, 55, 70, 90].map((h, j) => (
                          <div
                            key={j}
                            className={`bm-hatch-light flex-1 rounded-t border ${j === 3 ? "border-saffron-500" : "border-ink-700"}`}
                            style={{ height: `${h}%` }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <h3 className="mb-2 text-[15px] font-medium text-neutral-50">{f.title}</h3>
                  <p className="text-[13px] leading-[1.6] text-neutral-400">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              ["Upload", "Add PDFs and wait for each to show ready."],
              ["Ask", "Type a question in plain English, on the web or in Telegram."],
              ["Check", "Open the quoted passage and confirm it yourself."],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-4">
                <span className="font-mono text-[13px] text-matrix-400">{i + 1}</span>
                <div>
                  <p className="text-[14px] font-medium text-neutral-100">{t}</p>
                  <p className="mt-1 text-[13.5px] text-neutral-400">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="w-full border-t border-ink-700" />

      {/* Security, on the hatched band from the template */}
      <section id="security" className="bm-hatch relative scroll-mt-14 px-6 py-24">
        <div className="mx-auto max-w-[1200px]">
          <div className="border border-ink-700 bg-ink-950 p-8 md:p-12">
            <h2 className="max-w-[520px] text-[clamp(1.8rem,3vw,2.5rem)] font-medium leading-[1.15] tracking-[-0.03em] text-neutral-50">
              Your documents stay yours
            </h2>
            <p className="mt-4 max-w-[480px] text-[14.5px] leading-relaxed text-neutral-400">
              Financial documents are sensitive. Access is limited by design,
              and the limits apply to our own team too.
            </p>
            <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
              {SECURITY.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-4">
                  <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-matrix-500" />
                  <div>
                    <h3 className="text-[14.5px] font-medium text-neutral-100">{title}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-neutral-400">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="w-full border-t border-ink-700" />

      {/* Telegram */}
      <section id="telegram" className="scroll-mt-14 px-6 py-24">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 md:grid-cols-2">
          <div>
            <Send className="h-5 w-5 text-saffron-500" />
            <h2 className="mt-5 text-[clamp(1.8rem,3vw,2.5rem)] font-medium leading-[1.15] tracking-[-0.03em] text-neutral-50">
              Ask from your phone
            </h2>
            <p className="mt-4 max-w-[440px] text-[14.5px] leading-relaxed text-neutral-400">
              Link your Telegram once with a short code from your account, then
              message the bot a question anywhere. You get the same answer and
              the same quoted source, and the chat appears in your history.
            </p>
            <Link
              href={user && !user.isAdmin ? "/telegram" : "/signup"}
              className="mt-8 inline-block border border-neutral-100/40 px-5 py-2.5 text-[13px] text-neutral-100 transition-colors hover:bg-neutral-100 hover:text-ink-950"
            >
              {user && !user.isAdmin ? "Connect Telegram" : "Create an account to connect"}
            </Link>
          </div>
          <div className="border border-ink-700 bg-ink-900/40 p-6">
            <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-ink-800 px-4 py-2.5 text-[13.5px] text-neutral-100">
              What was the total debt at year end?
            </div>
            <div className="mt-3 max-w-[90%] rounded-2xl rounded-bl-sm border border-ink-700 px-4 py-3 text-[13.5px] text-neutral-300">
              Total borrowings were ₹4,210 crore.
              <p className="mt-2 text-[12px] text-matrix-400">✅ grounded · Annual report, p. 84</p>
            </div>
            <p className="mt-4 text-center text-[11.5px] text-neutral-600">Illustration</p>
          </div>
        </div>
      </section>

      <div className="w-full border-t border-ink-700" />

      {/* CTA + contact */}
      <section id="contact" className="scroll-mt-14 px-6 pb-20 pt-28">
        <div className="mx-auto max-w-[1200px] text-center">
          <h2 className="mx-auto max-w-[580px] text-[clamp(2rem,4vw,3.2rem)] font-medium leading-[1.1] tracking-[-0.035em] text-neutral-50">
            Your documents already have the answers.
          </h2>
          <p className="mx-auto mt-5 max-w-[420px] text-[15px] text-neutral-400">
            Upload a few reports and ask your first question in a couple of
            minutes.
          </p>
          <div className="mt-10 flex justify-center">
            <Link
              href={startHref}
              className="group inline-flex items-center gap-2.5 border border-neutral-100/40 px-8 py-3.5 text-[15px] font-medium text-neutral-100 transition-colors hover:bg-neutral-100 hover:text-ink-950"
            >
              {startLabel}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="mx-auto mt-24 max-w-[720px] border border-ink-700 p-8 text-left md:p-10">
            <Mail className="h-5 w-5 text-saffron-500" />
            <h3 className="mt-4 text-[20px] font-medium tracking-tight text-neutral-50">Contact us</h3>
            <p className="mt-2 max-w-[460px] text-[14px] leading-relaxed text-neutral-400">
              Questions, feedback, or a request to remove your data? Write to us
              and we&apos;ll reply.
            </p>
            {contactEmail ? (
              <a
                href={`mailto:${contactEmail}`}
                className="mt-6 inline-block bg-neutral-50 px-5 py-2.5 text-[13px] font-medium text-ink-950 hover:bg-neutral-200"
              >
                {contactEmail}
              </a>
            ) : (
              <p className="mt-6 text-[13px] text-neutral-500">Contact details will be published here soon.</p>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-ink-700">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-6">
          <div className="flex items-center gap-2.5">
            <Mark size={16} />
            <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-neutral-100">BharatMatrix</span>
          </div>
          <div className="flex items-center gap-5 text-[12px] text-neutral-500">
            <span>© {new Date().getFullYear()}</span>
            <Link href="/admin/login" className="hover:text-neutral-200">Admin</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
