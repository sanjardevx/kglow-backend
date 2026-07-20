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
    alert("Please insert all required inputs!");
    return false;
  }

  if (memberPassword.length < 8) {
    alert("Password must be at least 8 characters!");
    return false;
  }
}