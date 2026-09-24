console.log("Order confirmation frontend javascript file");

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
    const id = e.target.id;
    const orderId = id.replace("confirm-", "");
    if (!confirm("Confirm this order?")) return;

    try {
      const response = await axios.post("/admin/order/update", {
        orderId: orderId,
        orderStatus: "CONFIRMED",
      });
      if (response.data.data) {
        location.reload();
      } else alert("Order update failed!");
    } catch (err) {
      console.log(err);
      alert("Order update failed!");
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
      alert("Please write why this order is being rejected!");
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
        location.reload();
      } else alert("Order update failed!");
    } catch (err) {
      console.log(err);
      alert(err.response?.data?.message || "Order update failed!");
    } finally {
      $submit.prop("disabled", false);
    }
  });
});