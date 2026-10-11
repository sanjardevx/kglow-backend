console.log("Signup frontend javascript file");

$(function () {
  $(".password-toggle").on("click", function () {
    const input = $(".member-password");
    const isPassword = input.attr("type") === "password";
    input.attr("type", isPassword ? "text" : "password");
    $(this).text(isPassword ? "Hide" : "Show");
  });
});

function validateSignupForm() {
  const memberNick = $(".member-nick").val(),
    memberPassword = $(".member-password").val();

  if (memberNick === "" || memberPassword === "") {
    toast("Please insert all required inputs.", "bad");
    return false;
  }

  if (memberPassword.length < 8) {
    toast("Password must be at least 8 characters.", "bad");
    return false;
  }
}