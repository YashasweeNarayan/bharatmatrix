import Link from "next/link";
import { cookies } from "next/headers";
import { Lock, KeyRound, Users, ScrollText, ShieldCheck, Mail } from "lucide-react";
import Cinematic from "@/components/cinematic/Cinematic";
import { ensureSchema } from "@/lib/db";
import { SESSION_COOKIE, getUserByToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SECURITY = [
  { icon: Lock, title: "Private by default", body: "Your documents, questions and answers belong to your account alone. No other user can see them." },
  { icon: KeyRound, title: "Hardened sign-in", body: "Repeated failed attempts are blocked, passwords are screened for strength, and Google sign-in is available. Changing a password signs out every other device." },
  { icon: Users, title: "Two-person file access", body: "Administrators can review conversations to support the service. Opening anyone's uploaded files requires two administrators to approve together." },
  { icon: ScrollText, title: "Every admin action on record", body: "What an administrator views is logged and reviewable, and admin sessions expire within hours." },
  { icon: ShieldCheck, title: "Evidence is verified", body: "Every quoted passage is checked against your original text before an answer reaches you." },
  { icon: Lock, title: "Encrypted in transit", body: "All traffic between your browser and BharatMatrix is protected with HTTPS." },
];

export default async function Home() {
  await ensureSchema();
  const token = cookies().get(SESSION_COOKIE)?.value;
  const user = await getUserByToken(token);
  const contactEmail = process.env.CONTACT_EMAIL?.trim() || null;
  const startHref = user ? (user.isAdmin ? "/admin/history" : "/workspace") : "/signup";
  const startLabel = user ? (user.isAdmin ? "Open admin" : "Open workspace") : "Get started";

  return (
    <div className="cin-root">
      <nav className="cin-nav" aria-label="Main">
        <Link href="/" className="cin-brand">
          <span className="cin-mark" aria-hidden><i /><i /><i /><i /></span>
          BharatMatrix
        </Link>
        <div className="cin-links">
          <a href="#what">Product</a>
          <a href="#security">Security</a>
          <a href="#telegram">Telegram</a>
          <a href="#contact">Contact</a>
        </div>
        <div className="cin-actions">
          {user ? (
            <Link href={startHref} className="cin-btn">{startLabel}</Link>
          ) : (
            <>
              <Link href="/login" className="cin-btn-ghost">Log in</Link>
              <Link href="/signup" className="cin-btn">Sign up</Link>
            </>
          )}
        </div>
      </nav>

      <Cinematic ctaHref={startHref} ctaLabel={startLabel} />

      <section id="security" className="cin-section">
        <div className="cin-wrap">
          <h2 className="cin-h2">Built so your documents stay yours</h2>
          <p className="cin-lede">
            Financial documents are sensitive. Access is limited by design, and
            the limits apply to our own team too.
          </p>
          <div className="cin-sec-grid">
            {SECURITY.map(({ icon: Icon, title, body }) => (
              <div key={title} className="cin-sec-item">
                <Icon className="h-5 w-5" />
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="cin-section">
        <div className="cin-wrap">
          <h2 className="cin-h2">Talk to us</h2>
          <p className="cin-lede">
            A question about the product, a feature you need, or a request to
            delete your data. We read everything and reply.
          </p>
          <div className="cin-contact">
            <Mail className="h-5 w-5" style={{ color: "var(--brass)" }} />
            <h3>Email</h3>
            {contactEmail ? (
              <a className="cin-mail" href={`mailto:${contactEmail}`}>{contactEmail}</a>
            ) : (
              <p>Our contact address is being set up and will appear here shortly.</p>
            )}
          </div>
        </div>
      </section>

      <footer className="cin-foot">
        <div>
          <span className="cin-brand">
            <span className="cin-mark" aria-hidden><i /><i /><i /><i /></span>
            BharatMatrix
          </span>
          <span>
            © {new Date().getFullYear()} ·{" "}
            <Link href="/admin/login" style={{ color: "inherit" }}>Admin</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
