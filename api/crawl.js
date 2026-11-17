import { json } from "../lib/lab.js";

const MAX_BYTES = 400000;
const MAX_TEXT = 8000;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

function badHost(hostname) {
    const host = String(hostname || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
    if (!host) {
        return true;
    }
    if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host === "0:0:0:0:0:0:0:1") {
        return true;
    }
    if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
        return true;
    }
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
        const a = Number(ipv4[1]);
        const b = Number(ipv4[2]);
        if (a === 10 || a === 127 || a === 0) {
            return true;
        }
        if (a === 169 && b === 254) {
            return true;
        }
        if (a === 172 && b >= 16 && b <= 31) {
            return true;
        }
        if (a === 192 && b === 168) {
            return true;
        }
    }
    return false;
}

function safeUrl(raw) {
    let parsed;
    try {
        parsed = new URL(String(raw || "").trim());
    } catch (err) {
        return null;
    }
    if (parsed.protocol !== "https:") {
        return null;
    }
    if (parsed.username || parsed.password) {
        return null;
    }
    if (badHost(parsed.hostname)) {
        return null;
    }
    return parsed;
}

function decodeEntities(text) {
    return String(text || "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, "\"")
        .replace(/&#39;/gi, "'");
}

function attr(tag, name) {
    const match = String(tag || "").match(new RegExp(name + "=[\"']([^\"']+)[\"']", "i"));
    return match ? match[1] : "";
}

function metaContent(html, key) {
    const tags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
    const needle = String(key || "").toLowerCase();
    for (let i = 0; i < tags.length; i += 1) {
        const tag = tags[i];
        const name = (attr(tag, "name") || attr(tag, "property") || "").toLowerCase();
        if (name === needle) {
            return decodeEntities(attr(tag, "content")).trim();
        }
    }
    return "";
}

function extract(html, href) {
    const titleMatch = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = decodeEntities((titleMatch ? titleMatch[1] : "").replace(/\s+/g, " ")).trim();
    const ogTitle = metaContent(html, "og:title");
    const description = metaContent(html, "description") || metaContent(html, "og:description");
    let body = String(html || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
        .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ");
    body = decodeEntities(body).trim();
    const parts = [];
    if (ogTitle || title) {
        parts.push(ogTitle || title);
    }
    if (description) {
        parts.push(description);
    }
    if (body) {
        parts.push(body);
    }
    const text = parts.join("\n\n").slice(0, MAX_TEXT);
    let host = "";
    try {
        host = new URL(href).hostname;
    } catch (err) {
        host = "";
    }
    return {
        url: href,
        host: host,
        title: (ogTitle || title || host || "Site").slice(0, 120),
        description: description.slice(0, 240),
        text: text,
        chars: text.length
    };
}

async function pull(href, hops) {
    const parsed = safeUrl(href);
    if (!parsed) {
        return { ok: false, status: 400, message: "Give it a public https website." };
    }
    const controller = new AbortController();
    const timer = setTimeout(function () {
        controller.abort();
    }, TIMEOUT_MS);
    let res;
    try {
        res = await fetch(parsed.href, {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: {
                "User-Agent": "HorseradishHost/1.0 (+https://horseradish.ai)",
                "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1"
            }
        });
    } catch (err) {
        return { ok: false, status: 502, message: "The site did not open." };
    } finally {
        clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next || hops >= MAX_REDIRECTS) {
            return { ok: false, status: 502, message: "The site did not open." };
        }
        try {
            return pull(new URL(next, parsed.href).href, hops + 1);
        } catch (err) {
            return { ok: false, status: 502, message: "The site did not open." };
        }
    }
    if (!res.ok) {
        return { ok: false, status: 502, message: "The site did not open." };
    }
    const type = String(res.headers.get("content-type") || "").toLowerCase();
    if (type && type.indexOf("html") < 0 && type.indexOf("text") < 0 && type.indexOf("xml") < 0) {
        return { ok: false, status: 415, message: "That address is not a page." };
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
        return { ok: false, status: 413, message: "That page is too large to chew." };
    }
    const html = new TextDecoder("utf-8").decode(buf);
    const page = extract(html, parsed.href);
    if (!page.text) {
        return { ok: false, status: 422, message: "No knowledge came off that page." };
    }
    page.at = new Date().toISOString();
    page.ok = true;
    return page;
}

export default {
    async fetch(request) {
        if (request.method.toUpperCase() !== "POST") {
            return json({ message: "Nope." }, 405);
        }
        let body = {};
        try {
            body = await request.json();
        } catch (err) {
            body = {};
        }
        const result = await pull(body.url, 0);
        if (!result.ok) {
            return json({ message: result.message }, result.status || 400);
        }
        return json(result);
    }
};
