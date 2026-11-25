import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { accountKey, firestoreAccessToken, firestoreProject, sessionSecret } from "./lab.js";

const RESERVED = new Set(["api", "h", "lib", "talk", "lab", "operator", "index", "hosts", "assets", "public", "admin", "www", "qr"]);
const RATES = {
    "gpt-4o-mini": [0.15, 0.6],
    "gpt-4o": [2.5, 10],
    "gpt-4.1-mini": [0.4, 1.6],
    "gpt-4.1": [2, 8]
};
const buckets = new Map();

export function publicSlug(value) {
    const slug = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
    if (slug.length < 2 || RESERVED.has(slug)) {
        return "";
    }
    return slug;
}

export function safeColor(value) {
    return /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? String(value) : "#0092a2";
}

export function safeLogo(value) {
    const logo = String(value || "");
    if (logo.length > 70000) {
        return "";
    }
    return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(logo) ? logo : "";
}

export function safeEndpoint(value) {
    let url;
    try {
        url = new URL(String(value || "").trim());
    } catch (err) {
        return "";
    }
    if (url.protocol !== "https:") {
        return "";
    }
    if (url.username || url.password) {
        return "";
    }
    if (url.port && url.port !== "443") {
        return "";
    }
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!host || host.length > 253) {
        return "";
    }
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
        return "";
    }
    if (host === "metadata.google.internal" || host === "metadata.goog") {
        return "";
    }
    if (host.includes(":") || host.includes("%") || /^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
        return "";
    }
    if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith("-") || host.endsWith("-") || host.includes("..")) {
        return "";
    }
    url.hash = "";
    url.username = "";
    url.password = "";
    return url.toString();
}

export function providerLabel(provider) {
    return provider === "custom" ? "Custom agent" : "OpenAI";
}

export function replyText(data) {
    const body = data && typeof data === "object" ? data : {};
    if (typeof body.output_text === "string" && body.output_text.trim()) {
        return cleanReply(body.output_text);
    }
    const chunks = [];
    const output = Array.isArray(body.output) ? body.output : [];
    output.forEach(function (item) {
        const row = item && typeof item === "object" ? item : {};
        const content = Array.isArray(row.content) ? row.content : [];
        content.forEach(function (part) {
            const bit = part && typeof part === "object" ? part : {};
            if (typeof bit.text === "string") {
                chunks.push(bit.text);
            }
        });
    });
    if (chunks.length) {
        return cleanReply(chunks.join(""));
    }
    const choice = body.choices && body.choices[0] && body.choices[0].message;
    if (choice && typeof choice.content === "string") {
        return cleanReply(choice.content);
    }
    if (typeof body.reply === "string") {
        return cleanReply(body.reply);
    }
    if (typeof body.text === "string") {
        return cleanReply(body.text);
    }
    if (typeof body.answer === "string") {
        return cleanReply(body.answer);
    }
    if (typeof body.message === "string") {
        return cleanReply(body.message);
    }
    return "";
}

function cleanReply(text) {
    return String(text || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, 1500);
}

export function tidyQuestion(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "")
        .replace(/\+?\d[\d\s().-]{7,}\d/g, "")
        .replace(/[^a-z0-9 ?]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
}

export function libraryText(pieces) {
    if (!Array.isArray(pieces)) {
        return "";
    }
    return pieces.slice(0, 8).map(function (piece) {
        const item = piece && typeof piece === "object" ? piece : {};
        const title = String(item.title || "").trim().slice(0, 80);
        const text = String(item.text || "").trim().slice(0, 2000);
        if (title && text) {
            return title + "\n" + text;
        }
        return text || title;
    }).filter(Boolean).join("\n\n").slice(0, 6000);
}

export function seal(plain) {
    const secret = sessionSecret();
    if (!secret) {
        const err = new Error("session");
        err.code = "session";
        throw err;
    }
    const key = createHash("sha256").update("horseradish-host-key:" + secret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, body]).toString("base64url");
}

export function unseal(packed) {
    const secret = sessionSecret();
    if (!secret || !packed) {
        return "";
    }
    let buf;
    try {
        buf = Buffer.from(String(packed), "base64url");
    } catch (err) {
        return "";
    }
    if (buf.length < 29) {
        return "";
    }
    const key = createHash("sha256").update("horseradish-host-key:" + secret).digest();
    const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    try {
        return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
    } catch (err) {
        return "";
    }
}

function encode(map) {
    const fields = {};
    Object.keys(map).forEach(function (key) {
        const value = map[key];
        if (value == null) {
            return;
        }
        if (typeof value === "boolean") {
            fields[key] = { booleanValue: value };
            return;
        }
        if (typeof value === "number" && Number.isFinite(value)) {
            fields[key] = { integerValue: String(Math.round(value)) };
            return;
        }
        fields[key] = { stringValue: String(value) };
    });
    return { fields };
}

