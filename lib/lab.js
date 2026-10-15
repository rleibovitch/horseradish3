import { createHmac, createSign, timingSafeEqual } from "node:crypto";

const COOKIE = "hr_lab";
const MAX_AGE = 60 * 60 * 24 * 7;
const BODIES = ["square", "circle", "triangle", "humanoid"];
const TRIGGERS = ["always", "phrase", "page"];
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
let firestoreToken = { access: "", exp: 0 };

export function clientId() {
    return String(process.env.GOOGLE_CLIENT_ID || "").trim();
}

export function sessionSecret() {
    return String(process.env.SESSION_SECRET || "").trim();
}

export function firebasePublic() {
    const apiKey = String(process.env.FIREBASE_API_KEY || "").trim();
    if (!apiKey) {
        return null;
    }
    const config = {
        apiKey: apiKey,
        authDomain: String(process.env.FIREBASE_AUTH_DOMAIN || "horseradish-hosts-993ea.firebaseapp.com").trim(),
        projectId: String(process.env.FIRESTORE_PROJECT_ID || "horseradish-hosts-993ea").trim()
    };
    const appId = String(process.env.FIREBASE_APP_ID || "").trim();
    if (appId) {
        config.appId = appId;
    }
    return config;
}

export function hasShelf() {
    return Boolean(firestoreCreds() || firebasePublic());
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

function firestoreCreds() {
    const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIRESTORE_SERVICE_ACCOUNT || "").trim();
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            const privateKey = String(parsed.private_key || "").replace(/\\n/g, "\n");
            const clientEmail = String(parsed.client_email || "");
            const projectId = String(parsed.project_id || process.env.FIRESTORE_PROJECT_ID || "horseradish-hosts-993ea");
            if (privateKey && clientEmail && projectId) {
                return { projectId: projectId, clientEmail: clientEmail, privateKey: privateKey };
            }
        } catch (err) {
            return null;
        }
    }
    const clientEmail = String(process.env.FIRESTORE_CLIENT_EMAIL || "").trim();
    const privateKey = String(process.env.FIRESTORE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
    const projectId = String(process.env.FIRESTORE_PROJECT_ID || "horseradish-hosts-993ea").trim();
    if (clientEmail && privateKey && projectId) {
        return { projectId: projectId, clientEmail: clientEmail, privateKey: privateKey };
    }
    return null;
}

function shelfPath(sub) {
    return String(sub || "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64);
}

function firestoreDocUrl(sub) {
    const creds = firestoreCreds();
    const safe = shelfPath(sub);
    return "https://firestore.googleapis.com/v1/projects/" + creds.projectId + "/databases/(default)/documents/lab/" + encodeURIComponent(safe);
}

async function firestoreAccessToken() {
    const creds = firestoreCreds();
    if (!creds) {
        throw new Error("shelf");
    }
    if (firestoreToken.access && Date.now() < firestoreToken.exp) {
        return firestoreToken.access;
    }
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const claim = Buffer.from(JSON.stringify({
        iss: creds.clientEmail,
        sub: creds.clientEmail,
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
        scope: FIRESTORE_SCOPE
    })).toString("base64url");
    const signer = createSign("RSA-SHA256");
    signer.update(header + "." + claim);
    const assertion = header + "." + claim + "." + signer.sign(creds.privateKey, "base64url");
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + encodeURIComponent(assertion)
    });
    if (!res.ok) {
        throw new Error("shelf");
    }
    const payload = await res.json();
    firestoreToken = {
        access: payload.access_token,
        exp: Date.now() + Math.max(30, Number(payload.expires_in || 3600) - 120) * 1000
    };
    return firestoreToken.access;
}

async function firestoreGet(sub) {
    const token = await firestoreAccessToken();
    const res = await fetch(firestoreDocUrl(sub), {
        headers: { authorization: "Bearer " + token }
    });
    if (res.status === 404) {
        return { hosts: [] };
    }
    if (!res.ok) {
        throw new Error("shelf");
    }
    const doc = await res.json();
    const raw = doc && doc.fields && doc.fields.hosts && doc.fields.hosts.stringValue;
    if (!raw) {
        return { hosts: [] };
    }
    try {
        const data = JSON.parse(raw);
        return data && Array.isArray(data.hosts) ? data : { hosts: [] };
    } catch (err) {
        return { hosts: [] };
    }
}

async function firestorePut(sub, data) {
    const token = await firestoreAccessToken();
    const res = await fetch(firestoreDocUrl(sub) + "?updateMask.fieldPaths=hosts", {
        method: "PATCH",
        headers: {
            authorization: "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            fields: {
                hosts: { stringValue: JSON.stringify(data) }
            }
        })
    });
    if (!res.ok) {
        throw new Error("shelf-put");
    }
}

export function cleanHost(input) {
    const host = input && typeof input === "object" ? input : {};
    const rawBody = host.body === "whatever" ? "humanoid" : host.body;
    const body = BODIES.indexOf(rawBody) >= 0 ? rawBody : "square";
    const trigger = TRIGGERS.indexOf(host.trigger) >= 0 ? host.trigger : "always";
    const portrait = String(host.portrait || "");
    let share = String(host.share || "HOST-UNNAMED").replace(/[^A-Za-z0-9-]/g, "").toUpperCase().replace(/^HR-/, "HOST-").slice(0, 28);
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
        share: share || "HOST-UNNAMED",
        savedAt: new Date().toISOString()
    };
}

export async function loadShelf(sub) {
    if (!firestoreCreds()) {
        const err = new Error("shelf");
        err.code = "shelf";
        throw err;
    }
    const data = await firestoreGet(sub);
    return Array.isArray(data.hosts) ? data.hosts : [];
}

export async function writeShelf(sub, hosts) {
    await firestorePut(sub, { hosts: hosts.slice(0, 24) });
}
