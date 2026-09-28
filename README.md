# Personal Workspace for 9Router

A local chat workspace and dashboard for 9Router. It runs on the same Android
device as 9Router through Termux, so the browser can use the local gateway at
`127.0.0.1`.

## Features

- Chat with models exposed by 9Router's OpenAI-compatible API.
- Search and select from the model list returned by 9Router.
- Keep multiple conversations in the browser's local storage.
- View gateway status, available models, and recent conversations.
- Keep the 9Router API key on the local Node server, never in browser code.
- No frontend or server packages to install.

## Run in Termux

Install Node.js and Git if needed:

```sh
pkg update
pkg install nodejs-lts git
```

Clone the public repository:

```sh
git clone https://github.com/VLjnh-New/personal-workspace-9router.git
cd personal-workspace-9router
cp .env.example .env
```

Edit `.env` and set the API key configured in your 9Router instance:

```sh
nano .env
```

At minimum, set:

```dotenv
ROUTER_API_KEY=your-9router-api-key
```

The default 9Router API address is `http://127.0.0.1:20128`. If you start
9Router on a different port, update `ROUTER_BASE_URL` in `.env`. For example,
if 9Router is running on port `5000`:

```dotenv
ROUTER_BASE_URL=http://127.0.0.1:5000
```

Start 9Router in one Termux session:

```sh
9router --port 20128 --host 127.0.0.1 --no-browser
```

Then start this app in another Termux session:

```sh
npm start
```

Open `http://127.0.0.1:4173` in the browser on the same device.

The server binds to `127.0.0.1` by default, so it is not exposed to other
devices on your Wi-Fi. Only set `HOST=0.0.0.0` if you intentionally want to
access it from another device on your local network.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Address for the Personal Workspace web server |
| `PORT` | `4173` | Port for the Personal Workspace web server |
| `ROUTER_BASE_URL` | `http://127.0.0.1:20128` | Base URL of the local 9Router API |
| `ROUTER_API_KEY` | empty | API key required by 9Router for chat requests |
| `ROUTER_REQUEST_TIMEOUT_MS` | `120000` | Maximum wait for a response from 9Router |

`.env` is ignored by Git. Do not commit API keys or paste them into the
browser's developer tools. Conversation history is stored in local browser
storage and is not uploaded by this app.

## Checks

```sh
npm run check
```