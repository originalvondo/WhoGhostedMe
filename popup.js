document.getElementById("status").textContent = "Checking...";

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  chrome.tabs.sendMessage(tabs[0].id, { type: "getNonFollowers" }, (response) => {
    const status = document.getElementById("status");
    const bar = document.getElementById("bar");
    const progressContainer = document.getElementById("progressBar");
    const resultList = document.getElementById("results");
    const copyBtn = document.getElementById("copy");
    const openBtn = document.getElementById("open");

    if (!response || response.error) {
      status.textContent = "Error: " + (response?.error || "No response from content script.");
      return;
    }

    const { nonFollowers, username } = response;
    let count = 0;
    progressContainer.style.display = "block";
    status.textContent = `Checking who ghosted ${username}...`;

    const interval = setInterval(() => {
      if (count < nonFollowers.length) {
        const li = document.createElement("li");
        li.textContent = `${nonFollowers[count].username}`;
        resultList.appendChild(li);
        count++;
        bar.style.width = `${(count / nonFollowers.length) * 100}%`;
      } else {
        clearInterval(interval);
        status.textContent = `${nonFollowers.length} people ghosted ${username}`;
        copyBtn.style.display = "inline-block";
        openBtn.style.display = "inline-block";
      }
    }, 50);

    copyBtn.onclick = () => {
      const text = nonFollowers.map(u =>
        `Username: ${u.username}\nprofile link: https://instagram.com/${u.username}`
      ).join("\n\n");
      navigator.clipboard.writeText(text);
    };

    openBtn.onclick = () => {
      const html = `
        <html>
          <head><title>Ghosted by ${username}</title></head>
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
    };
  });
});
