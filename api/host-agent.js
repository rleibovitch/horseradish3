import { json, readUser } from "../lib/lab.js";
import { ownerAct } from "../lib/agent.js";

export default {
    async fetch(request) {
        const method = request.method.toUpperCase();
        if (method !== "POST" && method !== "GET") {
            return json({ ok: false, message: "Nope." }, 405);
        }
        const user = readUser(request);
        if (!user) {
            return json({ ok: false, message: "Sign in to connect an agent." }, 401);
        }
        let body = {};
        if (method === "GET") {
            const url = new URL(request.url);
            body = {
                action: "status",
                slug: url.searchParams.get("h") || "",
                share: url.searchParams.get("share") || ""
            };
        } else {
            try {
                body = await request.json();
            } catch (err) {
                body = {};
            }
        }
        try {
            const result = await ownerAct(user, body, request);
            return json(result.body, result.status || 200);
        } catch (err) {
            const code = err && err.code;
            if (code === "session") {
                return json({ ok: false, message: "The Portal has no session key yet." }, 503);
            }
            if (code === "shelf") {
                return json({ ok: false, message: "The shelf is not connected yet." }, 503);
            }
            return json({ ok: false, message: "The door could not be saved." }, 500);
        }
    }
};
