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
        let dontFollowMeBack = [];

        const userQueryRes = await fetch(
          `https://www.instagram.com/web/search/topsearch/?query=${username}`
        );
        const userQueryJson = await userQueryRes.json();
        const user = userQueryJson.users.find(u => u.user.username === username);
        const userId = user?.user?.pk;

        if (!userId) {
          sendResponse({ error: "User ID not found." });
          return;
        }

        let after = null;
        let has_next = true;

        // Fetch followers
        while (has_next) {
          const res = await fetch(
            `https://www.instagram.com/graphql/query/?query_hash=c76146de99bb02f6415203be841dd25a&variables=` +
              encodeURIComponent(
                JSON.stringify({
                  id: userId,
                  include_reel: true,
                  fetch_mutual: true,
                  first: 50,
                  after: after,
                })
              )
          );
          const data = await res.json();
          has_next = data.data.user.edge_followed_by.page_info.has_next_page;
          after = data.data.user.edge_followed_by.page_info.end_cursor;

          followers = followers.concat(
            data.data.user.edge_followed_by.edges.map(({ node }) => ({
              username: node.username,
              full_name: node.full_name,
            }))
          );
        }

        // Fetch followings
        after = null;
        has_next = true;

        while (has_next) {
          const res = await fetch(
            `https://www.instagram.com/graphql/query/?query_hash=d04b0a864b4b54837c0d870b0e77e076&variables=` +
              encodeURIComponent(
                JSON.stringify({
                  id: userId,
                  include_reel: true,
                  fetch_mutual: true,
                  first: 50,
                  after: after,
                })
              )
          );
          const data = await res.json();
          has_next = data.data.user.edge_follow.page_info.has_next_page;
          after = data.data.user.edge_follow.page_info.end_cursor;

          followings = followings.concat(
            data.data.user.edge_follow.edges.map(({ node }) => ({
              username: node.username,
              full_name: node.full_name,
            }))
          );
        }

        dontFollowMeBack = followings.filter(f => {
          return !followers.find(fl => fl.username === f.username);
        });

        sendResponse({ nonFollowers: dontFollowMeBack, username });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();

    return true;
  }
});
