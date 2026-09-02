// background.js - Service worker for WhoGhostedMe extension

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getActiveTab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] });
    });
    return true;
  }

  // Relay unfollow message to an Instagram tab if called from results.html or popup
  if (message.type === "relayUnfollow") {
    (async () => {
      try {
        // Find an open Instagram tab
        const tabs = await chrome.tabs.query({ url: "*://*.instagram.com/*" });
        if (!tabs || tabs.length === 0) {
          sendResponse({
            success: false,
            error: "No open Instagram tab found. Please keep an Instagram tab open to perform unfollow actions."
          });
          return;
        }

        // Send unfollow message to the first available Instagram tab content script
        const targetTab = tabs.find(t => t.active) || tabs[0];
        chrome.tabs.sendMessage(
          targetTab.id,
          { type: "unfollowUser", userId: message.userId, username: message.username },
          (response) => {
            if (chrome.runtime.lastError) {
              sendResponse({
                success: false,
                error: chrome.runtime.lastError.message || "Failed to communicate with Instagram tab."
              });
            } else {
              sendResponse(response || { success: false, error: "No response from content script." });
            }
          }
        );
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // Relay follow message to an Instagram tab if called from results.html or popup
  if (message.type === "relayFollow") {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ url: "*://*.instagram.com/*" });
        if (!tabs || tabs.length === 0) {
          sendResponse({
            success: false,
            error: "No open Instagram tab found. Please keep an Instagram tab open to perform follow actions."
          });
          return;
        }

        const targetTab = tabs.find(t => t.active) || tabs[0];
        chrome.tabs.sendMessage(
          targetTab.id,
          { type: "followUser", userId: message.userId, username: message.username },
          (response) => {
            if (chrome.runtime.lastError) {
              sendResponse({
                success: false,
                error: chrome.runtime.lastError.message || "Failed to communicate with Instagram tab."
              });
            } else {
              sendResponse(response || { success: false, error: "No response from content script." });
            }
          }
        );
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // Relay remove follower message to an Instagram tab if called from results.html or popup
  if (message.type === "relayRemoveFollower") {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ url: "*://*.instagram.com/*" });
        if (!tabs || tabs.length === 0) {
          sendResponse({
            success: false,
            error: "No open Instagram tab found. Please keep an Instagram tab open to perform actions."
          });
          return;
        }

        const targetTab = tabs.find(t => t.active) || tabs[0];
        chrome.tabs.sendMessage(
          targetTab.id,
          { type: "removeFollower", userId: message.userId, username: message.username },
          (response) => {
            if (chrome.runtime.lastError) {
              sendResponse({
                success: false,
                error: chrome.runtime.lastError.message || "Failed to communicate with Instagram tab."
              });
            } else {
              sendResponse(response || { success: false, error: "No response from content script." });
            }
          }
        );
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});
