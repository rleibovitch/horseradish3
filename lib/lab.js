import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "hr_lab";
const MAX_AGE = 60 * 60 * 24 * 7;
const BLOB_API = "https://blob.vercel-storage.com";
const BODIES = ["square", "circle", "triangle", "whatever"];
const TRIGGERS = ["always", "phrase", "page"];

export function clientId() {
    return String(process.env.GOOGLE_CLIENT_ID || "").trim();
}

export function sessionSecret() {
    return String(process.env.SESSION_SECRET || "").trim();
}

export function hasShelf() {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function json(body, status, extraHeaders) {
    const headers = new Headers(extraHeaders || {});
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Cache-Control", "no-store");
    return new Response(JSON.stringify(body), { status: status || 200, headers });
}

export function cookieHeader(value, maxAge) {
    const secure = process.env.VERCEL === "1" ? "; Secure" : "";
    return COOKIE + "=" + encodeURIComponent(value) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + maxAge + secure;
}

function readCookie(request) {
    const raw = request.headers.get("cookie") || "";
    const parts = raw.split(";");
    for (let i = 0; i < parts.length; i += 1) {
        const trimmed = parts[i].trim();
        if (trimmed.startsWith(COOKIE + "=")) {
            return decodeURIComponent(trimmed.slice(COOKIE.length + 1));
        }
    }
    return "";
}

function sign(obj, secret) {
    const body = Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
    const sig = createHmac("sha256", secret).update(body).digest("base64url");
    return body + "." + sig;
}

function unsign(token, secret) {
    const parts = String(token || "").split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return null;
    }
    const expected = createHmac("sha256", secret).update(parts[0]).digest("base64url");
    const left = Buffer.from(expected);
    const right = Buffer.from(parts[1]);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
        return null;
    }
    try {
        return JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    } catch (err) {
        return null;
    }
}

export function readUser(request) {
    const secret = sessionSecret();
    if (!secret) {
        return null;
    }
    const payload = unsign(readCookie(request), secret);
    if (!payload || !payload.sub) {
        return null;
    }
    if (payload.exp && Date.now() > payload.exp) {
        return null;
    }
    return {
        sub: payload.sub,
        email: payload.email || "",
        name: payload.name || payload.email || "",
        picture: payload.picture || ""
    };
}

export function sessionCookie(user) {
    const secret = sessionSecret();
    const payload = {
        sub: user.sub,
        email: user.email,
        name: user.name,
        picture: user.picture || "",
        exp: Date.now() + MAX_AGE * 1000
    };
    return cookieHeader(sign(payload, secret), MAX_AGE);
}

export function clearCookie() {
    return cookieHeader("", 0);
}

export async function verifyGoogle(credential) {
    const aud = clientId();
    if (!aud || !credential) {
        return null;
    }
    const res = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
    if (!res.ok) {
        return null;
    }
    const tok = await res.json();
    if (tok.aud !== aud) {
        return null;
    }
    if (tok.email_verified !== "true" && tok.email_verified !== true) {
        return null;
    }
    if (tok.iss !== "https://accounts.google.com" && tok.iss !== "accounts.google.com") {
        return null;
    }
    if (Number(tok.exp) * 1000 < Date.now() - 30000) {
        return null;
    }
    return {
        sub: String(tok.sub || ""),
        email: String(tok.email || ""),
        name: String(tok.name || tok.email || "operator"),
        picture: String(tok.picture || "")
    };
}

function blobToken() {
    return String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
}

function shelfPath(sub) {
    const safe = String(sub || "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64);
    return "lab/" + safe + "/shelf.json";
}

async function blobPut(pathname, data) {
    const token = blobToken();
    if (!token) {
        throw new Error("shelf");
    }
    const url = BLOB_API + "?pathname=" + encodeURIComponent(pathname) + "&addRandomSuffix=0&allowOverwrite=1";
    const res = await fetch(url, {
        method: "PUT",
        headers: {
            authorization: "Bearer " + token,
            "x-api-version": "7"
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        throw new Error("shelf-put");
    }
    return res.json();
}

async function blobGetJson(pathname) {
    const token = blobToken();
    if (!token) {
        return null;
    }
    const listed = await fetch(BLOB_API + "?prefix=" + encodeURIComponent(pathname), {
        headers: {
            authorization: "Bearer " + token,
            "x-api-version": "7"
        }
    });
    if (!listed.ok) {
        return null;
    }
    const payload = await listed.json();
    const blobs = payload.blobs || [];
    const blob = blobs.find(function (item) {
        return item.pathname === pathname || (item.pathname && item.pathname.indexOf(pathname) === 0);
    });
    if (!blob || !blob.url) {
        return { hosts: [] };
    }
    const file = await fetch(blob.url, {
        headers: { authorization: "Bearer " + token }
    });
    if (file.status === 404) {
        return { hosts: [] };
    }
    if (!file.ok) {
        return null;
    }
    try {
        const data = await file.json();
        return data && Array.isArray(data.hosts) ? data : { hosts: [] };
    } catch (err) {
        return { hosts: [] };
    }
}

export function cleanHost(input) {
    const host = input && typeof input === "object" ? input : {};
    const body = BODIES.indexOf(host.body) >= 0 ? host.body : "square";
    const trigger = TRIGGERS.indexOf(host.trigger) >= 0 ? host.trigger : "always";
    const portrait = String(host.portrait || "");
    const share = String(host.share || "HR-HOST").replace(/[^A-Za-z0-9-]/g, "").toUpperCase().slice(0, 24);
    return {
        name: String(host.name || "Unnamed Host").slice(0, 40),
        body: body,
        prompt: String(host.prompt || "").slice(0, 500),
        specialty: String(host.specialty || "").slice(0, 240),
        site: String(host.site || "").slice(0, 240),
        fileName: String(host.fileName || "").slice(0, 80),
        fileText: String(host.fileText || "").slice(0, 4000),
        trigger: trigger,
        phrase: String(host.phrase || "").slice(0, 120),
        page: String(host.page || "").slice(0, 120),
        portrait: portrait.length > 80000 ? "" : portrait,
        share: share || "HR-HOST",
        savedAt: new Date().toISOString()
    };
}

export async function loadShelf(sub) {
    if (!blobToken()) {
        const err = new Error("shelf");
        err.code = "shelf";
        throw err;
    }
    const data = await blobGetJson(shelfPath(sub));
    if (!data) {
        const err = new Error("shelf");
        err.code = "shelf";
        throw err;
    }
    return Array.isArray(data.hosts) ? data.hosts : [];
}

export async function writeShelf(sub, hosts) {
    await blobPut(shelfPath(sub), { hosts: hosts.slice(0, 24) });
}
