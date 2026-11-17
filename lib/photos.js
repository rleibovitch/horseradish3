import { accountKey, firestoreAccessToken, firestoreProject } from "./lab.js";

const MAX_BYTES = 650000;

function safeId(value) {
    return String(value || "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 80);
}

function collectionUrl(sub) {
    const project = firestoreProject();
    const account = accountKey(sub);
    if (!project || !account) return "";
    return "https://firestore.googleapis.com/v1/projects/" + project
        + "/databases/(default)/documents/accounts/" + encodeURIComponent(account) + "/photos";
}

function text(field) {
    return field && typeof field.stringValue === "string" ? field.stringValue : "";
}

function number(field) {
    if (!field) return 0;
    const raw = field.integerValue != null ? field.integerValue : field.doubleValue;
    const value = Number(raw || 0);
    return Number.isFinite(value) ? value : 0;
}

function metaFrom(doc) {
    const fields = doc && doc.fields ? doc.fields : {};
    const id = text(fields.id) || String(doc.name || "").split("/").pop();
    return {
        id: id,
        name: text(fields.name),
        setId: text(fields.setId),
        setName: text(fields.setName),
        targetId: text(fields.targetId),
        width: number(fields.width),
        height: number(fields.height),
        updated: number(fields.updated)
    };
}

export function photoBytes(data) {
    const raw = String(data || "").replace(/\s/g, "");
    if (!raw || raw.length > 900000) return null;
    const bytes = Buffer.from(raw, "base64");
    if (!bytes.length || bytes.length > MAX_BYTES) return null;
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    return bytes;
}

export async function listAccountPhotos(sub) {
    const url = collectionUrl(sub);
    if (!url) {
        const err = new Error("photos");
        err.code = "photos";
        throw err;
    }
    const token = await firestoreAccessToken();
    const photos = [];
    let page = "";
    do {
        const next = new URL(url);
        next.searchParams.set("pageSize", "20");
        ["id", "name", "setId", "setName", "targetId", "width", "height", "updated"].forEach((field) => {
            next.searchParams.append("mask.fieldPaths", field);
        });
        if (page) next.searchParams.set("pageToken", page);
        const res = await fetch(next, { headers: { authorization: "Bearer " + token } });
        if (res.status === 404) return [];
        if (!res.ok) throw new Error("photos");
        const body = await res.json();
        (body.documents || []).forEach((doc) => photos.push(metaFrom(doc)));
        page = body.nextPageToken || "";
    } while (page && photos.length < 40);
    photos.sort((a, b) => b.updated - a.updated);
    return photos;
}

export async function readAccountPhoto(sub, id) {
    const photoId = safeId(id);
    const url = collectionUrl(sub);
    if (!url || !photoId) return null;
    const token = await firestoreAccessToken();
    const res = await fetch(url + "/" + encodeURIComponent(photoId), {
        headers: { authorization: "Bearer " + token }
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("photos");
    const doc = await res.json();
    const fields = doc.fields || {};
    const bytes = photoBytes(text(fields.bytes));
    if (!bytes) return null;
    return { meta: metaFrom(doc), bytes: bytes };
}

export async function writeAccountPhoto(sub, photo) {
    const photoId = safeId(photo && photo.id);
    const url = collectionUrl(sub);
    const bytes = photoBytes(photo && photo.data);
    if (!url) {
        const err = new Error("photos");
        err.code = "photos";
        throw err;
    }
    if (!photoId || !bytes) {
        const err = new Error("photo");
        err.code = "photo";
        throw err;
    }
    const token = await firestoreAccessToken();
    const now = Date.now();
    const res = await fetch(url + "/" + encodeURIComponent(photoId), {
        method: "PATCH",
        headers: {
            authorization: "Bearer " + token,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            fields: {
                id: { stringValue: photoId },
                name: { stringValue: String(photo.name || "Photo").slice(0, 80) },
                setId: { stringValue: safeId(photo.setId) },
                setName: { stringValue: String(photo.setName || "Untitled experience").slice(0, 80) },
                targetId: { stringValue: safeId(photo.targetId) },
                width: { integerValue: String(Math.max(1, Number(photo.width) || 1)) },
                height: { integerValue: String(Math.max(1, Number(photo.height) || 1)) },
                updated: { integerValue: String(now) },
                bytes: { stringValue: bytes.toString("base64") }
            }
        })
    });
    if (!res.ok) throw new Error("photos");
    return { id: photoId, updated: now };
}

export async function deleteAccountPhoto(sub, id) {
    const photoId = safeId(id);
    const url = collectionUrl(sub);
    if (!url || !photoId) return;
    const token = await firestoreAccessToken();
    const res = await fetch(url + "/" + encodeURIComponent(photoId), {
        method: "DELETE",
        headers: { authorization: "Bearer " + token }
    });
    if (!res.ok && res.status !== 404) throw new Error("photos");
}

export async function deleteAccountSet(sub, setId) {
    const wanted = safeId(setId);
    if (!wanted) return;
    const photos = await listAccountPhotos(sub);
    const mine = photos.filter((photo) => photo.setId === wanted);
    for (const photo of mine) {
        await deleteAccountPhoto(sub, photo.id);
    }
}
