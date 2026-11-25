(function () {
    const Lab = window.HorseradishLab;
    const root = document.getElementById("hosts-root");
    const fileInput = document.getElementById("hosts-file");
    if (!Lab || !root) {
        return;
    }

    const STOP = new Set("a an the of to for is are do you your we they it this that on in with and or what whats what's how much can has have from about".split(" "));
    let hosts = [];
    let draft = null;
    let holding = null;
    let mode = "list";
    let query = "";
    let question = "";
    let last = null;
    let ticket = [];
    let notice = "";
    let saving = false;
    let pendingPiece = "";
    let speaker = null;
    let keyDraft = "";
    let twilioDraft = "";
    let logoDraft = "";
    let door = null;
    let doorBusy = "";

    function esc(value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch];
        });
    }

    function pieceId() {
        return "p-" + Math.random().toString(36).slice(2, 8);
    }

    function words(value) {
        return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(function (word) {
            return word && !STOP.has(word) && (word.length > 2 || /\d/.test(word));
        });
    }

    function diningRoom() {
        return withAgent({
            name: "Dining room",
            specialty: "Questions about the menu. Orders, or the kitchen.",
            libraryName: "Menus",
            body: "square",
            voiceSource: "plan",
            voiceId: "",
            elevenKey: "",
            managerPhone: "",
            webhook: "",
            pieces: [
                {
                    id: "dinner",
                    title: "Dinner menu",
                    text: [
                        "Horseradish crusted salmon, lemon butter, 28",
                        "Dry-aged ribeye, charred onion, 42",
                        "Little gems, green goddess, 14",
                        "The kitchen is open 5 to 10. The bar stays until 12.",
                        "Nuts are in the crust. The ribeye can be made without butter."
                    ].join("\n")
                },
                {
                    id: "kids",
                    title: "Kids menu",
                    text: [
                        "Butter pasta, 9",
                        "Grilled cheese, tomato soup, 8",
                        "Broccoli, olive oil, 6",
                        "The kids menu ends at 8. Milk or water comes with each plate."
                    ].join("\n")
                }
            ],
            asks: [],
            dirty: true
        });
    }

    function withAgent(host) {
        host.agentProvider = host.agentProvider === "custom" ? "custom" : "openai";
        host.agentModel = host.agentModel || "gpt-4o-mini";
        host.agentEndpoint = host.agentEndpoint || "";
        host.agentWelcome = host.agentWelcome || "";
        host.agentMay = host.agentMay || "";
        host.agentMayNot = host.agentMayNot || "";
        host.agentColor = /^#[0-9a-fA-F]{6}$/.test(host.agentColor || "") ? host.agentColor : "#0092a2";
        host.doorSlug = String(host.doorSlug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32);
        host.agentLine = String(host.agentLine || "").slice(0, 20);
        return host;
    }

    function blankHost() {
        return withAgent({
            name: "",
            specialty: "Questions about the menu. Orders, or the kitchen.",
            libraryName: "Menus",
            body: "square",
            voiceSource: "key",
            voiceId: "",
            elevenKey: "",
            managerPhone: "",
            webhook: "",
            pieces: [{ id: pieceId(), title: "Menu", text: "" }],
            asks: [],
            dirty: true
        });
    }

    function clone(host) {
        return JSON.parse(JSON.stringify(host));
    }

    function voiceLabel(host) {
        if (host.voiceSource === "plan") {
            return "Horseradish plan";
        }
        if (host.elevenKey) {
            return "ElevenLabs";
        }
        return "Voice ready to connect";
    }

    function doorLine(host) {
        return host.doorSlug ? " · Live" : "";
    }

    function callHook() {
        return location.origin + "/api/host-call";
    }

    function publicDoor(slug) {
        return location.origin + "/h/" + slug;
    }

    function scanDoor(slug) {
        return location.origin + "/talk.html?h=" + encodeURIComponent(slug) + "&from=qr";
    }

    function embedDoor(slug, name) {
        const src = location.origin + "/talk.html?h=" + encodeURIComponent(slug);
        const title = String(name || "Host").replace(/"/g, "");
        return '<iframe src="' + src + '" title="' + title + '" style="width:100%;max-width:420px;height:640px;border:0;border-radius:28px"></iframe>';
    }

    function money(micro) {
        const dollars = Number(micro || 0) / 1000000;
        if (dollars < 0.01) {
            return "$" + dollars.toFixed(4);
        }
        return "$" + dollars.toFixed(2);
    }

    function spent(ms) {
        const sec = Math.round(Number(ms || 0) / 1000);
        if (sec < 90) {
            return sec + "s";
        }
        return Math.round(sec / 60) + " min";
    }

    function logoSrc() {
        const raw = logoDraft || (door && door.logo) || "";
        return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(raw) ? raw : "";
    }

    function pieceLine(host) {
        const pieces = host.pieces || [];
        if (!pieces.length) {
            return host.libraryName || "One library";
        }
        return pieces.map(function (piece) {
            return piece.title || "Menu";
        }).slice(0, 3).join(" · ");
    }

    function piecePreview(piece) {
        return String(piece.text || "").split(/\n+/).map(function (line) {
            return line.trim();
        }).filter(Boolean).slice(0, 4).join(" ");
    }

    function reply(host, asked) {
        const qWords = words(asked);
        const pieces = host.pieces || [];
        let broad = null;
        let broadOverlap = 0;
        pieces.forEach(function (piece) {
            const titleWords = words(piece.title);
            const overlap = titleWords.filter(function (word) {
                return qWords.indexOf(word) >= 0;
            }).length;
            const extras = qWords.filter(function (word) {
                return titleWords.indexOf(word) < 0;
            });
            if (overlap > broadOverlap && !extras.length && piece.text) {
                broad = piece;
                broadOverlap = overlap;
            }
        });
        if (broad) {
            return { known: true, question: asked, title: broad.title || "Library", line: piecePreview(broad) };
        }
        let best = { score: 0, long: 0, line: "", title: "" };
        pieces.forEach(function (piece) {
            const titleWords = words(piece.title);
            const titleHit = titleWords.some(function (word) {
                return qWords.indexOf(word) >= 0;
            });
            String(piece.text || "").split(/\n+/).forEach(function (raw) {
                const line = raw.trim();
                if (!line) {
                    return;
                }
                const lineWords = words(line);
                let score = 0;
                let long = 0;
                qWords.forEach(function (word) {
                    if (lineWords.indexOf(word) < 0) {
                        return;
                    }
                    score += 1;
                    if (word.length >= 5) {
                        long += 1;
                    }
                });
                if (titleHit) {
                    score += 1;
                }
                if (score > best.score || (score === best.score && long > best.long)) {
                    best = { score: score, long: long, line: line, title: piece.title || "Library" };
                }
            });
        });
        if (best.score >= 2 || best.long >= 1) {
            return { known: true, question: asked, title: best.title, line: best.line };
        }
        return { known: false, question: asked, title: "", line: "" };
    }

    function spoken(answer) {
        if (!answer) {
            return "";
        }
        if (!answer.known) {
            return "That is not on this library.";
        }
        return "From the " + (answer.title || "library") + ". " + answer.line;
    }

    function matches(host) {
        if (!query) {
            return true;
        }
        const hay = [
            host.name,
            host.specialty,
            host.libraryName,
            pieceLine(host)
        ].join(" ").toLowerCase();
        return hay.indexOf(query) >= 0;
    }

    function slug(name) {
        return String(name || "HOST").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) || "HOST";
    }

    function ensureShare() {
        if (draft.share) {
            return draft.share;
        }
        let share = ("HOST-" + slug(draft.name)).slice(0, 28);
        const clash = hosts.some(function (host) {
            return String(host.share || "").toUpperCase() === share;
        });
        if (clash) {
            share = (share.slice(0, 22) + "-" + Date.now().toString(36).slice(-4)).toUpperCase().slice(0, 28);
        }
        draft.share = share;
        return share;
    }

    function payload() {
        ensureShare();
        return {
            name: String(draft.name || "Unnamed Host").slice(0, 40),
            specialty: String(draft.specialty || "").slice(0, 240),
            libraryName: String(draft.libraryName || "Library").slice(0, 80),
            body: draft.body || "square",
            prompt: draft.prompt || "",
            site: draft.site || "",
            fileName: draft.fileName || "",
            fileText: draft.fileText || "",
            trigger: draft.trigger || "always",
            phrase: draft.phrase || "",
            page: draft.page || "",
            portrait: draft.portrait || "",
            share: draft.share,
            inbox: draft.inbox || "",
            phone: draft.phone || "",
            webhook: String(draft.webhook || "").trim().slice(0, 240),
            managerPhone: String(draft.managerPhone || "").trim().slice(0, 32),
            voiceSource: draft.voiceSource === "plan" ? "plan" : "key",
            voiceId: String(draft.voiceId || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40),
            elevenKey: String(draft.elevenKey || "").trim().slice(0, 200),
            doorSlug: String(draft.doorSlug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32),
            agentProvider: draft.agentProvider === "custom" ? "custom" : "openai",
            agentModel: String(draft.agentModel || "gpt-4o-mini").slice(0, 40),
            agentEndpoint: String(draft.agentEndpoint || "").trim().slice(0, 300),
            agentWelcome: String(draft.agentWelcome || "").slice(0, 280),
            agentMay: String(draft.agentMay || "").slice(0, 400),
            agentMayNot: String(draft.agentMayNot || "").slice(0, 400),
            agentColor: /^#[0-9a-fA-F]{6}$/.test(draft.agentColor || "") ? draft.agentColor : "#0092a2",
            agentLine: String(draft.agentLine || "").trim().slice(0, 20),
            pieces: (draft.pieces || []).slice(0, 8).map(function (piece) {
                return {
                    id: piece.id || pieceId(),
                    title: String(piece.title || "Menu").slice(0, 80),
                    text: String(piece.text || "").slice(0, 8000)
                };
            }),
            asks: (draft.asks || []).slice(0, 20),
            orders: (draft.orders || []).slice(0, 12).map(function (order) {
                return {
                    at: String(order.at || "").slice(0, 40),
                    kind: order.kind === "kitchen" ? "kitchen" : "order",
                    sent: Boolean(order.sent),
                    items: (order.items || []).slice(0, 16).map(function (item) {
                        return {
                            title: String(item.title || "").slice(0, 80),
                            line: String(item.line || "").slice(0, 180)
                        };
                    }).filter(function (item) {
                        return item.line;
                    })
                };
            }).filter(function (order) {
                return order.items.length;
            })
        };
    }

    function remember(host) {
        const share = String(host.share || "").toUpperCase();
        hosts = hosts.filter(function (item) {
            return String(item.share || "").toUpperCase() !== share;
        });
        hosts.unshift(host);
    }

    function saveDraft() {
        if (!draft || saving) {
            return Promise.resolve({ ok: false, message: "Still saving." });
        }
        if (!String(draft.name || "").trim()) {
            return Promise.resolve({ ok: false, message: "Give the host a name." });
        }
        const library = (draft.pieces || []).some(function (piece) {
            return String(piece.text || "").trim();
        });
        if (!library) {
            return Promise.resolve({ ok: false, message: "Add the menu to the library." });
        }
        saving = true;
        const body = payload();
        return Lab.save(body).then(function (result) {
            saving = false;
            if (result && result.ok && result.host) {
                draft = Object.assign(clone(result.host), { dirty: false });
                remember(result.host);
                holding = null;
            }
            return result || { ok: false, message: "The host stayed on this page." };
        }).catch(function () {
            saving = false;
            return { ok: false, message: "The host stayed on this page." };
        });
    }

    function stopSpeaking() {
        if (speaker) {
            speaker.pause();
            speaker = null;
        }
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    }

    function speak(text) {
        stopSpeaking();
        if (!text) {
            return;
        }
        if (!draft || draft.voiceSource === "plan" || !draft.elevenKey) {
            if (!window.speechSynthesis) {
                notice = "This browser has no preview voice.";
                render();
                return;
            }
            const utter = new SpeechSynthesisUtterance(text);
            utter.rate = 1;
            window.speechSynthesis.speak(utter);
            notice = draft && draft.voiceSource === "plan" ? "Preview voice." : "Add an ElevenLabs key to use that voice. This is a preview.";
            render();
            return;
        }
        notice = "Calling ElevenLabs…";
        render();
        fetch("/api/host-voice", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "xi-api-key": draft.elevenKey
            },
            body: JSON.stringify({
                text: text.slice(0, 600),
                voiceId: draft.voiceId || ""
            })
        }).then(function (res) {
            const type = res.headers.get("content-type") || "";
            if (!res.ok || type.indexOf("audio") < 0) {
                notice = "The voice did not answer. Check the ElevenLabs key and voice id.";
                render();
                return null;
            }
            return res.blob();
        }).then(function (blob) {
            if (!blob) {
                return;
            }
            const url = URL.createObjectURL(blob);
            speaker = new Audio(url);
            speaker.addEventListener("ended", function () {
                URL.revokeObjectURL(url);
            });
            notice = "";
            render();
            speaker.play().catch(function () {
                notice = "The browser held the voice. Press hear again.";
                render();
            });
        }).catch(function () {
            notice = "The voice did not answer.";
            render();
        });
    }

    function wantsOrder(asked) {
        return /\b(i'll|i will|we'll|we will|i'd like|id like|order|can i get|could i get|we want|i want|for the table)\b/i.test(asked);
    }

    function clausesOf(asked) {
        const parts = String(asked || "").split(/\band\b|,/i).map(function (part) {
            return part.trim();
        }).filter(Boolean);
        return parts.length ? parts : [String(asked || "")];
    }

    function bestDish(host, clause) {
        const qWords = words(clause);
        let best = null;
        let bestScore = 0;
        let bestLong = 0;
        (host.pieces || []).forEach(function (piece) {
            String(piece.text || "").split(/\n+/).forEach(function (raw) {
                const line = raw.trim();
                if (!line) {
                    return;
                }
                const lineWords = words(line).filter(function (word) {
                    return !/^\d+$/.test(word);
                });
                let score = 0;
                let long = 0;
                qWords.forEach(function (word) {
                    if (lineWords.indexOf(word) < 0) {
                        return;
                    }
                    score += 1;
                    if (word.length >= 5) {
                        long += 1;
                    }
                });
                if (score > bestScore || (score === bestScore && long > bestLong)) {
                    best = { title: piece.title || "Menu", line: line };
                    bestScore = score;
                    bestLong = long;
                }
            });
        });
        if (!best || bestLong < 1 && bestScore < 2) {
            return null;
        }
        return best;
    }

    function addLine(title, line, off) {
        const key = (title + "|" + line).toLowerCase();
        const there = ticket.some(function (item) {
            return (item.title + "|" + item.line).toLowerCase() === key;
        });
        if (there) {
            return false;
        }
        ticket.push({
            id: pieceId(),
            title: title || "Menu",
            line: line,
            off: Boolean(off)
        });
        return true;
    }

    function takeOrder(asked) {
        const found = [];
        clausesOf(asked).forEach(function (clause) {
            const dish = bestDish(draft, clause);
            if (!dish) {
                return;
            }
            if (addLine(dish.title, dish.line, false)) {
                found.push(dish);
            }
        });
        if (found.length) {
            notice = found.length === 1 ? "On the order." : found.length + " dishes on the order.";
            return;
        }
        addLine("For the kitchen", asked, true);
        notice = "Not on the menu. Send it to the kitchen.";
    }

    function stamp(kind, items) {
        const order = {
            at: new Date().toISOString(),
            kind: kind,
            sent: false,
            items: items.map(function (item) {
                return {
                    title: String(item.title || "").slice(0, 80),
                    line: String(item.line || "").slice(0, 180)
                };
            }).filter(function (item) {
                return item.line;
            })
        };
        if (!order.items.length) {
            return null;
        }
        draft.orders = [order].concat(draft.orders || []).slice(0, 12);
        draft.dirty = true;
        ticket = ticket.filter(function (item) {
            return !order.items.some(function (kept) {
                return kept.line === item.line && kept.title === item.title;
            });
        });
        return order;
    }

    function ship(orders) {
        const kitchen = orders.some(function (order) {
            return order.kind === "kitchen";
        });
        const placed = orders.some(function (order) {
            return order.kind === "order";
        });
        notice = placed && kitchen
            ? "Order held. The rest is for the kitchen."
            : (kitchen ? "Held for the kitchen." : "Order held on this host.");
        render();
        saveDraft().then(function (result) {
            if (!result || !result.ok || !draft.webhook || !draft.inbox) {
                if (!(result && result.ok)) {
                    notice = kitchen ? "Held for the kitchen. Sign in to send it." : "Order held here. Sign in to send it.";
                } else if (draft.managerPhone) {
                    notice = kitchen ? "Held for the kitchen at " + draft.managerPhone + "." : "Order held for " + draft.managerPhone + ".";
                }
                render();
                return;
            }
            Promise.all(orders.map(function (order) {
                return fetch("/api/host-ask", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        inbox: draft.inbox,
                        kind: order.kind,
                        question: order.items.map(function (item) {
                            return item.line;
                        }).join("; ").slice(0, 400),
                        items: order.items
                    })
                }).then(function (res) {
                    return res.json();
                }).then(function (data) {
                    order.sent = Boolean(data && data.sent);
                    const live = (draft.orders || []).find(function (item) {
                        return item.at === order.at && item.kind === order.kind;
                    });
                    if (live) {
                        live.sent = order.sent;
                    }
                }).catch(function () {
                    order.sent = false;
                });
            })).then(function () {
                const sent = orders.every(function (order) {
                    return order.sent;
                });
                notice = sent
                    ? (placed && kitchen ? "Order placed. The rest went to the kitchen." : (kitchen ? "Sent to the kitchen." : "Order placed."))
                    : notice;
                return Lab.patchHost(draft.share, { orders: draft.orders });
            }).then(function () {
                render();
            });
        });
    }

    function placeOrder() {
        if (!draft) {
            return;
        }
        const known = ticket.filter(function (item) {
            return !item.off;
        });
        const open = ticket.filter(function (item) {
            return item.off;
        });
        const orders = [];
        if (known.length) {
            orders.push(stamp("order", known));
        }
        if (open.length) {
            orders.push(stamp("kitchen", open));
        }
        const ready = orders.filter(Boolean);
        if (!ready.length) {
            notice = "Tell the host what to order.";
            render();
            return;
        }
        ship(ready);
    }

    function toKitchen() {
        if (!draft) {
            return;
        }
        if (last && !last.known && last.question) {
            addLine("For the kitchen", last.question, true);
        }
        const order = stamp("kitchen", ticket.slice());
        if (!order) {
            notice = "Nothing to send to the kitchen.";
            render();
            return;
        }
        ship([order]);
    }

    function card(host, extra) {
        const share = esc(host.share || "");
        return `
            <article class="hx-card ${extra || ""}">
                <p class="hx-kicker">${esc(host.libraryName || "One library")}</p>
                <h2>${esc(host.name || "Unnamed Host")}</h2>
                <p>${esc(pieceLine(host))}</p>
                <p class="hx-meta">${esc(voiceLabel(host) + doorLine(host))}</p>
                <button type="button" class="hx-go" data-action="open" data-share="${share}">Open</button>
            </article>`;
    }

    function renderList() {
        const shown = hosts.filter(matches);
        const sample = diningRoom();
        const showSample = matches(sample);
        const showHolding = holding && holding.dirty && matches(holding);
        root.innerHTML = `
            <div class="hx">
                <p class="hx-kicker">HOST by Horseradish</p>
                <div class="hx-hero-row">
                    <h1>Your agent. <span class="hx-block">Their phone.</span></h1>
                    <button type="button" class="hx-go hx-go-lg" data-action="new">New host</button>
                </div>
                <p class="hx-note" role="status">${esc(notice)}</p>
                <div class="hx-grid">
                    ${showHolding ? `
                        <article class="hx-card hx-card-hold">
                            <p class="hx-kicker">Not saved yet</p>
                            <h2>${esc(holding.name || "New host")}</h2>
                            <p>${esc(pieceLine(holding))}</p>
                            <div class="hx-actions">
                                <button type="button" class="hx-go" data-action="resume">Continue</button>
                                <button type="button" class="hx-ghost" data-action="discard">Discard</button>
                            </div>
                        </article>` : ""}
                    ${shown.map(function (host) { return card(host); }).join("")}
                    ${showSample ? `
                        <article class="hx-card hx-card-sample">
                            <p class="hx-kicker">Sample library</p>
                            <h2>Dining room</h2>
                            <p>Dinner menu · Kids menu</p>
                            <p class="hx-meta">A restaurant host, ready to seat.</p>
                            <button type="button" class="hx-go" data-action="seat-sample">Seat this host</button>
                        </article>` : ""}
                </div>
                ${!shown.length && !showSample && !showHolding ? `<p class="hx-empty">No hosts match that search.</p>` : ""}
            </div>`;
    }

    function connectMarkup() {
        const provider = draft.agentProvider === "custom" ? "custom" : "openai";
        const live = door && door.ok && door.published && door.slug;
        const mark = logoSrc();
        const busy = doorBusy ? "disabled" : "";
        return `
            <section class="hx-connect">
                <h2>Connect your agent</h2>
                <div class="hx-choices">
                    <label class="hx-choice">
                        <input type="radio" name="agent" value="openai" ${provider === "openai" ? "checked" : ""}>
                        <span>OpenAI</span>
                    </label>
                    <label class="hx-choice">
                        <input type="radio" name="agent" value="custom" ${provider === "custom" ? "checked" : ""}>
                        <span>Custom endpoint</span>
                    </label>
                </div>
                <label class="hx-label" for="hx-slug">Link</label>
                <input id="hx-slug" class="hx-field" data-field="doorSlug" value="${esc(draft.doorSlug || "")}" maxlength="32" placeholder="acme" autocomplete="off" spellcheck="false">
                ${provider === "custom" ? `
                    <label class="hx-label" for="hx-endpoint">Endpoint</label>
                    <input id="hx-endpoint" class="hx-field" data-field="agentEndpoint" type="url" value="${esc(draft.agentEndpoint || "")}" maxlength="300" placeholder="https://agent.example.com/talk" autocomplete="off" spellcheck="false">
                ` : `
                    <label class="hx-label" for="hx-model">Model</label>
                    <input id="hx-model" class="hx-field" data-field="agentModel" value="${esc(draft.agentModel || "gpt-4o-mini")}" maxlength="40" autocomplete="off" spellcheck="false">
                `}
                <label class="hx-label" for="hx-agent-key">API key</label>
                <input id="hx-agent-key" class="hx-field" data-field="agentKey" type="password" value="${esc(keyDraft)}" maxlength="200" placeholder="${door && door.keySet ? "Saved" : ""}" autocomplete="off" spellcheck="false">
                <label class="hx-label" for="hx-line">Phone</label>
                <input id="hx-line" class="hx-field" data-field="agentLine" type="tel" value="${esc(draft.agentLine || "")}" maxlength="20" placeholder="+1 718 555 0134" autocomplete="off">
                <label class="hx-label" for="hx-twilio">Twilio token</label>
                <input id="hx-twilio" class="hx-field" data-field="twilioToken" type="password" value="${esc(twilioDraft)}" maxlength="200" placeholder="${door && door.twilioSet ? "Saved" : ""}" autocomplete="off" spellcheck="false">
                <label class="hx-label" for="hx-call">Webhook</label>
                <p id="hx-call" class="hx-door-url">${esc(callHook())}</p>
                <button type="button" class="hx-ghost" data-action="copy-call">Copy webhook</button>
                <label class="hx-label" for="hx-welcome">Welcome</label>
                <input id="hx-welcome" class="hx-field" data-field="agentWelcome" value="${esc(draft.agentWelcome || "")}" maxlength="280" placeholder="Ask us anything" autocomplete="off">
                <label class="hx-label" for="hx-may">Allowed</label>
                <textarea id="hx-may" class="hx-area" data-field="agentMay" rows="2" maxlength="400" placeholder="Questions about the shop">${esc(draft.agentMay || "")}</textarea>
                <label class="hx-label" for="hx-may-not">Blocked</label>
                <textarea id="hx-may-not" class="hx-area" data-field="agentMayNot" rows="2" maxlength="400" placeholder="Payments and private accounts">${esc(draft.agentMayNot || "")}</textarea>
                <div class="hx-brand-row">
                    <label class="hx-label" for="hx-color">Color</label>
                    <input id="hx-color" class="hx-color" data-field="agentColor" type="color" value="${esc(draft.agentColor || "#0092a2")}">
                    <button type="button" class="hx-ghost" data-action="logo">Logo</button>
                    ${mark ? `<img class="hx-logo" src="${esc(mark)}" alt="">` : ""}
                </div>
                <div class="hx-actions">
                    <button type="button" class="hx-go" data-action="test-agent" ${busy}>Test</button>
                    <button type="button" class="hx-go" data-action="publish-agent" ${busy}>Publish</button>
                    ${live && door.enabled ? `<button type="button" class="hx-ghost" data-action="close-door" ${busy}>Turn off</button>` : ""}
                </div>
                ${door && door.reply ? `<article class="hx-answer"><p>${esc(door.reply)}</p></article>` : ""}
                ${live ? `
                    <div class="hx-metrics">
                        <p class="hx-metric"><b>${esc(door.scans || 0)}</b><span>Scans</span></p>
                        <p class="hx-metric"><b>${esc(door.talks || 0)}</b><span>Conversations</span></p>
                        <p class="hx-metric"><b>${esc(door.sessions || 0)}</b><span>Sessions</span></p>
                        <p class="hx-metric"><b>${esc((door.textTurns || 0) + " / " + (door.voiceTurns || 0))}</b><span>Text / voice</span></p>
                        <p class="hx-metric"><b>${esc(spent(door.durationMs))}</b><span>Time</span></p>
                        <p class="hx-metric"><b>${esc(door.calls || 0)}</b><span>API calls</span></p>
                        <p class="hx-metric"><b>${esc(money(door.microUsd))}</b><span>Cost</span></p>
                        <p class="hx-metric"><b>${esc(door.conversions || 0)}</b><span>Conversions</span></p>
                    </div>
                    ${(door.faq || []).length ? `<ul class="hx-asks">${door.faq.map(function (item) {
                        return `<li><span>${esc(item.n)}</span> ${esc(item.q)}</li>`;
                    }).join("")}</ul>` : ""}
                    <p class="hx-kicker">${door.enabled ? "Live" : "Off"}</p>
                    <p class="hx-door-url">${esc(publicDoor(door.slug))}</p>
                    <div class="hx-qr-row">
                        <div id="hx-qr" class="hx-qr"></div>
                        <div class="hx-actions">
                            <button type="button" class="hx-ghost" data-action="download-qr">Download QR</button>
                            <button type="button" class="hx-ghost" data-action="copy-link">Copy link</button>
                            <button type="button" class="hx-ghost" data-action="copy-embed">Copy embed</button>
                        </div>
                    </div>
                ` : ""}
            </section>`;
    }

    function renderEditor() {
        const pieces = draft.pieces || [];
        const plan = draft.voiceSource === "plan";
        const answer = last;
        root.innerHTML = `
            <div class="hx">
                <button type="button" class="hx-ghost" data-action="back">All hosts</button>
                <p class="hx-kicker">HOST by Horseradish</p>
                <input class="hx-name" data-field="name" value="${esc(draft.name || "")}" placeholder="Name the host" maxlength="40" autocomplete="off">
                ${connectMarkup()}
                <div class="hx-split">
                    <section class="hx-library">
                        <div class="hx-library-head">
                            <div>
                                <label class="hx-label" for="hx-library">Library</label>
                                <input id="hx-library" class="hx-field" data-field="libraryName" value="${esc(draft.libraryName || "")}" maxlength="80" autocomplete="off">
                            </div>
                            <button type="button" class="hx-ghost" data-action="add-piece" ${pieces.length >= 8 ? "disabled" : ""}>Add a piece</button>
                        </div>
                        <label class="hx-label" for="hx-specialty">What this host is for</label>
                        <input id="hx-specialty" class="hx-field" data-field="specialty" value="${esc(draft.specialty || "")}" maxlength="240" autocomplete="off">
                        ${pieces.map(function (piece, index) {
                            return `
                                <article class="hx-piece">
                                    <div class="hx-piece-top">
                                        <input class="hx-piece-title" data-field="piece-title" data-id="${esc(piece.id)}" value="${esc(piece.title || "")}" maxlength="80" aria-label="Piece title" placeholder="Dinner menu">
                                        <button type="button" class="hx-ghost" data-action="upload-piece" data-id="${esc(piece.id)}">Upload text</button>
                                        ${pieces.length > 1 ? `<button type="button" class="hx-ghost" data-action="remove-piece" data-id="${esc(piece.id)}">Remove</button>` : ""}
                                    </div>
                                    <textarea class="hx-piece-text" data-field="piece-text" data-id="${esc(piece.id)}" rows="7" maxlength="8000" placeholder="${index === 0 ? "Paste the menu. One dish a line." : "Paste the kids menu, or another piece of the same library."}">${esc(piece.text || "")}</textarea>
                                </article>`;
                        }).join("")}
                    </section>
                    <aside class="hx-side">
                        <section class="hx-panel hx-panel-teal">
                            <h2>Voice</h2>
                            <div class="hx-choices">
                                <label class="hx-choice">
                                    <input type="radio" name="voice" value="key" ${plan ? "" : "checked"}>
                                    <span>ElevenLabs key</span>
                                </label>
                                <label class="hx-choice">
                                    <input type="radio" name="voice" value="plan" ${plan ? "checked" : ""}>
                                    <span>Horseradish plan</span>
                                </label>
                            </div>
                            ${plan ? `<p>The plan voice previews in this browser.</p>` : `
                                <label class="hx-label" for="hx-key">API key</label>
                                <input id="hx-key" class="hx-field" data-field="elevenKey" type="password" value="${esc(draft.elevenKey || "")}" maxlength="200" autocomplete="off" spellcheck="false">
                                <label class="hx-label" for="hx-voice">Voice id</label>
                                <input id="hx-voice" class="hx-field" data-field="voiceId" value="${esc(draft.voiceId || "")}" maxlength="40" placeholder="Leave blank for the default voice" autocomplete="off" spellcheck="false">
                            `}
                        </section>
                        <section class="hx-panel hx-panel-ink">
                            <h2>Kitchen</h2>
                            <p>A placed order leaves through the webhook. Send the ticket to the kitchen when the menu cannot close it.</p>
                            <label class="hx-label" for="hx-phone">Kitchen phone</label>
                            <input id="hx-phone" class="hx-field" data-field="managerPhone" type="tel" value="${esc(draft.managerPhone || "")}" maxlength="32" placeholder="+1 718 555 0134" autocomplete="off">
                            <label class="hx-label" for="hx-hook">Webhook</label>
                            <input id="hx-hook" class="hx-field" data-field="webhook" type="url" value="${esc(draft.webhook || "")}" maxlength="240" placeholder="https://" autocomplete="off">
                        </section>
                    </aside>
                </div>
                <form class="hx-ask">
                    <label class="hx-label" for="hx-question">Ask, or order</label>
                    <div class="hx-ask-row">
                        <input id="hx-question" data-field="question" value="${esc(question)}" maxlength="400" placeholder="I'll have the salmon and the butter pasta" autocomplete="off">
                        <button type="submit" class="hx-go">Ask</button>
                    </div>
                </form>
                ${answer ? `
                    <article class="${answer.known ? "hx-answer" : "hx-unknown"}">
                        ${answer.known ? `<p class="hx-cite">${esc(answer.title)}</p><p>${esc(answer.line)}</p>` : `<p class="hx-cite">Not on the menu</p><p>The kitchen can take this.</p>`}
                        <div class="hx-actions">
                            <button type="button" class="hx-go" data-action="hear">Hear it</button>
                            ${answer.known ? `<button type="button" class="hx-ghost" data-action="add-order">Add to the order</button>` : `<button type="button" class="hx-ghost" data-action="to-kitchen">Send to the kitchen</button>`}
                        </div>
                    </article>` : ""}
                <section class="hx-ticket">
                    <p class="hx-kicker">Order</p>
                    ${ticket.length ? `<ul class="hx-asks">
                        ${ticket.map(function (item) {
                            return `<li><span>${esc(item.off ? "Kitchen" : item.title)}</span> ${esc(item.line)} <button type="button" class="hx-ghost" data-action="remove-line" data-id="${esc(item.id)}">Remove</button></li>`;
                        }).join("")}
                    </ul>` : `<p>Nothing on the ticket yet.</p>`}
                    <div class="hx-actions">
                        <button type="button" class="hx-go" data-action="place-order">Place the order</button>
                        <button type="button" class="hx-ghost" data-action="to-kitchen">Send to the kitchen</button>
                    </div>
                </section>
                ${(draft.orders || []).length ? `
                    <ul class="hx-asks">
                        ${(draft.orders || []).slice(0, 4).map(function (order) {
                            const label = order.kind === "kitchen" ? "Kitchen" : "Placed";
                            return `<li>${esc((order.items || []).map(function (item) { return item.line; }).join(" · "))} <span>${order.sent ? "Sent" : "Held"} · ${label}</span></li>`;
                        }).join("")}
                    </ul>` : ""}
                <div class="hx-savebar">
                    <button type="button" class="hx-go hx-go-lg" data-action="save" ${saving ? "disabled" : ""}>${saving ? "Saving…" : "Save host"}</button>
                    <p class="hx-note" role="status">${esc(notice)}</p>
                </div>
            </div>`;
    }

    function paintQr() {
        const box = document.getElementById("hx-qr");
        if (!box || !door || !door.slug || typeof qrcode !== "function") {
            return;
        }
        const code = qrcode(0, "M");
        code.addData(scanDoor(door.slug));
        code.make();
        box.innerHTML = code.createSvgTag({ cellSize: 4, margin: 2 });
    }

    function render() {
        if (mode === "editor" && draft) {
            renderEditor();
            paintQr();
            return;
        }
        renderList();
    }

    function edit(next) {
        draft = withAgent(next);
        mode = "editor";
        last = null;
        question = "";
        ticket = [];
        notice = "";
        keyDraft = "";
        twilioDraft = "";
        logoDraft = "";
        door = null;
        render();
        loadDoor();
    }

    function findPiece(id) {
        return (draft && draft.pieces || []).find(function (piece) {
            return piece.id === id;
        }) || null;
    }

    function onInput(event) {
        const el = event.target;
        if (!draft || !el.getAttribute) {
            return;
        }
        const field = el.getAttribute("data-field");
        if (!field) {
            return;
        }
        if (field === "agentKey") {
            keyDraft = el.value;
            return;
        }
        if (field === "twilioToken") {
            twilioDraft = el.value;
            return;
        }
        draft.dirty = true;
        if (field === "piece-title" || field === "piece-text") {
            const piece = findPiece(el.getAttribute("data-id"));
            if (!piece) {
                return;
            }
            piece[field === "piece-title" ? "title" : "text"] = el.value;
            return;
        }
        if (field === "question") {
            question = el.value;
            return;
        }
        draft[field] = el.value;
    }

    function onChange(event) {
        const el = event.target;
        if (!draft || !el) {
            return;
        }
        if (el.name === "agent") {
            draft.agentProvider = el.value === "custom" ? "custom" : "openai";
            draft.dirty = true;
            render();
            return;
        }
        if (el.name !== "voice") {
            return;
        }
        draft.voiceSource = el.value === "plan" ? "plan" : "key";
        draft.dirty = true;
        render();
    }

    function onSubmit(event) {
        if (!event.target.classList || !event.target.classList.contains("hx-ask")) {
            return;
        }
        event.preventDefault();
        if (!draft) {
            return;
        }
        const field = event.target.querySelector("[data-field='question']");
        if (field) {
            question = field.value;
        }
        const asked = String(question || "").trim();
        if (!asked) {
            notice = "Ask about the menu, or tell the host the order.";
            render();
            return;
        }
        last = reply(draft, asked);
        notice = "";
        if (wantsOrder(asked)) {
            takeOrder(asked);
        }
        render();
    }

    function onClick(event) {
        const button = event.target.closest("[data-action]");
        if (!button) {
            return;
        }
        const action = button.getAttribute("data-action");
        if (action === "new") {
            holding = null;
            edit(blankHost());
            return;
        }
        if (action === "seat-sample") {
            holding = null;
            edit(diningRoom());
            return;
        }
        if (action === "resume" && holding) {
            edit(holding);
            return;
        }
        if (action === "discard") {
            holding = null;
            notice = "";
            render();
            return;
        }
        if (action === "open") {
            const share = button.getAttribute("data-share");
            const host = hosts.find(function (item) {
                return item.share === share;
            });
            if (!host) {
                return;
            }
            if (draft && draft.dirty) {
                holding = draft;
            }
            edit(clone(host));
            return;
        }
        if (action === "back") {
            if (draft && draft.dirty) {
                holding = draft;
            }
            mode = "list";
            notice = "";
            render();
            return;
        }
        if (action === "add-piece" && draft) {
            if ((draft.pieces || []).length >= 8) {
                return;
            }
            draft.pieces.push({ id: pieceId(), title: "", text: "" });
            draft.dirty = true;
            render();
            return;
        }
        if (action === "remove-piece" && draft) {
            const id = button.getAttribute("data-id");
            draft.pieces = (draft.pieces || []).filter(function (piece) {
                return piece.id !== id;
            });
            draft.dirty = true;
            render();
            return;
        }
        if (action === "upload-piece") {
            pendingPiece = button.getAttribute("data-id") || "";
            if (fileInput) {
                fileInput.click();
            }
            return;
        }
        if (action === "save") {
            notice = "";
            render();
            saveDraft().then(function (result) {
                notice = result && result.ok ? "Saved to your account." : ((result && result.message) || "Sign in to keep this host.");
                render();
            });
            return;
        }
        if (action === "hear") {
            speak(spoken(last));
            return;
        }
        if (action === "add-order" && last && last.known) {
            addLine(last.title, last.line, false);
            notice = "On the order.";
            render();
            return;
        }
        if (action === "remove-line") {
            const id = button.getAttribute("data-id");
            ticket = ticket.filter(function (item) {
                return item.id !== id;
            });
            render();
            return;
        }
        if (action === "place-order") {
            placeOrder();
            return;
        }
        if (action === "to-kitchen") {
            toKitchen();
            return;
        }
        if (action === "logo") {
            if (logoInput) {
                logoInput.click();
            }
            return;
        }
        if (action === "test-agent") {
            postAgent("test");
            return;
        }
        if (action === "publish-agent") {
            postAgent("publish");
            return;
        }
        if (action === "close-door") {
            postAgent("disable");
            return;
        }
        if (action === "download-qr") {
            downloadQr();
            return;
        }
        if (action === "copy-link" && door && door.slug) {
            copyValue(scanDoor(door.slug).replace("&from=qr", ""), "Link copied.");
            return;
        }
        if (action === "copy-embed" && door && door.slug) {
            copyValue(embedDoor(door.slug, draft && draft.name), "Embed copied.");
            return;
        }
        if (action === "copy-call") {
            copyValue(callHook(), "Webhook copied.");
        }
    }

    function copyValue(value, note) {
        const done = function () {
            notice = note;
            render();
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(done).catch(function () {
                notice = value;
                render();
            });
            return;
        }
        notice = value;
        render();
    }

    function downloadQr() {
        const svg = document.querySelector("#hx-qr svg");
        if (!svg || !door || !door.slug) {
            return;
        }
        const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = door.slug + "-host.svg";
        link.click();
        setTimeout(function () {
            URL.revokeObjectURL(link.href);
        }, 1000);
    }

    function loadDoor() {
        if (!draft) {
            return;
        }
        const slug = draft.doorSlug || "";
        const share = draft.share || "";
        if (!slug && !share) {
            door = null;
            return;
        }
        fetch("/api/host-agent", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "status", slug: slug, share: share })
        }).then(function (res) {
            return res.json();
        }).then(function (data) {
            if (!draft) {
                return;
            }
            door = data || null;
            if (data && data.slug && !draft.doorSlug) {
                draft.doorSlug = data.slug;
            }
            if (data && data.endpoint && !draft.agentEndpoint) {
                draft.agentEndpoint = data.endpoint;
            }
            if (data && data.provider) {
                draft.agentProvider = data.provider === "custom" ? "custom" : "openai";
            }
            if (data && data.line) {
                draft.agentLine = data.line;
            }
            render();
        }).catch(function () {});
    }

    function agentBody(action) {
        ensureShare();
        return {
            action: action,
            name: String(draft.name || "").trim(),
            slug: String(draft.doorSlug || "").trim() || String(draft.name || ""),
            share: draft.share || "",
            provider: draft.agentProvider === "custom" ? "custom" : "openai",
            model: draft.agentModel || "gpt-4o-mini",
            endpoint: draft.agentEndpoint || "",
            apiKey: keyDraft,
            twilioToken: twilioDraft,
            line: draft.agentLine || "",
            welcome: draft.agentWelcome || "",
            may: draft.agentMay || "",
            mayNot: draft.agentMayNot || "",
            color: draft.agentColor || "#0092a2",
            logo: logoDraft,
            pieces: draft.pieces || [],
            message: "Hello. What can you help me with?"
        };
    }

    function applyDoor(data) {
        door = data;
        if (!draft) {
            return Promise.resolve();
        }
        if (data && data.slug) {
            draft.doorSlug = data.slug;
        }
        if (data && data.provider) {
            draft.agentProvider = data.provider === "custom" ? "custom" : "openai";
        }
        if (data && data.model) {
            draft.agentModel = data.model;
        }
        if (data && data.endpoint) {
            draft.agentEndpoint = data.endpoint;
        }
        if (data && data.line) {
            draft.agentLine = data.line;
        }
        keyDraft = "";
        twilioDraft = "";
        const fields = {
            doorSlug: draft.doorSlug || "",
            agentProvider: draft.agentProvider,
            agentModel: draft.agentModel || "",
            agentEndpoint: draft.agentEndpoint || "",
            agentWelcome: draft.agentWelcome || "",
            agentMay: draft.agentMay || "",
            agentMayNot: draft.agentMayNot || "",
            agentColor: draft.agentColor || "#0092a2",
            agentLine: draft.agentLine || ""
        };
        const known = hosts.some(function (host) {
            return String(host.share || "").toUpperCase() === String(draft.share || "").toUpperCase();
        });
        if (!known || !draft.share || !Lab.patchHost) {
            return Promise.resolve();
        }
        return Lab.patchHost(draft.share, fields).then(function (result) {
            if (result && result.ok && result.host) {
                const reply = data && data.reply;
                draft = Object.assign(withAgent(clone(result.host)), { dirty: false });
                if (reply) {
                    door.reply = reply;
                }
                remember(result.host);
            }
        }).catch(function () {});
    }

    function postAgent(action) {
        if (!draft || doorBusy) {
            return;
        }
        if (action !== "disable" && !String(draft.name || "").trim()) {
            notice = "Name the host.";
            render();
            return;
        }
        doorBusy = action;
        notice = action === "test" ? "Testing the connection." : (action === "disable" ? "Closing the door." : "Publishing the door.");
        render();
        const body = action === "disable"
            ? { action: "disable", slug: draft.doorSlug || "", share: draft.share || "" }
            : agentBody(action);
        fetch("/api/host-agent", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body)
        }).then(function (res) {
            return res.text().then(function (raw) {
                let data = {};
                try {
                    data = JSON.parse(raw);
                } catch (err) {
                    data = { ok: false, message: "The door could not be saved." };
                }
                return data;
            });
        }).then(function (data) {
            doorBusy = "";
            if (!data || data.ok === false) {
                notice = (data && data.message) || "The door could not be saved.";
                render();
                return;
            }
            notice = action === "test" ? "The connection answered." : (action === "disable" ? "The door is closed." : "The door is open.");
            logoDraft = "";
            applyDoor(data).then(function () {
                render();
            });
        }).catch(function () {
            doorBusy = "";
            notice = "The door could not be saved.";
            render();
        });
    }

    root.addEventListener("input", onInput);
    root.addEventListener("change", onChange);
    root.addEventListener("submit", onSubmit);
    root.addEventListener("click", onClick);

    const logoInput = document.createElement("input");
    logoInput.type = "file";
    logoInput.accept = "image/png,image/jpeg,image/webp,image/gif";
    logoInput.hidden = true;
    document.body.appendChild(logoInput);
    logoInput.addEventListener("change", function () {
        const file = logoInput.files && logoInput.files[0];
        logoInput.value = "";
        if (!file || !draft) {
            return;
        }
        const reader = new FileReader();
        reader.onload = function () {
            const src = String(reader.result || "");
            if (src.length > 70000 || !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(src)) {
                notice = "Use a smaller PNG, JPEG, or WebP logo.";
                render();
                return;
            }
            logoDraft = src;
            notice = "Logo ready. Publish to put it on the door.";
            render();
        };
        reader.readAsDataURL(file);
    });

    if (fileInput) {
        fileInput.addEventListener("change", function () {
            const file = fileInput.files && fileInput.files[0];
            fileInput.value = "";
            const piece = findPiece(pendingPiece);
            pendingPiece = "";
            if (!file || !piece) {
                return;
            }
            const named = file.name || "";
            const textFile = /\.(txt|md|csv|json)$/i.test(named) || /^text\//.test(file.type || "");
            if (!textFile) {
                notice = "Upload a text file, or paste the menu.";
                render();
                return;
            }
            if (file.size > 200000) {
                notice = "That file is too long for one piece.";
                render();
                return;
            }
            const reader = new FileReader();
            reader.onload = function () {
                piece.text = String(reader.result || "").slice(0, 8000);
                if (!String(piece.title || "").trim()) {
                    piece.title = named.replace(/\.[^.]+$/, "").slice(0, 80);
                }
                if (draft) {
                    draft.dirty = true;
                }
                notice = "Added " + named + ".";
                render();
            };
            reader.readAsText(file);
        });
    }

    function open() {
        const box = document.getElementById("os-search");
        query = box ? String(box.value || "").trim().toLowerCase() : "";
        if (draft && draft.dirty) {
            holding = draft;
        }
        mode = "list";
        notice = "";
        return Lab.list().then(function (result) {
            hosts = result && result.ok ? result.hosts || [] : [];
            if (result && !result.ok && result.message) {
                notice = result.message;
            }
            render();
        }).catch(function () {
            notice = "Your hosts could not be loaded.";
            render();
        });
    }

    function search(value) {
        query = String(value || "").trim().toLowerCase();
        if (mode !== "list") {
            return;
        }
        render();
    }

    window.HorseradishHosts = { open: open, search: search };
})();
