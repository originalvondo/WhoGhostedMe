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

        // Function to fetch image and convert to data URL
        const fetchImageAsDataUrl = async (imageUrl) => {
          if (!imageUrl) return '';
          try {
            const response = await fetch(imageUrl);
            if (!response.ok) return '';
            const blob = await response.blob();
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result);
              reader.onerror = () => resolve('');
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            console.warn('Failed to fetch image:', imageUrl, e);
            return '';
          }
        };

        // Fetch followers and followings in parallel
        const fetchFollowers = async (userId, onProgress) => {
          let followers = [];
          let after = null;
          let has_next = true;
          let totalFetched = 0;
          let totalCount = 0;

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

            // Get total count from first response
            if (totalCount === 0) {
              totalCount = data.data.user.edge_followed_by.count;
            }

            const newFollowers = data.data.user.edge_followed_by.edges.map(({ node }) => ({
              username: node.username,
              full_name: node.full_name,
              profile_pic_url: node.profile_pic_url,
              profile_pic_url_hd: node.profile_pic_url_hd,
            }));
            followers = followers.concat(newFollowers);
            totalFetched += newFollowers.length;

            if (onProgress) {
              onProgress({ type: 'followers', fetched: totalFetched, total: totalCount });
            }
          }
          return followers;
        };

        const fetchFollowings = async (userId, onProgress) => {
          let followings = [];
          let after = null;
          let has_next = true;
          let totalFetched = 0;
          let totalCount = 0;

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

            // Get total count from first response
            if (totalCount === 0) {
              totalCount = data.data.user.edge_follow.count;
            }

            const newFollowings = data.data.user.edge_follow.edges.map(({ node }) => ({
              username: node.username,
              full_name: node.full_name,
              profile_pic_url: node.profile_pic_url,
              profile_pic_url_hd: node.profile_pic_url_hd,
            }));
            followings = followings.concat(newFollowings);
            totalFetched += newFollowings.length;

            if (onProgress) {
              onProgress({ type: 'followings', fetched: totalFetched, total: totalCount });
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
          worker.onmessage = async (e) => {
            const { notFollowingBack } = e.data;
            // Fetch profile pictures for ghosted users
            const usersWithImages = await Promise.all(notFollowingBack.map(async (user) => {
              const profilePic = user.profile_pic_url_hd || user.profile_pic_url;
              const profilePicDataUrl = await fetchImageAsDataUrl(profilePic);
              return { ...user, profile_pic_data_url: profilePicDataUrl };
            }));
            // Send ghosted users to popup
            chrome.runtime.sendMessage({
              action: 'ghostedUsers',
              users: usersWithImages
            });
            sendResponse({ nonFollowers: usersWithImages, username });
            worker.terminate();
          };
          worker.postMessage({ followers, followings });
        } else {
          // Compare followers and followings using Set for O(1) lookup
          const followerUsernames = new Set(followers.map(f => f.username));
          const dontFollowMeBack = followings.filter(f => !followerUsernames.has(f.username));

          // Fetch profile pictures for ghosted users
          const usersWithImages = await Promise.all(dontFollowMeBack.map(async (user) => {
            const profilePic = user.profile_pic_url_hd || user.profile_pic_url;
            const profilePicDataUrl = await fetchImageAsDataUrl(profilePic);
            return { ...user, profile_pic_data_url: profilePicDataUrl };
          }));

          // Send ghosted users to popup
          chrome.runtime.sendMessage({
            action: 'ghostedUsers',
            users: usersWithImages
          });
          
          sendResponse({ nonFollowers: usersWithImages, username });
        }
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }
});
