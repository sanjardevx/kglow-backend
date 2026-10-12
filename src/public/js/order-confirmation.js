console.log("Order confirmation frontend javascript file");

/** The customer's name, for wording a confirmation and its toast. Read off the
 *  row rather than passed around, since the table already shows it. */
function customerOf(orderId) {
  const name = $(`.view-btn[data-order="${orderId}"]`)
    .closest("tr")
    .children("td")
    .eq(1)
    .text()
    .trim();
  return name && name !== "-" ? name : "this customer";
}

/**
 * Moves a decided order into its new state in place: the status pill, the row
 * highlight, and the decision controls inside the modal.
 *
 * This used to be location.reload(). Reloading threw away the admin's place in
 * the list and, now that the list is paged, could land them somewhere else
 * entirely — and a queue of orders is worked through one after another, so the
 * wait happened on every single decision.
 */
function settleOrder(orderId, status) {
  const $row = $(`.view-btn[data-order="${orderId}"]`).closest("tr");
  $row.removeClass("row-waiting");
  $row
    .find(".status-pill")
    .removeClass("status-waiting_confirmation status-confirmed status-rejected")
    .addClass(`status-${status.toLowerCase()}`)
    .text(status);

  // The two decision buttons go; View stays, since a decided order is still
  // worth opening.
  $(`#row-actions-${orderId}`).find(".row-confirm, .row-reject").remove();

  const $modal = $(`#order-modal-${orderId}`);
  $modal.find(`#decision-${orderId}`).remove();
  $modal.find(`#reject-box-${orderId}`).remove();
  $modal.removeClass("open");

  // The sidebar and the Waiting chip both quote a number that just changed.
  const $badge = $(".sidebar-badge");
  const left = Math.max(0, Number($badge.text() || 0) - 1);
  if (left === 0) $badge.remove();
  else $badge.text(left);
  const $chip = $(".chip-waiting .chip-count");
  if ($chip.length) $chip.text(Math.max(0, Number($chip.text() || 0) - 1));
}

/** Sends one decision. Shared by the buttons in the row and the ones inside
 *  the detail modal, so both take exactly the same path to the server. */
async function decideOrder($button, orderId, orderStatus, rejectReason) {
  const customer = customerOf(orderId);
  $button.prop("disabled", true);
  try {
    const body = { orderId: orderId, orderStatus: orderStatus };
    if (rejectReason) body.rejectReason = rejectReason;
    const response = await axios.post("/admin/order/update", body);
    if (!response.data.data) {
      toast("Order update failed.", "bad");
      return false;
    }
    settleOrder(orderId, orderStatus);
    toast(
      `Order for ${customer} ${orderStatus === "CONFIRMED" ? "confirmed" : "rejected"}.`,
    );
    return true;
  } catch (err) {
    console.log(err);
    toast(errorMessage(err, "Order update failed."), "bad");
    return false;
  } finally {
    $button.prop("disabled", false);
  }
}

$(function () {
  $(".view-btn").on("click", function () {
    const orderId = $(this).data("order");
    $(`#order-modal-${orderId}`).addClass("open");
  });

  $(".modal-close").on("click", function () {
    $(this).closest(".modal-backdrop").removeClass("open");
  });

  $(".modal-backdrop").on("click", function (e) {
    if (e.target === this) {
      $(this).removeClass("open");
    }
  });

  /** Confirm, from the row or from inside the detail modal. */
  $(".confirm-btn, .row-confirm").on("click", async function () {
    const $button = $(this);
    const orderId = String($button.data("order") || this.id.replace("confirm-", ""));

    const agreed = await confirmAction({
      title: "Confirm this order?",
      body: `${customerOf(orderId)} will be told the payment went through and the stock stays reserved. This cannot be undone.`,
      confirmLabel: "Confirm order",
    });
    if (!agreed) return;

    await decideOrder($button, orderId, "CONFIRMED");
  });

  /** Reject from the row. The reason is asked for in the same dialog — the
   *  shopper sees it on their order, and rejecting without one is what the
   *  modal's reject box was added to prevent. */
  $(".row-reject").on("click", async function () {
    const $button = $(this);
    const orderId = String($button.data("order"));

    const reason = await promptAction({
      title: "Reject this order?",
      body: `${customerOf(orderId)} will see this on their order, and the stock goes back to the shelf.`,
      label: "Why is this order being rejected?",
      placeholder: "e.g. The payment screenshot doesn't match the order total.",
      confirmLabel: "Reject order",
      danger: true,
      empty: "Please write why this order is being rejected.",
    });
    if (!reason) return;

    await decideOrder($button, orderId, "REJECTED", reason);
  });

  /** Reject asks for a reason first: the shopper sees it on their order, so
   * rejecting without one is what this replaced. */
  $(".reject-btn").on("click", function (e) {
    const orderId = e.target.id.replace("reject-", "");
    $(`#decision-${orderId}`).hide();
    $(`#reject-box-${orderId}`).addClass("open").find("textarea").focus();
  });

  $(".reject-cancel").on("click", function () {
    const orderId = $(this).data("order");
    $(`#reject-box-${orderId}`).removeClass("open").find("textarea").val("");
    $(`#decision-${orderId}`).show();
  });

  $(".reject-submit").on("click", async function () {
    const orderId = $(this).data("order");
    const $box = $(`#reject-box-${orderId}`);
    const rejectReason = $box.find("textarea").val().trim();

    if (!rejectReason) {
      toast("Please write why this order is being rejected.", "bad");
      $box.find("textarea").focus();
      return;
    }

    await decideOrder($(this), orderId, "REJECTED", rejectReason);
  });
});