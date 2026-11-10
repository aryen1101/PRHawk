import { useRef } from "react";
import { Link } from "react-router-dom";
import "lenis/dist/lenis.css";
import Brand from "../components/Brand.jsx";
import ReviewPreview from "../components/ReviewPreview.jsx";
import SeverityTag from "../components/SeverityTag.jsx";
import { exampleReview } from "../data/exampleReview.js";
import useLandingMotion from "../hooks/useLandingMotion.js";
import { installUrl } from "../lib/config.js";
import { SEVERITIES } from "../lib/severity.js";

/** Sample rows for the rules illustration; every name is an example, not a customer. */
const EXAMPLE_RULES = [
  { severity: "security", rule: "Validate request bodies before using them", origin: "Custom rule" },
  { severity: "bug", rule: "Await every promise returned by the database client", origin: "Learned from this repository" },
  { severity: "style", rule: "Name React components in PascalCase", origin: "Learned from this repository" },
  { severity: "suggestion", rule: "Prefer early returns over nested conditionals", origin: "Learned from example-org/standards" },
];

const STEPS = [
  { title: "Install the App", text: "Pick the repositories PRHawk may read and comment on.", detail: ["contents: read", "pull requests: write"] },
  { title: "Open a pull request", text: "Opening, reopening or pushing to a pull request starts a review.", detail: ["pull_request", "opened, synchronize, reopened"] },
  { title: "Read the review on GitHub", text: "A risk summary and inline comments arrive on the pull request.", detail: ["pulls.createReview", "event: COMMENT"] },
  { title: "Merge", text: "Each merge refreshes the conventions PRHawk reviews against.", detail: ["pull_request", "closed, merged: true"] },
];

