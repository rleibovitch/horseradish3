(function () {
    const Lab = window.HorseradishLab;
    if (!Lab) {
        return;
    }

    const door = document.getElementById("lab-door");
    const floor = document.getElementById("lab-floor");
    const grid = document.getElementById("lab-grid");
    const empty = document.getElementById("lab-empty");
    const who = document.getElementById("lab-who");
    const note = document.getElementById("lab-note");
    const googleSlot = document.getElementById("google-slot");

    function showNote(text) {
        note.textContent = text || "";
    }

    function card(host) {
        const el = document.createElement("article");
        el.className = "stamp lab-card";

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

        const actions = document.createElement("div");
        actions.className = "lab-card-actions";
        const wakeBtn = document.createElement("button");
        wakeBtn.type = "button";
        wakeBtn.className = "mini-stamp";
        wakeBtn.textContent = "Wake";
        wakeBtn.addEventListener("click", function () {
            Lab.wake(host);
        });
        const forgetBtn = document.createElement("button");
        forgetBtn.type = "button";
        forgetBtn.className = "text-chip";
        forgetBtn.textContent = "Release";
        forgetBtn.addEventListener("click", function () {
            Lab.forget(host.share).then(function () {
                paintFloor();
            });
        });
        actions.appendChild(wakeBtn);
        actions.appendChild(forgetBtn);

        el.appendChild(preview);
        el.appendChild(actions);
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
            if (!result.ok) {
                empty.hidden = false;
                empty.textContent = result.message || "The shelf is not mounted yet.";
                return;
            }
            if (!result.hosts.length) {
                empty.hidden = false;
                empty.textContent = "No Hosts on this shelf. Go build one.";
                return;
            }
            empty.hidden = true;
            result.hosts.forEach(function (host) {
                grid.appendChild(card(host));
            });
        });
    }

    function afterLogin() {
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
            showNote("Next: create the Horseradish OAuth client in Google Cloud, then put GOOGLE_CLIENT_ID on Vercel.");
        }
    });
})();
