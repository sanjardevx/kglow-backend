console.log("Home frontend javascript file");

import { createTimeline, scrambleText, stagger } from "https://esm.sh/animejs";

const tl = createTimeline({ loop: true });

tl.add(".kg-slide:nth-child(1)", {
  opacity: { to: 1, duration: 250, ease: "linear" },
  scale: [{ from: 0.75, to: 1, duration: 1500, ease: "inOut(3.5)" }],
  ease: "inOut(3)",
});
tl.add(".kg-slide:nth-child(1) p.kg-center", {
  scale: { from: 3 },
  color: { from: "var(--accent-hover)", to: "var(--accent)" },
  innerHTML: scrambleText({
    override: " ",
    ease: "inQuad",
    duration: 500,
    from: "center",
    cursor: "░▒▓█",
  }),
}, "<<");
tl.add(".kglow-stage", {
  background: "var(--surface-2)",
}, "<<+=50");
tl.add(".kg-slide:nth-child(1) p:not(.kg-center)", {
  scale: { from: 0.75 },
  color: { to: "var(--ink-soft)" },
  innerHTML: scrambleText({
    override: " ",
    from: "center",
    duration: 500,
    revealDelay: 250,
    cursor: "░▒▓",
    perturbation: 0.25,
  }),
}, stagger([250, 750], { grid: true, from: "center", ease: "out(3)", start: "<<" }));
tl.add(".kg-slide:nth-child(1) p:not(.kg-center)", {
  innerHTML: scrambleText({
    text: "",
    override: false,
    from: "center",
    ease: "outQuad",
    reversed: true,
    duration: 800,
    cursor: "░▒▓",
  }),
}, "<+=150");
tl.add(".kglow-stage", {
  background: "var(--ink)",
}, "<-=600");
tl.add(".kg-slide:nth-child(1) p.kg-center", {
  scale: 1.5,
  color: { to: "#ffffff" },
  ease: "inOutExpo",
  duration: 1500,
  innerHTML: scrambleText({
    text: "K-GLOW SECRETS",
    ease: "inQuad",
    override: false,
    from: "center",
    duration: 1000,
    perturbation: 0.25,
  }),
}, "<<");
tl.add(".kg-slide:nth-child(1) p.kg-center", {
  scale: 1,
  color: "#ffffff",
  ease: "inOutExpo",
  duration: 1150,
  innerHTML: scrambleText({
    override: false,
    text: "Korean beauty, delivered.",
    from: "right",
    duration: 950,
    settleDuration: 500,
    ease: "inOut",
  }),
}, "<+=250");
tl.add(".kg-slide:nth-child(1) p.kg-center", {
  innerHTML: scrambleText({
    text: "",
    override: false,
    from: "random",
    reversed: true,
    duration: 850,
    perturbation: 0.5,
  }),
}, "<+=500");
tl.set(".kg-slide:nth-child(2)", {
  opacity: 1,
}, "<<");
tl.add(".kg-slide:nth-child(2) p", {
  innerHTML: scrambleText({
    override: " ",
    from: "center",
    duration: 500,
    revealDelay: 250,
    cursor: "░▒▓",
    perturbation: 0.5,
  }),
}, stagger([0, 1000], { grid: true, from: "center", ease: "out(3)", start: "<<+=250", reversed: true }));
tl.add(".kg-slide:nth-child(2) p", {
  scale: [0.8, 1],
}, stagger([0, 150], { grid: true, from: "center", ease: "out(3)", start: "<<", reversed: true }));
tl.add(".kg-slide:nth-child(2) p", {
  innerHTML: scrambleText({
    text: "&nbsp;",
    override: false,
    from: "center",
    reversed: true,
    duration: 500,
    cursor: "░▒▓",
  }),
}, stagger([0, 750], { grid: true, from: "center", ease: "out(3)", start: "<+=500" }));
tl.set(".kg-slide:nth-child(3)", {
  opacity: 1,
}, "<<");
tl.add(".kg-slide:nth-child(3) p", {
  color: "#ffffff",
  scale: 1.5,
  ease: "inOutExpo",
  innerHTML: scrambleText({
    override: " ",
    from: "center",
    settleDuration: 500,
    revealRate: 33,
    perturbation: 0.2,
  }),
}, "-=250");
tl.add(".kg-slide:nth-child(3) p", {
  color: { to: "var(--accent-soft)", duration: 750 },
  ease: "inOutExpo",
  duration: 1250,
  innerHTML: scrambleText({
    text: "Manage with confidence.",
    override: false,
    from: "right",
    cursor: "░▒▓",
    duration: 750,
    ease: "inOut",
  }),
}, "<+=750");
tl.add(".kglow-stage", {
  background: "var(--bg)",
  duration: 750,
}, "<<");

tl.init();