export default function LandingPage() {
  const scope = useRef(null);
  useLandingMotion(scope);

  return (
    <div className="site" ref={scope}>
      <header className="site-nav">
        <div className="container site-nav-inner">
          <Brand />
          <nav className="site-nav-links" aria-label="Primary">
            <a href="#review">Example review</a>
            <a href="#how-it-works">How it works</a>
            <a href="#cli">CLI</a>
            <Link to="/setup">Settings</Link>
          </nav>
          <a className="btn btn-secondary btn-nav" href={installUrl} target="_blank" rel="noreferrer">
            Install on GitHub
          </a>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="container hero-grid">
            <div className="hero-text">
              <h1 data-hero>
                Ship confidently.
                <br />
                Review automatically.
              </h1>
              <p className="lead" data-hero>
                Line-level review on every pull request, using your team&rsquo;s own conventions.
              </p>
              <div className="hero-actions" data-hero>
                <a className="btn btn-primary" href={installUrl} target="_blank" rel="noreferrer">
                  Install on GitHub
                </a>
                <a className="btn btn-ghost" href="#how-it-works">
                  How it works
                </a>
              </div>
              <p className="hero-note" data-hero>
                Install once. Every new or updated pull request gets reviewed automatically.
              </p>
            </div>
            <figure className="hero-visual" data-hero-visual>
              <ReviewPreview review={exampleReview} variant="compact" />
              <figcaption>PRHawk&rsquo;s review of a test pull request, as posted on GitHub.</figcaption>
            </figure>
          </div>
        </section>

        <section className="section" id="review" aria-labelledby="review-title">
          <div className="container">
            <div className="section-head" data-reveal>
              <h2 id="review-title">A real review, line by line</h2>
              <p className="lead">The full review of a 16-line test file with four planted problems.</p>
            </div>
            <figure className="showcase" data-reveal>
              <ReviewPreview review={exampleReview} />
              <figcaption>
                Posted <span className="num">{exampleReview.postedAfterSeconds}</span> seconds after pull request
                #{exampleReview.number} opened. Filter by severity, or open any comment.
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="section section-tight" aria-labelledby="parts-title">
          <div className="container parts">
            <h2 id="parts-title" data-reveal>Every review has three parts</h2>
            <div className="parts-rows" data-stagger>
              <div className="parts-row">
                <h3>Risk summary</h3>
                <p>A quality score from 0 to 100, the highest-risk changes and a merge recommendation.</p>
              </div>
              <div className="parts-row">
                <h3>Inline comments</h3>
                <p>Each finding sits on a changed line: the issue, why it matters and a concrete fix.</p>
              </div>
              <div className="parts-row">
                <h3>Severity on every finding</h3>
                <ul className="sev-legend" aria-label="Severity tags">
                  {SEVERITIES.map((severity) => (
                    <li key={severity.id}>
                      <SeverityTag severity={severity.id} />
                      <span>{severity.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="band" id="conventions" aria-labelledby="conventions-title">
          <div className="container split">
            <div className="split-text" data-reveal>
              <h2 id="conventions-title">Your conventions, not generic rules</h2>
              <p className="lead">PRHawk learns from your last 10 merged pull requests and reviews against what it finds.</p>
              <dl className="facts">
                <div>
                  <dt>Convention sources</dt>
                  <dd>Add any installed or public repository, such as redis/redis.</dd>
                </div>
                <div>
                  <dt>Custom rules</dt>
                  <dd>Write your own. Relearning never overwrites them.</dd>
                </div>
                <div>
                  <dt>Full control</dt>
                  <dd>Edit, disable or delete a custom rule at any time.</dd>
                </div>
              </dl>
            </div>
            <figure className="rules-figure" data-reveal>
              <div className="rules-panel">
                <div className="rules-panel-head">
                  <span>Rules applied to reviews</span>
                  <span className="rules-panel-sample">Example</span>
                </div>
                <ul>
                  {EXAMPLE_RULES.map((rule) => (
                    <li key={rule.rule}>
                      <SeverityTag severity={rule.severity} />
                      <span className="rules-panel-rule">{rule.rule}</span>
                      <span className="rules-panel-origin">{rule.origin}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <figcaption>An example of the rules list on the settings page.</figcaption>
            </figure>
          </div>
        </section>

        <section className="section" id="how-it-works" aria-labelledby="how-title">
          <div className="container">
            <div className="section-head" data-reveal>
              <h2 id="how-title">Opening a pull request starts a review</h2>
            </div>
            <ol className="steps" data-stagger>
              {STEPS.map((step) => (
                <li key={step.title}>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                  <code className="step-detail">
                    {step.detail.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </code>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section section-tight statement" aria-labelledby="control-title">
          <div className="container" data-reveal>
            <h2 id="control-title" className="statement-label">Controlled by you</h2>
            <p className="statement-text">
              Bring your own model keys, keep credentials on your backend, and choose exactly which repositories
              receive reviews.
            </p>
          </div>
        </section>

        <section className="band" id="cli" aria-labelledby="cli-title">
          <div className="container split split-cli">
            <div className="split-text" data-reveal>
              <h2 id="cli-title">Prefer the terminal?</h2>
              <p className="lead">
                Use the CLI for convention learning, dry runs and local reviews. The website and webhook use the same
                review engine.
              </p>
            </div>
            <figure className="terminal" data-reveal>
              <figcaption>backend/</figcaption>
              <pre>
                <code>
                  <span className="tok-comment"># Learn conventions from merged pull requests</span>
                  {"\n"}npm run learn -- owner/repo{"\n\n"}
                  <span className="tok-comment"># Review a pull request without posting</span>
                  {"\n"}npm run review -- PR_URL --dry-run
                </code>
              </pre>
            </figure>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container site-footer-inner">
          <div className="site-footer-mast">
            <Brand size={40} />
            <p>AI code intelligence for teams that ship.</p>
          </div>
          <nav className="site-footer-links" aria-label="Footer">
            <a href={installUrl} target="_blank" rel="noreferrer">
              Install on GitHub
            </a>
            <Link to="/setup">Settings</Link>
            <a href="#how-it-works">How it works</a>
            <a href="#cli">CLI</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
