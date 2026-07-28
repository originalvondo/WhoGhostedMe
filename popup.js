// popup.js
const statusEl = document.getElementById("status");
const progressContainer = document.getElementById("progressContainer");
const followersProgress = document.getElementById("followersProgress");
const followingsProgress = document.getElementById("followingsProgress");
const followersProgressText = document.getElementById("followersProgressText");
const followingsProgressText = document.getElementById("followingsProgressText");
const resultList = document.getElementById("results");
const copyBtn = document.getElementById("copy");
const openBtn = document.getElementById("open");
// const exportTxtBtn = document.getElementById("exportTxtBtn");
const exportCSVBtn = document.getElementById("exportCsvBtn");

function showStatus(text, withSpinner = true) {
  statusEl.innerHTML = withSpinner
    ? `${text}<span class="spinner"></span>`
    : text;
}

// Listen for progress updates from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'progress') {
    progressContainer.style.display = 'block';
    
    if (message.type === 'followers') {
      followersProgressText.textContent = `${message.fetched} loaded`;
      // We don't know total, so just show a growing bar
      followersProgress.style.width = `${Math.min(message.fetched / 100 * 100, 100)}%`;
    } else if (message.type === 'followings') {
      followingsProgressText.textContent = `${message.fetched} loaded`;
      followingsProgress.style.width = `${Math.min(message.fetched / 100 * 100, 100)}%`;
    }
  }
});

// kick off
showStatus("Checking");

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  chrome.tabs.sendMessage(tabs[0].id, { type: "getNonFollowers" }, (response) => {
    if (!response || response.error) {
      statusEl.textContent = "Error: " + (response?.error || "No response from content script.");
      return;
    }

    const { nonFollowers, username } = response;
    let count = 0;
    progressContainer.style.display = "none";
    showStatus(`Checking who ghosted ${username}`);

    const interval = setInterval(() => {
      if (count < nonFollowers.length) {
        const user = nonFollowers[count].username;
        const li = document.createElement("li");
        li.innerHTML = `<a href="https://instagram.com/${user}" target="_blank">${user}</a>`;
        resultList.appendChild(li);

        count++;
      } else {
        clearInterval(interval);
        showStatus(`${nonFollowers.length} people ghosted ${username}`, false);
        copyBtn.style.display = "inline-block";
        openBtn.style.display = "inline-block";
        // exportTxtBtn.style.display = "inline-block";
        exportCSVBtn.style.display = "inline-block";
      }
    }, 20);

    copyBtn.addEventListener("click", () => {
      const text = nonFollowers.map(u =>
        `Username: ${u.username}\nprofile link: https://instagram.com/${u.username}`
      ).join("\n\n");

      navigator.clipboard.writeText(text).then(() => {
        copyBtn.textContent = "Copied to clipboard";
        copyBtn.classList.add("copied");
      });
    });

    openBtn.addEventListener("click", () => {
      const html = `
        <html>
          <head><title>Ghosted ${username}</title></head>
          <body>
            <h2>People who ghosted ${username}</h2>
            <ol>
              ${nonFollowers.map(u =>
                `<li><a href="https://instagram.com/${u.username}" target="_blank">${u.username}</a></li>`
              ).join("")}
            </ol>
          </body>
        </html>
      `;
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      chrome.tabs.create({ url });
    });

    // exportTxtBtn.addEventListener("click", () => {
    //   if (!nonFollowers.length) return;
    //   const content = nonFollowers.map(u => `${u.full_name} | (@${u.username})`).join("\n");
    //   downloadFile("ghosted_list.txt", content, "text/plain");
    // });

    exportCSVBtn.addEventListener("click", () => {
      if (!nonFollowers.length) return;
      const headers = "Full Name,Username\n";
      const rows = nonFollowers.map(u => `${u.full_name}, ${u.username}`).join("\n");
      const content = headers + rows;
      downloadFile("ghosted_list.csv", content, "text/csv");
    });

    function downloadFile(filename, content, mimeType) {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();

      URL.revokeObjectURL(url);
    }

  });
});

