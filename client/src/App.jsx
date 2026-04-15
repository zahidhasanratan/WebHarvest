import { useCallback, useMemo, useRef, useState } from "react";

const WAITING_JSON = {
  status: "waiting",
  message: "Submit a URL to run a scrape (backend must be running on port 5000 with the Vite proxy)."
};

const INITIAL_EXTRACT = {
  text: true,
  links: true,
  images: false,
  meta: false
};

const API_BASE = import.meta.env.VITE_API_URL ?? "";

/** Strip scheme so the field matches the visible `https://` prefix (avoids double https on paste). */
function sanitizeUrlInput(raw) {
  return String(raw || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^\/+/, "");
}

function normalizeUrl(raw) {
  const t = sanitizeUrlInput(raw);
  if (!t) return "";
  return "https://" + t.replace(/^\/+/, "");
}

function extractKeysTrue(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v)
    .map(([k]) => k);
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function downloadText(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const urlRef = useRef(null);
  const scrapeAbortRef = useRef(null);
  const scrapeTimerRef = useRef(null);

  const [url, setUrl] = useState("");
  const [depth, setDepth] = useState(1);
  const [extract, setExtract] = useState(() => ({ ...INITIAL_EXTRACT }));
  const [jsonText, setJsonText] = useState(
    () => JSON.stringify(WAITING_JSON, null, 2)
  );
  const [result, setResult] = useState(null);
  const [badgeText, setBadgeText] = useState("Idle");
  const [badgeVariant, setBadgeVariant] = useState(null);
  const [loading, setLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [activeTab, setActiveTab] = useState("summary");
  const [activePageIdx, setActivePageIdx] = useState(0);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [options, setOptions] = useState(() => ({
    maxPages: 20,
    includeSubdomains: false,
    allowQueryParams: false,
    includeUrlContains: "",
    excludeUrlContains: "",
    crawlDelayMs: 0,
    timeoutMs: 25000,
    retries: 1,
    userAgent: ""
  }));
  const [features, setFeatures] = useState(() => ({
    emails: false,
    phones: false,
    prices: false,
    videos: false,
    audio: false,
    backgroundImages: false,
    documents: false
  }));

  const toggleExtract = useCallback((key) => {
    setExtract((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleFeature = useCallback((key) => {
    setFeatures((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const stopScrapeTimer = useCallback(() => {
    if (scrapeTimerRef.current) {
      clearInterval(scrapeTimerRef.current);
      scrapeTimerRef.current = null;
    }
  }, []);

  const startScrapeTimer = useCallback(() => {
    stopScrapeTimer();
    const startedAt = Date.now();
    setElapsedMs(0);
    scrapeTimerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 250);
  }, [stopScrapeTimer]);

  const handleReset = useCallback(() => {
    if (scrapeAbortRef.current) {
      scrapeAbortRef.current.abort();
      scrapeAbortRef.current = null;
    }
    stopScrapeTimer();
    setUrl("");
    setDepth(1);
    setExtract({ ...INITIAL_EXTRACT });
    setJsonText(JSON.stringify(WAITING_JSON, null, 2));
    setResult(null);
    setBadgeText("Idle");
    setBadgeVariant(null);
    setLoading(false);
    setElapsedMs(0);
    setActiveTab("summary");
    setActivePageIdx(0);
    setShowAdvanced(false);
    setOptions({
      maxPages: 20,
      includeSubdomains: false,
      allowQueryParams: false,
      includeUrlContains: "",
      excludeUrlContains: "",
      crawlDelayMs: 0,
      timeoutMs: 25000,
      retries: 1,
      userAgent: ""
    });
    setFeatures({
      emails: false,
      phones: false,
      prices: false,
      videos: false,
      audio: false,
      backgroundImages: false,
      documents: false
    });
  }, []);

  const apiFetch = useCallback(
    async (path, opts = {}) => {
      const res = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        ...opts,
        headers: {
          "Content-Type": "application/json",
          ...(opts.headers || {})
        }
      });
      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: "Non-JSON response from server", body: raw.slice(0, 800) };
      }
      if (!res.ok) {
        const msg = data.error || data.message || `Request failed (${res.status})`;
        const e = new Error(msg);
        e.details = data;
        throw e;
      }
      return data;
    },
    []
  );

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
            {
              error:
                "Select at least one of Page text, Links, Images, or turn on Meta & Open Graph in Advanced options."
            },
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
      setResult(null);
      setActiveTab("summary");
      setActivePageIdx(0);
      startScrapeTimer();

      const controller = new AbortController();
      scrapeAbortRef.current = controller;

      try {
        const data = await apiFetch("/api/scrape", {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
            url: normalized,
            depth: Number(depth),
            extract: keys,
            options,
            features
          }),
          headers: {}
        });
        setJsonText(JSON.stringify(data, null, 2));
        setResult(data);
        setBadgeText("Done");
        setBadgeVariant("ok");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Scrape failed";
        const aborted =
          err instanceof Error && (err.name === "AbortError" || message.includes("aborted"));
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
              error: aborted ? "Scrape cancelled" : message,
              hint:
                "Run the API on port 5000 (`npm run dev` in the project root). Use the Vite dev app (`npm run client:dev`) so `/api` proxies correctly."
            },
            null,
            2
          )
        );
        setResult(null);
        setBadgeText(aborted ? "Cancelled" : "Error");
        setBadgeVariant(null);
      } finally {
        scrapeAbortRef.current = null;
        stopScrapeTimer();
        setLoading(false);
      }
    },
    [url, depth, extract, apiFetch, options, features, startScrapeTimer, stopScrapeTimer]
  );

  const handleCancelScrape = useCallback(() => {
    if (scrapeAbortRef.current) scrapeAbortRef.current.abort();
  }, []);

  const pages = useMemo(() => {
    return result && Array.isArray(result.pages) ? result.pages : [];
  }, [result]);

  const activePage = useMemo(() => {
    return pages[activePageIdx] || null;
  }, [pages, activePageIdx]);

  const pageCounts = useMemo(() => {
    const p = activePage?.data || {};
    return {
      links: Array.isArray(p.links) ? p.links.length : 0,
      images: Array.isArray(p.images) ? p.images.length : 0,
      textChars: typeof p.text === "string" ? p.text.length : 0,
      metaKeys: p.meta && typeof p.meta === "object" ? Object.keys(p.meta).length : 0,
      emails: Array.isArray(p.emails) ? p.emails.length : 0,
      phones: Array.isArray(p.phones) ? p.phones.length : 0,
      prices: Array.isArray(p.prices) ? p.prices.length : 0,
      videos: Array.isArray(p.videos) ? p.videos.length : 0,
      audio: Array.isArray(p.audio) ? p.audio.length : 0,
      bgImages: Array.isArray(p.backgroundImages) ? p.backgroundImages.length : 0
      ,
      documents: Array.isArray(p.documents) ? p.documents.length : 0
    };
  }, [activePage]);

  const exportAll = useMemo(() => {
    // aggregate across all pages (deduped)
    const sets = {
      links: new Set(),
      images: new Set(),
      emails: new Set(),
      phones: new Set(),
      prices: new Set(),
      videos: new Set(),
      audio: new Set(),
      backgroundImages: new Set(),
      documents: new Map()
    };
    for (const p of pages) {
      if (!p || p.error || !p.data) continue;
      const d = p.data;
      for (const k of Object.keys(sets)) {
        if (k === "documents") {
          const docs = d.documents;
          if (Array.isArray(docs)) {
            for (const doc of docs) {
              const url = String(doc?.url || "");
              if (url) sets.documents.set(url, { url, type: doc?.type || "", text: doc?.text || "" });
            }
          }
          continue;
        }
        const arr = d[k];
        if (Array.isArray(arr)) for (const v of arr) sets[k].add(String(v));
      }
    }
    const toArr = (s) => [...s].filter(Boolean);
    return {
      links: toArr(sets.links),
      images: toArr(sets.images),
      emails: toArr(sets.emails),
      phones: toArr(sets.phones),
      prices: toArr(sets.prices),
      videos: toArr(sets.videos),
      audio: toArr(sets.audio),
      backgroundImages: toArr(sets.backgroundImages),
      documents: [...sets.documents.values()]
    };
  }, [pages]);

  const handleCopyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setBadgeText("Copied");
      setBadgeVariant("ok");
    } catch {
      setBadgeText("Copy failed");
      setBadgeVariant(null);
    }
  }, [jsonText]);

  const handleDownloadJson = useCallback(() => {
    const stamp = new Date().toISOString().replaceAll(":", "-");
    downloadText(`webharvest-${stamp}.json`, jsonText, "application/json;charset=utf-8");
  }, [jsonText]);

  const handleDownloadCsv = useCallback(
    (kind) => {
      const rows = [["value"]];
      const values = exportAll[kind] || [];
      for (const v of values) rows.push([v]);
      const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
      const stamp = new Date().toISOString().replaceAll(":", "-");
      downloadText(`webharvest-${kind}-${stamp}.csv`, csv, "text/csv;charset=utf-8");
    },
    [exportAll]
  );

  const handleDownloadDocumentsCsv = useCallback(() => {
    const docs = Array.isArray(exportAll.documents) ? exportAll.documents : [];
    const rows = [["type", "url", "text"]];
    for (const d of docs) rows.push([d.type || "", d.url || "", d.text || ""]);
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    const stamp = new Date().toISOString().replaceAll(":", "-");
    downloadText(`webharvest-documents-${stamp}.csv`, csv, "text/csv;charset=utf-8");
  }, [exportAll.documents]);

  const badgeClass =
    "badge" +
    (badgeVariant === "running" ? " badge--running" : "") +
    (badgeVariant === "ok" ? " badge--ok" : "");

  const prettyElapsed = useMemo(() => {
    const s = Math.floor(elapsedMs / 1000);
    const ms = Math.floor((elapsedMs % 1000) / 10)
      .toString()
      .padStart(2, "0");
    return `${s}.${ms}s`;
  }, [elapsedMs]);

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
                  onChange={(e) => setUrl(sanitizeUrlInput(e.target.value))}
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
                      checked={features.emails}
                      onChange={() => toggleFeature("emails")}
                    />
                    <span>Emails</span>
                  </label>
                  <label className="chip">
                    <input
                      type="checkbox"
                      checked={features.phones}
                      onChange={() => toggleFeature("phones")}
                    />
                    <span>Phones</span>
                  </label>
                  <label className="chip">
                    <input
                      type="checkbox"
                      checked={features.documents}
                      onChange={() => toggleFeature("documents")}
                    />
                    <span>Documents</span>
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

            <div className="adv-row">
              <button
                type="button"
                className="btn btn-ghost adv-toggle"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? "Hide advanced options" : "Show advanced options"}
              </button>
            </div>

            {showAdvanced ? (
              <div className="advanced">
                <div className="advanced-grid">
                  <label className="field">
                    <span className="field-label">Max pages</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={options.maxPages}
                      onChange={(e) =>
                        setOptions((p) => ({ ...p, maxPages: Number(e.target.value) }))
                      }
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">Timeout (ms)</span>
                    <input
                      type="number"
                      min={2000}
                      max={60000}
                      value={options.timeoutMs}
                      onChange={(e) =>
                        setOptions((p) => ({ ...p, timeoutMs: Number(e.target.value) }))
                      }
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">Retries</span>
                    <input
                      type="number"
                      min={0}
                      max={3}
                      value={options.retries}
                      onChange={(e) =>
                        setOptions((p) => ({ ...p, retries: Number(e.target.value) }))
                      }
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">Crawl delay (ms)</span>
                    <input
                      type="number"
                      min={0}
                      max={5000}
                      value={options.crawlDelayMs}
                      onChange={(e) =>
                        setOptions((p) => ({ ...p, crawlDelayMs: Number(e.target.value) }))
                      }
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">Include URL contains</span>
                    <input
                      type="text"
                      value={options.includeUrlContains}
                      onChange={(e) =>
                        setOptions((p) => ({ ...p, includeUrlContains: e.target.value }))
                      }
                      placeholder="/products"
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">Exclude URL contains</span>
                    <input
                      type="text"
                      value={options.excludeUrlContains}
                      onChange={(e) =>
                        setOptions((p) => ({ ...p, excludeUrlContains: e.target.value }))
                      }
                      placeholder="/login"
                    />
                  </label>

                  <label className="field">
                    <span className="field-label">User-Agent (optional)</span>
                    <input
                      type="text"
                      value={options.userAgent}
                      onChange={(e) =>
                        setOptions((p) => ({ ...p, userAgent: e.target.value }))
                      }
                      placeholder="Mozilla/5.0 ..."
                    />
                  </label>

                  <div className="checks">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={options.includeSubdomains}
                        onChange={() =>
                          setOptions((p) => ({
                            ...p,
                            includeSubdomains: !p.includeSubdomains
                          }))
                        }
                      />
                      <span>Allow subdomains</span>
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={options.allowQueryParams}
                        onChange={() =>
                          setOptions((p) => ({
                            ...p,
                            allowQueryParams: !p.allowQueryParams
                          }))
                        }
                      />
                      <span>Keep query params</span>
                    </label>
                  </div>
                </div>

                <div className="field" style={{ marginTop: "0.75rem" }}>
                  <span className="field-label">Smart extract (optional)</span>
                  <div className="toggle-grid">
                    <label className="chip">
                      <input
                        type="checkbox"
                        checked={extract.meta}
                        onChange={() => toggleExtract("meta")}
                      />
                      <span>Meta &amp; Open Graph</span>
                    </label>
                    <label className="chip">
                      <input
                        type="checkbox"
                        checked={features.prices}
                        onChange={() => toggleFeature("prices")}
                      />
                      <span>Prices</span>
                    </label>
                    <label className="chip">
                      <input
                        type="checkbox"
                        checked={features.videos}
                        onChange={() => toggleFeature("videos")}
                      />
                      <span>Videos</span>
                    </label>
                    <label className="chip">
                      <input
                        type="checkbox"
                        checked={features.audio}
                        onChange={() => toggleFeature("audio")}
                      />
                      <span>Audio</span>
                    </label>
                    <label className="chip">
                      <input
                        type="checkbox"
                        checked={features.backgroundImages}
                        onChange={() => toggleFeature("backgroundImages")}
                      />
                      <span>BG images</span>
                    </label>
                  </div>
                </div>
              </div>
            ) : null}

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
            {loading && !result ? (
              <div className="smart-loading">
                <div className="smart-loading-top">
                  <div className="smart-title">Working…</div>
                  <div className="smart-meta">
                    <span className="mono">elapsed {prettyElapsed}</span>
                    <button type="button" className="btn btn-ghost export-btn" onClick={handleCancelScrape}>
                      Cancel
                    </button>
                  </div>
                </div>
                <div className="smart-bar" aria-hidden="true">
                  <div className="smart-bar-fill" />
                </div>
                <div className="smart-hint">
                  Fetching HTML, following internal links, and extracting the fields you selected.
                </div>
                <pre className="json-preview" id="json-preview">
                  <code>{jsonText}</code>
                </pre>
              </div>
            ) : result ? (
              <div className="result-advanced">
                <div className="result-toolbar">
                  <div className="tabs" role="tablist" aria-label="Results tabs">
                    {[
                      ["summary", "Summary"],
                      ["text", `Text (${pageCounts.textChars})`],
                      ["links", `Links (${pageCounts.links})`],
                      ["images", `Images (${pageCounts.images})`],
                      ["meta", `Meta (${pageCounts.metaKeys})`],
                      ["emails", `Emails (${pageCounts.emails})`],
                      ["phones", `Phones (${pageCounts.phones})`],
                      ["prices", `Prices (${pageCounts.prices})`],
                      ["videos", `Videos (${pageCounts.videos})`],
                      ["audio", `Audio (${pageCounts.audio})`],
                      ["bgImages", `BG images (${pageCounts.bgImages})`],
                      ["documents", `Documents (${pageCounts.documents})`],
                      ["raw", "Raw JSON"]
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={"tab" + (activeTab === key ? " tab--active" : "")}
                        onClick={() => setActiveTab(key)}
                        role="tab"
                        aria-selected={activeTab === key}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="page-select">
                    <span className="page-label">Page</span>
                    <select
                      value={activePageIdx}
                      onChange={(e) => setActivePageIdx(Number(e.target.value))}
                      aria-label="Select page"
                    >
                      {pages.map((p, idx) => (
                        <option key={`${p.url}-${idx}`} value={idx}>
                          {idx + 1}. {p.url}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="export-actions">
                    <button type="button" className="btn btn-ghost export-btn" onClick={handleCopyJson}>
                      Copy JSON
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost export-btn"
                      onClick={handleDownloadJson}
                    >
                      Download JSON
                    </button>
                    <details className="export-menu">
                      <summary className="export-summary">Download CSV</summary>
                      <div className="export-popover">
                        {[
                          ["links", `Links (${exportAll.links.length})`],
                          ["images", `Images (${exportAll.images.length})`],
                          ["documents", `Documents (${exportAll.documents.length})`],
                          ["emails", `Emails (${exportAll.emails.length})`],
                          ["phones", `Phones (${exportAll.phones.length})`],
                          ["prices", `Prices (${exportAll.prices.length})`],
                          ["videos", `Videos (${exportAll.videos.length})`],
                          ["audio", `Audio (${exportAll.audio.length})`],
                          ["backgroundImages", `BG images (${exportAll.backgroundImages.length})`]
                        ].map(([k, label]) => (
                          <button
                            key={k}
                            type="button"
                            className="export-item"
                            onClick={() => (k === "documents" ? handleDownloadDocumentsCsv() : handleDownloadCsv(k))}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>

                <div className="result-content">
                  {activeTab === "summary" ? (
                    <div className="summary-grid">
                      <div className="summary-card">
                        <div className="summary-k">Start URL</div>
                        <div className="summary-v">{result.startUrl || "-"}</div>
                      </div>
                      <div className="summary-card">
                        <div className="summary-k">Depth</div>
                        <div className="summary-v">{result.maxDepth}</div>
                      </div>
                      <div className="summary-card">
                        <div className="summary-k">Pages scraped</div>
                        <div className="summary-v">{result.pageCount}</div>
                      </div>
                      <div className="summary-card">
                        <div className="summary-k">Extract</div>
                        <div className="summary-v">
                          {Array.isArray(result.extract) ? result.extract.join(", ") : "-"}
                        </div>
                      </div>

                      <div className="summary-wide">
                        <div className="summary-k">Selected page</div>
                        <div className="summary-v">
                          {activePage?.error ? (
                            <span className="error-pill">Error: {activePage.error}</span>
                          ) : (
                            <span className="ok-pill">OK</span>
                          )}{" "}
                          <span className="muted">·</span>{" "}
                          <span className="mono">{activePage?.url || "-"}</span>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {activeTab === "text" ? (
                    <div className="pane">
                      {activePage?.error ? (
                        <div className="pane-empty">This page failed: {activePage.error}</div>
                      ) : (
                        <pre className="text-preview">
                          <code>
                            {typeof activePage?.data?.text === "string"
                              ? activePage.data.text.slice(0, 20000)
                              : "(no text)"}{" "}
                            {typeof activePage?.data?.text === "string" &&
                            activePage.data.text.length > 20000
                              ? "\n\n…(truncated)"
                              : ""}
                          </code>
                        </pre>
                      )}
                    </div>
                  ) : null}

                  {activeTab === "links" ? (
                    <div className="pane">
                      {Array.isArray(activePage?.data?.links) && activePage.data.links.length ? (
                        <ul className="list">
                          {activePage.data.links.slice(0, 500).map((l) => (
                            <li key={l} className="list-item">
                              <a href={l} target="_blank" rel="noreferrer">
                                {l}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="pane-empty">(no links)</div>
                      )}
                    </div>
                  ) : null}

                  {activeTab === "emails" ? (
                    <div className="pane">
                      {Array.isArray(activePage?.data?.emails) && activePage.data.emails.length ? (
                        <ul className="list">
                          {activePage.data.emails.slice(0, 1000).map((v) => (
                            <li key={v} className="list-item">
                              <a href={`mailto:${v}`}>{v}</a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="pane-empty">(no emails)</div>
                      )}
                    </div>
                  ) : null}

                  {activeTab === "phones" ? (
                    <div className="pane">
                      {Array.isArray(activePage?.data?.phones) && activePage.data.phones.length ? (
                        <ul className="list">
                          {activePage.data.phones.slice(0, 1000).map((v) => (
                            <li key={v} className="list-item">
                              <a href={`tel:${v}`}>{v}</a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="pane-empty">(no phones)</div>
                      )}
                    </div>
                  ) : null}

                  {activeTab === "prices" ? (
                    <div className="pane">
                      {Array.isArray(activePage?.data?.prices) && activePage.data.prices.length ? (
                        <ul className="list">
                          {activePage.data.prices.slice(0, 1000).map((v) => (
                            <li key={v} className="list-item">
                              <span className="mono">{v}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="pane-empty">(no prices)</div>
                      )}
                    </div>
                  ) : null}

                  {activeTab === "videos" ? (
                    <div className="pane">
                      {Array.isArray(activePage?.data?.videos) && activePage.data.videos.length ? (
                        <ul className="list">
                          {activePage.data.videos.slice(0, 500).map((v) => (
                            <li key={v} className="list-item">
                              <a href={v} target="_blank" rel="noreferrer">
                                {v}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="pane-empty">(no videos)</div>
                      )}
                    </div>
                  ) : null}

                  {activeTab === "audio" ? (
                    <div className="pane">
                      {Array.isArray(activePage?.data?.audio) && activePage.data.audio.length ? (
                        <ul className="list">
                          {activePage.data.audio.slice(0, 500).map((v) => (
                            <li key={v} className="list-item">
                              <a href={v} target="_blank" rel="noreferrer">
                                {v}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="pane-empty">(no audio)</div>
                      )}
                    </div>
                  ) : null}

                  {activeTab === "bgImages" ? (
                    <div className="pane">
                      {Array.isArray(activePage?.data?.backgroundImages) &&
                      activePage.data.backgroundImages.length ? (
                        <div className="image-grid">
                          {activePage.data.backgroundImages.slice(0, 120).map((src) => (
                            <a
                              key={src}
                              className="image-card"
                              href={src}
                              target="_blank"
                              rel="noreferrer"
                              title={src}
                            >
                              <img src={src} alt="" loading="lazy" />
                              <span className="image-url">{src}</span>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div className="pane-empty">(no background images)</div>
                      )}
                    </div>
                  ) : null}

                  {activeTab === "documents" ? (
                    <div className="pane">
                      {Array.isArray(activePage?.data?.documents) && activePage.data.documents.length ? (
                        <div className="table-wrap">
                          <table className="table">
                            <thead>
                              <tr>
                                <th>Type</th>
                                <th>URL</th>
                                <th>Label</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activePage.data.documents.slice(0, 400).map((d) => (
                                <tr key={d.url}>
                                  <td className="mono">{d.type}</td>
                                  <td>
                                    <a href={d.url} target="_blank" rel="noreferrer">
                                      {d.url}
                                    </a>
                                  </td>
                                  <td>{d.text || ""}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="pane-empty">(no documents)</div>
                      )}
                    </div>
                  ) : null}

                  {activeTab === "images" ? (
                    <div className="pane">
                      {Array.isArray(activePage?.data?.images) && activePage.data.images.length ? (
                        <div className="image-grid">
                          {activePage.data.images.slice(0, 120).map((src) => (
                            <a
                              key={src}
                              className="image-card"
                              href={src}
                              target="_blank"
                              rel="noreferrer"
                              title={src}
                            >
                              <img src={src} alt="" loading="lazy" />
                              <span className="image-url">{src}</span>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div className="pane-empty">(no images)</div>
                      )}
                    </div>
                  ) : null}

                  {activeTab === "meta" ? (
                    <div className="pane">
                      {activePage?.error ? (
                        <div className="pane-empty">This page failed: {activePage.error}</div>
                      ) : (
                        <>
                          <div className="meta-title">
                            <span className="summary-k">Title</span>
                            <div className="summary-v">
                              {activePage?.data?.title || "(no title)"}
                            </div>
                          </div>
                          {activePage?.data?.meta && typeof activePage.data.meta === "object" ? (
                            <div className="table-wrap">
                              <table className="table">
                                <thead>
                                  <tr>
                                    <th>Key</th>
                                    <th>Value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {Object.entries(activePage.data.meta)
                                    .slice(0, 200)
                                    .map(([k, v]) => (
                                      <tr key={k}>
                                        <td className="mono">{k}</td>
                                        <td>{String(v)}</td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="pane-empty">(no meta)</div>
                          )}
                        </>
                      )}
                    </div>
                  ) : null}

                  {activeTab === "raw" ? (
                    <pre className="json-preview" id="json-preview">
                      <code>{jsonText}</code>
                    </pre>
                  ) : null}
                </div>
              </div>
            ) : (
              <pre className="json-preview" id="json-preview">
                <code>{jsonText}</code>
              </pre>
            )}
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
        <span>© WebHarvest ·</span>
      </footer>
    </>
  );
}
