console.log("Users frontend javascript file");

$(".member-status").on("change", function (e) {
  const id = e.target.id,
    memberStatus = $(`#${id}.member-status`).val();

  axios
    .post("/admin/user/edit", {
      _id: id,
      memberStatus: memberStatus,
    })
    .then((response) => {
      console.log("response:", response);
      const result = response.data;

      if (result.data) {
        $(`#${id}.member-status`)
          .removeClass("status-active status-block status-delete")
          .addClass(`status-${memberStatus.toLowerCase()}`)
          .blur();
        toast(`Status set to ${memberStatus.toLowerCase()}.`);
      } else toast("User update failed.", "bad");
    })
    .catch((err) => {
      console.log(err);
      toast(errorMessage(err, "User update failed."), "bad");
    });
});
