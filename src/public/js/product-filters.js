/**
 * Products page: search, category, status, stock and sort over the whole
 * catalog, all in the page (the list is not paged). The choices are kept in
 * the address, so the reload after saving a product comes back to the same
 * view, and a filtered view can be bookmarked.
 */
(function () {
  const rows = Array.from(document.querySelectorAll(".pf-row"));
  const tbody = rows[0] ? rows[0].parentElement : null;
  const q = document.getElementById("pf-q");
  const status = document.getElementById("pf-status");
  const stock = document.getElementById("pf-stock");
  const sort = document.getElementById("pf-sort");
  const chips = Array.from(document.querySelectorAll(".pf-chip"));
  const count = document.getElementById("pf-count");
  const empty = document.getElementById("pf-empty");
  const resets = [document.getElementById("pf-reset"), document.getElementById("pf-reset-2")];
  if (!tbody || !q) return;

  let category = "";

  const SORTS = {
    new: (a, b) => a.dataset.order - b.dataset.order,
    name: (a, b) => a.dataset.name.localeCompare(b.dataset.name),
    brand: (a, b) =>
      a.dataset.brand.localeCompare(b.dataset.brand) ||
      a.dataset.name.localeCompare(b.dataset.name),
    "price-asc": (a, b) => a.dataset.price - b.dataset.price,
    "price-desc": (a, b) => b.dataset.price - a.dataset.price,
    left: (a, b) => a.dataset.left - b.dataset.left,
    views: (a, b) => b.dataset.views - a.dataset.views,
  };

  function matches(row, words) {
    const d = row.dataset;
    if (category && d.category !== category) return false;
    if (status.value && d.status !== status.value) return false;
    const left = Number(d.left);
    if (stock.value === "low" && !(left > 0 && left <= 2)) return false;
    if (stock.value === "out" && left > 0) return false;
    const text = d.name + " " + d.brand;
    return words.every((w) => text.includes(w));
  }

  function apply() {
    const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const sorted = rows.slice().sort(SORTS[sort.value] || SORTS.new);
    let shown = 0;
    sorted.forEach((row) => {
      tbody.appendChild(row);
      const ok = matches(row, words);
      row.hidden = !ok;
      if (ok) row.querySelector(".pf-num").textContent = String(++shown);
    });

    count.textContent = shown === rows.length ? String(rows.length) : shown + " of " + rows.length;
    empty.hidden = shown > 0;
    const filtered = Boolean(words.length || category || status.value || stock.value || sort.value !== "new");
    resets[0].hidden = !filtered;
    chips.forEach((c) => {
      const on = c.dataset.cat === category;
      c.classList.toggle("is-on", on);
      c.setAttribute("aria-pressed", String(on));
    });

    const params = new URLSearchParams();
    if (q.value.trim()) params.set("q", q.value.trim());
    if (category) params.set("cat", category);
    if (status.value) params.set("status", status.value);
    if (stock.value) params.set("stock", stock.value);
    if (sort.value !== "new") params.set("sort", sort.value);
    const qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }

  function reset() {
    q.value = "";
    category = "";
    status.value = "";
    stock.value = "";
    sort.value = "new";
    apply();
    q.focus();
  }

  // Start from the address, if it carries a view.
  const start = new URLSearchParams(location.search);
  q.value = start.get("q") || "";
  category = start.get("cat") || "";
  status.value = start.get("status") || "";
  stock.value = start.get("stock") || "";
  sort.value = SORTS[start.get("sort")] ? start.get("sort") : "new";

  q.addEventListener("input", apply);
  [status, stock, sort].forEach((el) => el.addEventListener("change", apply));
  chips.forEach((c) =>
    c.addEventListener("click", () => {
      category = c.dataset.cat;
      apply();
    }),
  );
  resets.forEach((b) => b && b.addEventListener("click", reset));

  // "/" jumps to the search box, as on most admin tools.
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !typing) {
      e.preventDefault();
      q.focus();
    } else if (e.key === "Escape" && document.activeElement === q && q.value) {
      q.value = "";
      apply();
    }
  });

  // A status changed from the row keeps its row where it is (no jumping
  // while the admin works), but counts for the next filter.
  document.querySelectorAll(".new-product-status").forEach((sel) =>
    sel.addEventListener("change", () => {
      sel.closest(".pf-row").dataset.status = sel.value;
    }),
  );

  apply();
})();
