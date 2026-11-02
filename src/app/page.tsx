import MatrixHero from "@/components/MatrixHero";

export default function Home() {
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
        <a
          href="#workspace"
          className="rounded-full bg-neutral-100 px-4 py-2 text-[13px] font-medium text-ink-950 transition-colors hover:bg-white"
        >
          Open workspace
        </a>
      </header>

      <section className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 pb-24 pt-10 md:grid-cols-2 md:gap-8 md:px-12 md:pt-20">
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
            it came from — and it tells you when two documents disagree.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <a
              href="#workspace"
              className="rounded-full bg-saffron-500 px-5 py-2.5 text-[13px] font-medium text-ink-950 transition-colors hover:bg-saffron-400"
            >
              Open workspace
            </a>
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

      <section
        id="workspace"
        className="relative z-10 border-t border-ink-700 px-6 py-24 text-center md:px-12"
      >
        <p className="font-mono text-[13px] text-neutral-500">
          Workspace is under construction — Step 2 of the build (document
          upload) is next.
        </p>
      </section>
    </main>
  );
}
