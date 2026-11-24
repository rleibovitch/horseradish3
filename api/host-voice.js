import { json } from "../lib/lab.js";

const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";

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

        const key = String(request.headers.get("xi-api-key") || "").trim();
        const text = String(body.text || "").trim().slice(0, 600);
        const voiceId = String(body.voiceId || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40) || DEFAULT_VOICE;
        if (key.length < 8 || key.length > 200) {
            return json({ message: "Add an ElevenLabs key on this host." }, 400);
        }
        if (!text) {
            return json({ message: "Nothing to say." }, 400);
        }

        let upstream;
        try {
            upstream = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + voiceId, {
                method: "POST",
                headers: {
                    "xi-api-key": key,
                    "Content-Type": "application/json",
                    Accept: "audio/mpeg"
                },
                body: JSON.stringify({
                    text: text,
                    model_id: "eleven_turbo_v2_5"
                })
            });
        } catch (err) {
            return json({ message: "The voice did not answer." }, 502);
        }
        if (!upstream.ok) {
            return json({ message: "The voice did not answer." }, 502);
        }

        const audio = await upstream.arrayBuffer();
        return new Response(audio, {
            status: 200,
            headers: {
                "Content-Type": "audio/mpeg",
                "Cache-Control": "no-store"
            }
        });
    }
};
