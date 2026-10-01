document.addEventListener("DOMContentLoaded", function () {
    const hamburger = document.querySelector(".hamburger-menu");
    const navMenu = document.querySelector(".nav-menu");
    const navLinks = document.querySelectorAll(".nav-link");

    function closeMenu() {
        hamburger.classList.remove("active");
        navMenu.classList.remove("open");
        hamburger.setAttribute("aria-expanded", "false");
        hamburger.setAttribute("aria-label", "Open menu");
    }

    function openMenu() {
        hamburger.classList.add("active");
        navMenu.classList.add("open");
        hamburger.setAttribute("aria-expanded", "true");
        hamburger.setAttribute("aria-label", "Close menu");
    }

    hamburger.addEventListener("click", function () {
        if (navMenu.classList.contains("open")) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    navLinks.forEach(function (link) {
        link.addEventListener("click", function () {
            closeMenu();
        });
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            closeMenu();
        }
    });

    navLinks.forEach(function (link) {
        link.addEventListener("click", function (event) {
            const href = this.getAttribute("href");
            if (href && href.startsWith("#")) {
                const target = document.getElementById(href.slice(1));
                if (target) {
                    event.preventDefault();
                    const offset = 88;
                    window.scrollTo({
                        top: target.getBoundingClientRect().top + window.scrollY - offset,
                        behavior: "smooth"
                    });
                }
            }
        });
    });

    const animateElements = document.querySelectorAll(".agent, .question-demo");

    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add("in-view");
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });

        animateElements.forEach(function (el) {
            el.style.opacity = "0";
            el.style.transition = "opacity 0.45s ease";
            observer.observe(el);
        });
    }

    const style = document.createElement("style");
    style.textContent = ".in-view { opacity: 1 !important; }";
    document.head.appendChild(style);

    function formatAgo(fromIso) {
        const then = new Date(fromIso);
        if (Number.isNaN(then.getTime())) {
            return "a while ago";
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

    function applyPresence(status) {
        const online = Boolean(status && status.online);
        const ago = formatAgo(status && status.lastSeen);
        const full = online
            ? "Horseradish is online."
            : "Horseradish was last online " + ago + ".";
        const short = online ? "Online" : ago;

        document.querySelectorAll("[data-presence]").forEach(function (el) {
            el.classList.toggle("is-online", online);
            el.classList.toggle("is-away", !online);
        });
        document.querySelectorAll("[data-presence-label]").forEach(function (el) {
            el.textContent = full;
        });
        document.querySelectorAll("[data-presence-short]").forEach(function (el) {
            el.textContent = short;
        });
        document.querySelectorAll("[data-presence-headline]").forEach(function (el) {
            el.textContent = full;
        });
    }

    function loadPresence() {
        fetch("operator.json", { cache: "no-store" })
            .then(function (res) {
                if (!res.ok) {
                    throw new Error("presence");
                }
                return res.json();
            })
            .then(applyPresence)
            .catch(function () {
                applyPresence({ online: false, lastSeen: null });
            });
    }

    loadPresence();
    setInterval(loadPresence, 30000);
});
