// DOM Elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const voiceSelect = document.getElementById('voiceSelect');
const roleInput = document.getElementById('roleInput');
const personalityInput = document.getElementById('personalityInput');
const wordLimitInput = document.getElementById('wordLimitInput');
const refineRoleBtn = document.getElementById('refineRoleBtn');
const refinePersonalityBtn = document.getElementById('refinePersonalityBtn');
const toggleConfigBtn = document.getElementById('toggleConfigBtn');
const configSections = document.getElementById('configSections');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const conversation = document.getElementById('conversation');
const logContainer = document.getElementById('logContainer');
const clearLogBtn = document.getElementById('clearLogBtn');
const logSection = document.getElementById('logSection');

// WebRTC components
let peerConnection = null;
let dataChannel = null;
let audioElement = null;

// State
let currentAssistantMessage = null;

// Event listeners
startBtn.addEventListener('click', startSession);
stopBtn.addEventListener('click', stopSession);
clearLogBtn.addEventListener('click', () => {
    logContainer.innerHTML = '';
});

// Toggle config sections (mobile)
toggleConfigBtn.addEventListener('click', () => {
    if (configSections.style.display === 'none') {
        configSections.style.display = 'block';
        toggleConfigBtn.textContent = '⬆️ 隱藏設定';
    } else {
        configSections.style.display = 'none';
        toggleConfigBtn.textContent = '⬇️ 顯示設定';
    }
});

// Refine buttons
refineRoleBtn.addEventListener('click', async () => {
    await refinePrompt('role');
});

refinePersonalityBtn.addEventListener('click', async () => {
    await refinePrompt('personality');
});

// Build system instructions from role, personality, and word limit
function buildSystemInstructions() {
    const role = roleInput.value.trim();
    const personality = personalityInput.value.trim();
    const wordLimit = wordLimitInput.value;

    let instructions = '';

    // Base instruction (always in Cantonese)
    instructions = '你係一個AI助手，用廣東話同用戶對話。';

    // Add role if provided
    if (role) {
        instructions += `\n\n你嘅身份：${role}`;
    }

    // Add personality if provided
    if (personality) {
        instructions += `\n\n你嘅性格同知識：${personality}`;
    }

    // Add word limit (override default if specified)
    if (wordLimit) {
        instructions += `\n\n重要：你嘅回覆最多${wordLimit}字。保持簡潔。`;
    } else {
        instructions += '\n\n重要：你嘅回覆盡量簡短，大概10-30字左右。保持簡潔。';
    }

    return instructions;
}

// Refine prompts using OpenRouter API (in Cantonese)
async function refinePrompt(type) {
    const isRole = type === 'role';
    const button = isRole ? refineRoleBtn : refinePersonalityBtn;
    const input = isRole ? roleInput : personalityInput;
    const originalText = input.value.trim();

    if (!originalText) {
        alert(isRole ? '請先輸入AI身份' : '請先輸入AI性格同知識');
        return;
    }

    // Disable button and show loading state
    button.disabled = true;
    button.classList.add('refining');
    button.textContent = '優化中...';

    try {
        const systemPrompt = isRole
            ? '你係一個AI助手，專門幫用戶優化佢哋嘅AI角色設定。用戶會俾你一個簡單嘅角色描述，你要將佢變得更詳細、更生動、更有用。用廣東話回覆，直接輸出優化後嘅內容，唔好加額外解釋。'
            : '你係一個AI助手，專門幫用戶優化佢哋嘅AI性格同知識設定。用戶會俾你一個簡單嘅性格描述，你要將佢變得更詳細、更生動、更有用。用廣東話回覆，直接輸出優化後嘅內容，唔好加額外解釋。';

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer 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',
                'HTTP-Referer': window.location.origin,
            },
            body: JSON.stringify({
                model: 'openai/gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: originalText }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        const refinedText = data.choices[0].message.content.trim();

        // Update input with refined text
        input.value = refinedText;
        log(`✨ ${isRole ? '身份' : '性格'}已優化`, 'success');

    } catch (error) {
        console.error('Error refining prompt:', error);
        log(`❌ 優化失敗: ${error.message}`, 'error');
        alert('優化失敗，請稍後再試');
    } finally {
        // Restore button state
        button.disabled = false;
        button.classList.remove('refining');
        button.textContent = '✨ 優化';
    }
}

// Start a new session
async function startSession() {
    try {
        updateStatus('connecting', '正在連接...');
        log('正在請求臨時密鑰...', 'info');

        // Get system instructions
        const instructions = buildSystemInstructions();

        // Get ephemeral key from backend
        const response = await fetch('/api/session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                voice: voiceSelect.value,
                instructions: instructions
            })
        });

        if (!response.ok) {
            throw new Error('無法獲取臨時密鑰');
        }

        const { sessionId, ephemeralKey, expiresAt } = await response.json();
        
        log(`✅ 臨時密鑰已接收 (Session: ${sessionId})`, 'success');
        log(`⏰ 到期時間: ${new Date(expiresAt * 1000).toLocaleString()}`, 'info');

        // Initialize WebRTC connection
        await initWebRTC(ephemeralKey, instructions);

        // Disable inputs during session
        startBtn.disabled = true;
        stopBtn.disabled = false;
        voiceSelect.disabled = true;
        roleInput.disabled = true;
        personalityInput.disabled = true;
        wordLimitInput.disabled = true;
        refineRoleBtn.disabled = true;
        refinePersonalityBtn.disabled = true;

        // Hide config on mobile after starting
        if (window.innerWidth <= 767) {
            configSections.style.display = 'none';
            toggleConfigBtn.style.display = 'block';
            toggleConfigBtn.textContent = '⬇️ 顯示設定';
        }

        // Clear conversation except system message
        conversation.innerHTML = '';

    } catch (error) {
        console.error('Error starting session:', error);
        log(`❌ 錯誤: ${error.message}`, 'error');
        updateStatus('error', '連接失敗');
        addMessage('system', `錯誤: ${error.message}`);
    }
}

