# Zoom-like Platform Implementation Roadmap

This document outlines the technical approach to implementing the comprehensive feature set of a modern Unified Communications/Video Conferencing platform (Zoom Clone).

## 1. Meeting & Call Core
**Architecture**: Transition from pure Mesh P2P to a Hybrid Architecture (SFU - Selective Forwarding Unit) for scalability.
*   **One-to-one**: Direct P2P (WebRTC). **[Implemented]**
*   **Group / Large Meetings**: Requires an SFU (e.g., Mediasoup, Janus, or LiveKit). Mesh P2P limits to ~4 participants due to bandwidth.
    *   *Implementation*: Deploy LiveKit server. Client connects to SFU. SFU forwards streams.
*   **Scheduling**:
    *   *Implementation*: PostgreSQL database for meeting entities (start_time, end_time, recurrence_rule). Backend CRUD endpoints.
*   **Join Logic**:
    *   *implementation*: Deep linking `app://join/ID` or `https://app.com/meeting/ID`.
    *   *Waiting Room*: Socket.io room "waiting_room_{ID}". Host approves, user moves to "active_room_{ID}".

## 2. Audio Features
*   **Device Selection**: `navigator.mediaDevices.enumerateDevices()`. Hot-swapping tracks using `sender.replaceTrack()`.
*   **Noise Suppression**: 
    *   *Web*: `AudioWorklet` with RNNoise (WASM).
    *   *Native*: Platform-specific SDKs.
*   **Dial-in/PSTN**: Integration with Twilio Programmable Voice or Vonage. SIP Trunking gateway to bridge PSTN -> WebRTC.

## 3. Video Features
*   **Resolution Control**: `RTCRtpEncodingParameters` (Simulcast). Send Low/Mid/High layers.
*   **Virtual Backgrounds**:
    *   *Implementation*: `@mediapipe/selfie_segmentation` or `tensforflow-models/body-pix`. Run segmentation mask on Canvas, compose with background image, send Canvas stream.
*   **Filters**: WebGL shaders on `<canvas>` before streaming.

## 4. Screen Sharing
*   **Capture**: `getDisplayMedia()`. **[Implemented]**
*   **Annotation**: Overlay a transparent `<canvas>` over the video element. Sync drawing coordinates via Data Channel.
*   **Remote Control**: Requires native OS-level app (Electron/Desktop). Web browser cannot control OS mouse (sandbox security).

## 5. Whiteboard
*   **Tech Stack**: HTML5 Canvas + CRDT (Conflict-free Replicated Data Type) like Yjs for real-time multi-user sync.
*   **Export**: `canvas.toDataURL()` or generate PDF.

## 6. Chat & Messaging
*   **Transport**: WebRTC Data Channels (for low latency in-meeting) + WebSocket/Redis (for persistence).
*   **Rich Text**: Markdown parsing.
*   **File Sharing**: Chunked ArrayBuffer transfer over Data Channel. **[Partially Implemented in P2PService]**

## 7. Participant Management
*   **State Management**: Redux/Zustand store for participant list.
*   **Permissions**: Role-based flags in JWT or Session object (isHost=true).
*   **Spotlight**: Signaling server instructs clients *which* stream to render in high quality.

## 8. Breakout Rooms
*   **Logic**: "Sub-rooms" in the signaling server.
*   **Flow**: Host triggers "split". Server sends messages to clients to disconnect main `transport` and connect to `breakout_transport_N`.

## 9. Recording
*   **Local**: `MediaRecorder` API in browser. Save Blob locally.
*   **Cloud**: 'Egress' service (headless Chrome or GStreamer bot) joins the room, composites video/audio, writes to AWS S3.

## 10. Transcription (AI)
*   **Pipeline**: Audio Stream -> Backend -> STT Service (Deepgram/Google Speech-to-Text) -> Text -> WebSocket Broadcast.
*   **Live**: Web Speech API (Client-side, free but limited support) or Server-side.

## 11. Security
*   **E2EE**: WebRTC Insertable Streams API. Encrypt frames with per-frame key before sending. Server cannot decrypt.
*   **Auth**: OAuth2 / OIDC for login.

## 12 - 20 (Enterprise Features)
*   These require a robust backend (Node.js/Go/Rust) + Relational DB + Redis.
*   **Zoom Phone**: Heavy telecom integration (SIP).
*   **Integration**: REST API + Webhooks.

---

## Current Active Tasks (Immediate Implementation)

1.  **Device Selection (Audio/Video)**: Allow users to switch inputs.
2.  **File Sharing in Chat**: Activate the P2P file transfer UI.
3.  **Meeting Link Logic**: Ensure deep linking works.

This document serves as the master plan. We will proceed iteratively.
