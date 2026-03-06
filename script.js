document.addEventListener("DOMContentLoaded", () => {
  const addressBar = document.getElementById("address-bar");
  const loadBtn = document.getElementById("load-btn");
  const viewport = document.getElementById("viewport-frame");

  loadBtn.addEventListener("click", () => {
    let url = addressBar.value;
    if (!url.startsWith("http")) {
      url = "https://" + url;
    }
    // We use a "template literal" (the backticks ``) to easily plug in the URL
    viewport.src = `/proxy?url=${url}`;
  });
});