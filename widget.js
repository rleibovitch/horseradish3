(function (root) {
    const DEFAULTS = {
        apiKey: "AIzaSyCBXPavsl8G8q1rj6fLbavsYpxVTZK7VSU",
        projectId: "horseradish-hosts-993ea"
    };

    function decodeHost(raw) {
        if (!raw) {
            return null;
        }
        try {
            if (raw.charAt(0) === "{") {
                return JSON.parse(raw);
            }
            const json = decodeURIComponent(escape(atob(raw)));
            return JSON.parse(json);
        } catch (err) {
            return null;
        }
    }

    function postNote(host, text) {
        const inbox = host.inbox;
        if (!inbox) {
            return Promise.reject(new Error("inbox"));
        }
        const gate = host.gate || "https://horseradish.ai/api/inbox";
        return fetch(gate, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                inbox: inbox,
                share: String(host.share || ""),
                text: text
            })
        }).then(function (res) {
            return res.json().then(function (body) {
                if (!res.ok) {
                    const err = new Error("send");
                    err.body = body;
                    throw err;
                }
                if (host.phone && /Mobi|Android|iPhone/i.test(navigator.userAgent || "")) {
                    const sms = "sms:" + String(host.phone).replace(/[^\d+]/g, "") +
                        "?body=" + encodeURIComponent(text);
                    window.location.href = sms;
                }
                return body;
            });
        });
    }

    function mount(host, node) {
        if (!host || !node) {
            return;
        }
        if (node.getAttribute("data-ready")) {
            return;
        }
        node.setAttribute("data-ready", "1");
        node.className = (node.className ? node.className + " " : "") + "hr-host";
        node.innerHTML = "" +
            "<div class=\"hr-dock\">" +
            "<div class=\"hr-card\">" +
            "<strong></strong>" +
            "<p class=\"hr-specialty\"></p>" +
            "<form class=\"hr-form\">" +
            "<label class=\"hr-vis\">Note</label>" +
            "<textarea name=\"note\" rows=\"3\" maxlength=\"400\" placeholder=\"Write a note.\" required></textarea>" +
            "<button type=\"submit\">Send</button>" +
            "</form>" +
            "<p class=\"hr-status\" role=\"status\"></p>" +
            "</div>" +
            "<button type=\"button\" class=\"hr-avatar\" aria-label=\"Open Host\">" +
            "<span class=\"hr-face\"><i class=\"hr-eye l\"></i><i class=\"hr-eye r\"></i><i class=\"hr-mouth\"></i></span>" +
            "</button>" +
            "</div>";
        node.querySelector("strong").textContent = host.name || "Host";
        node.querySelector(".hr-specialty").textContent = host.specialty || "";
        const avatar = node.querySelector(".hr-avatar");
        avatar.setAttribute("data-body", host.body || "square");
        avatar.addEventListener("click", function () {
            node.classList.toggle("is-open");
        });
        const form = node.querySelector(".hr-form");
        const status = node.querySelector(".hr-status");
        form.addEventListener("submit", function (event) {
            event.preventDefault();
            const box = form.querySelector("textarea");
            const text = String(box.value || "").trim();
            if (!text) {
                return;
            }
            status.textContent = "Sending…";
            postNote(host, text).then(function () {
                box.value = "";
                status.textContent = "It's in.";
            }).catch(function () {
                status.textContent = "The note did not go through.";
            });
        });
    }

    function boot() {
        const nodes = document.querySelectorAll("[data-hr-b]:not([data-ready])");
        Array.prototype.forEach.call(nodes, function (node) {
            mount(decodeHost(node.getAttribute("data-hr-b")), node);
        });
    }

    if (!document.getElementById("hr-host-css")) {
        const style = document.createElement("style");
        style.id = "hr-host-css";
        style.textContent = [
            ".hr-host{position:fixed;right:20px;bottom:20px;z-index:2147483646;font-family:'Space Grotesk',Segoe UI,sans-serif;}",
            ".hr-host .hr-dock{display:flex;flex-direction:column;align-items:flex-end;gap:10px;}",
            ".hr-host .hr-card{display:none;width:240px;background:#fafaf8;color:#1a1a2e;border:2px solid #1a1a2e;box-shadow:6px 6px 0 #1a1a2e;padding:12px 14px;}",
            ".hr-host.is-open .hr-card{display:block;}",
            ".hr-host .hr-card strong{display:block;font-size:15px;margin:0 0 4px;}",
            ".hr-host .hr-specialty{margin:0 0 10px;color:#5c5a70;font-size:13px;line-height:1.35;}",
            ".hr-host .hr-form textarea{width:100%;border:2px solid #1a1a2e;background:#fff;color:#1a1a2e;font:inherit;padding:8px;resize:vertical;margin:0 0 8px;}",
            ".hr-host .hr-form button{border:2px solid #1a1a2e;background:#1a1a2e;color:#fafaf8;font:inherit;font-weight:600;padding:8px 12px;cursor:pointer;}",
            ".hr-host .hr-status{margin:8px 0 0;font-size:12px;color:#5c5a70;min-height:1em;}",
            ".hr-host .hr-vis{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);}",
            ".hr-host .hr-avatar{width:72px;height:72px;border:2px solid #1a1a2e;background:#f5f0e8;box-shadow:5px 5px 0 #1a1a2e;cursor:pointer;position:relative;padding:0;}",
            ".hr-host .hr-avatar[data-body='circle']{border-radius:50%;}",
            ".hr-host .hr-avatar[data-body='square']{border-radius:14px;}",
            ".hr-host .hr-avatar[data-body='triangle']{border-radius:8px;clip-path:polygon(50% 0,100% 100%,0 100%);}",
            ".hr-host .hr-avatar[data-body='humanoid']{border-radius:50% 50% 42% 42%;height:78px;}",
            ".hr-host .hr-face{position:absolute;inset:18px 12px 16px;}",
            ".hr-host .hr-eye{position:absolute;top:8px;width:8px;height:8px;border-radius:50%;background:#1a1a2e;display:block;}",
            ".hr-host .hr-eye.l{left:8px;}",
            ".hr-host .hr-eye.r{right:8px;}",
            ".hr-host .hr-mouth{position:absolute;left:50%;bottom:4px;width:14px;height:6px;margin-left:-7px;border-bottom:2px solid #1a1a2e;border-radius:0 0 10px 10px;display:block;}"
        ].join("");
        document.head.appendChild(style);
    }

    root.HorseradishWidget = { mount: mount, boot: boot };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})(window);
