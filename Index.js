const addressBar = document.getElementById("address-bar");
const loadBtn = document.getElementById("load-btn");
const viewport = document.getElementById("veiwport-frame");

loadBtn.addEventListener("click", () => {
  let url = addressBar.value;
  if (!url.startsWith("http")) {
    url = "https://" + url;
  }
  veiwport.src = url;
});
