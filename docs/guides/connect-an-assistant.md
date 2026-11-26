# Connect an AI assistant to your venue

Let an AI assistant such as Claude look up your venue's reservations, guests and open times, over a read-only connection. The assistant can read. It cannot book, change or cancel anything.

This guide is for a venue owner or manager who can sign in to the hospitality app. Refs #9488, built on #9663 (token model), #9664 (token as read-only bearer), #9665 (Settings page) and #9666 (MCP endpoint).

## 1. Create a token

1. Sign in to the hospitality app and open **Settings**.
2. Find the **Connect an AI assistant** card.
3. Enter a **Token name**, such as the assistant it is for (up to 80 characters). A name is required.
4. Pick **Expires**: in 30 days, in 90 days (the default), in 1 year, or never.
5. Choose **Create token**.
6. Copy the token now with **Copy token**. It is shown once, and you cannot see it again. If you lose it, revoke it and create another.

A token starts with `mbe_pat_`. Treat it like a password: anyone who holds it can read your venues' data until it expires or you revoke it.

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

Five read-only tools. Names are exact.

| Tool                      | Takes                                            | Does                                                                                   |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `list_venues`             | nothing                                          | Lists the venues you belong to: `id`, `name`, `ianaTimezone`.                          |
| `check_availability`      | `venueId`, `date` (YYYY-MM-DD), `partySize`      | Lists the time slots open to online guests on a date (the online booking widget view). |
| `lookup_reservation`      | `venueId`, optional `guestName`, optional `date` | Finds reservations by guest name and/or date.                                          |
| `search_guests`           | `venueId`, `query`                               | Searches the guest directory by name, email or phone.                                  |
| `list_today_reservations` | `venueId`, optional `date`, optional `status`    | Lists reservations for today (venue-local) or a given date, optionally by status.      |

`status` is one of `PENDING`, `CONFIRMED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`. The assistant calls `list_venues` first and passes a venue's `id` as `venueId` to the other four. These are the same tools the in-app chat uses for reading, so they behave alike.

`check_availability` shows the online-booking view only. A service that takes phone bookings only shows no slots there, so an empty answer does not mean the venue is full.

## 4. What read-only and scoping mean

- **Read-only is enforced on the server.** The MCP endpoint registers only the five tools above, so no write tool can be reached. Separately, the reservations API refuses any request authenticated by a token that is not `GET` or `HEAD` (`403`), and a token can never reach the token endpoints, so it cannot create or revoke tokens.
- **A token acts as you.** It reaches every venue you belong to, and nothing else. You cannot limit a token to one venue. The reservations API checks venue membership on each request, so a `venueId` for a venue you do not belong to is refused.
- **Guest data is in scope.** `search_guests` and `lookup_reservation` return guest names and contact details for your venues. Share a token only with an assistant you trust with that.
- **Limits.** 60 requests per minute per token, answered with `429` and a `Retry-After` header past that. A bad, expired or revoked token answers `401`.

## 5. See and revoke tokens

The Settings card lists each token with its name, a short prefix, when it was created, when it was last used (or "Never used"), and when it expires.

To revoke, choose **Revoke** next to the token and confirm. Anything using the token stops working right away, and this cannot be undone. Revoke a token when you stop using an assistant, when a laptop is lost, or when you think the token leaked.