function decode(doc) {
    const fields = (doc && doc.fields) || {};
    const out = {};
    Object.keys(fields).forEach(function (name) {
        const cell = fields[name] || {};
        if (Object.prototype.hasOwnProperty.call(cell, "stringValue")) {
            out[name] = cell.stringValue;
        } else if (Object.prototype.hasOwnProperty.call(cell, "booleanValue")) {
            out[name] = Boolean(cell.booleanValue);
        } else if (Object.prototype.hasOwnProperty.call(cell, "integerValue")) {
            out[name] = Number(cell.integerValue);
        } else if (Object.prototype.hasOwnProperty.call(cell, "doubleValue")) {
            out[name] = Number(cell.doubleValue);
        }
    });
    return out;
}

function project() {
    const id = firestoreProject();
    if (!id) {
        const err = new Error("shelf");
        err.code = "shelf";
        throw err;
    }
    return id;
}

async function authed(path, init) {
    const token = await firestoreAccessToken();
    const headers = Object.assign({ authorization: "Bearer " + token }, (init && init.headers) || {});
    return fetch("https://firestore.googleapis.com/v1/projects/" + project() + "/databases/(default)/documents" + path, Object.assign({}, init, { headers }));
}

async function getDoc(collection, id) {
    const res = await authed("/" + collection + "/" + encodeURIComponent(id), { method: "GET" });
    if (res.status === 404) {
        return null;
    }
    if (!res.ok) {
        const err = new Error("shelf");
        err.code = "shelf";
        throw err;
    }
    return decode(await res.json());
}

async function putDoc(collection, id, map) {
    const mask = Object.keys(map).map(function (key) {
        return "updateMask.fieldPaths=" + encodeURIComponent(key);
    }).join("&");
    const res = await authed("/" + collection + "/" + encodeURIComponent(id) + "?" + mask, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(encode(map))
    });
    if (!res.ok) {
        const err = new Error("shelf");
        err.code = "shelf";
        throw err;
    }
}

async function deleteDoc(collection, id) {
    const res = await authed("/" + collection + "/" + encodeURIComponent(id), { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
        const err = new Error("shelf");
        err.code = "shelf";
        throw err;
    }
}

function secretId(ownerId, slug) {
    return accountKey(ownerId) + "__" + slug;
}

function blankDoor(ownerId, slug) {
    return {
        ownerId: ownerId,
        slug: slug,
        share: "",
        name: "Host",
        welcome: "",
        may: "",
        mayNot: "",
        color: "#0092a2",
        logo: "",
        provider: "openai",
        model: "gpt-4o-mini",
        library: "",
        line: "",
        enabled: false,
        scans: 0,
        talks: 0,
        sessions: 0,
        textTurns: 0,
        voiceTurns: 0,
        durationMs: 0,
        calls: 0,
        errors: 0,
        conversions: 0,
        microUsd: 0,
        hourKey: 0,
        hourHits: 0,
        faq: "[]",
        seen: "[]",
        scanned: "[]"
    };
}

function listField(raw) {
    try {
        const parsed = JSON.parse(String(raw || "[]"));
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        return [];
    }
}

export function publicCard(door) {
    if (!door) {
        return null;
    }
    return {
        name: String(door.name || "Host").slice(0, 40),
        welcome: String(door.welcome || "").slice(0, 280),
        color: safeColor(door.color),
        logo: safeLogo(door.logo),
        enabled: door.enabled === true,
        provider: providerLabel(door.provider)
    };
}

export function ownerView(door, secret) {
    const faq = listField(door && door.faq).filter(function (item) {
        return item && item.q && item.n;
    }).slice(0, 8);
    return {
        ok: true,
        connected: Boolean(secret && (secret.sealedKey || secret.endpoint)),
        keySet: Boolean(secret && secret.sealedKey),
        twilioSet: Boolean(secret && secret.sealedTwilio),
        line: door ? String(door.line || "") : "",
        enabled: Boolean(door && door.enabled === true),
        published: Boolean(door && door.slug),
        slug: door ? String(door.slug || "") : "",
        share: door ? String(door.share || "") : "",
        provider: secret && secret.provider === "custom" ? "custom" : (door && door.provider === "custom" ? "custom" : "openai"),
        model: (secret && secret.model) || (door && door.model) || "gpt-4o-mini",
        endpoint: secret ? String(secret.endpoint || "") : "",
        name: door ? String(door.name || "") : "",
        welcome: door ? String(door.welcome || "") : "",
        may: door ? String(door.may || "") : "",
        mayNot: door ? String(door.mayNot || "") : "",
        color: door ? safeColor(door.color) : "#0092a2",
        logo: door ? safeLogo(door.logo) : "",
        scans: Number(door && door.scans || 0),
        talks: Number(door && door.talks || 0),
        sessions: Number(door && door.sessions || 0),
        textTurns: Number(door && door.textTurns || 0),
        voiceTurns: Number(door && door.voiceTurns || 0),
        durationMs: Number(door && door.durationMs || 0),
        calls: Number(door && door.calls || 0),
        conversions: Number(door && door.conversions || 0),
        microUsd: Number(door && door.microUsd || 0),
        faq: faq
    };
}

async function doorsFor(ownerId) {
    const token = await firestoreAccessToken();
    const res = await fetch("https://firestore.googleapis.com/v1/projects/" + project() + "/databases/(default)/documents:runQuery", {
        method: "POST",
        headers: {
            authorization: "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId: "hostDoors" }],
                where: {
                    fieldFilter: {
                        field: { fieldPath: "ownerId" },
                        op: "EQUAL",
                        value: { stringValue: String(ownerId) }
                    }
                },
                limit: 24
            }
        })
    });
    if (!res.ok) {
        return [];
    }
    const rows = await res.json();
    if (!Array.isArray(rows)) {
        return [];
    }
    return rows.map(function (row) {
        return row && row.document ? decode(row.document) : null;
    }).filter(Boolean);
}

