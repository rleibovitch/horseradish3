import { answerCall, callTwiml } from "../lib/agent.js";

function xmlResponse(body, status) {
    return new Response(body, {
        status: status || 200,
        headers: {
            "Content-Type": "text/xml; charset=utf-8",
            "Cache-Control": "no-store"
        }
    });
}

export default {
    async fetch(request) {
        if (request.method.toUpperCase() !== "POST") {
            return xmlResponse(callTwiml("hangup", "", ""), 405);
        }
        const form = {};
        try {
            const raw = await request.text();
            const params = new URLSearchParams(raw);
            params.forEach(function (value, key) {
                form[key] = value;
            });
        } catch (err) {
            form.To = "";
        }
        try {
            const result = await answerCall(request, form);
            return xmlResponse(result.xml, result.status || 200);
        } catch (err) {
            return xmlResponse(callTwiml("say", "One moment.", "/api/host-call"), 200);
        }
    }
};
