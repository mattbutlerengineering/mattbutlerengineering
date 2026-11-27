# Connect an AI assistant to your venue

Let an AI assistant such as Claude look up your venue's reservations, guests and open times. By default the connection is read-only: the assistant can read, and it cannot book, change or cancel anything. You can opt a token in to a small set of changes (move a booking, pause and resume tables), each of which is a two-step change the assistant is told to show you before it goes ahead (section 4).

This guide is for a venue owner or manager who can sign in to the hospitality app. Refs #9488 and #9489, built on #9663 (token model), #9664 (token as bearer), #9665 (Settings page), #9666 (MCP endpoint), #9778 (write scope), #9780 (audit) and #9781 (write tools).

## 1. Create a token

1. Sign in to the hospitality app and open **Settings**.
2. Find the **Connect an AI assistant** card.
3. Enter a **Token name**, such as the assistant it is for (up to 80 characters). A name is required.
4. Pick **Expires**: in 30 days, in 90 days (the default), in 1 year, or never.
5. Leave **Allow this token to make changes** off for a read-only token (the default). Turn it on only if you want the assistant to be able to move a booking or pause and resume tables (section 4).
6. Choose **Create token**.
7. Copy the token now with **Copy token**. It is shown once, and you cannot see it again. If you lose it, revoke it and create another.

A token starts with `mbe_pat_`. Treat it like a password: anyone who holds it can read your venues' data until it expires or you revoke it. A token that can make changes can also move bookings and pause tables for as long as it lives, so keep those short-lived.

You can hold at most 10 active tokens. At the limit, the card asks you to revoke one before creating another.

## 2. Add the server to your assistant

The server is a remote MCP server over streamable HTTP.

- **URL:** `https://mattbutlerengineering.com/api/gen/mcp`
- **Authentication:** an `Authorization: Bearer <your token>` header on every request.
- **Methods:** `POST` only. `GET` and `DELETE` answer `405` with `Allow: POST`. The server keeps no session between requests and answers in plain JSON.

### Claude Desktop

Claude Desktop reads `claude_desktop_config.json` (Settings, Developer, Edit Config). That file starts local servers, so reach a remote server that needs a bearer header through the `mcp-remote` bridge:

```json
{
  "mcpServers": {
    "mbe-venues": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mattbutlerengineering.com/api/gen/mcp",
        "--header",
        "Authorization:${MBE_AUTH_HEADER}"
      ],
      "env": {
        "MBE_AUTH_HEADER": "Bearer mbe_pat_your_token_here"
      }
    }
  }
}
```

Restart Claude Desktop. The server announces itself as `mbe-venues`. The `mcp-remote` bridge and the config file location come from their own projects' documentation, not from this repo, so check them if a Claude Desktop release changes the format.

### Any other MCP client

Point a client that supports streamable HTTP at the URL above and set the `Authorization` header to `Bearer <your token>`. To check the connection by hand:

```bash
curl -sS https://mattbutlerengineering.com/api/gen/mcp \
  -H "Authorization: Bearer $MBE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 3. What the assistant can do

A read-only token (the default) gets five read-only tools and nothing else. Names are exact.

| Tool                      | Takes                                            | Does                                                                                   |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `list_venues`             | nothing                                          | Lists the venues you belong to: `id`, `name`, `ianaTimezone`.                          |
| `check_availability`      | `venueId`, `date` (YYYY-MM-DD), `partySize`      | Lists the time slots open to online guests on a date (the online booking widget view). |
| `lookup_reservation`      | `venueId`, optional `guestName`, optional `date` | Finds reservations by guest name and/or date.                                          |
| `search_guests`           | `venueId`, `query`                               | Searches the guest directory by name, email or phone.                                  |
| `list_today_reservations` | `venueId`, optional `date`, optional `status`    | Lists reservations for today (venue-local) or a given date, optionally by status.      |

`status` is one of `PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`. The assistant calls `list_venues` first and passes a venue's `id` as `venueId` to the other four. These are the same tools the in-app chat uses for reading, so they behave alike.

`check_availability` shows the online-booking view only. A service that takes phone bookings only shows no slots there, so an empty answer does not mean the venue is full.

## 4. Making changes (opt-in)

A token created with **Allow this token to make changes** adds three tools to the five above. A read-only token never sees them and cannot call them.

| Tool                 | Takes                                                                                         | Does                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `modify_reservation` | `venueId`, `reservationId`, and any of `date`, `startTime`, `endTime`, `tableId`, `partySize` | Moves a booking. It cannot change notes, status, or override a limit.                                                          |
| `pause_tables`       | `venueId`, `tables` (names or numbers), `until` (a date as YYYY-MM-DD, or `until reopened`)   | Takes tables out of booking from today. It refuses when a booking sits on those tables; finish those on the Availability page. |
| `resume_tables`      | `venueId`, `tables`                                                                           | Undoes `pause_tables`: reopens the table pause that holds exactly those tables, telling no guest.                              |

These tools are marked destructive. Whether your assistant app actually asks you before running a tool depends on its own tool-approval setting, so keep approval on for these tools.

**Every change takes two calls.**

1. The assistant calls the tool. Nothing is changed. The reply is a preview of what would happen (for `pause_tables`, whether any booking would be affected) and a `confirmToken`.
2. The assistant calls the same tool again with the `confirmToken`. The server then makes exactly the change in the preview, whatever else the assistant sends. This is enforced by the server.

The assistant is instructed to show you the preview and wait for your yes before the second call. The server cannot check that you said yes: whether you are actually prompted depends on your assistant app's tool-approval setting. Keep approval turned on for these tools.

A `confirmToken` works once, for that tool and venue, and expires after 5 minutes. It is signed with your access token, so no one else can make one, and a changed, expired or reused token is refused. Every change a token makes is logged with the tool that made it.

Nothing else can be changed with a token, even by calling the API directly: the reservations API refuses any other write.

## 5. What read-only and scoping mean

- **Read-only is enforced on the server.** A read-only token sees only the five read tools, so no write tool can be reached. Separately, the reservations API refuses any request authenticated by a read-only token that is not `GET` or `HEAD` (`403`). A token that can make changes may make only the changes in section 4. No token can ever reach the token management endpoints, so it cannot create or revoke tokens.
- **A token acts as you.** It reaches every venue you belong to, and nothing else. You cannot limit a token to one venue. The reservations API checks venue membership on each request, so a `venueId` for a venue you do not belong to is refused.
- **Guest data is in scope.** `search_guests` and `lookup_reservation` return guest names and contact details for your venues. Share a token only with an assistant you trust with that.
- **Limits.** 60 requests per minute per token, answered with `429` and a `Retry-After` header past that. A bad, expired or revoked token answers `401`.

## 6. See and revoke tokens

The Settings card lists each token with its name, whether it can make changes, a short prefix, when it was created, when it was last used (or "Never used"), and when it expires.

To revoke, choose **Revoke** next to the token and confirm. Anything using the token stops working right away, and this cannot be undone. Revoke a token when you stop using an assistant, when a laptop is lost, or when you think the token leaked.
