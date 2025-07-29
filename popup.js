// popup.js

document.addEventListener('DOMContentLoaded', async () => {
  debugger; // breakpoint: DOM loaded
  const statusEl = document.getElementById('status');
  const listEl   = document.getElementById('list');

  try {
    // 1) Get the active tab
    debugger; // before querying tabs
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      throw new Error('Couldn’t find active tab or URL');
    }

    // 2) Ensure we’re on an Instagram profile URL
    debugger; // before URL check
    if (!/^https:\/\/www\.instagram\.com\/[^\/]+\/$/.test(tab.url)) {
      throw new Error('Not on an Instagram profile page');
    }

    statusEl.textContent = '✅ Profile detected. Fetching data…';
    debugger; // before sending message

    // 3) Ask content.js for the non‑followers
    chrome.tabs.sendMessage(tab.id, { action: 'getNonFollowers' }, response => {
      debugger; // entering response callback

      try {
        if (!response) {
          throw new Error('No response from content script');
        }
        if (!response.success) {
          throw new Error(`Content script error: ${response.error}`);
        }

        const users = response.data;
        statusEl.textContent = `✅ Retrieved ${users.length} entries.`;
        listEl.innerHTML = '';  // clear any previous content

        if (!users.length) {
          listEl.innerHTML = '<li>🎉 Everyone follows you back!</li>';
          return;
        }

        // 4) Render list
        users.forEach(u => {
          const li = document.createElement('li');
          li.innerHTML = `
            <a
              href="https://www.instagram.com/${u.username}/"
              target="_blank"
              rel="noopener noreferrer"
            >
              ${u.username}
            </a>`;
          listEl.appendChild(li);
        });
      } catch (err) {
        debugger; // breakpoint: error rendering response
        statusEl.textContent = `⚠️ ${err.message}`;
        console.error('Popup render error:', err);
      }
    });
  } catch (err) {
    debugger; // breakpoint: outer try/catch
    statusEl.textContent = `❌ ${err.message}`;
    console.error('Popup initialization error:', err);
  }
});
