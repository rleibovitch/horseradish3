(function () {
    const params = new URLSearchParams(location.search);
    const slug = String(params.get("h") || "").trim().toLowerCase();
    const who = document.getElementById("who");
    const welcome = document.getElementById("welcome");
    const status = document.getElementById("status");
    const thread = document.getElementById("thread");
    const form = document.getElementById("talk");
    const say = document.getElementById("say");
    const send = document.getElementById("send");
    const mic = document.getElementById("mic");
    const logoWrap = document.getElementById("logo-wrap");
    const logo = document.getElementById("logo");
    const history = [];
    let open = false;
    let pending = false;
    let lastAt = 0;
    let hearing = null;

    function sessionId() {
        const key = "hr-host-" + slug;
        let id = "";
        try {
            id = sessionStorage.getItem(key) || "";
        } catch (err) {
            id = "";
        }
        if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
            id = "v" + Math.random().toString(36).slice(2) + Date.now().toString(36);
            try {
                sessionStorage.setItem(key, id);
            } catch (err) {}
        }
        return id;
    }

    function paint(host) {
        const color = /^#[0-9a-fA-F]{6}$/.test(host.color || "") ? host.color : "#0092a2";
        document.documentElement.style.setProperty("--brand", color);
        who.textContent = host.name || "Host";
        document.title = (host.name || "Host") + " · HOST by Horseradish";
        welcome.textContent = host.welcome || "Ask in the language you would use with the person at the door.";
        const src = String(host.logo || "");
        if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src)) {
            logo.src = src;
            logo.alt = host.name || "Host";
            logoWrap.hidden = false;
        }
    }

    function add(kind, text) {
        const item = document.createElement("li");
        item.className = kind;
        item.textContent = text;
        thread.appendChild(item);
        item.scrollIntoView({ block: "nearest" });
    }

    function shut(message) {
        open = false;
        status.textContent = message;
        say.disabled = true;
        send.disabled = true;
        mic.disabled = true;
    }

    function speak(text) {
        if (!window.speechSynthesis) {
            return;
        }
        window.speechSynthesis.cancel();
        const line = new SpeechSynthesisUtterance(text);
        line.rate = 1;
        window.speechSynthesis.speak(line);
    }

    function sendMessage(text, mode) {
        const message = String(text || "").trim();
        if (!open || pending || !message) {
            return;
        }
        pending = true;
        send.disabled = true;
        status.textContent = mode === "voice" ? "Listening to the reply." : "The host is answering.";
        add("mine", message);
        say.value = "";
        const now = Date.now();
        const gap = lastAt ? Math.min(120000, now - lastAt) : 0;
        lastAt = now;
        const body = {
            h: slug,
            message: message,
            history: history.slice(-8),
            session: sessionId(),
            mode: mode === "voice" ? "voice" : "text",
            gap: gap
        };
        fetch("/api/host-talk", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body)
        }).then(function (res) {
            return res.text().then(function (raw) {
                try {
                    return JSON.parse(raw);
                } catch (err) {
                    return { ok: false, message: "The Host could not answer that." };
                }
            });
        }).then(function (data) {
            pending = false;
            send.disabled = false;
            if (!data || !data.ok || !data.reply) {
                status.textContent = (data && data.message) || "The Host could not answer that.";
                return;
            }
            history.push({ role: "user", content: message });
            history.push({ role: "assistant", content: data.reply });
            while (history.length > 8) {
                history.shift();
            }
            add("theirs", data.reply);
            status.textContent = mode === "voice" ? "Speaking." : "Ask another question.";
            if (mode === "voice") {
                speak(data.reply);
            }
        }).catch(function () {
            pending = false;
            send.disabled = false;
            status.textContent = "The Host could not answer that.";
        });
    }

    form.addEventListener("submit", function (event) {
        event.preventDefault();
        sendMessage(say.value, "text");
    });

    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) {
        mic.hidden = true;
    } else {
        const ear = new Rec();
        ear.lang = "en-US";
        ear.interimResults = true;
        ear.onresult = function (event) {
            let text = "";
            let final = false;
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
                text += event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    final = true;
                }
            }
            say.value = text;
            if (final) {
                hearing = null;
                mic.setAttribute("aria-pressed", "false");
                sendMessage(text, "voice");
            }
        };
        ear.onerror = function () {
            hearing = null;
            mic.setAttribute("aria-pressed", "false");
            status.textContent = "The microphone stayed off. Type the question instead.";
        };
        ear.onend = function () {
            mic.setAttribute("aria-pressed", "false");
        };
        mic.addEventListener("click", function () {
            if (hearing) {
                ear.stop();
                hearing = null;
                mic.setAttribute("aria-pressed", "false");
                return;
            }
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            hearing = ear;
            mic.setAttribute("aria-pressed", "true");
            status.textContent = "Listening.";
            try {
                ear.start();
            } catch (err) {
                status.textContent = "The microphone stayed off. Type the question instead.";
            }
        });
    }

    if (!slug) {
        shut("This door is not open yet.");
        return;
    }

    fetch("/api/host-door?h=" + encodeURIComponent(slug)).then(function (res) {
        return res.text().then(function (raw) {
            try {
                return JSON.parse(raw);
            } catch (err) {
                return { ok: false, message: "This door is not open yet." };
            }
        });
    }).then(function (data) {
        if (!data || !data.ok || !data.host) {
            shut((data && data.message) || "This door is not open yet.");
            return;
        }
        paint(data.host);
        if (!data.host.enabled) {
            shut("This Host is closed.");
            return;
        }
        open = true;
        say.disabled = false;
        send.disabled = false;
        mic.disabled = false;
        status.textContent = "Speak, or type.";
        if (params.get("from") === "qr") {
            const key = "hr-scan-" + slug;
            let seen = "";
            try {
                seen = sessionStorage.getItem(key) || "";
            } catch (err) {
                seen = "";
            }
            if (!seen) {
                try {
                    sessionStorage.setItem(key, "1");
                } catch (err) {}
                fetch("/api/host-door", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ event: "scan", h: slug, session: sessionId() })
                }).catch(function () {});
            }
        }
    }).catch(function () {
        shut("This door is not open yet.");
    });
})();
