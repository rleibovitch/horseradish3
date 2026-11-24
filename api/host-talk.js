import { json } from "../lib/lab.js";
import { talk } from "../lib/agent.js";

export default {
    async fetch(request) {
        if (request.method.toUpperCase() !== "POST") {
            return json({ ok: false, message: "Nope." }, 405);
        }
        let body = {};
        try {
            body = await request.json();
        } catch (err) {
            body = {};
        }
        try {
            const result = await talk(request, body);
            return json(result.body, result.status || 200);
        } catch (err) {
            const code = err && err.code;
            if (code === "session" || code === "shelf") {
                return json({ ok: false, message: "This Host cannot answer right now." }, 503);
            }
            return json({ ok: false, message: "The Host could not answer that." }, 500);
        }
    }
};
