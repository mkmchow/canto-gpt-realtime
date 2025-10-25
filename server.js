import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

// Debug: Log environment variables
console.log('\n🔍 Environment Variables:');
console.log('AZURE_OPENAI_ENDPOINT:', process.env.AZURE_OPENAI_ENDPOINT ? '✅ Set' : '❌ Not set');
console.log('AZURE_OPENAI_API_KEY:', process.env.AZURE_OPENAI_API_KEY ? '✅ Set' : '❌ Not set');
console.log('AZURE_OPENAI_DEPLOYMENT_NAME:', process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'Not set');
console.log('AZURE_REGION:', process.env.AZURE_REGION || 'Not set');
console.log('');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Endpoint to generate ephemeral API key
app.post('/api/session', async (req, res) => {
  try {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-realtime';
    const apiVersion = '2025-04-01-preview';

    if (!endpoint || !apiKey) {
      return res.status(500).json({ 
        error: 'Azure OpenAI credentials not configured' 
      });
    }

    // Construct the sessions URL
    const sessionsUrl = `${endpoint}/openai/realtimeapi/sessions?api-version=${apiVersion}`;
    
    console.log('🔑 Minting ephemeral key...');
    console.log('📍 Sessions URL:', sessionsUrl);
    console.log('📍 Deployment:', deployment);

    const response = await fetch(sessionsUrl, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: deployment,
        voice: req.body.voice || 'alloy',
        instructions: req.body.instructions
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to create session:', response.status, errorText);
      return res.status(response.status).json({ 
        error: 'Failed to create session',
        details: errorText
      });
    }

    const data = await response.json();
    console.log('✅ Ephemeral key created:', data.id);

    res.json({
      sessionId: data.id,
      ephemeralKey: data.client_secret?.value,
      expiresAt: data.expires_at
    });

  } catch (error) {
    console.error('❌ Error creating session:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Ready to mint ephemeral keys for WebRTC sessions\n`);
});


