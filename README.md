# Azure OpenAI Realtime API - WebRTC Implementation

This project uses the **Azure OpenAI Realtime API via WebRTC** to provide low-latency, real-time voice conversations - matching the quality of the Azure AI Foundry Playground.

## 🎯 Why WebRTC?

The Azure playground uses **WebRTC** instead of WebSockets because:

- **Lower Latency**: Designed for real-time communication with minimal delay
- **Better Audio Quality**: Built-in audio/video codec support
- **Error Correction**: Handles packet loss and jitter automatically
- **Peer-to-Peer**: Direct connection reduces server overhead

WebSockets are only recommended for server-to-server scenarios where low latency isn't critical.

## 🏗️ Architecture

```
┌─────────┐                    ┌─────────┐                    ┌──────────┐
│ Browser │ ←──Ephemeral Key── │ Server  │                    │  Azure   │
│         │                    │         │                    │ OpenAI   │
│         │ ──────WebRTC Peer Connection (Direct)──────────→ │ Realtime │
│         │                    │         │                    │   API    │
└─────────┘                    └─────────┘                    └──────────┘
    ↓                                                               ↓
Microphone → RTC Audio Track ────────────────────────────→ Audio Input
                                                                    ↓
Speaker ← RTC Audio Track ←──────────────────────────── Audio Output
```

### Key Components:

1. **Backend (server.js)**: 
   - Mints ephemeral API keys (keeps your API key secure)
   - Serves static files

2. **Frontend (app.js)**:
   - Requests ephemeral key from backend
   - Establishes WebRTC peer connection directly to Azure
   - Sends audio via RTC audio tracks
   - Receives audio via RTC audio tracks
   - Sends/receives events via data channel

## 📋 Prerequisites

- Azure OpenAI resource in **East US 2** or **Sweden Central**
- Deployed `gpt-realtime` or `gpt-realtime-mini` model
- Node.js installed

## 🚀 Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   - The `.env` file is already configured with your Azure credentials
   - Verify these settings:
     ```
     AZURE_OPENAI_ENDPOINT=https://martin-0759-resource.openai.azure.com
     AZURE_OPENAI_API_KEY=your_api_key
     AZURE_OPENAI_DEPLOYMENT_NAME=gpt-realtime
     AZURE_REGION=eastus2
     ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open browser:**
   - Navigate to `http://localhost:3000`
   - Click "Start Session"
   - Allow microphone access
   - Start speaking!

## 🔧 How It Works

### Ephemeral Key Flow:

1. Client clicks "Start Session"
2. Client requests ephemeral key from backend (`/api/session`)
3. Backend calls Azure Sessions API with your API key
4. Azure returns ephemeral key (valid for 1 minute)
5. Backend returns ephemeral key to client
6. Client uses ephemeral key to establish WebRTC connection

### WebRTC Connection:

1. Create `RTCPeerConnection`
2. Add microphone audio track
3. Create data channel for events
4. Generate SDP offer
5. Send offer to Azure WebRTC endpoint with ephemeral key
6. Receive SDP answer from Azure
7. Set remote description
8. Connection established! 🎉

### Real-time Communication:

- **Audio**: Flows directly through RTC audio tracks (peer-to-peer)
- **Events**: Sent/received through data channel (transcripts, status, errors)

## 🎙️ Features

- **Low-latency voice interaction** (same quality as Azure playground)
- **Real-time transcription** of user speech
- **Interruption support** (interrupt AI at any time)
- **Voice selection** (alloy, echo, shimmer, verse, fable, onyx)
- **Custom instructions** for AI personality
- **Event logging** for debugging
- **Beautiful UI** with status indicators

## 🔒 Security

- API key stored securely on backend
- Only ephemeral keys exposed to client
- Ephemeral keys expire after 1 minute
- Ephemeral keys work for one session only

## 📚 References

- [Azure OpenAI Realtime API via WebRTC](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/realtime-audio-webrtc)
- [Azure OpenAI Realtime API Reference](https://learn.microsoft.com/en-us/azure/ai-services/openai/realtime-audio-reference)
- [WebRTC API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)

## 🆚 Comparison with WebSocket Version

| Feature | WebRTC (This Project) | WebSocket (GPT Realtime) |
|---------|----------------------|--------------------------|
| Latency | **Very Low** ⚡ | Higher |
| Audio Quality | **Excellent** 🎵 | Good |
| Use Case | Client apps | Server-to-server |
| Complexity | Moderate | Simple |
| Playground Match | **✅ Exact** | ❌ Different |

## 📝 License

MIT


