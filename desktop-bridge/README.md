# HayKasa Discord Bridge

HayKasa's web player cannot rely on Discord's legacy browser WebSocket RPC for new Discord applications. This local bridge keeps the website isolated from Discord IPC while still allowing Rich Presence on Discord Desktop.

## Windows quick start

1. Install Node.js 20 or newer if it is not already installed.
2. Open Discord Desktop and sign in.
3. Double-click `start-windows.bat` and leave the window running.
4. Open `https://haykasa.vercel.app`, enable **Discord listening activity**, and play a song.

The website connects only to `ws://127.0.0.1:64650`. The bridge then connects to Discord's native `discord-ipc-0` through `discord-ipc-9` pipe and sends `SET_ACTIVITY`.

## Start from a terminal

```powershell
node desktop-bridge/discord-bridge.mjs
```

## Start automatically with Windows

Run this once from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File desktop-bridge/install-windows-startup.ps1
```

## Health check

With the bridge running, open:

`http://127.0.0.1:64650/health`

It reports whether the bridge is running and whether it currently has an open Discord IPC connection.

## Security

- The bridge listens only on `127.0.0.1`; it is not exposed to the LAN or internet.
- Browser WebSocket upgrades are accepted only from HayKasa production and explicit local development origins.
- No Discord client secret is stored in the bridge or sent to the browser.
- The bridge clears Rich Presence shortly after the last HayKasa browser connection closes.