async function loadOwned(ownerId, slug, share) {
    const clean = publicSlug(slug);
    if (clean) {
        const door = await getDoc("hostDoors", clean);
        if (door && door.ownerId === ownerId) {
            const secret = await getDoc("hostSecrets", secretId(ownerId, clean));
            return { door: door, secret: secret, slug: clean };
        }
        if (door && door.ownerId && door.ownerId !== ownerId) {
            return { taken: true, slug: clean };
        }
    }
    if (share) {
        const doors = await doorsFor(ownerId);
        const found = doors.find(function (door) {
            return String(door.share || "") === String(share);
        });
        if (found && found.slug) {
            const secret = await getDoc("hostSecrets", secretId(ownerId, found.slug));
            return { door: found, secret: secret, slug: found.slug };
        }
    }
    return { door: null, secret: null, slug: clean };
}

function clip(value, max) {
    return String(value || "").trim().slice(0, max);
}

function modelName(value) {
    const model = clip(value, 40);
    return /^gpt-[A-Za-z0-9._-]{1,32}$/.test(model) ? model : "gpt-4o-mini";
}

function historyOf(input) {
    if (!Array.isArray(input)) {
        return [];
    }
    return input.slice(-8).map(function (item) {
        const row = item && typeof item === "object" ? item : {};
        const content = clip(row.content || row.text, 800);
        if (!content) {
            return null;
        }
        return {
            role: row.role === "assistant" ? "assistant" : "user",
            content: content
        };
    }).filter(Boolean);
}

function instructions(door) {
    return [
        "You are the public Host for " + (door.name || "this business") + ".",
        "You speak for this business on their public door.",
        door.welcome ? "Opening intent: " + door.welcome : "",
        "You may: " + (door.may || "Answer questions about this business."),
        "You may not: " + (door.mayNot || "Touch private accounts, email, or payments."),
        "You have no tools on this door. You cannot charge a card, send email, or change an order.",
        "If the visitor wants a transaction, tell them the owner confirms it.",
        "Keep the reply short enough to say aloud.",
        door.library ? "Approved knowledge:\n" + door.library : "When the approved knowledge does not cover the question, say so."
    ].filter(Boolean).join("\n\n");
}

function microUsd(model, inputTokens, outputTokens) {
    const rate = RATES[model] || RATES["gpt-4o-mini"];
    return Math.round((Number(inputTokens) || 0) * rate[0] + (Number(outputTokens) || 0) * rate[1]);
}

function usageOf(data) {
    const usage = data && data.usage ? data.usage : {};
    return {
        input: Number(usage.input_tokens || usage.prompt_tokens || 0),
        output: Number(usage.output_tokens || usage.completion_tokens || 0)
    };
}

async function readJson(res) {
    const text = await res.text();
    if (!text) {
        return {};
    }
    try {
        return JSON.parse(text);
    } catch (err) {
        return { text: text.slice(0, 1500) };
    }
}

export async function completeTurn(secret, door, message, history, fetchImpl, requestHost) {
    const call = fetchImpl || fetch;
    const prior = historyOf(history);
    if (secret.provider === "custom") {
        return completeCustom(secret, door, message, prior, call, requestHost);
    }
    return completeOpenAI(secret, door, message, prior, call);
}

