import {
    clientId,
    hasShelf,
    json,
    readUser,
    sessionCookie,
    clearCookie,
    sessionSecret,
    verifyGoogle
} from "../lib/lab.js";

export default {
    async fetch(request) {
        const method = request.method.toUpperCase();

        if (method === "GET") {
            return json({
                user: readUser(request),
                clientId: clientId(),
                shelf: hasShelf()
            });
        }

        if (method === "DELETE") {
            return json({ user: null }, 200, { "Set-Cookie": clearCookie() });
        }

        if (method !== "POST") {
            return json({ message: "Nope." }, 405);
        }

        if (!clientId()) {
            return json({ message: "The Google lock is not hung yet." }, 503);
        }
        if (!sessionSecret()) {
            return json({ message: "The Lab has no session key yet." }, 503);
        }

        let body = {};
        try {
            body = await request.json();
        } catch (err) {
            body = {};
        }

        const user = await verifyGoogle(body.credential);
        if (!user || !user.sub) {
            return json({ message: "Google did not let us in." }, 401);
        }

        return json({ user: user, shelf: hasShelf() }, 200, {
            "Set-Cookie": sessionCookie(user)
        });
    }
};
