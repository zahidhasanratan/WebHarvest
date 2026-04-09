const cheerio = require("cheerio");
const { URL } = require("url");

const USER_AGENT = "WebHarvest/1.0 (Educational; +https://example.com)";
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_CRAWL_PAGES = 35;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

function isInternalLink(pageUrl, targetUrl, opts = {}) {
  try {
    const a = new URL(pageUrl);
    const b = new URL(targetUrl);
    const ha = a.hostname.toLowerCase();
    const hb = b.hostname.toLowerCase();
    if (ha === hb) return true;
    if (opts.includeSubdomains) {
      return hb === ha || hb.endsWith(`.${ha}`);
    }
    return false;
  } catch {
    return false;
  }
}

async function fetchHtml(url, fetchOpts = {}) {
  const timeoutMs = Number(fetchOpts.timeoutMs || 25000);
  const userAgent = fetchOpts.userAgent || USER_AGENT;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent,
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

function extractBackgroundImages($, pageUrl) {
  const set = new Set();
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const m = style.match(/background-image\s*:\s*url\(([^)]+)\)/i);
    if (!m) return;
    const raw = m[1].trim().replace(/^['"]|['"]$/g, "");
    if (!raw) return;
    try {
      set.add(new URL(raw, pageUrl).href);
    } catch {
      /* skip */
    }
  });
  return [...set];
}

function extractVideoUrls($, pageUrl) {
  const set = new Set();
  const push = (s) => {
    if (!s) return;
    try {
      set.add(new URL(s, pageUrl).href);
    } catch {
      /* skip */
    }
  };
  $("video[src]").each((_, el) => push($(el).attr("src")));
  $("video source[src]").each((_, el) => push($(el).attr("src")));
  $("iframe[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    if (/youtube\.com\/embed\/|player\.vimeo\.com\/video\//i.test(src)) push(src);
  });
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (/\.(mp4|webm|mov)(\?|#|$)/i.test(href)) push(href);
  });
  return [...set];
}

function extractAudioUrls($, pageUrl) {
  const set = new Set();
  const push = (s) => {
    if (!s) return;
    try {
      set.add(new URL(s, pageUrl).href);
    } catch {
      /* skip */
    }
  };
  $("audio[src]").each((_, el) => push($(el).attr("src")));
  $("audio source[src]").each((_, el) => push($(el).attr("src")));
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (/\.(mp3|m4a|aac|wav|ogg)(\?|#|$)/i.test(href)) push(href);
  });
  return [...set];
}