async function completeOpenAI(secret, door, message, history, call) {
    const apiKey = unseal(secret.sealedKey);
    if (!apiKey) {
        return { ok: false, status: 401, message: "Add the API key, then test the connection." };
    }
    const model = modelName(secret.model || door.model);
    const input = history.concat([{ role: "user", content: message }]).map(function (row) {
        return {
            role: row.role,
            content: [{ type: row.role === "assistant" ? "output_text" : "input_text", text: row.content }]
        };
    });
    const payload = {
        model: model,
        instructions: instructions(door),
        input: input,
        max_output_tokens: 500,
        store: false
    };
    let res;
    try {
        res = await call("https://api.openai.com/v1/responses", {
            method: "POST",
            redirect: "manual",
            signal: AbortSignal.timeout(25000),
            headers: {
                authorization: "Bearer " + apiKey,
                "content-type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        if (res.status === 400) {
            await res.arrayBuffer().catch(function () {});
            res = await call("https://api.openai.com/v1/responses", {
                method: "POST",
                redirect: "manual",
                signal: AbortSignal.timeout(25000),
                headers: {
                    authorization: "Bearer " + apiKey,
                    "content-type": "application/json"
                },
                body: JSON.stringify({
                    model: model,
                    instructions: payload.instructions,
                    input: history.concat([{ role: "user", content: message }])
                })
            });
        }
    } catch (err) {
        return { ok: false, status: 502, message: "The agent could not be reached." };
    }
    if (res.status >= 300 && res.status < 400) {
        return { ok: false, status: 502, message: "The agent could not be reached." };
    }
    const data = await readJson(res);
    if (!res.ok) {
        return { ok: false, status: res.status, message: ownerError(res.status) };
    }
    const text = replyText(data);
    if (!text) {
        return { ok: false, status: 502, message: "The agent returned an empty answer." };
    }
    if (text.includes(apiKey)) {
        return { ok: false, status: 502, message: "The agent echoed the key. The reply was dropped." };
    }
    const usage = usageOf(data);
    return {
        ok: true,
        text: text,
        model: model,
        inputTokens: usage.input,
        outputTokens: usage.output,
        microUsd: microUsd(model, usage.input, usage.output),
        conversion: false
    };
}

function sameHost(endpoint, requestHost) {
    if (!requestHost) {
        return false;
    }
    try {
        return new URL(endpoint).hostname.toLowerCase() === String(requestHost).split(":")[0].toLowerCase();
    } catch (err) {
        return false;
    }
}

async function completeCustom(secret, door, message, history, call, requestHost) {
    const prior = historyOf(history);
    const endpoint = safeEndpoint(secret.endpoint);
    if (!endpoint) {
        return { ok: false, status: 400, message: "That endpoint has to be a public https address." };
    }
    if (sameHost(endpoint, requestHost)) {
        return { ok: false, status: 400, message: "Point the endpoint at your agent, not back at this door." };
    }
    const apiKey = secret.sealedKey ? unseal(secret.sealedKey) : "";
    const headers = { "content-type": "application/json", accept: "application/json, text/plain" };
    if (apiKey) {
        headers.authorization = "Bearer " + apiKey;
    }
    let res;
    try {
        res = await call(endpoint, {
            method: "POST",
            redirect: "manual",
            signal: AbortSignal.timeout(20000),
            headers: headers,
            body: JSON.stringify({
                message: message,
                history: prior,
                host: door.name || "Host",
                session: String(door.session || "").slice(0, 64)
            })
        });
    } catch (err) {
        return { ok: false, status: 502, message: "The endpoint could not be reached." };
    }
    if (res.status >= 300 && res.status < 400) {
        return { ok: false, status: 400, message: "The endpoint redirected. Use its final https address." };
    }
    const type = String(res.headers.get("content-type") || "");
    if (type.includes("text/html")) {
        return { ok: false, status: 502, message: "The endpoint returned a page instead of an answer." };
    }
    const data = await readJson(res);
    if (!res.ok) {
        return { ok: false, status: res.status, message: "The endpoint returned " + res.status + "." };
    }
    const text = replyText(data);
    if (!text) {
        return { ok: false, status: 502, message: "The endpoint returned an empty answer." };
    }
    if (apiKey && text.includes(apiKey)) {
        return { ok: false, status: 502, message: "The endpoint echoed the key. The reply was dropped." };
    }
    return {
        ok: true,
        text: text,
        model: "custom",
        inputTokens: 0,
        outputTokens: 0,
        microUsd: 0,
        conversion: data.conversion === true
    };
}

function ownerError(status) {
    if (status === 401 || status === 403) {
        return "The agent refused the key.";
    }
    if (status === 404) {
        return "That model was not found.";
    }
    if (status === 429) {
        return "The agent is busy. Try again in a minute.";
    }
    return "The agent did not answer. Check the connection and test again.";
}

function visitorError(result) {
    if (result.status === 429) {
        return "The agent is busy. Try again in a minute.";
    }
    return "The Host could not answer that.";
}

function allowVisitor(id) {
    const now = Date.now();
    const prev = buckets.get(id) || [];
    const recent = prev.filter(function (stamp) {
        return now - stamp < 3600000;
    });
    const minute = recent.filter(function (stamp) {
        return now - stamp < 60000;
    });
    if (minute.length >= 8 || recent.length >= 40) {
        buckets.set(id, recent);
        return false;
    }
    recent.push(now);
    buckets.set(id, recent);
    if (buckets.size > 5000) {
        buckets.clear();
    }
    return true;
}

function clientKey(request, slug) {
    const fwd = String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    const raw = fwd || String(request.headers.get("x-real-ip") || "visitor");
    return createHash("sha256").update(slug + "|" + raw).digest("base64url").slice(0, 24);
}

function rememberId(list, id) {
    const next = list.filter(function (item) {
        return item !== id;
    });
    next.push(id);
    return next.slice(-200);
}

function bumpFaq(door, message) {
    const question = tidyQuestion(message);
    if (question.length < 12) {
        return;
    }
    const faq = listField(door.faq);
    const found = faq.find(function (item) {
        return item && item.q === question;
    });
    if (found) {
        found.n = Number(found.n || 0) + 1;
    } else {
        faq.push({ q: question, n: 1 });
    }
    faq.sort(function (a, b) {
        return Number(b.n) - Number(a.n);
    });
    door.faq = JSON.stringify(faq.slice(0, 8));
}

async function saveSecret(ownerId, slug, secret) {
    await putDoc("hostSecrets", secretId(ownerId, slug), {
        ownerId: ownerId,
        slug: slug,
        provider: secret.provider === "custom" ? "custom" : "openai",
        model: modelName(secret.model),
        endpoint: secret.endpoint || "",
        sealedKey: secret.sealedKey || "",
        sealedTwilio: secret.sealedTwilio || "",
        updatedAt: new Date().toISOString()
    });
}

function applyPublic(door, input) {
    door.name = clip(input.name, 40) || "Host";
    door.welcome = clip(input.welcome, 280);
    door.may = clip(input.may, 400);
    door.mayNot = clip(input.mayNot, 400);
    door.color = safeColor(input.color);
    door.provider = input.provider === "custom" ? "custom" : "openai";
    door.model = modelName(input.model);
    door.library = libraryText(input.pieces);
    if (input.share) {
        door.share = clip(input.share, 28);
    }
    if (input.logo) {
        const logo = safeLogo(input.logo);
        if (logo) {
            door.logo = logo;
        }
    }
}

async function writeConnection(ownerId, slug, input, existing) {
    const provider = input.provider === "custom" ? "custom" : "openai";
    const endpoint = provider === "custom" ? safeEndpoint(input.endpoint) : "";
    if (provider === "custom" && input.endpoint && !endpoint) {
        return { ok: false, status: 400, message: "That endpoint has to be a public https address." };
    }
    const next = {
        provider: provider,
        model: modelName(input.model || (existing && existing.model)),
        endpoint: endpoint || (existing && existing.endpoint) || "",
        sealedKey: existing && existing.sealedKey || "",
        sealedTwilio: existing && existing.sealedTwilio || ""
    };
    const typed = clip(input.apiKey, 200);
    if (typed) {
        next.sealedKey = seal(typed);
    }
    const twilioToken = clip(input.twilioToken, 200);
    if (twilioToken) {
        next.sealedTwilio = seal(twilioToken);
    }
    if (provider === "openai" && !next.sealedKey) {
        return { ok: false, status: 400, message: "Add the OpenAI key to connect this Host." };
    }
    if (provider === "custom" && !next.endpoint) {
        return { ok: false, status: 400, message: "Add the https endpoint for your agent." };
    }
    await saveSecret(ownerId, slug, next);
    return { ok: true, secret: next };
}

function requestHostOf(request) {
    if (!request || !request.headers) {
        return "";
    }
    return request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
}

export async function ownerAct(user, body, request) {
    const ownerId = String(user.sub || "");
    const input = body && typeof body === "object" ? body : {};
    const action = String(input.action || "status");
    const loaded = await loadOwned(ownerId, input.slug || input.h, input.share);
    if (action === "status") {
        return { status: 200, body: ownerView(loaded.door, loaded.secret) };
    }
    if (action === "disable") {
        if (!loaded.door) {
            return { status: 404, body: { ok: false, message: "This door is not published yet." } };
        }
        loaded.door.enabled = false;
        await putDoc("hostDoors", loaded.door.slug, loaded.door);
        return { status: 200, body: ownerView(loaded.door, loaded.secret) };
    }
    const slug = publicSlug(input.slug || (loaded.door && loaded.door.slug) || input.name);
    if (!slug) {
        return { status: 400, body: { ok: false, message: "Choose a public name of at least two letters." } };
    }
    if (loaded.taken && loaded.slug === slug) {
        return { status: 409, body: { ok: false, message: "That public name is already on a door." } };
    }
    const existingDoor = loaded.door && loaded.door.slug === slug ? loaded.door : await (async function () {
        const current = await getDoc("hostDoors", slug);
        if (current && current.ownerId && current.ownerId !== ownerId) {
            return { taken: true };
        }
        return current;
    })();
    if (existingDoor && existingDoor.taken) {
        return { status: 409, body: { ok: false, message: "That public name is already on a door." } };
    }
    const previous = loaded.door && loaded.door.slug && loaded.door.slug !== slug ? loaded.door.slug : "";
    const priorSecret = loaded.secret && (!loaded.slug || loaded.slug === slug) ? loaded.secret : (previous ? await getDoc("hostSecrets", secretId(ownerId, previous)) : null);
    const saved = await writeConnection(ownerId, slug, input, priorSecret);
    if (!saved.ok) {
        return { status: saved.status, body: { ok: false, message: saved.message } };
    }
    if (action === "test") {
        const promptDoor = Object.assign(blankDoor(ownerId, slug), existingDoor || {}, {
            name: clip(input.name, 40) || (existingDoor && existingDoor.name) || "Host",
            welcome: clip(input.welcome, 280),
            may: clip(input.may, 400),
            mayNot: clip(input.mayNot, 400),
            library: libraryText(input.pieces) || (existingDoor && existingDoor.library) || "",
            provider: saved.secret.provider,
            model: saved.secret.model,
            session: "owner-test"
        });
        const turn = await completeTurn(saved.secret, promptDoor, clip(input.message, 800) || "Hello. What can you help me with?", [], fetch, requestHostOf(request));
        if (turn.ok && existingDoor) {
            existingDoor.calls = Number(existingDoor.calls || 0) + 1;
            existingDoor.microUsd = Number(existingDoor.microUsd || 0) + Number(turn.microUsd || 0);
            await putDoc("hostDoors", slug, existingDoor).catch(function () {});
        }
        if (!turn.ok) {
            return { status: turn.status || 502, body: { ok: false, message: turn.message, slug: slug } };
        }
        return { status: 200, body: Object.assign(ownerView(existingDoor, saved.secret), { reply: turn.text, slug: slug }) };
    }
    const door = Object.assign(blankDoor(ownerId, slug), existingDoor || {});
    applyPublic(door, input);
    door.ownerId = ownerId;
    door.slug = slug;
    door.enabled = true;
    door.provider = saved.secret.provider;
    door.model = saved.secret.model;
    const claimed = await claimLine(ownerId, slug, input.line, door.line);
    if (!claimed.ok) {
        return { status: claimed.status || 400, body: { ok: false, message: claimed.message, slug: slug } };
    }
    door.line = claimed.phone || "";
    await putDoc("hostDoors", slug, door);
    if (previous) {
        await deleteDoc("hostDoors", previous);
        await deleteDoc("hostSecrets", secretId(ownerId, previous));
    }
    return { status: 200, body: ownerView(door, saved.secret) };
}

export async function readCard(slug) {
    const clean = publicSlug(slug);
    if (!clean) {
        return null;
    }
    const door = await getDoc("hostDoors", clean);
    if (!door) {
        return null;
    }
    return publicCard(door);
}

export async function markScan(request, slug, session) {
    const clean = publicSlug(slug);
    if (!clean) {
        return { ok: false };
    }
    const door = await getDoc("hostDoors", clean);
    if (!door || door.enabled !== true) {
        return { ok: false };
    }
    const id = clip(session, 64);
    const scanned = listField(door.scanned);
    if (id && scanned.indexOf(id) >= 0) {
        return { ok: true, counted: false };
    }
    if (!allowVisitor(clientKey(request, clean) + ":scan")) {
        return { ok: true, counted: false };
    }
    door.scans = Number(door.scans || 0) + 1;
    if (id) {
        door.scanned = JSON.stringify(rememberId(scanned, id));
    }
    await putDoc("hostDoors", clean, door);
    return { ok: true, counted: true };
}

export async function talk(request, body) {
    const input = body && typeof body === "object" ? body : {};
    const slug = publicSlug(input.h || input.slug);
    if (!slug) {
        return { status: 404, body: { ok: false, message: "This door is not open yet." } };
    }
    const door = await getDoc("hostDoors", slug);
    if (!door) {
        return { status: 404, body: { ok: false, message: "This door is not open yet." } };
    }
    if (door.enabled !== true) {
        return { status: 403, body: { ok: false, message: "This Host is closed." } };
    }
    const message = clip(input.message, 800);
    if (!message) {
        return { status: 400, body: { ok: false, message: "Say something to the Host." } };
    }
    if (!allowVisitor(clientKey(request, slug))) {
        return { status: 429, body: { ok: false, message: "This Host is catching its breath. Try again in a minute." } };
    }
    const hour = Math.floor(Date.now() / 3600000);
    if (Number(door.hourKey) !== hour) {
        door.hourKey = hour;
        door.hourHits = 0;
    }
    if (Number(door.hourHits) >= 120) {
        return { status: 429, body: { ok: false, message: "This Host is catching its breath. Try again in a minute." } };
    }
    const secret = await getDoc("hostSecrets", secretId(door.ownerId, slug));
    if (!secret) {
        return { status: 503, body: { ok: false, message: "This Host cannot answer right now." } };
    }
    const session = clip(input.session, 64);
    door.session = session;
    const requestHost = requestHostOf(request);
    const turn = secret.provider === "custom"
        ? await completeCustom(secret, door, message, input.history, fetch, requestHost)
        : await completeOpenAI(secret, door, message, historyOf(input.history), fetch);
    door.hourHits = Number(door.hourHits || 0) + 1;
    door.calls = Number(door.calls || 0) + 1;
    delete door.session;
    if (!turn.ok) {
        door.errors = Number(door.errors || 0) + 1;
        await putDoc("hostDoors", slug, door).catch(function () {});
        return { status: turn.status || 502, body: { ok: false, message: visitorError(turn) } };
    }
    const seen = listField(door.seen);
    if (session && seen.indexOf(session) < 0) {
        door.talks = Number(door.talks || 0) + 1;
        door.sessions = Number(door.sessions || 0) + 1;
        door.seen = JSON.stringify(rememberId(seen, session));
    }
    if (input.mode === "voice") {
        door.voiceTurns = Number(door.voiceTurns || 0) + 1;
    } else {
        door.textTurns = Number(door.textTurns || 0) + 1;
    }
    const gap = Math.max(0, Math.min(120000, Number(input.gap) || 0));
    door.durationMs = Number(door.durationMs || 0) + gap;
    door.microUsd = Number(door.microUsd || 0) + Number(turn.microUsd || 0);
    if (turn.conversion) {
        door.conversions = Number(door.conversions || 0) + 1;
    }
    bumpFaq(door, message);
    await putDoc("hostDoors", slug, door).catch(function () {});
    return { status: 200, body: { ok: true, reply: turn.text } };
}

export function e164(value) {
    const raw = String(value || "").trim();
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10) {
        return "+1" + digits;
    }
    if (digits.length === 11 && digits.startsWith("1")) {
        return "+" + digits;
    }
    if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) {
        return "+" + digits;
    }
    return "";
}