// Initialize WebRTC peer connection
async function initWebRTC(ephemeralKey, instructions) {
    try {
        updateStatus('connecting', '正在建立WebRTC連接...');
        log('正在創建RTCPeerConnection...', 'info');

        // Create peer connection
        peerConnection = new RTCPeerConnection();

        // Set up audio element to play remote audio
        audioElement = document.createElement('audio');
        audioElement.autoplay = true;
        document.body.appendChild(audioElement);

        peerConnection.ontrack = (event) => {
            log('📡 收到遠程音頻軌道', 'success');
            audioElement.srcObject = event.streams[0];
        };

        // Get user microphone
        log('🎤 正在請求麥克風權限...', 'info');
        const clientMedia = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        log('✅ 麥克風權限已授予', 'success');
        const audioTrack = clientMedia.getAudioTracks()[0];
        peerConnection.addTrack(audioTrack);

        // Create data channel for events
        dataChannel = peerConnection.createDataChannel('realtime-channel');
        setupDataChannel(dataChannel, instructions);

        // Create and set local offer
        log('📝 正在創建SDP offer...', 'info');
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Send offer to Azure and get answer
        const region = 'eastus2'; // Must match your Azure OpenAI resource region
        const deployment = 'gpt-realtime';
        const webrtcUrl = `https://${region}.realtimeapi-preview.ai.azure.com/v1/realtimertc?model=${deployment}`;
        
        log(`🌐 正在連接: ${webrtcUrl}`, 'info');

        const sdpResponse = await fetch(webrtcUrl, {
            method: 'POST',
            body: offer.sdp,
            headers: {
                'Authorization': `Bearer ${ephemeralKey}`,
                'Content-Type': 'application/sdp'
            }
        });

        if (!sdpResponse.ok) {
            throw new Error(`WebRTC連接失敗: ${sdpResponse.status}`);
        }

        const answerSdp = await sdpResponse.text();
        const answer = { type: 'answer', sdp: answerSdp };
        await peerConnection.setRemoteDescription(answer);

        log('✅ WebRTC連接已建立！', 'success');
        updateStatus('connected', '已連接 - 開始講嘢！');

    } catch (error) {
        console.error('Error initializing WebRTC:', error);
        throw error;
    }
}

// Set up data channel event handlers
function setupDataChannel(channel, instructions) {
    channel.addEventListener('open', () => {
        log('📢 數據頻道已打開', 'success');
        updateStatus('listening', '聆聽中...');
        
        // Send session update with instructions
        if (instructions) {
            const event = {
                type: 'session.update',
                session: {
                    instructions: instructions
                }
            };
            channel.send(JSON.stringify(event));
            log('📤 已發送 session.update', 'info');
        }
    });

    channel.addEventListener('message', (event) => {
        const realtimeEvent = JSON.parse(event.data);
        handleRealtimeEvent(realtimeEvent);
    });

    channel.addEventListener('close', () => {
        log('📢 數據頻道已關閉', 'warning');
        updateStatus('disconnected', '已斷開');
    });

    channel.addEventListener('error', (error) => {
        log(`❌ 數據頻道錯誤: ${error}`, 'error');
    });
}

// Handle realtime events from Azure
function handleRealtimeEvent(event) {
    log(`📨 ${event.type}`, 'info');

    switch (event.type) {
        case 'session.created':
            addMessage('system', `會話已創建 (模型: ${event.session.model})`);
            break;

        case 'session.updated':
            addMessage('system', '會話配置已更新');
            break;

        case 'input_audio_buffer.speech_started':
            updateStatus('listening', '你正在說話...');
            break;

        case 'input_audio_buffer.speech_stopped':
            updateStatus('connected', '處理中...');
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
            updateStatus('speaking', 'AI正在說話...');
            break;

        case 'response.done':
            updateStatus('listening', '聆聽中...');
            break;

        case 'error':
            log(`❌ 錯誤: ${event.error.message}`, 'error');
            addMessage('system', `錯誤: ${event.error.message}`);
            break;
    }
}

// UI update functions
function updateAssistantMessage(delta) {
    if (!currentAssistantMessage) {
        currentAssistantMessage = document.createElement('div');
        currentAssistantMessage.className = 'message assistant-message';
        currentAssistantMessage.innerHTML = '<strong>AI:</strong> <span class="text"></span>';
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
        messageDiv.innerHTML = `<strong>你:</strong> <span class="text">${text}</span>`;
    } else if (role === 'assistant') {
        messageDiv.className = 'message assistant-message';
        messageDiv.innerHTML = `<strong>AI:</strong> <span class="text">${text}</span>`;
    } else {
        messageDiv.className = 'message system-message';
        messageDiv.textContent = text;
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
    log('正在停止會話...', 'warning');

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
    roleInput.disabled = false;
    personalityInput.disabled = false;
    wordLimitInput.disabled = false;
    refineRoleBtn.disabled = false;
    refinePersonalityBtn.disabled = false;

    // Show config sections on mobile
    if (window.innerWidth <= 767) {
        toggleConfigBtn.style.display = 'none';
        configSections.style.display = 'block';
    }

    updateStatus('disconnected', '會話已結束');
    addMessage('system', '會話已結束');
    log('✅ 會話已停止', 'success');
}

// Initial message
addMessage('system', '準備好後按「開始對話」');
