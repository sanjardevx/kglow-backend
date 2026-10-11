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

  const $modal = $(`#order-modal-${orderId}`);
  $modal.find(`#decision-${orderId}`).remove();
  $modal.find(`#reject-box-${orderId}`).remove();
  $modal.removeClass("open");
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

  $(".confirm-btn").on("click", async function (e) {
    const $button = $(this);
    const orderId = e.target.id.replace("confirm-", "");
    const customer = customerOf(orderId);

    const agreed = await confirmAction({
      title: "Confirm this order?",
      body: `${customer} will be told the payment went through and the stock stays reserved. This cannot be undone.`,
      confirmLabel: "Confirm order",
    });
    if (!agreed) return;

    $button.prop("disabled", true);
    try {
      const response = await axios.post("/admin/order/update", {
        orderId: orderId,
        orderStatus: "CONFIRMED",
      });
      if (response.data.data) {
        settleOrder(orderId, "CONFIRMED");
        toast(`Order for ${customer} confirmed.`);
      } else toast("Order update failed.", "bad");
    } catch (err) {
      console.log(err);
      toast(errorMessage(err, "Order update failed."), "bad");
    } finally {
      $button.prop("disabled", false);
    }
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

    const $submit = $(this).prop("disabled", true);
    try {
      const response = await axios.post("/admin/order/update", {
        orderId: orderId,
        orderStatus: "REJECTED",
        rejectReason: rejectReason,
      });
      if (response.data.data) {
        settleOrder(orderId, "REJECTED");
        toast(`Order for ${customerOf(orderId)} rejected.`);
      } else toast("Order update failed.", "bad");
    } catch (err) {
      console.log(err);
      toast(errorMessage(err, "Order update failed."), "bad");
    } finally {
      $submit.prop("disabled", false);
    }
  });
});