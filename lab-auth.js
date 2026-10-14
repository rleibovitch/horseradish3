(function (root) {
    const PENDING_KEY = "horseradish-lab-pending";
    const WAKE_KEY = "horseradish-wake-host";
    let config = { user: null, clientId: "", shelf: false };

    function fetchJSON(url, options) {
        return fetch(url, Object.assign({ credentials: "same-origin", cache: "no-store" }, options || {}))
            .then(function (res) {
                return res.json().then(function (body) {
                    return { ok: res.ok, status: res.status, body: body };
                }).catch(function () {
                    return { ok: res.ok, status: res.status, body: {} };
                });
            });
    }

    function load() {
        return fetchJSON("/api/lab-session").then(function (res) {
            config = {
                user: res.body && res.body.user ? res.body.user : null,
                clientId: (res.body && res.body.clientId) || "",
                shelf: Boolean(res.body && res.body.shelf)
            };
            return config;
        }).catch(function () {
            return config;
        });
    }

    function mountButton(el, onDone) {
        if (!el) {
            return;
        }
        el.innerHTML = "";
        if (!config.clientId) {
            const hint = document.createElement("p");
            hint.className = "field-hint";
            hint.textContent = "The Lab door is cut. Hang the Google lock, then this button appears.";
            el.appendChild(hint);
            return;
        }
        function draw() {
            if (!root.google || !google.accounts || !google.accounts.id) {
                return false;
            }
            google.accounts.id.initialize({
                client_id: config.clientId,
                callback: function (response) {
                    login(response.credential).then(function (result) {
                        if (onDone) {
                            onDone(result);
                        }
                    });
                },
                ux_mode: "popup",
                auto_select: false
            });
            google.accounts.id.renderButton(el, {
                type: "standard",
                theme: "filled_black",
                size: "large",
                text: "signin_with",
                shape: "rectangular",
                width: 280
            });
            return true;
        }
        if (!draw()) {
            let tries = 0;
            const timer = setInterval(function () {
                tries += 1;
                if (draw() || tries > 40) {
                    clearInterval(timer);
                }
            }, 150);
        }
    }

    function login(credential) {
        return fetchJSON("/api/lab-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: credential })
        }).then(function (res) {
            if (!res.ok) {
                return { ok: false, message: (res.body && res.body.message) || "Google did not let us in." };
            }
            config.user = res.body.user;
            config.shelf = Boolean(res.body.shelf);
            return { ok: true, user: config.user };
        });
    }

    function logout() {
        return fetchJSON("/api/lab-session", { method: "DELETE" }).then(function () {
            config.user = null;
            return true;
        });
    }

    function save(host) {
        return load().then(function (cfg) {
            if (!cfg.user) {
                try {
                    sessionStorage.setItem(PENDING_KEY, JSON.stringify(host));
                } catch (err) {}
                return { ok: false, needLogin: true };
            }
            return fetchJSON("/api/lab-hosts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ host: host })
            }).then(function (res) {
                if (res.status === 401) {
                    try {
                        sessionStorage.setItem(PENDING_KEY, JSON.stringify(host));
                    } catch (err) {}
                    return { ok: false, needLogin: true };
                }
                if (!res.ok) {
                    return { ok: false, message: (res.body && res.body.message) || "The Lab did not take it." };
                }
                return { ok: true, host: res.body.host };
            });
        });
    }

    function takePending() {
        try {
            const raw = sessionStorage.getItem(PENDING_KEY);
            sessionStorage.removeItem(PENDING_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            return null;
        }
    }

    function list() {
        return fetchJSON("/api/lab-hosts").then(function (res) {
            if (!res.ok) {
                return { ok: false, hosts: [], message: res.body && res.body.message };
            }
            return { ok: true, hosts: res.body.hosts || [] };
        });
    }

    function loadHost(share) {
        return fetchJSON("/api/lab-hosts?share=" + encodeURIComponent(share)).then(function (res) {
            if (!res.ok) {
                return null;
            }
            if (res.body && res.body.host) {
                return res.body.host;
            }
            const key = String(share || "").toUpperCase();
            const hosts = (res.body && res.body.hosts) || [];
            return hosts.find(function (host) {
                return String(host.share || "").toUpperCase() === key;
            }) || null;
        }).catch(function () {
            return null;
        });
    }

    function forget(share) {
        return fetchJSON("/api/lab-hosts?share=" + encodeURIComponent(share), { method: "DELETE" });
    }

    function wake(host) {
        try {
            sessionStorage.setItem(WAKE_KEY, JSON.stringify(host));
        } catch (err) {}
        root.location.href = "index.html?wake=" + encodeURIComponent(host.share) + "#factory";
    }

    function enterDashboard() {
        root.location.replace("lab.html");
    }

    function stayOnFactory() {
        const hash = root.location.hash;
        if (hash === "#factory" || hash === "#field" || hash === "#questions" || hash === "#contact") {
            return true;
        }
        return Boolean(new URLSearchParams(root.location.search).get("wake"));
    }

    function promptLogin(onDone) {
        return load().then(function (cfg) {
            if (cfg.user) {
                const result = { ok: true, user: cfg.user };
                if (onDone) {
                    onDone(result);
                } else {
                    enterDashboard();
                }
                return result;
            }
            if (!cfg.clientId) {
                enterDashboard();
                return { ok: false, needSetup: true };
            }
            const slot = document.getElementById("greet-google") || document.getElementById("google-slot");
            mountButton(slot, function (result) {
                if (onDone) {
                    onDone(result);
                    return;
                }
                if (result.ok) {
                    enterDashboard();
                }
            });
            if (root.google && google.accounts && google.accounts.id && google.accounts.id.prompt) {
                google.accounts.id.prompt();
            }
            return { ok: false, needButton: true };
        });
    }

    function bootGreet() {
        const greet = document.getElementById("top");
        if (!greet || !greet.classList.contains("greet")) {
            document.body.classList.remove("is-booting");
            return;
        }
        const loginCta = document.getElementById("login-cta");
        const note = document.getElementById("greet-note");
        function ready() {
            document.body.classList.remove("is-booting");
        }
        load().then(function (cfg) {
            if (cfg.user && !stayOnFactory()) {
                enterDashboard();
                return;
            }
            ready();
        }).catch(ready);
        setTimeout(ready, 1800);
        const create = greet.querySelector('a[href="#factory"]');
        if (create) {
            create.addEventListener("click", function (event) {
                const target = document.getElementById("factory");
                if (!target) {
                    return;
                }
                event.preventDefault();
                root.history.pushState(null, "", "#factory");
                root.scrollTo({
                    top: target.getBoundingClientRect().top + root.scrollY - 88,
                    behavior: "smooth"
                });
            });
        }
        if (loginCta) {
            loginCta.addEventListener("click", function () {
                promptLogin(function (result) {
                    if (result.ok) {
                        enterDashboard();
                        return;
                    }
                    if (note && result.message) {
                        note.textContent = result.message;
                    }
                });
            });
        }
    }

    root.HorseradishLab = {
        load: load,
        mountButton: mountButton,
        login: login,
        logout: logout,
        save: save,
        takePending: takePending,
        list: list,
        loadHost: loadHost,
        forget: forget,
        wake: wake,
        enterDashboard: enterDashboard,
        promptLogin: promptLogin,
        config: function () {
            return config;
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bootGreet);
    } else {
        bootGreet();
    }
})(window);