function lineId(phone) {
    return String(phone || "").replace(/\D/g, "");
}

async function claimLine(ownerId, slug, typed, previous) {
    const raw = String(typed || "").trim();
    if (raw && !e164(raw)) {
        return { ok: false, status: 400, message: "Check the phone number." };
    }
    const next = e164(raw);
    const prev = e164(previous);
    if (prev && prev !== next) {
        const old = await getDoc("hostLines", lineId(prev));
        if (old && old.ownerId === ownerId) {
            await deleteDoc("hostLines", lineId(prev));
        }
    }
    if (!next) {
        return { ok: true, phone: "" };
    }
    const current = await getDoc("hostLines", lineId(next));
    if (current && current.ownerId && current.ownerId !== ownerId) {
        return { ok: false, status: 409, message: "That number is already on a Host." };
    }
    await putDoc("hostLines", lineId(next), {
        ownerId: ownerId,
        slug: slug,
        phone: next
    });
    return { ok: true, phone: next };
}

export function twilioSignature(authToken, url, params) {
    const keys = Object.keys(params || {}).sort();
    let data = String(url || "");
    keys.forEach(function (key) {
        data += key + String(params[key] == null ? "" : params[key]);
    });
    return createHmac("sha1", String(authToken || "")).update(data, "utf8").digest("base64");
}

