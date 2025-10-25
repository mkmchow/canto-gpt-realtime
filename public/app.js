// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const voiceSelect = document.getElementById('voiceSelect');
const instructionsInput = document.getElementById('instructionsInput');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const conversation = document.getElementById('conversation');
const logContainer = document.getElementById('logContainer');
const clearLogBtn = document.getElementById('clearLogBtn');

// WebRTC components
let peerConnection = null;
let dataChannel = null;
let audioElement = null;

// Event listeners
startBtn.addEventListener('click', startSession);
stopBtn.addEventListener('click', stopSession);
clearLogBtn.addEventListener('click', () => {
    logContainer.innerHTML = '';
});

// Start a new session
async function startSession() {
    try {
        updateStatus('connecting', 'Requesting ephemeral key...');
        log('Requesting ephemeral key from server...', 'info');

        // Get ephemeral key from backend
        const response = await fetch('/api/session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                voice: voiceSelect.value,
                instructions: instructionsInput.value || undefined
            })
        });

        if (!response.ok) {
            throw new Error('Failed to get ephemeral key');
        }

        const { sessionId, ephemeralKey, expiresAt } = await response.json();
        
        log(`✅ Ephemeral key received (Session: ${sessionId})`, 'success');
        log(`⏰ Expires at: ${new Date(expiresAt * 1000).toLocaleString()}`, 'info');

        // Initialize WebRTC connection
        await initWebRTC(ephemeralKey);

        startBtn.disabled = true;
        stopBtn.disabled = false;
        voiceSelect.disabled = true;
        instructionsInput.disabled = true;

    } catch (error) {
        console.error('Error starting session:', error);
        log(`❌ Error: ${error.message}`, 'error');
        updateStatus('error', 'Failed to start session');
        addMessage('system', `Error: ${error.message}`);
    }
}

// Initialize WebRTC peer connection
async function initWebRTC(ephemeralKey) {
    try {
        updateStatus('connecting', 'Setting up WebRTC connection...');
        log('Creating RTCPeerConnection...', 'info');

        // Create peer connection
        peerConnection = new RTCPeerConnection();

        // Set up audio element to play remote audio
        audioElement = document.createElement('audio');
        audioElement.autoplay = true;
        document.body.appendChild(audioElement);

        peerConnection.ontrack = (event) => {
            log('📡 Received remote audio track', 'success');
            audioElement.srcObject = event.streams[0];
        };

        // Get user microphone
        log('🎤 Requesting microphone access...', 'info');
        const clientMedia = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        log('✅ Microphone access granted', 'success');
        const audioTrack = clientMedia.getAudioTracks()[0];
        peerConnection.addTrack(audioTrack);

        // Create data channel for events
        dataChannel = peerConnection.createDataChannel('realtime-channel');
        setupDataChannel(dataChannel);

        // Create and set local offer
        log('📝 Creating SDP offer...', 'info');
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Send offer to Azure and get answer
        const region = 'eastus2'; // Must match your Azure OpenAI resource region
        const deployment = 'gpt-realtime';
        const webrtcUrl = `https://${region}.realtimeapi-preview.ai.azure.com/v1/realtimertc?model=${deployment}`;
        
        log(`🌐 Connecting to: ${webrtcUrl}`, 'info');

        const sdpResponse = await fetch(webrtcUrl, {
            method: 'POST',
            body: offer.sdp,
            headers: {
                'Authorization': `Bearer ${ephemeralKey}`,
                'Content-Type': 'application/sdp'
            }
        });

        if (!sdpResponse.ok) {
            throw new Error(`WebRTC connection failed: ${sdpResponse.status}`);
        }

        const answerSdp = await sdpResponse.text();
        const answer = { type: 'answer', sdp: answerSdp };
        await peerConnection.setRemoteDescription(answer);

        log('✅ WebRTC connection established!', 'success');
        updateStatus('connected', 'Connected - Start speaking!');

    } catch (error) {
        console.error('Error initializing WebRTC:', error);
        throw error;
    }
}

