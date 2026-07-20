console.log("Home frontend javascript file");

anime({
  targets: ".sphere-animation",
  opacity: [0, 1],
  scale: [0.85, 1],
  duration: 1200,
  easing: "easeOutExpo",
});

anime({
  targets: ".sphere-animation",
  rotate: "360deg",
  duration: 40000,
  easing: "linear",
  loop: true,
});