/**
 * Shared admin UI: toasts and a confirm dialog.
 *
 * Loaded on every admin page from includes/header.ejs, before the per-page
 * scripts, so `toast()` and `confirmAction()` are there by the time they run.
 *
 * These replace window.alert and window.confirm. Both of those block the whole
 * tab until dismissed, look like a browser warning rather than part of the
 * panel, and put the message somewhere the admin's eyes are not — in a list
 * where the work is confirming orders one after another, that is a stop sign
 * every few seconds.
 */

/** Toasts stack here, created on first use so no page pays for an empty node. */
let toastHost = null;

function getToastHost() {
  if (!toastHost) {
    toastHost = document.createElement("div");
    toastHost.className = "toast-host";
    document.body.appendChild(toastHost);
  }
  return toastHost;
}

/**
 * A short message in the top-right corner.
 *
 * @param {string} message  what happened, in the admin's words
 * @param {"good"|"bad"} kind  "bad" stays up longer and announces itself as an
 *   alert: a failure is worth interrupting a screen reader for, a success is
 *   not.
 */
function toast(message, kind = "good") {
  const host = getToastHost();
  const node = document.createElement("div");
  node.className = `toast toast-${kind}`;
  node.setAttribute("role", kind === "bad" ? "alert" : "status");
  node.textContent = message;
  host.appendChild(node);

  // Two frames: the first paints it in its start position, the second lets the
  // transition run. One frame is not always enough.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => node.classList.add("in"));
  });

  const life = kind === "bad" ? 6000 : 3200;
  const close = () => {
    node.classList.remove("in");
    node.addEventListener("transitionend", () => node.remove(), { once: true });
    // Nothing transitions under prefers-reduced-motion, so transitionend never
    // fires and the node would stay forever.
    setTimeout(() => node.remove(), 400);
  };
  const timer = setTimeout(close, life);
  node.addEventListener("click", () => {
    clearTimeout(timer);
    close();
  });
}

/**
 * Asks before something that cannot be undone. Resolves true if the admin
 * agrees, false on Cancel, Escape, or a click on the backdrop.
 *
 * @param {{title: string, body?: string, confirmLabel?: string,
 *          danger?: boolean}} options
 * @returns {Promise<boolean>}
 */
function confirmAction({
  title,
  body = "",
  confirmLabel = "Confirm",
  danger = false,
}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop confirm-backdrop open";
    backdrop.innerHTML = `
      <div class="modal-box confirm-box" role="dialog" aria-modal="true"
           aria-labelledby="confirm-title">
        <div class="title-row">
          <div class="title" id="confirm-title"></div>
        </div>
        <p class="confirm-body"></p>
        <div class="confirm-actions">
          <button type="button" class="btn-outline confirm-no">Cancel</button>
          <button type="button" class="confirm-yes"></button>
        </div>
      </div>`;

    // Set as text, never as markup: a product or customer name can carry
    // anything, and it is about to sit inside this dialog.
    backdrop.querySelector("#confirm-title").textContent = title;
    const bodyNode = backdrop.querySelector(".confirm-body");
    if (body) bodyNode.textContent = body;
    else bodyNode.remove();

    const yes = backdrop.querySelector(".confirm-yes");
    yes.textContent = confirmLabel;
    yes.className = danger ? "confirm-yes btn-danger" : "confirm-yes btn-console";

    const previous = document.activeElement;
    const finish = (answer) => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      if (previous && previous.focus) previous.focus();
      resolve(answer);
    };
    const onKey = (e) => {
      if (e.key === "Escape") finish(false);
    };

    backdrop.querySelector(".confirm-no").addEventListener("click", () => finish(false));
    yes.addEventListener("click", () => finish(true));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) finish(false);
    });
    document.addEventListener("keydown", onKey);

    document.body.appendChild(backdrop);
    yes.focus();
  });
}

/** The message a failed axios call should show: the server's own wording when
 *  it sent one, otherwise the caller's fallback. */
function errorMessage(err, fallback) {
  return err?.response?.data?.message || fallback;
}

/** Shows the message the last redirect left behind, if there was one. */
document.addEventListener("DOMContentLoaded", () => {
  const node = document.getElementById("admin-notice");
  if (!node) return;
  try {
    const notice = JSON.parse(node.textContent);
    if (notice && notice.message) toast(notice.message, notice.kind);
  } catch (err) {
    console.log("Could not read the page notice", err);
  }
});
