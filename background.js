// background.js - Service worker for WhoGhostedMe side panel
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});
