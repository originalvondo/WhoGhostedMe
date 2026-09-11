# Instagram API & Profile Analysis: WhoGhostedMe

This document provides a comprehensive technical breakdown of Instagram's web endpoints, payload structures, relationship semantics, button state machines, and permission rules discovered through live network traffic analysis on `instagram.com`.

---

## 1. Profile Query: `PolarisProfilePageContentQuery`

When navigating to any profile on `instagram.com` (`instagram.com/<username>/`), the Instagram web client issues a GraphQL request to retrieve profile data, relationship state, and viewer context.

### Endpoint Details
- **URL**: `POST https://www.instagram.com/api/graphql`
- **Doc ID**: `28036671149327607`
- **Friendly Name**: `PolarisProfilePageContentQuery`
- **Headers Needed** (Browser automatically sends cookies, session credentials, and user agent):
  - `Content-Type`: `application/x-www-form-urlencoded`
  - `X-CSRFToken`: `<csrftoken cookie value>`
  - `X-IG-App-ID`: `936619743392459`
  - `X-FB-Friendly-Name`: `PolarisProfilePageContentQuery`
- **Form Body**:
  ```http
  doc_id=28036671149327607
  &fb_api_req_friendly_name=PolarisProfilePageContentQuery
  &server_timestamps=true
  &variables={"enable_integrity_filters":true,"id":"<TARGET_USER_PK>","__relay_internal__pv__PolarisCannesGuardianExperienceEnabledrelayprovider":true,"__relay_internal__pv__PolarisCASB976ProfileEnabledrelayprovider":false,"__relay_internal__pv__PolarisWebSchoolsEnabledrelayprovider":false,"__relay_internal__pv__PolarisRepostsConsumptionEnabledrelayprovider":true,"__relay_internal__pv__PolarisShortDramaEnabledrelayprovider":false}
  ```

---

## 2. Profile Response Structure: Three Core Scenarios

Every profile response contains two primary objects under `data`:
1. `data.user`: The profile being viewed.
2. `data.viewer.user`: The currently logged-in account (the viewer).

```
data: {
  user: { ... },    <-- Profile being viewed
  viewer: {
    user: {
      pk: "...",    <-- Logged-in user's PK
      id: "..."
    }
  }
}
```

### Comparative Analysis Table

| Attribute | Scenario 1: Own Profile | Scenario 2: Followed User (Private) | Scenario 3: Private Non-Followed User |
| :--- | :--- | :--- | :--- |
| **Target User PK** | `"52577246685"` | `"8421121150"` / `"63910523456"` | `"77420864783"` (`_chill.strom_`) |
| **Viewer PK** | `"52577246685"` | `"52577246685"` | `"52577246685"` |
| **Profile Identification** | `user.pk === viewer.user.pk` (**Own**) | `user.pk !== viewer.user.pk` (**Other**) | `user.pk !== viewer.user.pk` (**Other**) |
| `friendship_status` | `null` | `{ following: true, followed_by: true, ... }` | `{ following: false, followed_by: true, ... }` |
| `follower_count` | Available (`196`) | Available (`440` / `30`) | Available (`39`) |
| `following_count` | Available (`157`) | Available (`146` / `41`) | Available (`90`) |
| `profile_pic_url` | Full CDN URL | Full CDN URL | Full CDN URL |
| `hd_profile_pic_url_info` | Full 1080p CDN URL | Full 1080p CDN URL | Full 1080p CDN URL |
| `is_private` | `true` | `true` | `true` |
| `is_verified` | `false` | `false` | `false` |
| **Can fetch followers list?** | **YES** (Own profile) | **YES** (`following: true`) | **NO** (`is_private: true && following: false`) |
| **Can fetch following list?** | **YES** (Own profile) | **YES** (`following: true`) | **NO** (`is_private: true && following: false`) |

---

## 3. Privacy & Guardrail Handling: Scenario 3 Deep Dive

When inspecting a private profile that the viewer does not follow (`is_private: true && friendship_status.following === false`):
1. **GraphQL Query Succeeds**:
   - Returns full header metadata: `pk`, `username`, `full_name`, `follower_count`, `following_count`, `profile_pic_url`, and `friendship_status`.
   - `followed_by: true` indicates whether this private user follows the viewer (fan relationship).
   - `outgoing_request: true` indicates if the viewer has an active pending follow request.
2. **Relationship Lists are Restricted**:
   - Instagram blocks `friendships/<id>/followers/` and `following/`.
3. **Extension UX Handling**:
   - Extension immediately identifies the restriction without sending failing API calls:
     ```javascript
     const isRestrictedPrivate = profile.is_private && !profile.isOwnProfile && profile.friendship_status?.following !== true;
     ```
   - Displays a clean, informative profile card:
     - User's avatar, `@username`, full name, and bio.
     - Total Followers and Following counts.
     - Relationship banner:
       - If `followed_by === true`: *"@username follows you, but their account is private. Follow them back to scan."*
       - If `followed_by === false`: *"This account is private. Follow @username to scan their profile."*
     - Action Button:
       - If `outgoing_request === true`: Disabled `"Requested"` button (or `"Cancel Request"` on hover).
       - If `outgoing_request === false`: Interactive `"Follow Back"` or `"Follow"` button.

---

## 4. Relationship Endpoints: Universal Specifications

Live testing on **Own Profile** (`52577246685`) and **Other User's Profile** (`63910523456`) confirms complete uniformity across all scenarios.

### Matrix: Following vs. Followers Across All Accounts

