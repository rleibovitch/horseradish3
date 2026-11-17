import { json, readUser } from "../lib/lab.js";
import {
    deleteAccountPhoto,
    deleteAccountSet,
    listAccountPhotos,
    readAccountPhoto,
    writeAccountPhoto
} from "../lib/photos.js";

function unavailable() {
    return json({ message: "Photo storage is not connected yet." }, 503);
}

export default {
    async fetch(request) {
        const user = readUser(request);
        if (!user) return json({ message: "Sign in before saving a photo." }, 401);

        const method = request.method.toUpperCase();
        const url = new URL(request.url);

        try {
            if (method === "GET") {
                const id = url.searchParams.get("id");
                if (id) {
                    const photo = await readAccountPhoto(user.sub, id);
                    if (!photo) return json({ message: "That photo is not on the account." }, 404);
                    return new Response(photo.bytes, {
                        status: 200,
                        headers: {
                            "Content-Type": "image/jpeg",
                            "Cache-Control": "private, no-store"
                        }
                    });
                }
                const photos = await listAccountPhotos(user.sub);
                return json({ photos: photos });
            }

            if (method === "POST") {
                let body = {};
                try {
                    body = await request.json();
                } catch (err) {
                    body = {};
                }
                const saved = await writeAccountPhoto(user.sub, body);
                return json({ photo: saved });
            }

            if (method === "DELETE") {
                const id = url.searchParams.get("id");
                const setId = url.searchParams.get("set");
                if (setId) await deleteAccountSet(user.sub, setId);
                else if (id) await deleteAccountPhoto(user.sub, id);
                return json({ ok: true });
            }

            return json({ message: "Nope." }, 405);
        } catch (err) {
            if (err && (err.code === "photos" || err.message === "photos" || err.message === "shelf")) {
                return unavailable();
            }
            if (err && err.code === "photo") {
                return json({ message: "Use a JPEG under 650 KB." }, 400);
            }
            return unavailable();
        }
    }
};