function signedByTwilio(authToken, url, params, given) {
    const expected = twilioSignature(authToken, url, params);
    const left = Buffer.from(expected);
    const right = Buffer.from(String(given || ""));
    if (!authToken || left.length !== right.length) {
        return false;
    }
    return timingSafeEqual(left, right);
}

function xml(value) {
    return String(value || "").replace(/[&<>"']/g, function (ch) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;" }[ch];
    });
}

function callUrl(request) {
    const proto = String(request.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
    const host = String(request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim();
    const path = new URL(request.url).pathname;
    if (!host) {
        return "https://horseradish.ai/api/host-call";
    }
    return proto + "://" + host + path;
}

function gather(hook) {
    return "<Gather input=\"speech\" speechTimeout=\"auto\" speechModel=\"phone_call\" action=\"" + xml(hook) + "\" method=\"POST\"/>";
}

export function callTwiml(kind, spoken, hook) {
    const line = xml(clip(spoken, 800) || "Hello.");
    const next = gather(hook || "/api/host-call");
    if (kind === "hangup") {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Hangup/></Response>";
    }
    if (kind === "closed") {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Say>" + line + "</Say><Hangup/></Response>";
    }
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Say>" + line + "</Say>" + next + "</Response>";
}

export async function answerCall(request, params) {
    const form = params && typeof params === "object" ? params : {};
    const phone = e164(form.To || "");
    if (!phone) {
        return { status: 200, xml: callTwiml("closed", "This number is not connected.", "") };
    }
    const line = await getDoc("hostLines", lineId(phone));
    if (!line || !line.slug || !line.ownerId) {
        return { status: 200, xml: callTwiml("closed", "This number is not connected.", "") };
    }
    const secret = await getDoc("hostSecrets", secretId(line.ownerId, line.slug));
    const token = secret && secret.sealedTwilio ? unseal(secret.sealedTwilio) : "";
    const hook = callUrl(request);
    if (!signedByTwilio(token, hook, form, request.headers.get("x-twilio-signature"))) {
        return { status: 403, xml: callTwiml("hangup", "", "") };
    }
    const door = await getDoc("hostDoors", line.slug);
    if (!door || door.enabled !== true || door.ownerId !== line.ownerId) {
        return { status: 200, xml: callTwiml("closed", (door && door.name ? door.name + " is closed." : "This line is closed."), hook) };
    }
    const callSid = String(form.CallSid || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
    const said = clip(form.SpeechResult, 800);
    const priorDoc = callSid ? await getDoc("hostCalls", callSid) : null;
    const history = listField(priorDoc && priorDoc.history);
    if (!said) {
        const again = history.length ? "Once more." : (door.welcome || door.name || "Hello.");
        return { status: 200, xml: callTwiml("say", again, hook) };
    }
    if (!allowVisitor("call:" + lineId(phone))) {
        return { status: 200, xml: callTwiml("say", "One minute.", hook) };
    }
    const hour = Math.floor(Date.now() / 3600000);
    if (Number(door.hourKey) !== hour) {
        door.hourKey = hour;
        door.hourHits = 0;
    }
    if (Number(door.hourHits) >= 120) {
        return { status: 200, xml: callTwiml("say", "One minute.", hook) };
    }
    door.session = callSid;
    const turn = secret.provider === "custom"
        ? await completeCustom(secret, door, said, history, fetch, requestHostOf(request))
        : await completeOpenAI(secret, door, said, history, fetch);
    delete door.session;
    door.hourHits = Number(door.hourHits || 0) + 1;
    door.calls = Number(door.calls || 0) + 1;
    if (!turn.ok) {
        door.errors = Number(door.errors || 0) + 1;
        await putDoc("hostDoors", line.slug, door).catch(function () {});
        return { status: 200, xml: callTwiml("say", "One moment.", hook) };
    }
    const seen = listField(door.seen);
    if (callSid && seen.indexOf(callSid) < 0) {
        door.talks = Number(door.talks || 0) + 1;
        door.sessions = Number(door.sessions || 0) + 1;
        door.seen = JSON.stringify(rememberId(seen, callSid));
    }
    door.voiceTurns = Number(door.voiceTurns || 0) + 1;
    door.microUsd = Number(door.microUsd || 0) + Number(turn.microUsd || 0);
    bumpFaq(door, said);
    await putDoc("hostDoors", line.slug, door).catch(function () {});
    const nextHistory = history.concat([
        { role: "user", content: said },
        { role: "assistant", content: turn.text }
    ]).slice(-8);
    if (callSid) {
        await putDoc("hostCalls", callSid, {
            slug: line.slug,
            history: JSON.stringify(nextHistory),
            updatedAt: new Date().toISOString()
        }).catch(function () {});
    }
    return { status: 200, xml: callTwiml("say", turn.text, hook) };
}