function detectDocumentType(url) {
  const u = String(url || "").toLowerCase();
  const m = u.match(/\.(pdf|docx|doc|xlsx|xls|csv|pptx|ppt)(\?|#|$)/i);
  return m ? m[1].toLowerCase() : "";
}

function extractDocumentLinks($, pageUrl) {
  const map = new Map(); // url -> {url,type,text}
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let abs;
    try {
      abs = new URL(href, pageUrl).href;
    } catch {
      return;
    }
    const typ = detectDocumentType(abs);
    if (!typ) return;
    const text = ($(el).text() || "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!map.has(abs)) map.set(abs, { url: abs, type: typ, text });
  });
  return [...map.values()];
}

function extractRegexMatches(text, regex, limit = 2000) {
  if (!text) return [];
  const set = new Set();
  let m;
  while ((m = regex.exec(text)) && set.size < limit) {
    const v = (m[0] || "").trim();
    if (v) set.add(v);
  }
  return [...set];
}

function extractFromHtml(html, pageUrl, extract, features = {}) {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const out = {};

  const bodyTextForRegex = $("body").text().replace(/\s+/g, " ").trim();

  if (extract.includes("text")) {
    out.text = bodyTextForRegex.slice(0, 500_000);
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

  if (features.backgroundImages) {
    out.backgroundImages = extractBackgroundImages($, pageUrl);
  }
  if (features.videos) {
    out.videos = extractVideoUrls($, pageUrl);
  }
  if (features.audio) {
    out.audio = extractAudioUrls($, pageUrl);
  }
  if (features.emails) {
    out.emails = extractRegexMatches(
      bodyTextForRegex,
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
      2000
    );
  }
  if (features.phones) {
    out.phones = extractRegexMatches(
      bodyTextForRegex,
      /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3}[\s-]?\d{3,4}/g,
      2000
    );
  }
  if (features.prices) {
    out.prices = extractRegexMatches(
      bodyTextForRegex,
      /(?:\$|€|£|৳|₹|¥)\s?\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?\s?(?:USD|EUR|GBP|BDT|INR)/gi,
      2000
    );
  }

  if (features.documents) {
    out.documents = extractDocumentLinks($, pageUrl);
  }

  return out;
}

function sanitizeUrlForQueue(abs, opts = {}) {
  const u = new URL(abs);
  u.hash = "";
  if (!opts.allowQueryParams) u.search = "";
  return u.href;
}

function discoverInternalLinks(html, pageUrl, opts = {}) {
  const $ = cheerio.load(html);
  const set = new Set();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:"))
      return;
    try {
      const abs = new URL(href, pageUrl).href;
      if (!abs.startsWith("http")) return;
      if (!isInternalLink(pageUrl, abs, opts)) return;
      if (!isSafeHttpUrl(abs)) return;
      const cleaned = sanitizeUrlForQueue(abs, opts);
      if (opts.includeUrlContains && !cleaned.includes(opts.includeUrlContains)) return;
      if (opts.excludeUrlContains && cleaned.includes(opts.excludeUrlContains)) return;
      set.add(cleaned);
    } catch {
      /* skip */
    }
  });
  return [...set];
}

/**
 * @param {{ url: string, depth: number, extract: string[], options?: any, features?: any }} opts
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
  const options = opts.options || {};
  const features = opts.features || {};
  const maxPages = Math.min(50, Math.max(1, Number(options.maxPages || MAX_CRAWL_PAGES)));
  const crawlDelayMs = Math.min(5000, Math.max(0, Number(options.crawlDelayMs || 0)));
  const retries = Math.min(3, Math.max(0, Number(options.retries || 0)));

  const visited = new Set();
  const queue = [{ url: start, level: 0 }];
  visited.add(start);

  const pages = [];

  while (queue.length && pages.length < maxPages) {
    const { url, level } = queue.shift();

    let html;
    let finalUrl;
    try {
      if (!isSafeHttpUrl(url)) continue;
      let lastErr;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const r = await fetchHtml(url, {
            timeoutMs: options.timeoutMs,
            userAgent: options.userAgent
          });
          html = r.html;
          finalUrl = r.finalUrl;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          if (attempt < retries) await sleep(250);
        }
      }
      if (lastErr) throw lastErr;
    } catch (e) {
      pages.push({
        url,
        level,
        error: e.message || "Fetch failed"
      });
      continue;
    }

    if (crawlDelayMs) await sleep(crawlDelayMs);

    let data;
    try {
      data = extractFromHtml(html, finalUrl, extract, features);
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
        next = discoverInternalLinks(html, finalUrl, options);
      } catch {
        next = [];
      }
      for (const link of next) {
        if (pages.length + queue.length >= maxPages * 2) break;
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
    options: {
      maxPages,
      includeSubdomains: Boolean(options.includeSubdomains),
      allowQueryParams: Boolean(options.allowQueryParams),
      includeUrlContains: options.includeUrlContains || "",
      excludeUrlContains: options.excludeUrlContains || "",
      crawlDelayMs,
      timeoutMs: Number(options.timeoutMs || 25000),
      retries,
      userAgent: options.userAgent || USER_AGENT
    },
    features: {
      emails: Boolean(features.emails),
      phones: Boolean(features.phones),
      prices: Boolean(features.prices),
      videos: Boolean(features.videos),
      audio: Boolean(features.audio),
      backgroundImages: Boolean(features.backgroundImages),
      documents: Boolean(features.documents)
    },
    pageCount: pages.filter((p) => !p.error).length,
    pages
  };
}

module.exports = {
  runScrape,
  normalizeStartUrl,
  isSafeHttpUrl
};
