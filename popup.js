document.addEventListener("DOMContentLoaded", () => {
  const status = document.getElementById("status");
  const list = document.getElementById("nonFollowersList");
  const copyBtn = document.getElementById("copyBtn");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0] || !tabs[0].url.includes("instagram.com/")) {
      status.textContent = "Please open an Instagram profile.";
      return;
    }

    chrome.tabs.sendMessage(tabs[0].id, { type: "getNonFollowers" }, (response) => {
      if (chrome.runtime.lastError) {
        status.textContent = "Error: No response from content script.";
        console.error("Runtime error:", chrome.runtime.lastError.message);
        return;
      }

      if (response?.error) {
        status.textContent = "Error: " + response.error;
        console.error("Script error:", response.error);
        return;
      }

      const { nonFollowers, username } = response;

      if (!nonFollowers || nonFollowers.length === 0) {
        status.textContent = `Everyone follows @${username} back! 🎉`;
        return;
      }

      let clipboardText = "";
      let count = 0;

      status.textContent = `Non-Followers found: ${count}`;
      const interval = setInterval(() => {
        if (count >= nonFollowers.length) {
          clearInterval(interval);
          status.textContent = `Non-Followers found: ${nonFollowers.length}`;
          copyBtn.style.display = "block";
          return;
        }

        const user = nonFollowers[count];
        const li = document.createElement("li");
        li.innerHTML = `<a href="https://instagram.com/${user.username}" target="_blank">@${user.username}</a>`;
        list.appendChild(li);

        clipboardText += `Username: ${user.username}\nProfile link: https://instagram.com/${user.username}\n\n`;
        status.textContent = `Non-Followers found: ${count + 1}`;
        count++;
      }, 100);
      
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(clipboardText.trim());
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy List to Clipboard"), 2000);
      };
    });
  });
});