| Feature | Following Endpoint | Followers Endpoint |
| :--- | :--- | :--- |
| **URL Pattern** | `/api/v1/friendships/${userId}/following/?count=${count}` | `/api/v1/friendships/${userId}/followers/?count=${count}&search_surface=follow_list_page` |
| **Initial Request** | No `max_id` param | No `max_id` param |
| **Pagination Param** | `&max_id=${next_max_id}` | `&max_id=${encodeURIComponent(next_max_id)}` |
| **Cursor Value** | Numeric index (`"12"`, `"24"`, `"36"`) | Numeric index (`"12"`, `"24"`) OR Base64 string (`"QVFC..."`) |
| **Response Object** | `{ users, has_more, next_max_id, page_size, big_list, status }` | `{ users, has_more, next_max_id, page_size, big_list, status }` |
| **User Object Schema** | `pk`, `id`, `username`, `full_name`, `profile_pic_url`, `is_private`, `is_verified` | `pk`, `id`, `username`, `full_name`, `profile_pic_url`, `is_private`, `is_verified` |
| **Termination Flag** | `has_more === false` or `!next_max_id` or `users.length === 0` | `has_more === false` or `!next_max_id` or `users.length === 0` |
| **Follow-up Metadata** | `POST /api/v1/friendships/show_many/` | `POST /api/v1/friendships/show_many/` |

---

## 5. Friendship Statuses Endpoint (`show_many/`) Semantics

Immediately following each page of followers or followings, Instagram calls:
`POST https://www.instagram.com/api/v1/friendships/show_many/`
- Form: `user_ids=<comma_separated_ids>&jazoest=...&fb_dtsg=...`

### Key Semantic Rule
- `friendship_statuses` **ALWAYS reflects the relationship between the LOGGED-IN VIEWER and the users in the list.**
- If on **Own Profile**:
  - `status.following === true` means the viewer follows them.
  - `status.is_bestie === true` means the user is on the viewer's Close Friends list.
- If on **Another Person's Profile**:
  - `status.following` and `status.is_bestie` still indicate the **viewer's** relationship with those users.
  - This allows the WhoGhostedMe action button ("Follow" / "Following") in the side panel to ALWAYS accurately reflect what the viewer can do (Follow or Unfollow that person)!

---

## 6. Button State Machine & User Interactions

Every profile card rendered in the extension features context-aware action buttons with responsive hover states based on the viewer's friendship status:

| Relationship State | Default Label & Style | Hover Label & Style | Click Action |
| :--- | :--- | :--- | :--- |
| **Viewer follows user** (`following: true`) | `"Following"` (neutral gray border) | `"Unfollow"` (soft red text/border) | Calls `friendships/destroy/${id}/` -> Transitions to `"Follow"` or `"Follow Back"` |
| **User follows viewer, but viewer doesn't follow** | `"Follow Back"` (Instagram blue) + `"Remove"` pill | `"Follow Back"` | Calls `friendships/create/${id}/` -> Transitions to `"Following"` |
| **Neither follows each other** | `"Follow"` (Instagram blue) | `"Follow"` | Calls `friendships/create/${id}/` -> Transitions to `"Following"` (or `"Requested"` if private) |
| **Viewer sent request, pending** (`outgoing_request: true`) | `"Requested"` (neutral gray) | `"Cancel Request"` (soft red) | Calls `friendships/destroy/${id}/` -> Cancels request |
| **User requested to follow viewer** (`incoming_request: true`) | Badge: `"Requested you"` + `"Confirm"` | `"Confirm"` | Approves follower request |

### Remove Follower Action
When a user is following the viewer, the viewer can remove them from their followers list without blocking:
- **URL**: `POST https://www.instagram.com/api/v1/friendships/remove_follower/${userId}/`
- **Body**: `user_id=${userId}`
- **Headers**: `X-CSRFToken`, `X-IG-App-ID: 936619743392459`, `X-Requested-With: XMLHttpRequest`

---

## 7. Universal Mathematical Set Operations

Because the relationship lists (`followers` and `following`) belong to the **target user being scanned** (whether it's yourself or another person):

1. Let $F_{ers}$ = Set of all IDs in target user's `followers` list.
2. Let $F_{ing}$ = Set of all IDs in target user's `following` list.

### A. Don't Follow Back (Ghosts)
$$\text{Ghosts} = \{ u \in \text{following} \mid u.\text{id} \notin F_{ers} \}$$
- **Signal Badge**: Card shows `"Doesn't follow back"` badge.
- **Meaning on Own Profile**: People you follow who do not follow you back.
- **Meaning on Another Person's Profile**: People that person follows who do not follow that person back.

### B. Fans
$$\text{Fans} = \{ u \in \text{followers} \mid u.\text{id} \notin F_{ing} \}$$
- **Signal Badge**: Card shows `"Fan • Doesn't follow back"` badge.
- **Meaning on Own Profile**: People who follow you, whom you do not follow back.
- **Meaning on Another Person's Profile**: People who follow that person, whom that person does not follow back.

### C. Mutual Followers
$$\text{Mutual} = \{ u \in \text{following} \mid u.\text{id} \in F_{ers} \}$$

---

## 8. Action Endpoints Summary

- **Follow User**:
  - `POST https://www.instagram.com/api/v1/friendships/create/${userId}/`
  - Body: `user_id=${userId}&container_module=profile`
- **Unfollow / Cancel Request**:
  - `POST https://www.instagram.com/api/v1/friendships/destroy/${userId}/`
  - Body: `user_id=${userId}`
- **Remove Follower**:
  - `POST https://www.instagram.com/api/v1/friendships/remove_follower/${userId}/`
  - Body: `user_id=${userId}`
