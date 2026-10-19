(function (root) {
    const PENDING_KEY = "horseradish-lab-pending";
    const WAKE_KEY = "horseradish-wake-host";
    let config = { user: null, clientId: "", shelf: false, firebase: null };

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
                shelf: Boolean(res.body && res.body.shelf),
                firebase: res.body && res.body.firebase ? res.body.firebase : null
            };
            initFirebase();
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
            hint.textContent = "The Portal door is cut. Hang the Google lock, then this button appears.";
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

    function initFirebase() {
        if (!config.firebase || !config.firebase.apiKey || !root.firebase) {
            return false;
        }
        if (!firebase.apps.length) {
            firebase.initializeApp(config.firebase);
            if (firebase.auth && firebase.auth.Auth && firebase.auth.Auth.Persistence) {
                firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});
            }
        }
        return true;
    }

    function waitFirebaseUser() {
        if (!initFirebase()) {
            return Promise.resolve(null);
        }
        const auth = firebase.auth();
        if (auth.currentUser) {
            return Promise.resolve(auth.currentUser);
        }
        if (typeof auth.authStateReady === "function") {
            return auth.authStateReady().then(function () {
                return auth.currentUser || null;
            });
        }
        return new Promise(function (resolve) {
            let done = false;
            function finish(user) {
                if (done) {
                    return;
                }
                done = true;
                resolve(user || null);
            }
            const unsub = auth.onAuthStateChanged(function (user) {
                unsub();
                finish(user);
            });
            setTimeout(function () {
                finish(auth.currentUser);
            }, 2500);
        });
    }

    function signInFirebase(credential) {
        if (!initFirebase() || !credential) {
            return Promise.resolve(null);
        }
        const cred = firebase.auth.GoogleAuthProvider.credential(credential);
        return firebase.auth().signInWithCredential(cred);
    }

    function firebaseMiss(err) {
        const code = err && err.code ? String(err.code) : "";
        const detail = code || (err && err.message) || "unknown";
        return "Google is in. Firebase Auth did not take it (" + detail + "). Sign in once more.";
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
            config.firebase = res.body.firebase || config.firebase;
            return signInFirebase(credential).then(function () {
                config.shelf = true;
                return { ok: true, user: config.user };
            }).catch(function (err) {
                return {
                    ok: true,
                    user: config.user,
                    needFirebase: true,
                    message: firebaseMiss(err)
                };
            });
        });
    }

    function logout() {
        const out = initFirebase() ? firebase.auth().signOut().catch(function () {}) : Promise.resolve();
        return out.then(function () {
            return fetchJSON("/api/lab-session", { method: "DELETE" });
        }).then(function () {
            config.user = null;
            return true;
        });
    }

    function shareKey(value) {
        return String(value || "").trim().toUpperCase().replace(/^HR-/, "HOST-");
    }

    function makeInbox() {
        if (root.crypto && crypto.randomUUID) {
            return "in_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
        }
        return "in_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }

    function publishHost(host) {
        if (!initFirebase() || !host || !host.inbox) {
            return Promise.resolve();
        }
        return firebase.firestore().collection("public").doc(host.inbox).set({
            name: host.name || "",
            share: host.share || "",
            body: host.body || "square",
            specialty: host.specialty || "",
            inbox: host.inbox,
            phone: host.phone || "",
            webhook: host.webhook || ""
        }).catch(function () {});
    }

    function save(host) {
        return load().then(function (cfg) {
            if (!cfg.user) {
                try {
                    sessionStorage.setItem(PENDING_KEY, JSON.stringify(host));
                } catch (err) {}
                return { ok: false, needLogin: true };
            }
            return waitFirebaseUser().then(function (user) {
                if (!user) {
                    return { ok: false, needLogin: true, message: "Sign in once more so Firebase Auth can keep your Host." };
                }
                const incoming = Object.assign({}, host || {});
                const drop = {};
                drop[shareKey(incoming.share)] = true;
                if (incoming.wasShare) {
                    drop[shareKey(incoming.wasShare)] = true;
                }
                delete incoming.wasShare;
                const ref = firebase.firestore().collection("lab").doc(user.uid);
                return ref.get().then(function (snap) {
                    const data = snap.exists ? snap.data() : {};
                    const hosts = Array.isArray(data.hosts) ? data.hosts : [];
                    const logs = Array.isArray(data.logs) ? data.logs.slice() : [];
                    const existing = hosts.find(function (item) {
                        return drop[shareKey(item.share)];
                    });
                    const now = new Date().toISOString();
                    const again = Boolean(existing);
                    incoming.savedAt = now;
                    incoming.builtAt = (existing && existing.builtAt) || now;
                    incoming.deployedAt = now;
                    incoming.inbox = incoming.inbox || (existing && existing.inbox) || makeInbox();
                    incoming.phone = incoming.phone || (existing && existing.phone) || "";
                    incoming.webhook = incoming.webhook || (existing && existing.webhook) || "";
                    if (again) {
                        incoming.rebuiltAt = now;
                        incoming.redeployedAt = now;
                    }
                    const next = hosts.filter(function (item) {
                        return !drop[shareKey(item.share)];
                    });
                    next.unshift(incoming);
                    const entry = {
                        at: now,
                        share: incoming.share,
                        name: incoming.name || "Unnamed Host"
                    };
                    if (again) {
                        logs.unshift(Object.assign({ action: "redeployed" }, entry));
                        logs.unshift(Object.assign({ action: "rebuilt" }, entry));
                    } else {
                        logs.unshift(Object.assign({ action: "deployed" }, entry));
                    }
                    return ref.set({
                        hosts: next.slice(0, 24),
                        logs: logs.slice(0, 80)
                    }).then(function () {
                        return publishHost(incoming);
                    });
                }).then(function () {
                    return { ok: true, host: incoming };
                }).catch(function (err) {
                    return { ok: false, message: firebaseMiss(err) };
                });
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
        return waitFirebaseUser().then(function (user) {
            if (!user) {
                return {
                    ok: false,
                    hosts: [],
                    logs: [],
                    message: config.user
                        ? "Sign in once more so Firebase Auth can open your Host."
                        : "Enter the Portal first."
                };
            }
            const ref = firebase.firestore().collection("lab").doc(user.uid);
            return ref.get().then(function (snap) {
                const data = snap.exists ? snap.data() : {};
                const hosts = Array.isArray(data.hosts) ? data.hosts : [];
                const logs = Array.isArray(data.logs) ? data.logs : [];
                let patched = false;
                hosts.forEach(function (host) {
                    if (host && !host.inbox) {
                        host.inbox = makeInbox();
                        patched = true;
                    }
                });
                const ready = patched
                    ? ref.set({ hosts: hosts, logs: logs }).then(function () {
                        return Promise.all(hosts.map(publishHost));
                    })
                    : Promise.all(hosts.map(publishHost));
                return ready.then(function () {
                    return { ok: true, hosts: hosts, logs: logs };
                });
            }).catch(function (err) {
                return { ok: false, hosts: [], logs: [], message: firebaseMiss(err) };
            });
        });
    }

    function patchHost(share, fields) {
        return waitFirebaseUser().then(function (user) {
            if (!user) {
                return { ok: false, message: "Sign in once more so Firebase Auth can keep your Host." };
            }
            const key = shareKey(share);
            const ref = firebase.firestore().collection("lab").doc(user.uid);
            return ref.get().then(function (snap) {
                const data = snap.exists ? snap.data() : {};
                const hosts = Array.isArray(data.hosts) ? data.hosts : [];
                const logs = Array.isArray(data.logs) ? data.logs : [];
                let found = null;
                const next = hosts.map(function (host) {
                    if (shareKey(host.share) !== key) {
                        return host;
                    }
                    found = Object.assign({}, host, fields || {});
                    return found;
                });
                if (!found) {
                    return { ok: false, message: "No Host on this shelf matches." };
                }
                return ref.set({ hosts: next, logs: logs }).then(function () {
                    return publishHost(found);
                }).then(function () {
                    return { ok: true, host: found };
                });
            });
        }).catch(function (err) {
            return { ok: false, message: firebaseMiss(err) };
        });
    }

    function listNotes(hosts) {
        if (!initFirebase()) {
            return Promise.resolve([]);
        }
        const jobs = (hosts || []).filter(function (host) {
            return host && host.inbox;
        }).map(function (host) {
            return firebase.firestore().collection("inbox").doc(host.inbox).collection("items").get()
                .then(function (snap) {
                    return snap.docs.map(function (doc) {
                        const row = doc.data() || {};
                        let at = row.at || "";
                        if (at && typeof at.toDate === "function") {
                            at = at.toDate().toISOString();
                        }
                        return {
                            id: doc.id,
                            text: row.text || "",
                            share: row.share || host.share,
                            at: at,
                            name: host.name || "Host"
                        };
                    });
                }).catch(function () {
                    return [];
                });
        });
        return Promise.all(jobs).then(function (chunks) {
            return [].concat.apply([], chunks).sort(function (a, b) {
                return String(b.at).localeCompare(String(a.at));
            });
        });
    }

    function loadHost(share) {
        return list().then(function (result) {
            if (!result.ok) {
                return null;
            }
            const key = shareKey(share);
            return result.hosts.find(function (host) {
                return shareKey(host.share) === key;
            }) || null;
        }).catch(function () {
            return null;
        });
    }

    function forget(share) {
        return waitFirebaseUser().then(function (user) {
            if (!user) {
                return { ok: false, message: "Sign in once more so Firebase Auth can open your Host." };
            }
            const key = String(share || "").toUpperCase();
            const ref = firebase.firestore().collection("lab").doc(user.uid);
            return ref.get().then(function (snap) {
                const data = snap.exists ? snap.data() : {};
                const hosts = Array.isArray(data.hosts) ? data.hosts : [];
                const logs = Array.isArray(data.logs) ? data.logs : [];
                return ref.set({
                    hosts: hosts.filter(function (item) {
                        return String(item.share || "").toUpperCase() !== key;
                    }),
                    logs: logs
                });
            });
        });
    }

    function wake(host) {
        try {
            sessionStorage.setItem(WAKE_KEY, JSON.stringify(host));
        } catch (err) {}
        root.location.href = "index.html?edit=" + encodeURIComponent(host.share) + "#factory";
    }

    function enterDashboard() {
        root.location.replace("lab.html");
    }

    function stayOnFactory() {
        const hash = root.location.hash;
        if (hash === "#factory" || hash === "#host") {
            return true;
        }
        const params = new URLSearchParams(root.location.search);
        return Boolean(params.get("wake") || params.get("edit"));
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
        listNotes: listNotes,
        patchHost: patchHost,
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