// Set up data channel event handlers
function setupDataChannel(channel) {
    channel.addEventListener('open', () => {
        log('📢 Data channel opened', 'success');
        updateStatus('listening', 'Listening...');
        
        // Send session update with instructions
        const instructions = instructionsInput.value.trim();
        if (instructions) {
            const event = {
                type: 'session.update',
                session: {
                    instructions: instructions
                }
            };
            channel.send(JSON.stringify(event));
            log('📤 Sent session.update', 'info');
        }
    });

    channel.addEventListener('message', (event) => {
        const realtimeEvent = JSON.parse(event.data);
        handleRealtimeEvent(realtimeEvent);
    });

    channel.addEventListener('close', () => {
        log('📢 Data channel closed', 'warning');
        updateStatus('disconnected', 'Disconnected');
    });

    channel.addEventListener('error', (error) => {
        log(`❌ Data channel error: ${error}`, 'error');
    });
}

// Handle realtime events from Azure
function handleRealtimeEvent(event) {
    log(`📨 ${event.type}`, 'info');

    switch (event.type) {
        case 'session.created':
            addMessage('system', `Session created with model: ${event.session.model}`);
            break;

        case 'session.updated':
            addMessage('system', 'Session configuration updated');
            break;

        case 'input_audio_buffer.speech_started':
            updateStatus('listening', 'You are speaking...');
            break;

        case 'input_audio_buffer.speech_stopped':
            updateStatus('connected', 'Processing...');
            break;

        case 'conversation.item.input_audio_transcription.completed':
            if (event.transcript) {
                addMessage('user', event.transcript);
            }
            break;

        case 'response.audio_transcript.delta':
            updateAssistantMessage(event.delta);
            break;

        case 'response.audio_transcript.done':
            finalizeAssistantMessage(event.transcript);
            break;

        case 'response.created':
            updateStatus('speaking', 'AI is speaking...');
            break;

        case 'response.done':
            updateStatus('listening', 'Listening...');
            break;

        case 'error':
            log(`❌ Error: ${event.error.message}`, 'error');
            addMessage('system', `Error: ${event.error.message}`);
            break;
    }
}

// UI update functions
let currentAssistantMessage = null;

function updateAssistantMessage(delta) {
    if (!currentAssistantMessage) {
        currentAssistantMessage = document.createElement('div');
        currentAssistantMessage.className = 'message assistant-message';
        currentAssistantMessage.innerHTML = '<strong>Assistant:</strong> <span class="text"></span>';
        conversation.appendChild(currentAssistantMessage);
    }
    
    const textSpan = currentAssistantMessage.querySelector('.text');
    textSpan.textContent += delta;
    conversation.scrollTop = conversation.scrollHeight;
}

function finalizeAssistantMessage(transcript) {
    if (currentAssistantMessage && transcript) {
        const textSpan = currentAssistantMessage.querySelector('.text');
        textSpan.textContent = transcript; // Use final transcript
    }
    currentAssistantMessage = null;
}

function addMessage(role, text) {
    const messageDiv = document.createElement('div');
    
    if (role === 'user') {
        messageDiv.className = 'message user-message';
        messageDiv.innerHTML = `<strong>You:</strong> ${text}`;
    } else if (role === 'assistant') {
        messageDiv.className = 'message assistant-message';
        messageDiv.innerHTML = `<strong>Assistant:</strong> ${text}`;
    } else {
        messageDiv.className = 'message system-message';
        messageDiv.innerHTML = `<strong>System:</strong> ${text}`;
    }
    
    conversation.appendChild(messageDiv);
    conversation.scrollTop = conversation.scrollHeight;
}

function updateStatus(state, text) {
    statusIndicator.className = `status-indicator ${state}`;
    statusText.textContent = text;
}

function log(message, type = 'info') {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// Stop session
function stopSession() {
    log('Stopping session...', 'warning');

    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (audioElement) {
        audioElement.remove();
        audioElement = null;
    }

    startBtn.disabled = false;
    stopBtn.disabled = true;
    voiceSelect.disabled = false;
    instructionsInput.disabled = false;

    updateStatus('disconnected', 'Session ended');
    addMessage('system', 'Session ended');
    log('✅ Session stopped', 'success');
}

// Initial message
addMessage('system', 'Click "Start Session" to begin. Make sure to allow microphone access when prompted.');


