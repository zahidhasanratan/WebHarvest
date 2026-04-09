const cheerio = require("cheerio");
const { URL } = require("url");

const USER_AGENT = "WebHarvest/1.0 (Educational; +https://example.com)";
const FETCH_TIMEOUT_MS = 25000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_CRAWL_PAGES = 35;

function isSafeHttpUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost")) return false;
    if (host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return false;
    if (/^10\./.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    if (/^169\.254\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function normalizeStartUrl(raw) {
  const t = String(raw || "").trim();
  if (!t) return "";
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
  try {
    const u = new URL(withProto);
    u.hash = "";
    return u.href;
  } catch {
    return "";
  }
}

function isInternalLink(pageUrl, targetUrl) {
  try {
    const a = new URL(pageUrl);
    const b = new URL(targetUrl);
    return a.hostname.toLowerCase() === b.hostname.toLowerCase();
  } catch {
    return false;
  }
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.statusCode = res.status >= 500 ? 502 : 400;
      throw err;
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) {
      const err = new Error("Page too large");
      err.statusCode = 413;
      throw err;
    }
    return { finalUrl: res.url, html: Buffer.from(buf).toString("utf8") };
  } finally {
    clearTimeout(timer);
  }
}

function extractFromHtml(html, pageUrl, extract) {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const out = {};

  if (extract.includes("text")) {
    const text = $("body").text().replace(/\s+/g, " ").trim();
    out.text = text.slice(0, 500_000);
  }

  if (extract.includes("links")) {
    const set = new Set();
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href || href.startsWith("javascript:") || href.startsWith("#")) return;
      try {
        const abs = new URL(href, pageUrl).href;
        if (abs.startsWith("http")) set.add(abs);
      } catch {
        /* skip */
      }
    });
    out.links = [...set];
  }

  if (extract.includes("images")) {
    const set = new Set();
    const pushSrc = (s) => {
      if (!s) return;
      try {
        set.add(new URL(s, pageUrl).href);
      } catch {
        /* skip */
      }
    };
    $("img[src]").each((_, el) => pushSrc($(el).attr("src")));
    $("img[data-src]").each((_, el) => pushSrc($(el).attr("data-src")));
    $("source[srcset]").each((_, el) => {
      const ss = $(el).attr("srcset");
      if (!ss) return;
      const first = ss.split(",")[0].trim().split(/\s+/)[0];
      pushSrc(first);
    });
    out.images = [...set];
  }

  if (extract.includes("meta")) {
    const meta = {};
    $("meta").each((_, el) => {
      const name = $(el).attr("name") || $(el).attr("property") || $(el).attr("itemprop");
      const content = $(el).attr("content");
      if (name && content) meta[name] = content;
    });
    out.title = $("title").first().text().trim();
    out.meta = meta;
  }

  return out;
}

function discoverInternalLinks(html, pageUrl) {
  const $ = cheerio.load(html);
  const set = new Set();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:"))
      return;
    try {
      const abs = new URL(href, pageUrl).href;
      if (!abs.startsWith("http")) return;
      if (!isInternalLink(pageUrl, abs)) return;
      if (!isSafeHttpUrl(abs)) return;
      const u = new URL(abs);
      u.hash = "";
      set.add(u.href);
    } catch {
      /* skip */
    }
  });
  return [...set];
}

/**
 * @param {{ url: string, depth: number, extract: string[] }} opts
 */
async function runScrape(opts) {
  const start = normalizeStartUrl(opts.url);
  if (!start || !isSafeHttpUrl(start)) {
    const err = new Error("Invalid or disallowed URL");
    err.statusCode = 400;
    throw err;
  }

  const extract = Array.isArray(opts.extract) ? opts.extract : [];
  const maxDepth = Math.min(4, Math.max(0, Number(opts.depth) || 0));

  const visited = new Set();
  const queue = [{ url: start, level: 0 }];
  visited.add(start);

  const pages = [];

  while (queue.length && pages.length < MAX_CRAWL_PAGES) {
    const { url, level } = queue.shift();

    let html;
    let finalUrl;
    try {
      if (!isSafeHttpUrl(url)) continue;
      const r = await fetchHtml(url);
      html = r.html;
      finalUrl = r.finalUrl;
    } catch (e) {
      pages.push({
        url,
        level,
        error: e.message || "Fetch failed"
      });
      continue;
    }

    let data;
    try {
      data = extractFromHtml(html, finalUrl, extract);
    } catch (parseErr) {
      pages.push({
        url: finalUrl,
        level,
        error: parseErr?.message || "Failed to parse HTML"
      });
      continue;
    }

    pages.push({
      url: finalUrl,
      level,
      data
    });

    if (level < maxDepth) {
      let next = [];
      try {
        next = discoverInternalLinks(html, finalUrl);
      } catch {
        next = [];
      }
      for (const link of next) {
        if (pages.length + queue.length >= MAX_CRAWL_PAGES * 2) break;
        if (!visited.has(link)) {
          visited.add(link);
          queue.push({ url: link, level: level + 1 });
        }
      }
    }
  }

  return {
    startUrl: start,
    maxDepth,
    extract,
    pageCount: pages.filter((p) => !p.error).length,
    pages
  };
}

module.exports = {
  runScrape,
  normalizeStartUrl,
  isSafeHttpUrl
};
