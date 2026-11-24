import { firebasePublic, json } from "../lib/lab.js";

function firestoreBase() {
    const fb = firebasePublic() || {};
    const project = fb.projectId || "horseradish-hosts-993ea";
    const key = fb.apiKey || "";
    return {
        key: key,
        root: "https://firestore.googleapis.com/v1/projects/" + project + "/databases/(default)/documents"
    };
}

function decodeDoc(doc) {
    const fields = (doc && doc.fields) || {};
    const out = {};
    Object.keys(fields).forEach(function (name) {
        const cell = fields[name] || {};
        out[name] = cell.stringValue || "";
    });
    return out;
}

function safeHook(value) {
    let url;
    try {
        url = new URL(String(value || "").trim());
    } catch (err) {
        return "";
    }
    if (url.protocol !== "https:") {
        return "";
    }
    const host = url.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local") || host === "metadata.google.internal") {
        return "";
    }
    if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|0\.0\.0\.0)/.test(host)) {
        return "";
    }
    return url.toString();
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

        const inbox = String(body.inbox || "").replace(/[^A-Za-z0-9_-]/g, "");
        const kind = body.kind === "kitchen" || body.kind === "order" ? body.kind : "question";
        const question = String(body.question || "").trim().slice(0, 400);
        const items = Array.isArray(body.items) ? body.items.slice(0, 16).map(function (item) {
            const row = item && typeof item === "object" ? item : {};
            return {
                title: String(row.title || "").slice(0, 80),
                line: String(row.line || "").slice(0, 180)
            };
        }).filter(function (item) {
            return item.line;
        }) : [];
        if (!inbox || (!question && !items.length)) {
            return json({ sent: false, held: true }, 400);
        }

        const db = firestoreBase();
        if (!db.key) {
            return json({ sent: false, held: true }, 503);
        }

        const pub = await fetch(db.root + "/public/" + encodeURIComponent(inbox) + "?key=" + encodeURIComponent(db.key));
        if (!pub.ok) {
            return json({ sent: false, held: true });
        }
        const card = decodeDoc(await pub.json());
        const hook = safeHook(card.webhook);
        if (!hook) {
            return json({ sent: false, held: true });
        }

        try {
            const sent = await fetch(hook, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    kind: kind,
                    name: card.name || "",
                    phone: card.managerPhone || "",
                    question: question,
                    items: items,
                    at: new Date().toISOString()
                })
            });
            return json({ sent: sent.ok, held: !sent.ok });
        } catch (err) {
            return json({ sent: false, held: true });
        }
    }
};
