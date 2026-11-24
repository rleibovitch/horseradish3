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
        return {
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
        };
    }

    function blankHost() {
        return {
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
        };
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
                <p class="hx-meta">${esc(voiceLabel(host))}</p>
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
                <p class="hx-kicker">Hosts</p>
                <div class="hx-hero-row">
                    <h1>A host knows <span class="hx-block">one library.</span></h1>
                    <button type="button" class="hx-go hx-go-lg" data-action="new">New host</button>
                </div>
                <p class="hx-lead">Upload the menu. The host answers from it, places the order, or sends the ticket to the kitchen.</p>
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

    function renderEditor() {
        const pieces = draft.pieces || [];
        const plan = draft.voiceSource === "plan";
        const answer = last;
        root.innerHTML = `
            <div class="hx">
                <button type="button" class="hx-ghost" data-action="back">All hosts</button>
                <p class="hx-kicker">${esc(draft.libraryName || "Library")}</p>
                <input class="hx-name" data-field="name" value="${esc(draft.name || "")}" placeholder="Name the host" maxlength="40" autocomplete="off">
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

    function render() {
        if (mode === "editor" && draft) {
            renderEditor();
            return;
        }
        renderList();
    }

    function edit(next) {
        draft = next;
        mode = "editor";
        last = null;
        question = "";
        ticket = [];
        notice = "";
        render();
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
        if (!draft || !el || el.name !== "voice") {
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
        }
    }

    root.addEventListener("input", onInput);
    root.addEventListener("change", onChange);
    root.addEventListener("submit", onSubmit);
    root.addEventListener("click", onClick);

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
