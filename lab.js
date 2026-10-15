(function () {
    const Lab = window.HorseradishLab;
    if (!Lab) {
        return;
    }

    const door = document.getElementById("lab-door");
    const floor = document.getElementById("lab-floor");
    const empty = document.getElementById("lab-empty");
    const who = document.getElementById("lab-who");
    const note = document.getElementById("lab-note");
    const googleSlot = document.getElementById("google-slot");
    const buildBtn = document.getElementById("lab-build");
    const fleetBody = document.getElementById("os-fleet");
    const hostsBody = document.getElementById("os-hosts");
    const activityList = document.getElementById("os-activity");
    const logsList = document.getElementById("os-logs");
    const taskList = document.getElementById("os-task-list");
    const search = document.getElementById("os-search");
    const menu = document.getElementById("os-menu");
    const scrim = document.getElementById("os-scrim");
    let current = null;
    let hosts = [];
    let query = "";

    function showNote(text) {
        note.textContent = text || "";
    }

    function initials(name) {
        const parts = String(name || "HR").trim().split(/\s+/);
        return ((parts[0] || "H").charAt(0) + (parts[1] || "R").charAt(0)).toUpperCase();
    }

    function roleOf(host) {
        return host.specialty || (host.body ? host.body.charAt(0).toUpperCase() + host.body.slice(1) + " Host" : "Host");
    }

    function statusOf(host) {
        const knows = Boolean(host.specialty || host.fileName || host.site);
        if (!knows) {
            return "offline";
        }
        if (host.trigger === "phrase" || host.trigger === "page") {
            return "idle";
        }
        return "active";
    }

    function statusLabel(status) {
        if (status === "active") {
            return "Active";
        }
        if (status === "idle") {
            return "Idle";
        }
        return "Offline";
    }

    function isDeployed(host) {
        return Boolean(host.site || host.fileName);
    }

    function ago(fromIso) {
        const then = new Date(fromIso);
        if (Number.isNaN(then.getTime())) {
            return "just now";
        }
        const minutes = Math.max(0, Math.round((Date.now() - then.getTime()) / 60000));
        if (minutes < 1) {
            return "just now";
        }
        if (minutes === 1) {
            return "1 min ago";
        }
        if (minutes < 60) {
            return minutes + " mins ago";
        }
        const hours = Math.round(minutes / 60);
        if (hours === 1) {
            return "1 hour ago";
        }
        if (hours < 48) {
            return hours + " hours ago";
        }
        const days = Math.round(hours / 24);
        return days === 1 ? "1 day ago" : days + " days ago";
    }

    function stamp(fromIso) {
        const then = new Date(fromIso);
        if (Number.isNaN(then.getTime())) {
            return ago(fromIso);
        }
        return then.toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short"
        }) + " · " + ago(fromIso);
    }

    function logCopy(entry) {
        const name = entry.name || entry.share || "Host";
        if (entry.action === "rebuilt") {
            return name + " rebuilt";
        }
        if (entry.action === "redeployed") {
            return name + " redeployed";
        }
        if (entry.action === "deployed") {
            return name + " deployed";
        }
        return name + " built";
    }

    function logTone(action) {
        if (action === "redeployed" || action === "deployed") {
            return "active";
        }
        if (action === "rebuilt") {
            return "idle";
        }
        return "offline";
    }

    function activityCopy(host) {
        if (host.site) {
            return host.name + " is placed on " + host.site + ".";
        }
        if (host.fileName) {
            return host.name + " holds " + host.fileName + ".";
        }
        if (host.trigger === "phrase" && host.phrase) {
            return host.name + " waits for \"" + host.phrase + "\".";
        }
        if (host.trigger === "page" && host.page) {
            return host.name + " wakes on " + host.page + ".";
        }
        return host.name + " is on your shelf.";
    }

    function matches(host) {
        if (!query) {
            return true;
        }
        const blob = [host.name, host.share, host.specialty, host.body, host.site, host.fileName].join(" ").toLowerCase();
        return blob.indexOf(query) >= 0;
    }

    function mark(host) {
        const el = document.createElement("span");
        el.className = "os-host-mark";
        el.setAttribute("data-body", host.body || "square");
        el.textContent = String(host.name || "H").charAt(0).toUpperCase();
        return el;
    }

    function hostCell(host) {
        const wrap = document.createElement("div");
        wrap.className = "os-host";
        wrap.appendChild(mark(host));
        const copy = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = host.name || "Unnamed Host";
        const id = document.createElement("small");
        id.textContent = "ID: " + (host.share || "HOST-UNNAMED");
        copy.appendChild(name);
        copy.appendChild(id);
        wrap.appendChild(copy);
        return wrap;
    }

    function row(host) {
        const tr = document.createElement("tr");
        const status = statusOf(host);

        const details = document.createElement("td");
        details.appendChild(hostCell(host));

        const role = document.createElement("td");
        role.className = "os-role";
        role.textContent = roleOf(host);

        const state = document.createElement("td");
        const pill = document.createElement("span");
        pill.className = "os-status is-" + status;
        pill.textContent = statusLabel(status);
        state.appendChild(pill);

        const actions = document.createElement("td");
        const box = document.createElement("div");
        box.className = "os-actions";
        const wake = document.createElement("button");
        wake.type = "button";
        wake.className = "os-mini";
        wake.textContent = "Edit";
        wake.addEventListener("click", function () {
            Lab.wake(host);
        });
        const release = document.createElement("button");
        release.type = "button";
        release.className = "os-mini";
        release.textContent = "Release";
        release.addEventListener("click", function () {
            current = host.share === (current && current.share) ? null : current;
            Lab.forget(host.share).then(function () {
                paintFloor();
            });
        });
        box.appendChild(wake);
        box.appendChild(release);
        actions.appendChild(box);

        tr.appendChild(details);
        tr.appendChild(role);
        tr.appendChild(state);
        tr.appendChild(actions);
        return tr;
    }

    function fillTable(tbody, list) {
        if (!tbody) {
            return;
        }
        tbody.innerHTML = "";
        list.forEach(function (host) {
            tbody.appendChild(row(host));
        });
    }

    function fillActivity(el, list) {
        if (!el) {
            return;
        }
        el.innerHTML = "";
        if (!list.length) {
            const item = document.createElement("li");
            item.textContent = "No activity yet. Build a Host and it will show here.";
            el.appendChild(item);
            return;
        }
        list.slice(0, 8).forEach(function (host) {
            const item = document.createElement("li");
            const dot = document.createElement("span");
            dot.className = "os-dot is-" + statusOf(host);
            const copy = document.createElement("div");
            copy.appendChild(document.createTextNode(activityCopy(host)));
            const time = document.createElement("time");
            time.textContent = stamp(host.savedAt);
            copy.appendChild(time);
            item.appendChild(dot);
            item.appendChild(copy);
            el.appendChild(item);
        });
    }

    function fillLogs(el, logs) {
        if (!el) {
            return;
        }
        el.innerHTML = "";
        if (!logs.length) {
            const item = document.createElement("li");
            item.textContent = "No rebuilds or redeployments yet. Edit a Host and save it to the Portal.";
            el.appendChild(item);
            return;
        }
        logs.forEach(function (entry) {
            const item = document.createElement("li");
            const dot = document.createElement("span");
            dot.className = "os-dot is-" + logTone(entry.action);
            const copy = document.createElement("div");
            copy.appendChild(document.createTextNode(logCopy(entry)));
            const time = document.createElement("time");
            time.dateTime = entry.at || "";
            time.textContent = stamp(entry.at);
            copy.appendChild(time);
            item.appendChild(dot);
            item.appendChild(copy);
            el.appendChild(item);
        });
    }

    function fillTasks(list) {
        if (!taskList) {
            return;
        }
        taskList.innerHTML = "";
        if (!list.length) {
            const item = document.createElement("li");
            item.textContent = "No tasks yet. Place a Host on an asset, or edit one from the fleet.";
            taskList.appendChild(item);
            return;
        }
        list.forEach(function (host) {
            const item = document.createElement("li");
            const copy = document.createElement("div");
            const name = document.createElement("strong");
            name.textContent = host.name || "Unnamed Host";
            const meta = document.createElement("p");
            meta.className = "os-hint";
            meta.textContent = isDeployed(host)
                ? "Placed on an asset."
                : "Waiting to be placed.";
            copy.appendChild(name);
            copy.appendChild(meta);
            const wake = document.createElement("button");
            wake.type = "button";
            wake.className = "os-mini";
            wake.textContent = "Edit";
            wake.addEventListener("click", function () {
                Lab.wake(host);
            });
            item.appendChild(copy);
            item.appendChild(wake);
            taskList.appendChild(item);
        });
    }

    function paintWho(user) {
        const face = document.getElementById("os-face");
        const initialsEl = document.getElementById("os-initials");
        const nameEl = document.getElementById("os-user-name");
        const roleEl = document.getElementById("os-user-role");
        const perm = document.getElementById("os-perm-who");
        if (!user) {
            who.hidden = true;
            return;
        }
        who.hidden = false;
        if (user.picture && face) {
            face.src = user.picture;
            face.hidden = false;
            if (initialsEl) {
                initialsEl.hidden = true;
            }
        } else {
            if (face) {
                face.hidden = true;
            }
            if (initialsEl) {
                initialsEl.hidden = false;
                initialsEl.textContent = initials(user.name || user.email);
            }
        }
        if (nameEl) {
            nameEl.textContent = user.name || user.email || "Operator";
        }
        if (roleEl) {
            roleEl.textContent = "Log out";
        }
        if (perm) {
            perm.textContent = (user.name || user.email) + " holds this door.";
        }
    }

    function paintFloor() {
        return Lab.list().then(function (result) {
            hosts = result.ok ? result.hosts || [] : [];
            const logs = result.ok ? result.logs || [] : [];
            const shown = hosts.filter(matches);
            const active = hosts.filter(function (host) {
                return statusOf(host) === "active";
            }).length;
            const tasks = hosts.filter(isDeployed).length;

            document.getElementById("os-total").textContent = String(hosts.length);
            document.getElementById("os-active").textContent = String(active);
            document.getElementById("os-tasks").textContent = String(tasks);
            document.getElementById("os-total-meta").textContent = hosts.length === 1 ? "on this shelf" : "on this shelf";
            document.getElementById("os-active-meta").textContent = active ? "Online currently running" : "none currently running";
            document.getElementById("os-tasks-meta").textContent = tasks === 1 ? "placed on an asset" : "placed on an asset";

            if (!result.ok) {
                current = null;
                empty.hidden = false;
                empty.textContent = result.message || "The shelf is not mounted yet.";
                fillTable(fleetBody, []);
                fillTable(hostsBody, []);
                fillActivity(activityList, []);
                fillLogs(logsList, []);
                fillTasks([]);
                if (buildBtn) {
                    buildBtn.textContent = "+ Create New Host";
                }
                if (result.message) {
                    showNote(result.message);
                }
                return false;
            }

            showNote("");
            if (!hosts.length) {
                current = null;
                empty.hidden = false;
                empty.textContent = "No Host here yet. Go build one.";
            } else {
                empty.hidden = true;
                current = shown[0] || hosts[0];
            }

            fillTable(fleetBody, shown);
            fillTable(hostsBody, shown);
            if (logs.length) {
                fillLogs(activityList, logs.slice(0, 8));
            } else {
                fillActivity(activityList, shown.length ? shown : hosts);
            }
            fillLogs(logsList, logs);
            fillTasks(shown.length ? shown : hosts);
            return true;
        });
    }

    function showView(name) {
        document.querySelectorAll(".os-view").forEach(function (view) {
            view.hidden = view.getAttribute("data-view") !== name;
        });
        document.querySelectorAll("[data-os-view]").forEach(function (btn) {
            btn.classList.toggle("is-on", btn.getAttribute("data-os-view") === name);
        });
        closeRail();
    }

    function openRail() {
        document.body.classList.add("is-rail");
        if (menu) {
            menu.setAttribute("aria-expanded", "true");
            menu.setAttribute("aria-label", "Close menu");
        }
        if (scrim) {
            scrim.hidden = false;
        }
    }

    function closeRail() {
        document.body.classList.remove("is-rail");
        if (menu) {
            menu.setAttribute("aria-expanded", "false");
            menu.setAttribute("aria-label", "Open menu");
        }
        if (scrim) {
            scrim.hidden = true;
        }
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
            floor.hidden = false;
            paintWho(Lab.config().user);
            return paintFloor().then(function (opened) {
                if (opened) {
                    door.hidden = true;
                    return;
                }
                door.hidden = false;
                Lab.mountButton(googleSlot, function (result) {
                    if (!result.ok) {
                        showNote(result.message);
                        return;
                    }
                    if (result.message) {
                        showNote(result.message);
                    }
                    afterLogin();
                });
            });
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
            wakeCode(chip.getAttribute("data-preset"));
        });
    }

    document.querySelectorAll("[data-os-view]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            showView(btn.getAttribute("data-os-view"));
        });
    });

    if (search) {
        search.addEventListener("input", function () {
            query = String(search.value || "").trim().toLowerCase();
            const shown = hosts.filter(matches);
            fillTable(fleetBody, shown);
            fillTable(hostsBody, shown);
            fillTasks(shown);
            if (query) {
                showView("hosts");
            }
        });
    }

    if (menu) {
        menu.addEventListener("click", function () {
            if (document.body.classList.contains("is-rail")) {
                closeRail();
            } else {
                openRail();
            }
        });
    }
    if (scrim) {
        scrim.addEventListener("click", closeRail);
    }
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeRail();
        }
    });

    function leavePortal() {
        Lab.logout().then(function () {
            window.location.reload();
        });
    }

    if (who) {
        who.addEventListener("click", leavePortal);
    }
    const leave = document.getElementById("os-leave");
    if (leave) {
        leave.addEventListener("click", leavePortal);
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
    });
})();
