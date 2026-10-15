(function () {
    const Lab = window.HorseradishLab;
    if (!Lab) {
        return;
    }

    const door = document.getElementById("lab-door");
    const floor = document.getElementById("lab-floor");
    const stage = document.getElementById("lab-stage");
    const shelf = document.getElementById("lab-shelf");
    const grid = document.getElementById("lab-grid");
    const empty = document.getElementById("lab-empty");
    const who = document.getElementById("lab-who");
    const note = document.getElementById("lab-note");
    const googleSlot = document.getElementById("google-slot");
    const being = document.getElementById("host-being");
    const portrait = document.getElementById("host-portrait");
    const nameLive = document.getElementById("host-name-live");
    const moodLive = document.getElementById("host-mood");
    const shareLive = document.getElementById("host-share-live");
    const wakeLine = document.getElementById("lab-wake-line");
    const buildBtn = document.getElementById("lab-build");
    let current = null;
    let hosts = [];

    function showNote(text) {
        note.textContent = text || "";
    }

    function wakeCopy(host) {
        if (host.trigger === "phrase" && host.phrase) {
            return "Wakes on \"" + host.phrase + "\".";
        }
        if (host.trigger === "page" && host.page) {
            return "Wakes on " + host.page + ".";
        }
        return "Always-on. Quiet until you need it.";
    }

    function paintHost(host) {
        current = host || null;
        if (!host) {
            stage.hidden = true;
            return;
        }
        stage.hidden = false;
        const dock = document.getElementById("host-dock");
        if (dock) {
            dock.classList.add("in-view");
            dock.style.opacity = "1";
        }
        being.dataset.body = host.body || "square";
        being.dataset.stage = host.trigger === "always" || !host.trigger ? "always" : "conditional";
        being.classList.add("is-painted");
        being.classList.toggle("has-knowledge", Boolean(host.specialty || host.fileName || host.site));
        being.classList.toggle("has-portrait", Boolean(host.portrait));
        nameLive.textContent = host.name || "Unnamed";
        moodLive.textContent = host.specialty || "I'm your Host.";
        shareLive.textContent = host.share || "";
        wakeLine.textContent = wakeCopy(host);
        being.querySelectorAll("[data-kit]").forEach(function (el) {
            el.classList.add("is-on");
        });
        if (host.portrait) {
            portrait.src = host.portrait;
            portrait.hidden = false;
        } else {
            portrait.removeAttribute("src");
            portrait.hidden = true;
        }
        if (grid) {
            grid.querySelectorAll(".lab-card").forEach(function (el) {
                el.classList.toggle("is-current", el.getAttribute("data-share") === host.share);
            });
        }
    }

    function card(host) {
        const el = document.createElement("article");
        el.className = "stamp lab-card";
        el.setAttribute("data-share", host.share || "");
        if (current && host.share === current.share) {
            el.classList.add("is-current");
        }

        const preview = document.createElement("div");
        preview.className = "plant-preview";
        preview.setAttribute("data-body", host.body || "square");

        const shape = document.createElement("span");
        shape.className = "plant-shape";
        shape.setAttribute("aria-hidden", "true");

        const copy = document.createElement("div");
        const kicker = document.createElement("p");
        kicker.className = "share-kicker";
        kicker.textContent = host.share || "";
        const name = document.createElement("p");
        name.className = "plant-name";
        name.textContent = host.name || "Unnamed Host";
        const specialty = document.createElement("p");
        specialty.className = "plant-specialty";
        specialty.textContent = host.specialty || "";
        copy.appendChild(kicker);
        copy.appendChild(name);
        copy.appendChild(specialty);

        preview.appendChild(shape);
        preview.appendChild(copy);
        el.appendChild(preview);
        el.addEventListener("click", function () {
            paintHost(host);
        });
        return el;
    }

    function paintWho(user) {
        who.innerHTML = "";
        if (!user) {
            who.hidden = true;
            return;
        }
        who.hidden = false;
        if (user.picture) {
            const img = document.createElement("img");
            img.src = user.picture;
            img.alt = "";
            img.className = "lab-face";
            who.appendChild(img);
        }
        const name = document.createElement("p");
        name.textContent = user.name || user.email;
        who.appendChild(name);
        const out = document.createElement("button");
        out.type = "button";
        out.className = "text-chip";
        out.textContent = "Leave the Lab";
        out.addEventListener("click", function () {
            Lab.logout().then(function () {
                window.location.reload();
            });
        });
        who.appendChild(out);
    }

    function paintFloor() {
        return Lab.list().then(function (result) {
            grid.innerHTML = "";
            hosts = result.ok ? result.hosts || [] : [];
            if (!result.ok) {
                paintHost(null);
                empty.hidden = false;
                empty.textContent = result.message || "The shelf is not mounted yet.";
                shelf.hidden = true;
                buildBtn.textContent = "Build a Host";
                return;
            }
            if (!hosts.length) {
                paintHost(null);
                empty.hidden = false;
                empty.textContent = "No Host here yet. Go build one.";
                shelf.hidden = true;
                buildBtn.textContent = "Build a Host";
                return;
            }
            empty.hidden = true;
            buildBtn.textContent = "Build another";
            const shown = current && hosts.some(function (host) {
                return host.share === current.share;
            }) ? hosts.find(function (host) {
                return host.share === current.share;
            }) : hosts[0];
            paintHost(shown);
            if (hosts.length > 1) {
                shelf.hidden = false;
                hosts.forEach(function (host) {
                    grid.appendChild(card(host));
                });
            } else {
                shelf.hidden = true;
            }
        });
    }

    function afterLogin() {
        document.body.classList.add("lab-open");
        const pending = Lab.takePending();
        const go = pending
            ? Lab.save(pending).then(function (result) {
                if (!result.ok) {
                    showNote(result.message);
                }
            })
            : Promise.resolve();
        return go.then(function () {
            door.hidden = true;
            floor.hidden = false;
            paintWho(Lab.config().user);
            return paintFloor();
        });
    }

    const p2p = document.getElementById("p2p-form");
    const shareIn = document.getElementById("share-in");

    function wakeCode(code) {
        const key = String(code || "").trim();
        if (!key) {
            showNote("Give it a share code.");
            return;
        }
        window.location.href = "index.html?wake=" + encodeURIComponent(key) + "#factory";
    }

    if (p2p) {
        p2p.addEventListener("submit", function (event) {
            event.preventDefault();
            wakeCode(shareIn && shareIn.value);
        });
        p2p.addEventListener("click", function (event) {
            const chip = event.target.closest("[data-preset]");
            if (!chip) {
                return;
            }
            const preset = chip.getAttribute("data-preset");
            if (shareIn) {
                shareIn.value = preset;
            }
            wakeCode(preset);
        });
    }

    document.getElementById("lab-wake").addEventListener("click", function () {
        if (current) {
            Lab.wake(current);
        }
    });
    document.getElementById("lab-release").addEventListener("click", function () {
        if (!current) {
            return;
        }
        const share = current.share;
        current = null;
        Lab.forget(share).then(function () {
            paintFloor();
        });
    });

    Lab.load().then(function (cfg) {
        if (cfg.user) {
            return afterLogin();
        }
        door.hidden = false;
        floor.hidden = true;
        Lab.mountButton(googleSlot, function (result) {
            if (!result.ok) {
                showNote(result.message);
                return;
            }
            afterLogin();
        });
        if (!cfg.clientId) {
            showNote("");
        }
    });
})();
