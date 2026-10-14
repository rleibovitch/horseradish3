import { cleanHost, json, loadShelf, readUser, writeShelf } from "../lib/lab.js";

function shelfMessage() {
    return "The Lab door opens. Firestore is not mounted yet.";
}

export default {
    async fetch(request) {
        const user = readUser(request);
        if (!user) {
            return json({ message: "Enter the Lab first." }, 401);
        }

        const method = request.method.toUpperCase();
        const url = new URL(request.url);

        try {
            if (method === "GET") {
                const hosts = await loadShelf(user.sub);
                const share = String(url.searchParams.get("share") || "").toUpperCase();
                if (share) {
                    const host = hosts.find(function (item) {
                        return String(item.share || "").toUpperCase() === share;
                    }) || null;
                    return json({ host: host, hosts: hosts });
                }
                return json({ hosts: hosts });
            }

            if (method === "POST") {
                let body = {};
                try {
                    body = await request.json();
                } catch (err) {
                    body = {};
                }
                const incoming = cleanHost(body.host);
                const hosts = await loadShelf(user.sub);
                const next = hosts.filter(function (item) {
                    return item.share !== incoming.share;
                });
                next.unshift(incoming);
                await writeShelf(user.sub, next);
                return json({ host: incoming, hosts: next.slice(0, 24) });
            }

            if (method === "DELETE") {
                const share = String(url.searchParams.get("share") || "").replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
                if (!share) {
                    return json({ message: "Which Host?" }, 400);
                }
                const hosts = await loadShelf(user.sub);
                const next = hosts.filter(function (item) {
                    return String(item.share || "").toUpperCase() !== share;
                });
                await writeShelf(user.sub, next);
                return json({ hosts: next });
            }

            return json({ message: "Nope." }, 405);
        } catch (err) {
            if (err && (err.code === "shelf" || err.message === "shelf" || err.message === "shelf-put")) {
                return json({ message: shelfMessage(), hosts: [] }, 503);
            }
            return json({ message: "The Lab missed." }, 500);
        }
    }
};
