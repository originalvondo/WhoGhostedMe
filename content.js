chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getNonFollowers") {
    (async () => {
      try {
        const url = window.location.href;
        const usernameMatch = url.match(/instagram\.com\/([^/?]+)/);
        const username = usernameMatch ? usernameMatch[1] : null;

        if (!username) {
          sendResponse({ error: "Not on a profile page." });
          return;
        }

        let followers = [];
        let followings = [];

        // First try topsearch
        let userId = null;
        try {
          const userQueryRes = await fetch(
            `https://www.instagram.com/web/search/topsearch/?query=${username}`
          );
          const userQueryJson = await userQueryRes.json();
          const user = userQueryJson.users.find(u => u.user.username === username);
          userId = user?.user?.pk || null;
        } catch (e) {
          console.warn("Topsearch failed:", e);
        }

        // If topsearch fails, fallback to scraping profile_id from HTML
        if (!userId) {
          const html = document.documentElement.innerHTML;
          const match = html.match(/"profile_id":"(\d+)"/);
          if (match) {
            userId = match[1];
          }
        }

        if (!userId) {
          sendResponse({ error: "User ID not found." });
          return;
        }

        const sendProgress = (progress) => {
          chrome.runtime.sendMessage({ action: 'progress', ...progress });
        };

        // Fetch followers and followings in parallel
        const fetchFollowers = async (userId, onProgress) => {
          let followers = [];
          let after = null;
          let has_next = true;
          let totalFetched = 0;

          while (has_next) {
            const res = await fetch(
              `https://www.instagram.com/graphql/query/?query_hash=c76146de99bb02f6415203be841dd25a&variables=` +
              encodeURIComponent(JSON.stringify({
                id: userId,
                first: 100,
                after: after,
              }))
            );
            const data = await res.json();
            has_next = data.data.user.edge_followed_by.page_info.has_next_page;
            after = data.data.user.edge_followed_by.page_info.end_cursor;

            const newFollowers = data.data.user.edge_followed_by.edges.map(({ node }) => ({
              username: node.username,
              full_name: node.full_name,
            }));
            followers = followers.concat(newFollowers);
            totalFetched += newFollowers.length;

            if (onProgress) {
              onProgress({ type: 'followers', fetched: totalFetched });
            }
          }
          return followers;
        };

        const fetchFollowings = async (userId, onProgress) => {
          let followings = [];
          let after = null;
          let has_next = true;
          let totalFetched = 0;

          while (has_next) {
            const res = await fetch(
              `https://www.instagram.com/graphql/query/?query_hash=d04b0a864b4b54837c0d870b0e77e076&variables=` +
              encodeURIComponent(JSON.stringify({
                id: userId,
                first: 100,
                after: after,
              }))
            );
            const data = await res.json();
            has_next = data.data.user.edge_follow.page_info.has_next_page;
            after = data.data.user.edge_follow.page_info.end_cursor;

            const newFollowings = data.data.user.edge_follow.edges.map(({ node }) => ({
              username: node.username,
              full_name: node.full_name,
            }));
            followings = followings.concat(newFollowings);
            totalFetched += newFollowings.length;

            if (onProgress) {
              onProgress({ type: 'followings', fetched: totalFetched });
            }
          }
          return followings;
        };

        // Fetch followers and followings in parallel
        const [fetchedFollowers, fetchedFollowings] = await Promise.all([
          fetchFollowers(userId, sendProgress),
          fetchFollowings(userId, sendProgress)
        ]);

        followers = fetchedFollowers;
        followings = fetchedFollowings;

        // Use Web Worker for comparison if lists are large (optional optimization)
        // For smaller lists, do it directly on main thread
        const totalUsers = followers.length + followings.length;
        
        if (totalUsers > 10000) {
          // Use Web Worker for large lists
          const worker = new Worker(chrome.runtime.getURL('worker.js'));
          worker.onmessage = (e) => {
            const { notFollowingBack } = e.data;
            sendResponse({ nonFollowers: notFollowingBack, username });
            worker.terminate();
          };
          worker.postMessage({ followers, followings });
        } else {
          // Compare followers and followings using Set for O(1) lookup
          const followerUsernames = new Set(followers.map(f => f.username));
          const dontFollowMeBack = followings.filter(f => !followerUsernames.has(f.username));

          sendResponse({ nonFollowers: dontFollowMeBack, username });
        }
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
});
