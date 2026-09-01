console.log("Reviews frontend javascript file");

$(function () {
  $("#process-btn").on("click", () => {
    $(".review-container").slideToggle(500);
    $("#process-btn").css("display", "none");
  });

  $("#cancel-btn").on("click", () => {
    $(".review-container").slideToggle(500);
    $("#process-btn").css("display", "flex");
  });

  $(".new-review-status").on("change", async function (e) {
    const id = e.target.id;
    const reviewStatus = $(`#${id}.new-review-status`).val();

    try {
      const response = await axios.post(`/admin/review/${id}`, {
        reviewStatus: reviewStatus,
      });
      console.log("response:", response);
      const result = response.data;
      if (result.data) {
        $(`#${id}.new-review-status`)
          .removeClass("status-active status-hidden")
          .addClass(`status-${reviewStatus.toLowerCase()}`)
          .blur();
      } else alert("Review update failed!");
    } catch (err) {
      console.log(err);
      alert("Review update failed!");
    }
  });
});

function validateForm() {
  const productId = $(".review-product").val(),
    reviewerName = $(".reviewer-name").val(),
    reviewStars = $(".review-stars").val(),
    reviewText = $(".review-text").val(),
    reviewStatus = $(".review-status").val();

  if (
    productId === "" ||
    reviewerName === "" ||
    reviewStars === "" ||
    reviewText === "" ||
    reviewStatus === ""
  ) {
    alert("Please insert all details!");
    return false;
  } else return true;
}
