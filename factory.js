(function () {
    const factory = document.getElementById("factory");
    if (!factory) {
        return;
    }

    const PRESETS = {
        "HOST-HORSERADISH": {
            name: "Horseradish",
            body: "square",
            prompt: "A cute 3D cube Host named Horseradish, black body, green leaves on top, cream paper light, stamp-shadow, looking straight at you.",
            specialty: "Specialized knowledge, shared.",
            site: "https://horseradish.ai",
            fileName: "",
            fileText: "",
            trigger: "always",
            phrase: "",
            page: "",
            portrait: ""
        },
        "HOST-HOUSE": {
            name: "House",
            body: "square",
            prompt: "A square Host for a restaurant. Knows the menu, the hours, the table.",
            specialty: "The menu, the hours, the table.",
            site: "",
            fileName: "",
            fileText: "",
            trigger: "always",
            phrase: "",
            page: "",
            portrait: ""
        },
        "HOST-FLOOR": {
            name: "Floor",
            body: "circle",
            prompt: "A circle Host for a storefront. Knows what you have and when you are open.",
            specialty: "What you have. When you're open.",
            site: "",
            fileName: "",
            fileText: "",
            trigger: "always",
            phrase: "",
            page: "",
            portrait: ""
        },
        "HOST-LISTING": {
            name: "Listing",
            body: "triangle",
            prompt: "A triangle Host for a real estate agent. Knows the house, the block, the showing.",
            specialty: "The house, the block, the showing.",
            site: "",
            fileName: "",
            fileText: "",
            trigger: "always",
            phrase: "",
            page: "",
            portrait: ""
        }
    };

    const BENCH_KEY = "horseradish-host-bench";

    const nameInput = document.getElementById("host-name");
    const promptInput = document.getElementById("nano-prompt");
    const specialtyInput = document.getElementById("specialty");
    const siteInput = document.getElementById("site-url");
    const phraseInput = document.getElementById("trigger-phrase");
    const pageInput = document.getElementById("trigger-page");
    const portraitInput = document.getElementById("portrait-file");
    const knowledgeInput = document.getElementById("knowledge-file");
    const being = document.getElementById("host-being");
    const portraitImg = document.getElementById("host-portrait");
    const nameLive = document.getElementById("host-name-live");
    const moodLive = document.getElementById("host-mood");
    const shareLive = document.getElementById("host-share-live");
    const shareOut = document.getElementById("share-out");
    const plantPreview = document.getElementById("plant-preview");
    const plantName = document.getElementById("plant-name");
    const plantSpecialty = document.getElementById("plant-specialty");
    const plantWake = document.getElementById("plant-wake");
    const fileStatus = document.querySelector("[data-file-status]");
    const outputMsg = document.getElementById("output-msg");
    const embedPreview = document.getElementById("embed-preview");
    const dialog = document.getElementById("login-dialog");
    const benchList = document.getElementById("bench-list");
    const shareIn = document.getElementById("share-in");

    const state = {
        name: "",
        body: "square",
        prompt: "",
        specialty: "",
        site: "",
        fileName: "",
        fileText: "",
        trigger: "always",
        phrase: "",
        page: "",
        portrait: "",
        card: "build",
        formed: false,
        brained: false
    };

    function slugName(name) {
        const slug = String(name || "")
            .replace(/[^A-Za-z0-9]/g, "")
            .slice(0, 16)
            .toUpperCase();
        return slug || "UNNAMED";
    }

    function shareCode() {
        return "HOST-" + slugName(state.name);
    }

    function readBody() {
        const picked = factory.querySelector("input[name='body']:checked");
        return picked ? picked.value : "square";
    }

    function readTrigger() {
        const picked = factory.querySelector("input[name='trigger']:checked");
        return picked ? picked.value : "always";
    }

    function gather() {
        state.name = (nameInput.value || "").trim();
        state.body = readBody();
        state.prompt = (promptInput.value || "").trim();
        state.specialty = (specialtyInput.value || "").trim();
        state.site = (siteInput.value || "").trim();
        state.trigger = readTrigger();
        state.phrase = (phraseInput.value || "").trim();
        state.page = (pageInput.value || "").trim();
    }

    function paintFromPrompt(prompt) {
        const text = (prompt || "").toLowerCase();
        if (/\btriangle\b/.test(text)) {
            setBody("triangle");
        } else if (/\bcircle\b|\bdot\b|\bround\b/.test(text)) {
            setBody("circle");
        } else if (/\bsquare\b|\bbox\b|\brect\b|\bcube\b/.test(text)) {
            setBody("square");
        } else if (/\bhumanoid\b|\bhuman\b|\bperson\b|\bfigure\b/.test(text)) {
            setBody("humanoid");
        } else if (prompt) {
            setBody("humanoid");
        }
        const paint = pickPaint(text);
        if (paint) {
            being.style.setProperty("--paint", paint);
            being.classList.add("is-painted");
        } else {
            being.style.removeProperty("--paint");
            being.classList.remove("is-painted");
        }
    }

    function pickPaint(text) {
        if (/\bgold\b|\bamber\b|\bcream\b/.test(text)) {
            return "#e0a325";
        }
        if (/\bteal\b|\bsea\b|\bblue\b/.test(text)) {
            return "#0092a2";
        }
        if (/\bcoral\b|\bred\b|\bhot\b/.test(text)) {
            return "#ff4d5a";
        }
        if (/\bpurple\b|\bink\b|\bviolet\b/.test(text)) {
            return "#c10078";
        }
        return "";
    }

    function normalizeBody(value) {
        if (value === "golda") {
            return "square";
        }
        if (value === "dot") {
            return "circle";
        }
        if (value === "whatever") {
            return "humanoid";
        }
        if (value === "circle" || value === "triangle" || value === "humanoid") {
            return value;
        }
        return "square";
    }

    function setBody(value) {
        const next = normalizeBody(value);
        const radio = factory.querySelector("input[name='body'][value='" + next + "']");
        if (radio) {
            radio.checked = true;
        }
        state.body = next;
    }

    function readWakeHost(key) {
        try {
            const raw = sessionStorage.getItem("horseradish-wake-host");
            if (!raw) {
                return null;
            }
            const host = JSON.parse(raw);
            sessionStorage.removeItem("horseradish-wake-host");
            const share = normalizeShare(host.share);
            if (host && (share === key || String(host.share || "").toUpperCase() === key)) {
                return host;
            }
        } catch (err) {}
        return null;
    }

    function fillHost(preset) {
        nameInput.value = preset.name || "";
        promptInput.value = preset.prompt || "";
        specialtyInput.value = preset.specialty || "";
        siteInput.value = preset.site || "";
        phraseInput.value = preset.phrase || "";
        pageInput.value = preset.page || "";
        setBody(normalizeBody(preset.body));
        const triggerRadio = factory.querySelector("input[name='trigger'][value='" + (preset.trigger || "always") + "']");
        if (triggerRadio) {
            triggerRadio.checked = true;
        }
        state.fileName = preset.fileName || "";
        state.fileText = preset.fileText || "";
        state.portrait = preset.portrait || "";
        if (state.portrait) {
            portraitImg.src = state.portrait;
            portraitImg.hidden = false;
        } else {
            portraitImg.removeAttribute("src");
            portraitImg.hidden = true;
        }
        if (fileStatus) {
            fileStatus.textContent = state.fileName ? ("Fed: " + state.fileName) : "No file yet.";
        }
        paintFromPrompt(preset.prompt || "");
        gather();
        state.formed = Boolean(state.name);
        state.brained = Boolean(state.specialty || state.fileName || state.site);
        showCard(state.brained ? "deploy" : (state.formed ? "brain" : "build"));
        setMsg((preset.name || "Host") + " woke. Peer to peer.");
        return true;
    }

    function normalizeShare(code) {
        return String(code || "").trim().toUpperCase().replace(/^HR-/, "HOST-");
    }

    function applyPreset(code) {
        const raw = String(code || "").trim().toUpperCase();
        const key = normalizeShare(raw);
        const fromKnown = PRESETS[key] || PRESETS[raw];
        const fromBench = loadBench().find(function (host) {
            return normalizeShare(host.share) === key || String(host.share || "").toUpperCase() === raw;
        });
        const fromWake = readWakeHost(key);
        const preset = fromKnown || fromBench || fromWake;
        if (preset) {
            return fillHost(preset);
        }
        if (window.HorseradishLab && HorseradishLab.loadHost) {
            setMsg("Asking the Lab for " + key + "…");
            HorseradishLab.loadHost(key).then(function (host) {
                if (host) {
                    fillHost(host);
                } else {
                    setMsg("No Host answers to that code. Try HOST-HORSERADISH, HOST-HOUSE, HOST-FLOOR, or HOST-LISTING.");
                }
            });
            return false;
        }
        setMsg("No Host answers to that code. Try HOST-HORSERADISH, HOST-HOUSE, HOST-FLOOR, or HOST-LISTING.");
        return false;
    }

    function mood() {
        if (!state.name && !state.specialty && !state.fileName && !state.site) {
            return "Build me. Teach me. Deploy me.";
        }
        if (!state.name) {
            return "A shape is forming. Give me a name.";
        }
        if (!state.specialty && !state.fileName && !state.site) {
            return "That's a shape. Give me knowledge.";
        }
        if (state.trigger === "phrase" && !state.phrase) {
            return "Brain is in. What phrase deploys me?";
        }
        if (state.trigger === "page" && !state.page) {
            return "Brain is in. Which page deploys me?";
        }
        if (state.trigger === "always") {
            return "I'm a Host. Always on. Deploy me.";
        }
        return "I'm a Host. Say the word. Deploy me.";
    }

    function render() {
        gather();
        being.dataset.body = state.body;
        being.dataset.stage = state.trigger === "always" ? "always" : "conditional";
        being.classList.toggle("has-portrait", Boolean(state.portrait));
        being.classList.toggle("has-knowledge", Boolean(state.specialty || state.fileName || state.site));
        nameLive.textContent = state.name || "Unnamed";
        moodLive.textContent = mood();
        const code = shareCode();
        shareOut.textContent = code;
        shareLive.textContent = code;
        if (plantPreview) {
            const host = spec();
            plantPreview.dataset.body = host.body;
            plantName.textContent = host.name;
            plantSpecialty.textContent = host.specialty;
            plantWake.textContent = host.trigger === "phrase" && host.phrase
                ? "Wakes on \"" + host.phrase + "\"."
                : host.trigger === "page" && host.page
                    ? "Wakes on " + host.page + "."
                    : "Always-on. Quiet until you need it.";
        }
        const built = isBuilt();
        const brained = isBrained();
        const wakeReady = state.trigger === "always" || (state.trigger === "phrase" && state.phrase) || (state.trigger === "page" && state.page);
        const deployed = built && brained && wakeReady;
        being.querySelectorAll("[data-kit]").forEach(function (el) {
            const kit = el.getAttribute("data-kit");
            const on = (kit === "build" && built) || (kit === "brain" && brained) || (kit === "deploy" && deployed);
            el.classList.toggle("is-on", on);
        });
        document.querySelectorAll("[data-assembly]").forEach(function (el) {
            const part = el.getAttribute("data-assembly");
            const on = (part === "build" && built) || (part === "brain" && brained) || (part === "deploy" && deployed);
            const locked = (part === "brain" && !built) || (part === "deploy" && !brained);
            el.classList.toggle("is-on", on);
            el.classList.toggle("is-locked", locked);
            el.classList.toggle("is-current", part === state.card);
            if (locked) {
                el.setAttribute("aria-disabled", "true");
            } else {
                el.removeAttribute("aria-disabled");
            }
        });
        document.querySelectorAll("[data-trigger-extra]").forEach(function (el) {
            el.hidden = el.getAttribute("data-trigger-extra") !== state.trigger;
        });
        paintCard();
    }

    function isBuilt() {
        return Boolean(state.formed && state.name);
    }

    function isBrained() {
        return Boolean(state.brained && (state.specialty || state.fileName || state.site));
    }

    function paintCard() {
        const cards = {
            build: document.getElementById("step-build"),
            brain: document.getElementById("step-brain"),
            deploy: document.getElementById("step-deploy")
        };
        Object.keys(cards).forEach(function (part) {
            const el = cards[part];
            if (!el) {
                return;
            }
            const current = part === state.card;
            el.hidden = !current;
            el.classList.toggle("is-current", current);
            if (current) {
                el.classList.add("in-view");
                el.style.opacity = "1";
            }
        });
        const dock = document.getElementById("host-dock");
        const grid = document.querySelector(".factory-grid");
        const atEnd = state.card === "deploy";
        if (dock) {
            dock.hidden = !atEnd;
        }
        if (grid) {
            grid.classList.toggle("has-dock", atEnd);
        }
    }

    function showCard(part) {
        if (part === "brain" && !isBuilt()) {
            part = "build";
        }
        if (part === "deploy" && !isBrained()) {
            part = isBuilt() ? "brain" : "build";
        }
        state.card = part;
        render();
        const el = document.getElementById("step-" + part);
        if (el && typeof el.scrollIntoView === "function") {
            el.scrollIntoView({ block: "start" });
            window.scrollBy(0, -88);
        }
    }

    function spec() {
        gather();
        return {
            name: state.name || "Unnamed Host",
            body: state.body,
            prompt: state.prompt,
            specialty: state.specialty || "A specialty still arriving",
            site: state.site,
            fileName: state.fileName,
            fileText: state.fileText.slice(0, 4000),
            trigger: state.trigger,
            phrase: state.phrase,
            page: state.page,
            portrait: state.portrait,
            share: shareCode(),
            peer: true,
            factory: "Horseradish Host Factory"
        };
    }

    function embedHtml(host) {
        const wake = host.trigger === "phrase"
            ? "Wakes on the phrase \"" + host.phrase + "\"."
            : host.trigger === "page"
                ? "Wakes on pages matching " + host.page + "."
                : "Always-on.";
        return [
            "<!-- Horseradish Host: " + host.name + " / " + host.share + " -->",
            "<div id=\"horseradish-host\" data-share=\"" + host.share + "\" data-body=\"" + host.body + "\">",
            "  <p><strong>" + host.name + "</strong> — a Horseradish Host.</p>",
            "  <p>" + host.specialty + "</p>",
            "  <p>" + wake + " Peer to peer. Share code " + host.share + ".</p>",
            "</div>",
            "<style>",
            "#horseradish-host{font-family:'Space Grotesk',sans-serif;background:#fafaf8;color:#1a1a2e;border:2px solid #1a1a2e;box-shadow:6px 6px 0 #1a1a2e;padding:1rem 1.1rem;max-width:22rem;}",
            "#horseradish-host p{margin:0 0 .4rem;}#horseradish-host p:last-child{margin:0;color:#5c5a70;font-size:.92rem;}",
            "</style>"
        ].join("\n");
    }

    function extensionFiles(host) {
        const matches = host.trigger === "page" && host.page
            ? ["*://" + host.page.replace(/^https?:\/\//, "") + "/*"]
            : ["<all_urls>"];
        const manifest = {
            manifest_version: 3,
            name: host.name + " — a Horseradish Host",
            version: "0.1.0",
            description: host.specialty + " Share code " + host.share + ".",
            content_scripts: [{
                matches: matches,
                js: ["content.js"],
                run_at: "document_idle"
            }]
        };
        const content = [
            "(function () {",
            "  var host = " + JSON.stringify({
                name: host.name,
                specialty: host.specialty,
                share: host.share,
                trigger: host.trigger,
                phrase: host.phrase,
                body: host.body
            }) + ";",
            "  if (host.trigger === 'phrase' && host.phrase) {",
            "    var hay = (document.body && document.body.innerText || '').toLowerCase();",
            "    if (hay.indexOf(host.phrase.toLowerCase()) === -1) { return; }",
            "  }",
            "  var el = document.createElement('div');",
            "  el.setAttribute('data-horseradish-host', host.share);",
            "  el.textContent = host.name + ' — ' + host.specialty + ' · ' + host.share;",
            "  el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646;background:#fafaf8;color:#1a1a2e;border:2px solid #1a1a2e;box-shadow:5px 5px 0 #1a1a2e;padding:10px 12px;font:600 12px/1.3 \"Space Grotesk\",sans-serif;max-width:16rem;';",
            "  document.documentElement.appendChild(el);",
            "})();"
        ].join("\n");
        const readme = [
            host.name + " — a Horseradish Host",
            "Share code: " + host.share,
            "Specialty: " + host.specialty,
            "Trigger: " + host.trigger + (host.phrase ? " / " + host.phrase : "") + (host.page ? " / " + host.page : ""),
            "",
            "Load unpacked in Chrome: chrome://extensions → Developer mode → Load unpacked.",
            "Made in the Horseradish Host Factory."
        ].join("\n");
        return {
            "manifest.json": JSON.stringify(manifest, null, 2),
            "content.js": content,
            "host.json": JSON.stringify(host, null, 2),
            "README.txt": readme
        };
    }

    function crcTable() {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n += 1) {
            let c = n;
            for (let k = 0; k < 8; k += 1) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[n] = c >>> 0;
        }
        return table;
    }

    const CRC = crcTable();

    function crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i += 1) {
            c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
        }
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    function u16(n) {
        return [n & 255, (n >>> 8) & 255];
    }

    function u32(n) {
        return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    }

    function zipStore(files) {
        const enc = new TextEncoder();
        const locals = [];
        const centrals = [];
        let offset = 0;
        Object.keys(files).forEach(function (name) {
            const nameBytes = enc.encode(name);
            const data = enc.encode(files[name]);
            const crc = crc32(data);
            const local = []
                .concat([0x50, 0x4B, 0x03, 0x04])
                .concat(u16(20))
                .concat(u16(0))
                .concat(u16(0))
                .concat(u16(0))
                .concat(u16(0))
                .concat(u32(crc))
                .concat(u32(data.length))
                .concat(u32(data.length))
                .concat(u16(nameBytes.length))
                .concat(u16(0));
            locals.push({ local: local, nameBytes: nameBytes, data: data });
            const central = []
                .concat([0x50, 0x4B, 0x01, 0x02])
                .concat(u16(20))
                .concat(u16(20))
                .concat(u16(0))
                .concat(u16(0))
                .concat(u16(0))
                .concat(u16(0))
                .concat(u32(crc))
                .concat(u32(data.length))
                .concat(u32(data.length))
                .concat(u16(nameBytes.length))
                .concat(u16(0))
                .concat(u16(0))
                .concat(u16(0))
                .concat(u16(0))
                .concat(u32(0))
                .concat(u32(offset));
            centrals.push({ central: central, nameBytes: nameBytes });
            offset += local.length + nameBytes.length + data.length;
        });
        const chunks = [];
        locals.forEach(function (part) {
            chunks.push(Uint8Array.from(part.local), part.nameBytes, part.data);
        });
        const centralStart = offset;
        centrals.forEach(function (part) {
            chunks.push(Uint8Array.from(part.central), part.nameBytes);
            offset += part.central.length + part.nameBytes.length;
        });
        const count = locals.length;
        const end = []
            .concat([0x50, 0x4B, 0x05, 0x06])
            .concat(u16(0))
            .concat(u16(0))
            .concat(u16(count))
            .concat(u16(count))
            .concat(u32(offset - centralStart))
            .concat(u32(centralStart))
            .concat(u16(0));
        chunks.push(Uint8Array.from(end));
        let total = 0;
        chunks.forEach(function (c) {
            total += c.length;
        });
        const out = new Uint8Array(total);
        let at = 0;
        chunks.forEach(function (c) {
            out.set(c, at);
            at += c.length;
        });
        return out;
    }

    function download(filename, bytes, type) {
        const blob = new Blob([bytes], { type: type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 500);
    }

    function setMsg(text) {
        const note = text || "";
        if (outputMsg) {
            outputMsg.textContent = note;
        }
        document.querySelectorAll("[data-card-msg]").forEach(function (el) {
            el.textContent = note;
        });
    }

    function loadBench() {
        try {
            const raw = localStorage.getItem(BENCH_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (err) {
            return [];
        }
    }

    function saveBench(host) {
        const list = loadBench().filter(function (item) {
            return item.share !== host.share;
        });
        list.unshift({
            name: host.name,
            share: host.share,
            body: host.body,
            specialty: host.specialty,
            prompt: host.prompt,
            site: host.site,
            fileName: host.fileName,
            fileText: host.fileText,
            trigger: host.trigger,
            phrase: host.phrase,
            page: host.page,
            portrait: host.portrait
        });
        localStorage.setItem(BENCH_KEY, JSON.stringify(list.slice(0, 8)));
        renderBench();
    }

    function renderBench() {
        const list = loadBench();
        if (!list.length) {
            benchList.hidden = true;
            benchList.innerHTML = "";
            return;
        }
        benchList.hidden = false;
        benchList.innerHTML = list.map(function (host) {
            return "<li><button type=\"button\" class=\"text-chip\" data-preset=\"" + host.share + "\">" + host.share + "</button> " + host.name + " — " + host.specialty + "</li>";
        }).join("");
    }

    function copyEmbed() {
        const html = embedHtml(spec());
        embedPreview.hidden = false;
        embedPreview.textContent = html;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(html).then(function () {
                setMsg("Embed HTML copied. Plant it on a site.");
            }).catch(function () {
                setMsg("Copy failed. The snippet is below. Select it.");
            });
        } else {
            setMsg("The snippet is below. Select it.");
        }
    }

    function downloadZip() {
        const host = spec();
        const bytes = zipStore(extensionFiles(host));
        const file = slugName(host.name).toLowerCase() + "-host.zip";
        download(file, bytes, "application/zip");
        setMsg("ZIP ready. Load it unpacked as an extension.");
    }

    factory.addEventListener("input", render);
    factory.addEventListener("change", render);

    document.getElementById("paint-btn").addEventListener("click", function () {
        gather();
        if (!state.name) {
            setMsg("Give it a name first.");
            return;
        }
        paintFromPrompt(promptInput.value);
        state.formed = true;
        setMsg("Formed. Next: knowledge.");
        showCard("brain");
    });

    document.getElementById("brain-btn").addEventListener("click", function () {
        gather();
        if (!state.specialty && !state.fileName && !state.site) {
            setMsg("Give it a specialty, a file, or a site first.");
            return;
        }
        state.brained = true;
        setMsg("Knowledge is in. Place it on your asset.");
        showCard("deploy");
    });

    portraitInput.addEventListener("change", function () {
        const file = portraitInput.files && portraitInput.files[0];
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = function () {
            state.portrait = String(reader.result || "");
            portraitImg.src = state.portrait;
            portraitImg.hidden = false;
            render();
            setMsg("Face taken. The Host is wearing it.");
        };
        reader.readAsDataURL(file);
    });

    knowledgeInput.addEventListener("change", function () {
        const file = knowledgeInput.files && knowledgeInput.files[0];
        if (!file) {
            state.fileName = "";
            state.fileText = "";
            fileStatus.textContent = "No file yet.";
            render();
            return;
        }
        state.fileName = file.name;
        fileStatus.textContent = "Fed: " + file.name;
        if (file.size < 120000 && /text|json|csv|html|markdown/i.test(file.type || file.name)) {
            const reader = new FileReader();
            reader.onload = function () {
                state.fileText = String(reader.result || "").slice(0, 4000);
                render();
            };
            reader.readAsText(file);
        } else {
            state.fileText = "";
            render();
        }
        setMsg("Knowledge is in. The Host is chewing.");
    });

    const p2pForm = document.getElementById("p2p-form");
    if (p2pForm) {
        p2pForm.addEventListener("submit", function (event) {
            event.preventDefault();
            applyPreset(shareIn.value);
        });
    }

    document.addEventListener("click", function (event) {
        const stamp = event.target.closest("[data-assembly]");
        if (stamp) {
            event.preventDefault();
            if (stamp.classList.contains("is-locked")) {
                return;
            }
            showCard(stamp.getAttribute("data-assembly"));
            return;
        }
        const chip = event.target.closest("[data-preset]");
        if (!chip) {
            return;
        }
        const preset = chip.getAttribute("data-preset");
        if (shareIn) {
            shareIn.value = preset;
        }
        applyPreset(preset);
    });

    document.getElementById("copy-embed").addEventListener("click", copyEmbed);
    document.getElementById("download-zip").addEventListener("click", downloadZip);
    const loginNote = document.getElementById("login-note");
    const googleSlot = document.getElementById("google-slot");

    function openLogin() {
        if (window.HorseradishLab) {
            HorseradishLab.load().then(function () {
                HorseradishLab.mountButton(googleSlot, function (result) {
                    if (!result.ok) {
                        if (loginNote) {
                            loginNote.textContent = result.message || "Google did not let us in.";
                        }
                        return;
                    }
                    const pending = HorseradishLab.takePending() || spec();
                    HorseradishLab.save(pending).then(function (saved) {
                        saveBench(pending);
                        if (saved.ok) {
                            window.location.href = "lab.html";
                            return;
                        }
                        if (loginNote) {
                            loginNote.textContent = saved.message || "The Lab did not take it.";
                        }
                    });
                });
            });
        }
        if (typeof dialog.showModal === "function") {
            dialog.showModal();
        } else {
            setMsg("To save this, login to the portal.");
        }
    }

    document.getElementById("save-factory").addEventListener("click", function () {
        const host = spec();
        if (!window.HorseradishLab) {
            openLogin();
            return;
        }
        HorseradishLab.save(host).then(function (result) {
            if (result.ok) {
                saveBench(host);
                window.location.href = "lab.html";
                return;
            }
            if (result.needLogin) {
                openLogin();
                return;
            }
            saveBench(host);
            setMsg(result.message || "Kept on this bench. The Lab shelf is not mounted yet.");
        });
    });
    document.getElementById("login-close").addEventListener("click", function () {
        dialog.close();
    });
    document.getElementById("bench-save").addEventListener("click", function () {
        saveBench(spec());
        dialog.close();
        setMsg("Kept on this bench. The Lab still wants Google.");
    });

    render();
    renderBench();

    const wake = new URLSearchParams(window.location.search).get("wake");
    if (wake) {
        if (shareIn) {
            shareIn.value = wake;
        }
        applyPreset(wake);
    }
})();
