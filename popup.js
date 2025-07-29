document.addEventListener("DOMContentLoaded", () => {
  const status = document.getElementById("status");
  const listContainer = document.getElementById("list");
  const errorDiv = document.getElementById("error");
  const copyBtn = document.getElementById("copyBtn");

  chrome.runtime.sendMessage({ type: "getActiveTab" }, (response) => {
    const tab = response.tab;
    if (!tab || !tab.url.includes("instagram.com")) {
      status.textContent = "Please go to an Instagram profile page.";
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "getNonFollowers" }, (res) => {
      if (chrome.runtime.lastError) {
        errorDiv.textContent = "Content script not responding.";
        return;
      }

      if (res.error) {
        errorDiv.textContent = "Error: " + res.error;
        return;
      }

      const { nonFollowers, username } = res;
      status.textContent = `Non-followers for ${username}: ${nonFollowers.length}`;

      let formattedList = "";

      nonFollowers.forEach((user) => {
        const link = `https://instagram.com/${user.username}`;
        const div = document.createElement("div");
        div.className = "user";
        div.innerHTML = `<a href="${link}" target="_blank">${user.username}</a>`;
        listContainer.appendChild(div);

        formattedList += `Username: ${user.username}\nProfile link: ${link}\n\n`;
      });

      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(formattedList).then(() => {
          copyBtn.textContent = "Copied!";
          setTimeout(() => {
            copyBtn.textContent = "Copy list to clipboard";
          }, 1500);
        });
      });
    });
  });
});
