# Bible Song Pro – OBS Overlay for Bible Verses & Song Lyrics

A modern church presentation system for OBS Studio that lets you display Bible verses and song lyrics in real-time.

**Originally created by Johnson Olakotan. Modified and improved by Ethan Cannelongo.**

---

## Features

- **Real-time Bible verse display** & **Auto-Retrieve Lyrics**
- **Dual Display Support:** Independently control Display 1 for main outputs and Display 2 with custom transitions and text layouts perfectly tuned for a secondary destination.
- **LAN Remote Control:** Connect safely across the network using the built-in Node server. You can control the slides directly from any computer or tablet on your local area network (LAN)! 
- **Remote Synchronization:** Have multiple operators in the production room? No problem. State stays globally unified across the network — one operator's UI correctly mirrors another operator's live projection state dynamically in real-time.
- **Highly Customizable:** Edit background styles, typography, and positioning live.
- Works perfectly as an internal OBS Browser Source Dock or in an external web browser!

---

## Setup (Network Mode)

1. Open your terminal and run `START_LAN_SERVER.command` (MacOS). 
2. Open your preferred browser. Navigate to the IP and port shown in the terminal (e.g. `http://YOUR_LAN_IP:5511`).
3. Access the Control Panel via the browser
4. Enable Network Broadcast in the settings
5. Embed the display links as Browser Sources in your production application (e.g. OBS, vMix).

---

## How It Works

- `Bible Song Pro panel.html` -> Control interface and dashboard
- `BSP_display.html` -> Primary presentation output screen
- `BSP_display2.html` -> Secondary presentation output screen
- Real-time zero-latency sync via `BroadcastChannel` API locally, or WebSocket relay for Local Area Networks.

---

## Tech Stack

- HTML, Vanilla CSS, JavaScript
- `BroadcastChannel` API
- Node.js (WebSockets)
- OBS Browser Source

---

## Support

- Original GitHub repo: `https://github.com/Johnbatey/bible-song-pro-obs`
