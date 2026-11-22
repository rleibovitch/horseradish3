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
    let pendingDelete = null;
    let pendingReply = null;
    let pendingCrawl = null;
    let crawlTick = null;

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
        return host.name + " is saved to your account.";
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
        release.className = "os-mini os-delete";
        release.setAttribute("aria-label", "Delete " + (host.name || "Host"));
        release.title = "Delete";
        release.innerHTML = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M9 3h6l1 2h7v2H1V5h7l1-2zm1 6h2v11h-2V9zm4 0h2v11h-2V9zM6 8h12v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8z\"/></svg><span>Delete</span>";
        release.addEventListener("click", function () {
            askDelete(host);
        });
        const crawl = document.createElement("button");
        crawl.type = "button";
        crawl.className = "os-mini";
        crawl.textContent = "Crawl";
        crawl.addEventListener("click", function () {
            openCrawl(host);
        });
        const connect = document.createElement("button");
        connect.type = "button";
        connect.className = "os-mini";
        connect.textContent = "Connect";
        connect.addEventListener("click", function () {
            openConnect(host);
        });
        if (host.inbox) {
            const open = document.createElement("a");
            open.className = "os-mini";
            open.href = "outside.html?in=" + encodeURIComponent(host.inbox);
            open.textContent = "Outside";
            box.appendChild(open);
        }
        box.appendChild(wake);
        box.appendChild(crawl);
        box.appendChild(connect);
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

    function fillTasks(notes) {
        if (!taskList) {
            return;
        }
        taskList.innerHTML = "";
        if (!notes.length) {
            const item = document.createElement("li");
            item.textContent = "No messages yet. Open a Host’s public page and send a message to see it here.";
            taskList.appendChild(item);
            return;
        }
        notes.forEach(function (note) {
            const item = document.createElement("li");
            const copy = document.createElement("div");
            const name = document.createElement("strong");
            name.textContent = note.name || "Host";
            const text = document.createElement("p");
            text.className = "os-hint";
            text.textContent = note.text || "";
            const time = document.createElement("time");
            time.textContent = stamp(note.at);
            copy.appendChild(name);
            copy.appendChild(text);
            copy.appendChild(time);
            if (note.reply) {
                const answer = document.createElement("p");
                answer.className = "os-task-answer";
                answer.textContent = note.reply;
                copy.appendChild(answer);
                const replied = document.createElement("time");
                replied.textContent = "Replied " + stamp(note.repliedAt);
                copy.appendChild(replied);
            }
            const reply = document.createElement("button");
            reply.type = "button";
            reply.className = "os-mini";
            reply.textContent = note.reply ? "Edit reply" : "Reply";
            reply.addEventListener("click", function () {
                openReply(note);
            });
            item.appendChild(copy);
            item.appendChild(reply);
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
            perm.textContent = (user.name || user.email) + " is signed in.";
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
            document.getElementById("os-total").textContent = String(hosts.length);
            document.getElementById("os-active").textContent = String(active);
            document.getElementById("os-total-meta").textContent = hosts.length === 1 ? "saved to your account" : "saved to your account";
            document.getElementById("os-active-meta").textContent = active ? "configured for always-on use" : "none configured for always-on use";

            if (!result.ok) {
                current = null;
                empty.hidden = false;
                empty.textContent = result.message || "Your Hosts could not be loaded. Try signing in again.";
                fillTable(fleetBody, []);
                fillTable(hostsBody, []);
                fillCrawlHosts([]);
                fillActivity(activityList, []);
                fillLogs(logsList, []);
                fillTasks([]);
                document.getElementById("os-tasks").textContent = "0";
                document.getElementById("os-tasks-meta").textContent = "sent through your Hosts";
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
                empty.textContent = "No Hosts yet. Create your first Host to get started.";
            } else {
                empty.hidden = true;
                current = shown[0] || hosts[0];
            }

            fillTable(fleetBody, shown);
            fillTable(hostsBody, shown);
            fillCrawlHosts(hosts);
            if (logs.length) {
                fillLogs(activityList, logs.slice(0, 8));
            } else {
                fillActivity(activityList, shown.length ? shown : hosts);
            }
            fillLogs(logsList, logs);
            return Lab.listNotes(hosts).then(function (notes) {
                document.getElementById("os-tasks").textContent = String(notes.length);
                document.getElementById("os-tasks-meta").textContent = notes.length === 1 ? "sent through your Hosts" : "sent through your Hosts";
                fillTasks(notes);
                return true;
            });
        });
    }

    function closeDeleteAsk() {
        pendingDelete = null;
        const dialog = document.getElementById("os-delete-ask");
        if (dialog && dialog.open) {
            dialog.close();
        }
    }

    function doDelete(host) {
        if (!host) {
            return;
        }
        current = host.share === (current && current.share) ? null : current;
        Lab.forget(host.share).then(function () {
            paintFloor();
        });
    }

    function askDelete(host) {
        pendingDelete = host;
        const dialog = document.getElementById("os-delete-ask");
        const copy = document.getElementById("os-delete-ask-copy");
        if (copy) {
            copy.textContent = "This removes " + (host.name || "this Host") + " from your saved Hosts.";
        }
        if (dialog && typeof dialog.showModal === "function") {
            if (!dialog.open) {
                dialog.showModal();
            }
            const cancel = document.getElementById("os-delete-cancel");
            if (cancel) {
                cancel.focus();
            }
            return;
        }
        if (window.confirm("Are you sure you want to delete?")) {
            doDelete(host);
        } else {
            pendingDelete = null;
        }
    }

    function closeReplyAsk() {
        pendingReply = null;
        const dialog = document.getElementById("os-reply-ask");
        if (dialog && dialog.open) {
            dialog.close();
        }
    }

    function paintReplyThread(note) {
        const quote = document.getElementById("os-reply-quote");
        const wrap = document.getElementById("os-reply-spoken-wrap");
        const spoken = document.getElementById("os-reply-spoken");
        const spokenAt = document.getElementById("os-reply-spoken-at");
        if (quote) {
            quote.textContent = (note && note.text) || "";
        }
        if (wrap) {
            wrap.hidden = !(note && note.reply);
        }
        if (spoken) {
            spoken.textContent = (note && note.reply) || "";
        }
        if (spokenAt) {
            spokenAt.textContent = note && note.reply ? stamp(note.repliedAt) : "";
        }
    }

    function openReply(note) {
        pendingReply = note;
        const dialog = document.getElementById("os-reply-ask");
        const title = document.getElementById("os-reply-ask-title");
        const hostEl = document.getElementById("os-reply-host");
        const box = document.getElementById("os-reply-text");
        const status = document.getElementById("os-reply-status");
        if (title) {
            title.textContent = "Reply through " + (note.name || "this Host");
        }
        if (hostEl) {
            hostEl.textContent = note.share || "Host";
        }
        paintReplyThread(note);
        if (box) {
            box.value = "";
        }
        if (status) {
            status.textContent = "";
        }
        if (dialog && typeof dialog.showModal === "function") {
            if (!dialog.open) {
                dialog.showModal();
            }
            if (box) {
                box.focus();
            }
        }
    }

    function fillCrawlHosts(list) {
        const select = document.getElementById("os-crawl-host");
        if (!select) {
            return;
        }
        const kept = select.value;
        select.innerHTML = "";
        if (!list.length) {
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "Create a Host first";
            select.appendChild(opt);
            return;
        }
        list.forEach(function (host) {
            const opt = document.createElement("option");
            opt.value = host.share || "";
            opt.textContent = (host.name || "Host") + (host.site ? " · " + host.site : "");
            select.appendChild(opt);
        });
        if (kept && list.some(function (host) { return host.share === kept; })) {
            select.value = kept;
        }
    }

    function jumpCrawl() {
        showView("dashboard");
        document.querySelectorAll("[data-os-jump]").forEach(function (btn) {
            btn.classList.toggle("is-on", btn.getAttribute("data-os-jump") === "crawl");
        });
        const panel = document.getElementById("os-crawl");
        if (panel && typeof panel.scrollIntoView === "function") {
            panel.scrollIntoView({ block: "start" });
        }
        const url = document.getElementById("os-crawl-url");
        if (url) {
            url.focus();
        }
    }

    function openCrawl(host) {
        const url = document.getElementById("os-crawl-url");
        const select = document.getElementById("os-crawl-host");
        if (url) {
            url.value = host.site || "";
        }
        if (select && host.share) {
            select.value = host.share;
        }
        jumpCrawl();
    }

    function stopCrawlProgress(ok) {
        if (crawlTick) {
            clearInterval(crawlTick);
            crawlTick = null;
        }
        const wrap = document.getElementById("os-crawl-progress");
        const bar = document.getElementById("os-crawl-progress-bar");
        if (!wrap || !bar) {
            return;
        }
        if (ok) {
            bar.style.width = "100%";
            return;
        }
        wrap.hidden = true;
        bar.style.width = "8%";
    }

    function startCrawlProgress() {
        const wrap = document.getElementById("os-crawl-progress");
        const bar = document.getElementById("os-crawl-progress-bar");
        if (!wrap || !bar) {
            return;
        }
        if (crawlTick) {
            clearInterval(crawlTick);
        }
        wrap.hidden = false;
        let pct = 10;
        bar.style.width = pct + "%";
        crawlTick = setInterval(function () {
            pct = Math.min(92, pct + Math.max(0.6, (92 - pct) * 0.12));
            bar.style.width = pct + "%";
        }, 160);
    }

    function showCrawlPreview(page) {
        const preview = document.getElementById("os-crawl-preview");
        const title = document.getElementById("os-crawl-preview-title");
        const copy = document.getElementById("os-crawl-preview-copy");
        const hostEl = document.getElementById("os-crawl-preview-host");
        if (!preview) {
            return;
        }
        preview.hidden = !page;
        if (!page) {
            return;
        }
        if (hostEl) {
            hostEl.textContent = page.host || page.url || "";
        }
        if (title) {
            title.textContent = page.title || "Page";
        }
        if (copy) {
            copy.textContent = (page.text || "").slice(0, 420);
        }
    }

    function openConnect(host) {
        const panel = document.getElementById("os-connect");
        const nameEl = document.getElementById("os-connect-name");
        const phoneEl = document.getElementById("os-connect-phone");
        const hookEl = document.getElementById("os-connect-hook");
        const noteEl = document.getElementById("os-connect-note");
        if (!panel) {
            return;
        }
        panel.hidden = false;
        panel.setAttribute("data-share", host.share || "");
        if (nameEl) {
            nameEl.textContent = host.name || "Host";
        }
        if (phoneEl) {
            phoneEl.value = host.phone || "";
        }
        if (hookEl) {
            hookEl.value = host.webhook || "";
        }
        if (noteEl) {
            noteEl.textContent = "";
        }
        showView("hosts");
        panel.scrollIntoView({ block: "start" });
    }

    function showView(name) {
        const section = name === "models" || name === "logs" || name === "projects" ? "studio" : name;
        document.querySelectorAll(".os-view").forEach(function (view) {
            view.hidden = view.getAttribute("data-view") !== section;
        });
        document.querySelectorAll("[data-os-view]").forEach(function (btn) {
            btn.classList.toggle("is-on", btn.getAttribute("data-os-view") === name);
        });
        document.querySelectorAll("[data-os-jump]").forEach(function (btn) {
            btn.classList.remove("is-on");
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

    function whenStudio(run) {
        if (window.HorseradishAfterImage && window.HorseradishAfterImage.open) {
            return Promise.resolve(run());
        }
        return new Promise(function (resolve) {
            let done = false;
            function finish() {
                if (done) {
                    return;
                }
                done = true;
                if (window.HorseradishAfterImage && window.HorseradishAfterImage.open) {
                    resolve(run());
                    return;
                }
                showNote("The editor could not open. Refresh the page.");
                resolve();
            }
            document.addEventListener("afterimage-ready", finish, { once: true });
            setTimeout(finish, 4000);
        });
    }

    function afterLogin() {
        document.body.classList.add("lab-open");
        if (door) {
            door.hidden = true;
        }
        if (floor) {
            floor.hidden = false;
        }
        paintWho(Lab.config().user);
        showNote("");
        showView("models");
        return whenStudio(function () {
            return window.HorseradishAfterImage.open();
        }).catch(function (err) {
            showNote(err && err.message ? err.message : "The editor could not open.");
        });
    }

    const deleteAsk = document.getElementById("os-delete-ask");
    const deleteCancel = document.getElementById("os-delete-cancel");
    const deleteGo = document.getElementById("os-delete-go");
    if (deleteCancel) {
        deleteCancel.addEventListener("click", closeDeleteAsk);
    }
    if (deleteGo) {
        deleteGo.addEventListener("click", function () {
            const host = pendingDelete;
            closeDeleteAsk();
            doDelete(host);
        });
    }
    if (deleteAsk) {
        deleteAsk.addEventListener("cancel", function () {
            pendingDelete = null;
        });
        deleteAsk.addEventListener("click", function (event) {
            if (event.target === deleteAsk) {
                closeDeleteAsk();
            }
        });
    }

    const replyAsk = document.getElementById("os-reply-ask");
    const replyForm = document.getElementById("os-reply-form");
    const replyCancel = document.getElementById("os-reply-cancel");
    if (replyCancel) {
        replyCancel.addEventListener("click", closeReplyAsk);
    }
    if (replyForm) {
        replyForm.addEventListener("submit", function (event) {
            event.preventDefault();
            const note = pendingReply;
            const box = document.getElementById("os-reply-text");
            const status = document.getElementById("os-reply-status");
            const go = document.getElementById("os-reply-go");
            if (!note) {
                return;
            }
            if (go) {
                go.disabled = true;
            }
            if (status) {
                status.textContent = "Sending…";
            }
            Lab.replyNote(note, box && box.value).then(function (result) {
                if (go) {
                    go.disabled = false;
                }
                if (!result.ok) {
                    if (status) {
                        status.textContent = result.message || "The reply did not go through.";
                    }
                    return;
                }
                pendingReply = Object.assign({}, note, {
                    reply: result.reply,
                    repliedAt: result.repliedAt
                });
                paintReplyThread(pendingReply);
                if (box) {
                    box.value = "";
                }
                if (status) {
                    status.textContent = "Reply sent.";
                }
                paintFloor();
                showView("tasks");
            });
        });
    }
    if (replyAsk) {
        replyAsk.addEventListener("cancel", function () {
            pendingReply = null;
        });
        replyAsk.addEventListener("click", function (event) {
            if (event.target === replyAsk) {
                closeReplyAsk();
            }
        });
    }

    const crawlForm = document.getElementById("os-crawl");
    const crawlSave = document.getElementById("os-crawl-save");
    if (crawlForm) {
        crawlForm.addEventListener("submit", function (event) {
            event.preventDefault();
            const url = ((document.getElementById("os-crawl-url") || {}).value || "").trim();
            const noteEl = document.getElementById("os-crawl-note");
            const go = document.getElementById("os-crawl-go");
            if (!url) {
                if (noteEl) {
                    noteEl.textContent = "Enter a website address.";
                }
                return;
            }
            if (go) {
                go.disabled = true;
            }
            if (noteEl) {
                noteEl.textContent = "Crawling…";
            }
            showCrawlPreview(null);
            startCrawlProgress();
            fetch("/api/crawl", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: url })
            }).then(function (res) {
                return res.json().then(function (body) {
                    body.ok = res.ok && body.ok !== false && Boolean(body.text);
                    body.status = res.status;
                    return body;
                });
            }).then(function (page) {
                if (go) {
                    go.disabled = false;
                }
                if (!page.ok) {
                    pendingCrawl = null;
                    stopCrawlProgress(false);
                    if (noteEl) {
                        noteEl.textContent = page.message || "The site did not open.";
                    }
                    return;
                }
                pendingCrawl = page;
                stopCrawlProgress(true);
                showCrawlPreview(page);
                if (noteEl) {
                    noteEl.textContent = "Review the extracted text, then save it to a Host.";
                }
            }).catch(function () {
                if (go) {
                    go.disabled = false;
                }
                pendingCrawl = null;
                stopCrawlProgress(false);
                if (noteEl) {
                    noteEl.textContent = "The site did not open.";
                }
            });
        });
    }
    if (crawlSave) {
        crawlSave.addEventListener("click", function () {
            const noteEl = document.getElementById("os-crawl-note");
            const share = ((document.getElementById("os-crawl-host") || {}).value || "").trim();
            const page = pendingCrawl;
            if (!page || !page.text) {
                if (noteEl) {
                    noteEl.textContent = "Crawl a site first.";
                }
                return;
            }
            if (!share) {
                if (noteEl) {
                    noteEl.textContent = "Create a Host first, then save this crawl to it.";
                }
                return;
            }
            crawlSave.disabled = true;
            Lab.patchHost(share, {
                site: page.url,
                specialty: page.title || page.host || "",
                fileName: page.host || "site",
                fileText: String(page.text || "").slice(0, 8000),
                crawledAt: page.at || new Date().toISOString()
            }).then(function (result) {
                crawlSave.disabled = false;
                if (noteEl) {
                    noteEl.textContent = result.ok ? "Page content saved to this Host." : (result.message || "Could not save.");
                }
                if (result.ok) {
                    paintFloor();
                }
            });
        });
    }
    document.querySelectorAll("[data-os-jump]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            if (btn.getAttribute("data-os-jump") === "crawl") {
                jumpCrawl();
            }
        });
    });

    const connectForm = document.getElementById("os-connect");
    if (connectForm) {
        connectForm.addEventListener("submit", function (event) {
            event.preventDefault();
            const share = connectForm.getAttribute("data-share");
            const phone = (document.getElementById("os-connect-phone") || {}).value || "";
            const webhook = (document.getElementById("os-connect-hook") || {}).value || "";
            const noteEl = document.getElementById("os-connect-note");
            Lab.patchHost(share, {
                phone: String(phone).trim(),
                webhook: String(webhook).trim()
            }).then(function (result) {
                if (noteEl) {
                    noteEl.textContent = result.ok ? "Connected." : (result.message || "Could not connect.");
                }
                if (result.ok) {
                    paintFloor();
                }
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
        window.location.href = "host.html?wake=" + encodeURIComponent(key) + "#factory";
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
            const name = btn.getAttribute("data-os-view");
            if (floor && floor.hidden) {
                return;
            }
            showView(name);
            if (!window.HorseradishAfterImage) {
                return;
            }
            if (name === "projects") {
                window.HorseradishAfterImage.projects();
            }
            if (name === "models") {
                window.HorseradishAfterImage.home();
            }
            if (name === "logs") {
                window.HorseradishAfterImage.logs();
            }
        });
    });

    if (search) {
        search.addEventListener("input", function () {
            if (!window.HorseradishAfterImage || !floor || floor.hidden) {
                return;
            }
            window.HorseradishAfterImage.search(search.value);
            showView("models");
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
