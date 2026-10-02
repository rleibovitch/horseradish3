(function () {
    const el = document.getElementById("horseradish-buddy");
    if (!el) {
        return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const card = document.querySelector(".agent.horseradish");
    const size = card ? 168 : 140;
    const inset = 22;
    const boxes = Array.prototype.slice.call(
        document.querySelectorAll(".stamp, .navbar, .stamp-btn, .footer")
    );
    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;
    let held = false;
    let freed = !card;
    let grabX = 0;
    let grabY = 0;
    let lastT = performance.now();
    let squash = 1;
    const trail = [];
    const ignore = [];

    function floorY() {
        return window.innerHeight - size - 8;
    }

    function perch() {
        if (!card) {
            return {
                x: Math.max(0, (window.innerWidth - size) / 2),
                y: Math.max(0, floorY())
            };
        }
        const r = card.getBoundingClientRect();
        return {
            x: r.left + (r.width - size) / 2,
            y: r.top - size * 0.58
        };
    }

    function paint() {
        const rot = freed ? Math.max(-22, Math.min(22, vx * 0.04)) : 0;
        const scale = held ? 1.08 : 1;
        el.style.transform = "translate(" + x + "px, " + y + "px) rotate(" + rot + "deg) scale(" + scale + ", " + (scale * squash) + ")";
        el.style.zIndex = held ? "1200" : (freed ? "40" : "5");
    }

    function point(event) {
        return { x: event.clientX, y: event.clientY };
    }

    function bounceWalls() {
        const maxX = Math.max(0, window.innerWidth - size);
        const maxY = floorY();

        if (x < 0) {
            x = 0;
            vx = Math.abs(vx) * 0.74;
        } else if (x > maxX) {
            x = maxX;
            vx = -Math.abs(vx) * 0.74;
        }

        if (y < 0) {
            y = 0;
            vy = Math.abs(vy) * 0.48;
        } else if (y > maxY) {
            y = maxY;
            if (vy > 90) {
                squash = Math.max(0.7, 1 - vy / 2600);
            }
            vy = -Math.abs(vy) * 0.64;
            vx *= 0.84;
            if (Math.abs(vy) < 80 && Math.abs(vx) < 36) {
                vy = 0;
                vx = 0;
            }
        }
    }

    function restOnSurface(incoming) {
        if (incoming > 90) {
            squash = Math.max(0.7, 1 - incoming / 2600);
        }
        vy = -Math.abs(incoming) * 0.64;
        vx *= 0.84;
        if (Math.abs(vy) < 80 && Math.abs(vx) < 36) {
            vy = 0;
            vx = 0;
        }
    }

    function overlapsBox(box, px, py) {
        const r = box.getBoundingClientRect();
        if (r.width < 12 || r.height < 12) {
            return false;
        }
        const left = px + inset;
        const top = py + inset;
        const right = px + size - inset;
        const bottom = py + size - inset;
        return right > r.left && left < r.right && bottom > r.top && top < r.bottom;
    }

    function rememberOverlaps() {
        ignore.length = 0;
        let i;
        for (i = 0; i < boxes.length; i += 1) {
            if (overlapsBox(boxes[i], x, y)) {
                ignore.push(boxes[i]);
            }
        }
    }

    function bounceBoxes(prevX, prevY) {
        let n;
        for (n = 0; n < 2; n += 1) {
            let i;
            for (i = 0; i < boxes.length; i += 1) {
                const box = boxes[i];
                const r = box.getBoundingClientRect();
                if (r.width < 12 || r.height < 12) {
                    continue;
                }

                const left = x + inset;
                const top = y + inset;
                const right = x + size - inset;
                const bottom = y + size - inset;
                const overlapX = Math.min(right, r.right) - Math.max(left, r.left);
                const overlapY = Math.min(bottom, r.bottom) - Math.max(top, r.top);
                if (overlapX <= 0 || overlapY <= 0) {
                    const idx = ignore.indexOf(box);
                    if (idx !== -1) {
                        ignore.splice(idx, 1);
                    }
                    continue;
                }
                if (ignore.indexOf(box) !== -1) {
                    continue;
                }

                const prevLeft = prevX + inset;
                const prevTop = prevY + inset;
                const prevRight = prevX + size - inset;
                const prevBottom = prevY + size - inset;
                const hitLeft = prevRight <= r.left && right > r.left;
                const hitRight = prevLeft >= r.right && left < r.right;
                const hitTop = prevBottom <= r.top && bottom > r.top;
                const hitBottom = prevTop >= r.bottom && top < r.bottom;

                if (hitTop || (!hitLeft && !hitRight && !hitBottom && overlapY <= overlapX && vy >= 0)) {
                    y = r.top - (size - inset);
                    restOnSurface(vy);
                } else if (hitBottom || (!hitLeft && !hitRight && overlapY <= overlapX)) {
                    y = r.bottom - inset;
                    vy = Math.abs(vy) * 0.48;
                } else if (hitLeft || (!hitRight && left < r.left + r.width / 2)) {
                    x = r.left - (size - inset);
                    vx = -Math.abs(vx) * 0.74;
                } else {
                    x = r.right - inset;
                    vx = Math.abs(vx) * 0.74;
                }
            }
        }
    }

    function pickUp(event) {
        held = true;
        freed = true;
        el.classList.add("is-held");
        vx = 0;
        vy = 0;
        trail.length = 0;
        const p = point(event);
        grabX = p.x - x;
        grabY = p.y - y;
        if (event.pointerId != null) {
            el.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        event.stopPropagation();
    }

    function drag(event) {
        if (!held) {
            return;
        }
        const p = point(event);
        x = p.x - grabX;
        y = p.y - grabY;
        trail.push({ t: performance.now(), x: x, y: y });
        if (trail.length > 6) {
            trail.shift();
        }
        paint();
        event.preventDefault();
    }

    function drop(event) {
        if (!held) {
            return;
        }
        held = false;
        el.classList.remove("is-held");
        rememberOverlaps();
        if (trail.length >= 2) {
            const a = trail[0];
            const b = trail[trail.length - 1];
            const dt = Math.max(16, b.t - a.t) / 1000;
            vx = (b.x - a.x) / dt;
            vy = (b.y - a.y) / dt;
            const max = 1900;
            const speed = Math.hypot(vx, vy);
            if (speed > max) {
                vx = (vx / speed) * max;
                vy = (vy / speed) * max;
            }
        }
        if (event && event.pointerId != null) {
            try {
                el.releasePointerCapture(event.pointerId);
            } catch (err) {
                /* already released */
            }
        }
    }

    function tick(now) {
        const dt = Math.min(0.032, (now - lastT) / 1000);
        lastT = now;
        squash += (1 - squash) * Math.min(1, dt * 14);

        if (!freed) {
            const home = perch();
            x = home.x;
            y = home.y;
            vx = 0;
            vy = 0;
        } else if (!held && !reduced) {
            const prevX = x;
            const prevY = y;
            vy += 2400 * dt;
            x += vx * dt;
            y += vy * dt;
            bounceWalls();
            bounceBoxes(prevX, prevY);
            bounceWalls();
        } else if (!held && reduced) {
            y = Math.min(y, floorY());
            vx = 0;
            vy = 0;
        }

        paint();
        requestAnimationFrame(tick);
    }

    el.addEventListener("pointerdown", pickUp);
    window.addEventListener("pointermove", drag, { passive: false });
    window.addEventListener("pointerup", drop);
    window.addEventListener("pointercancel", drop);
    window.addEventListener("resize", function () {
        if (!freed) {
            const home = perch();
            x = home.x;
            y = home.y;
        } else {
            x = Math.min(x, Math.max(0, window.innerWidth - size));
            y = Math.min(y, floorY());
        }
        paint();
    });

    const home = perch();
    x = home.x;
    y = home.y;
    paint();
    requestAnimationFrame(tick);
}());
