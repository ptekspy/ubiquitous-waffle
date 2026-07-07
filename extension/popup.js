document.getElementById("status").textContent = `Ready · v${chrome.runtime.getManifest().version}`;

document.getElementById("open-local").addEventListener("click", async () => {
  await chrome.tabs.create({ url: "http://localhost:3000", active: true });
  window.close();
});

document.getElementById("open-reddit").addEventListener("click", async () => {
  await chrome.tabs.create({ url: "https://www.reddit.com", active: true });
  window.close();
});
