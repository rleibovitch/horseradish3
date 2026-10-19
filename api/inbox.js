import { firebasePublic, json } from "../lib/lab.js";

function cors(body, status) {
    return json(body, status, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    });
}

function firestoreBase() {
    const fb = firebasePublic() || {};
    const project = fb.projectId || "horseradish-hosts-993ea";
    const key = fb.apiKey || "";
    return {
        project: project,
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

export default {
    async fetch(request) {
        if (request.method.toUpperCase() === "OPTIONS") {
            return cors({ ok: true }, 204);
        }
        if (request.method.toUpperCase() !== "POST") {
            return cors({ message: "Nope." }, 405);
        }

        let body = {};
        try {
            body = await request.json();
        } catch (err) {
            body = {};
        }

        const text = String(body.text || "").trim();
        const share = String(body.share || "").trim();
        const inbox = String(body.inbox || "").replace(/[^A-Za-z0-9_-]/g, "");
        if (!inbox || !text || text.length > 400) {
            return cors({ message: "The note did not go through." }, 400);
        }

        const db = firestoreBase();
        if (!db.key) {
            return cors({ message: "The Host has no door." }, 503);
        }

        const at = new Date().toISOString();
        const write = await fetch(db.root + "/inbox/" + encodeURIComponent(inbox) + "/items?key=" + encodeURIComponent(db.key), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fields: {
                    text: { stringValue: text },
                    share: { stringValue: share || "HOST" },
                    at: { stringValue: at }
                }
            })
        });
        if (!write.ok) {
            return cors({ message: "The note did not go through." }, 502);
        }

        let hook = "";
        let name = "";
        const pub = await fetch(db.root + "/public/" + encodeURIComponent(inbox) + "?key=" + encodeURIComponent(db.key));
        if (pub.ok) {
            const card = decodeDoc(await pub.json());
            hook = String(card.webhook || "").trim();
            name = String(card.name || "");
        }

        if (hook && /^https:\/\//i.test(hook)) {
            try {
                await fetch(hook, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        name: name,
                        share: share,
                        text: text,
                        at: at
                    })
                });
            } catch (err) {}
        }

        return cors({ ok: true, at: at }, 200);
    }
};
