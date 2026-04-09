import { useCallback, useState, useRef } from "react";

const WAITING_JSON = {
  status: "waiting",
  message: "Submit a URL to run a scrape (backend must be running on port 5000 with the Vite proxy)."
};

const INITIAL_EXTRACT = {
  text: true,
  links: true,
  images: false,
  meta: true
};

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function normalizeUrl(raw) {
  const t = String(raw || "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return "https://" + t.replace(/^\/+/, "");
}

function extractKeysTrue(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v)
    .map(([k]) => k);
}

export default function App() {
  const urlRef = useRef(null);

  const [url, setUrl] = useState("");
  const [depth, setDepth] = useState(1);
  const [extract, setExtract] = useState(() => ({ ...INITIAL_EXTRACT }));
  const [jsonText, setJsonText] = useState(
    () => JSON.stringify(WAITING_JSON, null, 2)
  );
  const [badgeText, setBadgeText] = useState("Idle");
  const [badgeVariant, setBadgeVariant] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggleExtract = useCallback((key) => {
    setExtract((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleReset = useCallback(() => {
    setUrl("");
    setDepth(1);
    setExtract({ ...INITIAL_EXTRACT });
    setJsonText(JSON.stringify(WAITING_JSON, null, 2));
    setBadgeText("Idle");
    setBadgeVariant(null);
    setLoading(false);
  }, []);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      const normalized = normalizeUrl(url);
      if (!normalized) {
        urlRef.current?.focus();
        setBadgeText("URL required");
        setBadgeVariant(null);
        setJsonText(
          JSON.stringify({ error: "Please enter a target URL." }, null, 2)
        );
        return;
      }

      const keys = extractKeysTrue(extract);
      if (keys.length === 0) {
        setBadgeText("Pick extract types");
        setBadgeVariant(null);
        setJsonText(
          JSON.stringify(
            { error: "Select at least one option under “What to extract”." },
            null,
            2
          )
        );
        return;
      }

      setLoading(true);
      setBadgeText("Scraping…");
      setBadgeVariant("running");
      setJsonText(
        JSON.stringify({ status: "pending", message: "Fetching and parsing…" }, null, 2)
      );

      try {
        const res = await fetch(`${API_BASE}/api/scrape`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            url: normalized,
            depth: Number(depth),
            extract: keys
          })
        });

        const raw = await res.text();
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = {
            error: "Non-JSON response from server",
            body: raw.slice(0, 800)
          };
        }

        if (!res.ok) {
          const msg =
            data.error ||
            data.message ||
            `Request failed (${res.status})`;
          const e = new Error(msg);
          e.details = data;
          throw e;
        }
        setJsonText(JSON.stringify(data, null, 2));
        setBadgeText("Done");
        setBadgeVariant("ok");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Scrape failed";
        const fromApi =
          err instanceof Error &&
          "details" in err &&
          err.details &&
          typeof err.details === "object"
            ? err.details
            : {};
        setJsonText(
          JSON.stringify(
            {
              ...fromApi,
              error: message,
              hint:
                "Run the API on port 5000 (`npm run dev` in the project root). Use the Vite dev app (`npm run client:dev`) so `/api` proxies correctly. If MongoDB is not set, add `SKIP_DB=1` to `.env` to start the API anyway."
            },
            null,
            2
          )
        );
        setBadgeText("Error");
        setBadgeVariant(null);
      } finally {
        setLoading(false);
      }
    },
    [url, depth, extract]
  );

  const badgeClass =
    "badge" +
    (badgeVariant === "running" ? " badge--running" : "") +
    (badgeVariant === "ok" ? " badge--ok" : "");

  return (
    <>
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-glow" aria-hidden="true" />

      <header className="site-header">
        <a className="brand" href="#">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">WebHarvest</span>
        </a>
        <nav className="nav" aria-label="Primary">
          <a href="#scrape">Scrape</a>
          <a href="#features">Features</a>
          <a href="#export">Export</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">Live scrape · POST /api/scrape</p>
          <h1 className="hero-title">
            Pull structure from any page — <em>without</em> the chaos.
          </h1>
          <p className="hero-lede">
            Enter a URL, choose what to harvest, and preview results in one calm
            workspace. Depth follows internal links on the same host (capped for
            safety).
          </p>
        </section>

        <section id="scrape" className="panel" aria-labelledby="scrape-title">
          <div className="panel-head">
            <h2 id="scrape-title">New scrape</h2>
            <p className="panel-sub">
              Configure once — run on schedule when your backend is ready.
            </p>
          </div>

          <form className="scrape-form" onSubmit={handleSubmit} noValidate>
            <label className="field url-field">
              <span className="field-label">Target URL</span>
              <div className="url-wrap">
                <span className="url-prefix" aria-hidden="true">
                  https://
                </span>
                <input
                  ref={urlRef}
                  type="text"
                  name="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="example.com/products/summer-sale"
                  autoComplete="url"
                  spellCheck={false}
                />
              </div>
            </label>

            <div className="field-row">
              <fieldset className="field toggles">
                <legend className="field-label">What to extract</legend>
                <div className="toggle-grid">
                  <label className="chip">
                    <input
                      type="checkbox"
                      checked={extract.text}
                      onChange={() => toggleExtract("text")}
                    />
                    <span>Page text</span>
                  </label>
                  <label className="chip">
                    <input
                      type="checkbox"
                      checked={extract.links}
                      onChange={() => toggleExtract("links")}
                    />
                    <span>Links</span>
                  </label>
                  <label className="chip">
                    <input
                      type="checkbox"
                      checked={extract.images}
                      onChange={() => toggleExtract("images")}
                    />
                    <span>Images</span>
                  </label>
                  <label className="chip">
                    <input
                      type="checkbox"
                      checked={extract.meta}
                      onChange={() => toggleExtract("meta")}
                    />
                    <span>Meta &amp; Open Graph</span>
                  </label>
                </div>
              </fieldset>

              <div className="field depth-field">
                <label className="field-label" htmlFor="depth">
                  Crawl depth
                </label>
                <div className="depth-control">
                  <input
                    type="range"
                    id="depth"
                    name="depth"
                    min={0}
                    max={4}
                    value={depth}
                    onChange={(e) => setDepth(Number(e.target.value))}
                  />
                  <output className="depth-value" htmlFor="depth">
                    {depth}
                  </output>
                </div>
                <p className="hint">
                  0 = single page only · higher = follow internal links
                </p>
              </div>
            </div>

            <div className="actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
              >
                <span className="btn-label">Run scrape</span>
                <span className="btn-shine" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleReset}
              >
                Clear form
              </button>
            </div>
          </form>
        </section>

        <section className="output" id="output" aria-live="polite">
          <div className="output-head">
            <h2>Results</h2>
            <span className={badgeClass} id="status-badge">
              {badgeText}
            </span>
          </div>
          <div className="output-body">
            <pre className="json-preview" id="json-preview">
              <code>{jsonText}</code>
            </pre>
          </div>
        </section>

        <section id="features" className="features">
          <article className="feature-card">
            <h3>Structured first</h3>
            <p>
              Designed around JSON-shaped output so your API and dashboard stay
              in sync.
            </p>
          </article>
          <article className="feature-card">
            <h3>Scope control</h3>
            <p>
              Depth and extract toggles mirror how real crawlers limit work and
              cost.
            </p>
          </article>
          <article className="feature-card">
            <h3>Export-ready</h3>
            <p>
              Same data can flow to CSV, Sheets, or webhooks — plug in when
              you’re ready.
            </p>
          </article>
        </section>

        <section id="export" className="cta-strip">
          <p>
            <strong>WebHarvest</strong> — harvest the web, own the data.
          </p>
        </section>
      </main>

      <footer className="site-footer">
        <span>© WebHarvest</span>
        <span className="sep">·</span>
        <span>
          Run API + Vite together, or set <code>VITE_API_URL</code> for production.
        </span>
      </footer>
    </>
  );
}
