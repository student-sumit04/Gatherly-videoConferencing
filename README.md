# Gatherly — Video Conferencing and Collaboration

Gatherly is a browser-based meeting workspace for real-time video calls and lightweight team collaboration. It combines peer-to-peer WebRTC media with Socket.io room events, providing video meetings, group chat, screen sharing, local recording, participant presence, and a shared whiteboard in one responsive interface.

The project deliberately uses a small Node.js stack and plain browser JavaScript. There is no frontend build step, making the code approachable for learners and straightforward for new contributors to run and modify.

## Table of contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Project structure](#project-structure)
- [How the application works](#how-the-application-works)
- [Getting started](#getting-started)
- [Available commands](#available-commands)
- [Testing a meeting](#testing-a-meeting)
- [Real-time event contract](#real-time-event-contract)
- [Development guide](#development-guide)
- [Security and privacy](#security-and-privacy)
- [Production deployment](#production-deployment)
- [Known limitations](#known-limitations)
- [Contribution guide](#contribution-guide)
- [Troubleshooting](#troubleshooting)

## Features

### Meetings and media

- Pre-join screen with a live camera preview
- Camera and microphone toggles before and during a meeting
- Peer-to-peer audio and video powered by WebRTC and PeerJS
- Responsive video grid for one or multiple participants
- Live camera and microphone status in the participant list
- Automatic cleanup when a participant disconnects

### Collaboration

- Room-wide chat with sender names and timestamps
- The latest 100 chat messages retained while a room is active
- Synchronized whiteboard with pen color, eraser, and clear controls
- Screen sharing with automatic restoration of the camera stream
- Invite-link copying from the meeting header or participant panel

### Recording and experience

- Local browser recording exported as a `.webm` file
- Remembered display name using browser local storage
- Unread chat indicator and unobtrusive status notifications
- Desktop, tablet, and mobile layouts
- Safe message rendering that does not insert user text as HTML

## Technology stack

| Area | Technology | Responsibility |
| --- | --- | --- |
| Frontend | HTML, EJS, CSS, vanilla JavaScript | Meeting UI and browser interactions |
| Media | WebRTC and PeerJS | Peer-to-peer camera, microphone, and screen streams |
| Real-time data | Socket.io | Chat, presence, media state, and whiteboard synchronization |
| Backend | Node.js and Express | HTTP server, routing, static assets, and room lifecycle |
| Templates | EJS | Injecting the generated room ID into the meeting page |
| Recording | MediaRecorder API | Saving a local camera or shared-screen recording |
| Tests | Node.js assertions and Socket.io Client | Integration smoke testing |

Node.js 18 or newer is required. Node.js 20 or 22 LTS is recommended.

## Project structure

```text
video-chat-v1-master/
├── backend/
│   └── server.js              # Express, Socket.io, PeerJS and room state
├── frontend/
│   ├── public/
│   │   ├── script.js          # Media, calls, chat, recording and whiteboard UI
│   │   └── style.css          # Visual system and responsive layouts
│   └── views/
│       └── room.ejs           # Pre-join screen and meeting markup
├── tests/
│   └── smoke.js               # HTTP and Socket.io integration smoke test
├── .gitignore
├── package.json               # Dependencies and root-level commands
├── package-lock.json          # Reproducible dependency versions
└── README.md
```

### Folder responsibilities

`frontend/` contains everything delivered to or rendered for the browser. Changes to layouts, controls, client-side media handling, and visual styling belong here.

`backend/` contains server-only code. Room membership, transient message history, whiteboard history, event validation, and PeerJS signaling are handled here.

`tests/` contains automated checks that exercise the public HTTP routes and real-time server events. New backend events should normally receive a corresponding smoke-test assertion.

The root directory contains project configuration and documentation so all common commands can be run from one location.

## How the application works

### 1. Room creation

Visiting `/` creates a UUID with Node's cryptographically secure `randomUUID()` function and redirects the user to `/:roomId`. Anyone with the same room URL joins the same meeting.

### 2. Pre-join flow

The browser asks for camera and microphone permission and displays a local preview. Users may disable either track before joining. If permission is unavailable, the user can still enter the room and use chat or the whiteboard.

### 3. Signaling and media

After the user submits a display name, the client connects to the embedded PeerJS signaling server and receives a peer ID. That ID and basic media state are sent to the room through Socket.io.

PeerJS helps participants exchange WebRTC connection information. Camera, microphone, and screen media travel directly between browsers when network conditions permit; the application server does not record or relay those media streams.

### 4. Room collaboration

Socket.io distributes small JSON events for:

- participant joins and departures;
- camera and microphone state;
- chat messages;
- whiteboard strokes and clearing.

The server stores room state in memory. It keeps up to 100 messages plus the current whiteboard strokes and removes the whole room when its final participant leaves.

### 5. Screen sharing and recording

Screen sharing replaces the outgoing WebRTC video track without ending the current peer call. When sharing ends, the client restores the camera track.

Recording uses the browser's `MediaRecorder` API. The result is downloaded directly to the recording user's device as WebM. It is not uploaded to the server.

## Getting started

### Prerequisites

- Node.js 18 or newer
- npm, included with Node.js
- A current version of Chrome, Edge, Firefox, or another WebRTC-capable browser
- A camera and microphone for full media testing

### Installation

From the project root:

```bash
npm install
```

Start the application:

```bash
npm start
```

Open:

```text
http://localhost:3030
```

The root route automatically creates and opens a new meeting room.

### Development mode

Use Nodemon to restart the backend after file changes:

```bash
npm run dev
```

Frontend files are served directly. Refresh the browser after editing `frontend/public` or `frontend/views`.

### Optional environment variable

The default port is `3030`. Set `PORT` to use another port.

PowerShell:

```powershell
$env:PORT=4000
npm start
```

Bash:

```bash
PORT=4000 npm start
```

## Available commands

| Command | Purpose |
| --- | --- |
| `npm start` | Start the application normally |
| `npm run dev` | Start with automatic backend restarts |
| `npm run check` | Check backend and frontend JavaScript syntax |
| `npm test` | Run the integration smoke test against a running server |

The smoke test expects the app at `http://localhost:3030`. To test another URL, set `TEST_URL` before running it.

## Testing a meeting

### Quick manual test

1. Run `npm start`.
2. Open `http://localhost:3030` in a browser.
3. Copy the generated room URL.
4. Open the same URL in a private browser window or a second browser.
5. Join with two different names.
6. Verify video, microphone toggling, chat, the participant list, and whiteboard strokes.
7. Test screen sharing and stop it through the browser share indicator.
8. Start and stop recording and verify that a WebM file is saved locally.

Using headphones prevents audio feedback when testing two participants on the same computer.

### Automated smoke test

Keep the application running in one terminal:

```bash
npm start
```

Run the test in another terminal:

```bash
npm test
```

The test verifies:

- meeting page rendering;
- the PeerJS signaling route;
- two clients joining one room;
- chat delivery and sender information;
- participant media-state updates;
- whiteboard stroke synchronization.

## Real-time event contract

Socket.io event names and payloads form the interface between `frontend/public/script.js` and `backend/server.js`.

| Event | Direction | Purpose |
| --- | --- | --- |
| `join-room` | Client → Server | Register a name, peer ID, room ID, and media state |
| `room-state` | Server → Client | Send current participants, messages, and whiteboard history |
| `participant-joined` | Server → Clients | Announce a new participant |
| `participants-updated` | Server → Clients | Replace the current participant roster |
| `participant-left` | Server → Clients | Remove a disconnected participant |
| `media-state` | Client → Server | Publish local camera and microphone state |
| `participant-media` | Server → Clients | Broadcast an updated participant media state |
| `chat-message` | Both directions | Submit and distribute a sanitized chat message |
| `board-draw` | Both directions | Submit and distribute one normalized drawing segment |
| `board-clear` | Both directions | Clear whiteboard history for the room |

When changing a payload, update the server, browser client, smoke test, and this table together.

## Development guide

### Frontend changes

- Edit structure and accessible labels in `frontend/views/room.ejs`.
- Edit colors, spacing, components, and breakpoints in `frontend/public/style.css`.
- Edit meeting behavior and browser APIs in `frontend/public/script.js`.
- Reuse the existing CSS custom properties instead of introducing isolated colors.
- Keep buttons keyboard accessible and provide an `aria-label` for icon-only controls.
- Render user-controlled content with `textContent`, never `innerHTML`.

### Backend changes

- Add routes, room state, and real-time event handlers in `backend/server.js`.
- Treat every event payload as untrusted input.
- Limit strings and numeric ranges before storing or broadcasting them.
- Clean up per-room resources when the final participant disconnects.
- Avoid placing media data in Socket.io events; WebRTC should handle media streams.

### Adding a real-time feature

1. Define a small JSON payload and event name.
2. Validate and normalize the payload in the backend.
3. Broadcast only to the appropriate room.
4. Add client-side rendering and cleanup behavior.
5. Add an integration assertion to `tests/smoke.js`.
6. Document the event in the event-contract table.
7. Run `npm run check` and `npm test`.

### Code conventions

- Use descriptive names and small functions focused on one behavior.
- Prefer `const`; use `let` only when a value is reassigned.
- Use two spaces for JavaScript, HTML, and CSS indentation.
- Keep shared application state inside the existing client `state` object.
- Do not commit secrets, generated recordings, `node_modules`, or `.env` files.

## Security and privacy

- Chat messages are trimmed, length-limited on the server, and rendered as text in the browser.
- Display names, room IDs, colors, drawing coordinates, and stroke widths are normalized before use.
- Recordings are created and downloaded locally; the backend does not receive them.
- Room URLs act as access links. The current project does not provide accounts, passwords, or waiting rooms.
- Camera and microphone permissions are controlled by the browser.
- In-memory state disappears when the last participant leaves or the server restarts.

Do not treat this learning project as production-ready access control. Authentication, authorization, abuse prevention, and operational monitoring must be added for public deployment.

## Production deployment

Production browsers require HTTPS for camera, microphone, screen-sharing, and recording APIs, except on `localhost`.

Before deploying publicly, plan for:

- HTTPS and secure WebSocket proxying;
- a dedicated TURN server for participants behind restrictive networks;
- authentication and room authorization;
- persistent storage if chat or whiteboards must survive restarts;
- rate limits and message-size limits at the proxy and application levels;
- a privacy policy and clear recording consent;
- centralized logging and error monitoring;
- a Socket.io adapter such as Redis when running multiple server instances.

A reverse proxy must forward both normal HTTP requests and WebSocket upgrades for Socket.io and PeerJS.

## Known limitations

- Room data is stored in server memory and is not persistent.
- There is no user account, meeting password, waiting room, or host moderation.
- No TURN server is configured, so some restrictive network combinations may fail to establish media.
- Peer-to-peer mesh calls use more upload bandwidth as participant count grows and are best suited to small meetings.
- Recording captures the selected local source, not a server-composited view of every participant.
- Whiteboard drawing history has a safety cap and is not saved after a room closes.
- The app uses an externally hosted PeerJS browser script and Google Fonts, requiring internet access unless they are self-hosted.

## Contribution guide

Contributions are welcome. Keep changes focused and explain the user-facing reason for each change.

### Suggested workflow

1. Fork or clone the repository.
2. Create a branch such as `feature/meeting-timer` or `fix/screen-share-cleanup`.
3. Install dependencies with `npm install`.
4. Run the app and reproduce the behavior you want to change.
5. Implement the smallest complete solution in the appropriate folder.
6. Add or update automated tests.
7. Run `npm run check`.
8. Start the server and run `npm test` in a second terminal.
9. Manually test with two browser sessions when changing WebRTC or UI behavior.
10. Update this README if setup, structure, commands, limitations, or event payloads changed.

### Pull request checklist

- [ ] The change has a clear purpose and limited scope.
- [ ] Frontend and backend responsibilities remain separated.
- [ ] User-provided data is validated and safely rendered.
- [ ] Desktop and mobile layouts were checked for UI changes.
- [ ] Two-participant behavior was checked for media changes.
- [ ] `npm run check` passes.
- [ ] `npm test` passes against a running server.
- [ ] Documentation was updated where necessary.
- [ ] No generated files, recordings, credentials, or `node_modules` are included.

### Good first contributions

- Add a meeting duration timer.
- Add participant speaking indicators using the Web Audio API.
- Add whiteboard undo and redo support.
- Add chat delivery or typing indicators.
- Improve automated validation for malformed Socket.io payloads.
- Self-host frontend dependencies for offline development.
- Add Docker and deployment examples.

## Troubleshooting

### Camera or microphone does not open

- Confirm browser permission is allowed for the site.
- Close other applications that may be using the device.
- Use `localhost` during development or HTTPS in production.
- Reload the page after changing browser permission.

### Another participant has no video or audio

- Confirm both users joined the exact same room URL.
- Check that the participant did not disable the relevant track.
- Try a different network. A production deployment generally requires TURN.
- Open the browser developer console and check for PeerJS or permission errors.

### Screen sharing stops unexpectedly

Browsers display their own sharing indicator. Stopping from that indicator fires an event and Gatherly restores the camera automatically.

### Port 3030 is already in use

Stop the process using the port or start Gatherly on another port using the `PORT` environment variable.

### Automated test cannot connect

Start the application before running `npm test`. If the server uses another port, set `TEST_URL` to its full origin.

## License

This project currently uses the ISC license declared in `package.json`.
