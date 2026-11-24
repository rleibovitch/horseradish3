import { json } from "../lib/lab.js";
import { markScan, readCard } from "../lib/agent.js";

export default {
    async fetch(request) {
        const method = request.method.toUpperCase();
        const url = new URL(request.url);
        if (method === "GET") {
            try {
                const card = await readCard(url.searchParams.get("h") || "");
                if (!card) {
                    return json({ ok: false, message: "This door is not open yet." }, 404);
                }
                return json({ ok: true, host: card });
            } catch (err) {
                return json({ ok: false, message: "This door is not open yet." }, 503);
            }
        }
        if (method !== "POST") {
            return json({ ok: false, message: "Nope." }, 405);
        }
        let body = {};
        try {
            body = await request.json();
        } catch (err) {
            body = {};
        }
        if (body.event !== "scan") {
            return json({ ok: false, message: "Nope." }, 400);
        }
        try {
            const result = await markScan(request, body.h || body.slug, body.session);
            return json(result, result.ok ? 200 : 404);
        } catch (err) {
            return json({ ok: false }, 503);
        }
    }
};
