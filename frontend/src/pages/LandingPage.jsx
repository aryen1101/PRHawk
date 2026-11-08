import { ArrowRight, Bot, GitPullRequest, ShieldCheck, Terminal } from "lucide-react";
import { Link } from "react-router-dom";

const installUrl =
  import.meta.env.VITE_GITHUB_APP_INSTALL_URL ||
  "https://github.com/apps/prhawk-webhook-tester/installations/new";

export default function LandingPage() {
  return (
    <main className="landing-page">
      <nav className="landing-nav">
        <Link to="/" className="landing-brand">
          <span className="landing-brand-mark">P</span>
          <span>PR<span className="brand-title-accent">Hawk</span><span className="brand-title-dot">.</span></span>
        </Link>
        <div className="landing-nav-actions">
          <a className="btn btn-primary landing-nav-cta" href={installUrl} target="_blank" rel="noreferrer">
            Install App <ArrowRight size={15} />
          </a>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-kicker"><span /> AI code review for every pull request</div>
        <h1>Ship confidently.<br /><em>Review automatically.</em></h1>
        <p className="landing-lede">
          PRHawk watches your GitHub pull requests, learns your team&apos;s conventions,
          and posts focused, line-level feedback before code reaches production.
        </p>
        <div className="landing-hero-actions">
          <a className="btn btn-primary landing-main-cta" href={installUrl} target="_blank" rel="noreferrer">
            Install on GitHub <ArrowRight size={17} />
          </a>
          <a className="landing-secondary-cta" href="#how-it-works">How it works</a>
        </div>
        <p className="landing-note">Install once. Every new or updated PR gets reviewed automatically.</p>
      </section>

      <section className="landing-proof">
        <div><strong>Automatic</strong><span>GitHub App webhooks</span></div>
        <div><strong>Context-aware</strong><span>Team conventions included</span></div>
        <div><strong>Actionable</strong><span>Comments on changed lines</span></div>
      </section>

      <section className="landing-features">
        <article className="landing-feature-card">
          <GitPullRequest size={22} />
          <h2>Reviews where work happens</h2>
          <p>PRHawk receives pull request events directly from GitHub and returns a summary, score, and inline findings.</p>
        </article>
        <article className="landing-feature-card">
          <Bot size={22} />
          <h2>Your conventions, not generic rules</h2>
          <p>Learn patterns from merged pull requests and use them to make future reviews specific to your codebase.</p>
        </article>
        <article className="landing-feature-card">
          <ShieldCheck size={22} />
          <h2>Controlled by you</h2>
          <p>Bring your own model keys, keep credentials on your backend, and choose exactly which repositories receive reviews.</p>
        </article>
      </section>

      <section className="landing-terminal">
        <div>
          <div className="landing-kicker"><Terminal size={14} /> For developers</div>
          <h2>Prefer the terminal?</h2>
          <p>Use the CLI for convention learning, dry runs, and local reviews. The website and webhook use the same review engine.</p>
        </div>
        <code>npm run learn -- owner/repo<br />npm run review -- PR_URL --dry-run</code>
      </section>

      <footer className="landing-footer">PRHawk · AI code intelligence for teams that ship</footer>
    </main>
  );
}
