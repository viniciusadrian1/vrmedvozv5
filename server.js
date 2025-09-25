require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const multer = require('multer');
const fetch = require('node-fetch'); // node-fetch v2

// Importar contexto do chat especializado
require('./chat_context.js');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));

// Middleware personalizado para logs detalhados em desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname), {
  // Configurações específicas para arquivos AR/VR
  setHeaders: (res, filePath) => {
    // Configurar CORS e cache para modelos 3D e assets
    if (filePath.endsWith('.glb') || filePath.endsWith('.gltf')) {
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 ano
    }
    
    // Configurar headers para arquivos JavaScript modules
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    
    // Headers de segurança para AR/VR
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }
}));

// Configuração do multer para upload de áudio
const upload = multer({ 
  dest: path.join(__dirname, 'tmp'),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limite
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Aceitar apenas arquivos de áudio
    if (file.mimetype.startsWith('audio/') || file.originalname.endsWith('.webm')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de áudio são permitidos'), false);
    }
  }
});

// Variáveis de ambiente com validação
const ELEVEN_KEY = process.env.ELEVEN_API_KEY || '';
const ELEVEN_VOICE_ID = process.env.ELEVEN_VOICE_ID || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Validação de configuração no startup
console.log('=== CONFIGURAÇÃO DO SERVIDOR AR MED ===');
console.log('OpenAI configurado:', !!OPENAI_KEY);
console.log('ElevenLabs configurado:', !!ELEVEN_KEY);
console.log('Voice ID configurado:', !!ELEVEN_VOICE_ID);
console.log('Modelo OpenAI:', OPENAI_MODEL);
console.log('==========================================');

// Endpoint para verificar configuração
app.get('/api/_env_check', (req, res) => {
  return res.json({
    haveOpenAI: !!OPENAI_KEY,
    haveEleven: !!ELEVEN_KEY,
    haveVoiceId: !!ELEVEN_VOICE_ID,
    model: OPENAI_MODEL,
    serverTime: new Date().toISOString(),
    arSupported: true,
    chatIntegrated: true
  });
});

// Endpoint para status da aplicação
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    features: {
      ar: true,
      chat: true,
      voice: !!ELEVEN_KEY,
      tts: !!ELEVEN_KEY && !!ELEVEN_VOICE_ID,
      stt: !!ELEVEN_KEY
    }
  });
});

// Text chat endpoint -> OpenAI (compatível com AR e Desktop)
app.post('/api/chat', async (req, res) => {
  try {
    // Aceitar múltiplos formatos de entrada para compatibilidade AR/Desktop
    let userText = '';
    
    // Se vier como array de mensagens (formato do frontend)
    if (req.body.messages && Array.isArray(req.body.messages)) {
      const lastUserMsg = req.body.messages.find(m => m.role === 'user');
      userText = lastUserMsg ? lastUserMsg.content : '';
    } else {
      // Formatos alternativos
      userText = (req.body.message || req.body.text || req.body.content || '').toString();
    }
    
    // Validação de entrada
    if (!userText || userText.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Missing message field',
        details: 'É necessário fornecer um texto para o chat'
      });
    }

    if (!OPENAI_KEY) {
      return res.status(500).json({ 
        error: 'OPENAI_API_KEY not configured',
        details: 'Chave da OpenAI não configurada no servidor'
      });
    }

    // Usar o contexto especializado definido em chat_context.js
    const systemPrompt = global.CHAT_CONTEXT || 'Você é um assistente virtual especialista em pneumologia (pulmão e doenças respiratórias).';

    const payload = {
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText.trim() }
      ],
      max_tokens: 512,
      temperature: 0.2,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    };

    console.log(`Enviando para OpenAI: "${userText.substring(0, 100)}${userText.length > 100 ? '...' : ''}"`);

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const j = await r.json().catch(() => null);
    
    if (!r.ok) {
      console.error('OpenAI chat error', r.status, j);
      return res.status(500).json({ 
        error: 'OpenAI error', 
        detail: j,
        status: r.status
      });
    }

    const answer = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    
    if (!answer) {
      return res.status(500).json({
        error: 'Empty response from OpenAI',
        detail: 'OpenAI retornou uma resposta vazia'
      });
    }

    console.log(`Resposta OpenAI: "${answer.substring(0, 100)}${answer.length > 100 ? '...' : ''}"`);
    
    return res.json({ 
      answer,
      timestamp: new Date().toISOString(),
      model: OPENAI_MODEL
    });
  } catch (err) {
    console.error('api/chat exception', err);
    return res.status(500).json({ 
      error: String(err),
      type: 'server_error',
      timestamp: new Date().toISOString()
    });
  }
});

// Voice endpoint: STT -> OpenAI -> TTS (ElevenLabs) - Otimizado para AR
app.post('/api/voice/chat', upload.single('file'), async (req, res) => {
  let filePath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file uploaded',
        details: 'É necessário enviar um arquivo de áudio'
      });
    }

    filePath = req.file.path;
    console.log(`Processando áudio: ${req.file.originalname} (${req.file.size} bytes)`);

    // Verificar configuração dos serviços
    if (!ELEVEN_KEY || !ELEVEN_VOICE_ID) {
      return res.status(500).json({ 
        error: 'ELEVEN_API_KEY or ELEVEN_VOICE_ID not configured',
        details: 'Serviço de voz não configurado no servidor'
      });
    }

    if (!OPENAI_KEY) {
      return res.status(500).json({ 
        error: 'OPENAI_API_KEY not configured',
        details: 'Serviço de IA não configurado no servidor'
      });
    }

    // STT request to ElevenLabs - transcrição de áudio
    console.log('Iniciando transcrição com ElevenLabs...');
    const sttForm = new FormData();
    sttForm.append('model_id', 'scribe_v1');
    sttForm.append('file', fs.createReadStream(filePath));

    const sttHeaders = Object.assign({ 'xi-api-key': ELEVEN_KEY }, sttForm.getHeaders());

    const sttResp = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: sttHeaders,
      body: sttForm
    });

    const sttText = await sttResp.text().catch(() => null);
    let sttJson = null;
    try { 
      sttJson = sttText ? JSON.parse(sttText) : null; 
    } catch(e) { 
      console.warn('STT response não é JSON válido:', sttText);
    }

    // Limpar arquivo temporário imediatamente após uso
    if (filePath) {
      try { 
        fs.unlinkSync(filePath); 
        filePath = null;
      } catch(e) {
        console.warn('Erro ao deletar arquivo temporário:', e.message);
      }
    }

    if (!sttResp.ok) {
      console.error('ElevenLabs STT error', sttResp.status, sttText);
      return res.status(500).json({ 
        error: 'STT failed', 
        status: sttResp.status, 
        detail: sttJson || sttText,
        service: 'elevenlabs_stt'
      });
    }

    const userText = (sttJson && (sttJson.text || sttJson.transcription)) || '';
    console.log(`Transcrição: "${userText}"`);
    
    if (!userText || userText.trim().length === 0) {
      return res.json({ 
        transcript: '', 
        reply: 'Não consegui transcrever o áudio. Tente falar mais claramente.', 
        audio_base64: '',
        timestamp: new Date().toISOString()
      });
    }

    // Enviar para OpenAI com contexto especializado
    console.log('Processando com OpenAI...');
    const systemPrompt = global.CHAT_CONTEXT || 'Você é um assistente virtual especialista em pneumologia (pulmão e doenças respiratórias).';
    
    const aiPayload = {
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText.trim() }
      ],
      max_tokens: 512,
      temperature: 0.2,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    };

    const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify(aiPayload)
    });

    const aiJson = await aiResp.json().catch(() => null);
    
    if (!aiResp.ok) {
      console.error('OpenAI error', aiResp.status, aiJson);
      return res.status(500).json({ 
        transcript: userText, 
        reply: '', 
        error: 'OpenAI error', 
        detail: aiJson,
        service: 'openai'
      });
    }

    const replyText = (aiJson.choices && aiJson.choices[0] && aiJson.choices[0].message && aiJson.choices[0].message.content) || '';
    console.log(`Resposta AI: "${replyText.substring(0, 100)}${replyText.length > 100 ? '...' : ''}"`);

    if (!replyText) {
      return res.json({
        transcript: userText,
        reply: 'Desculpe, não consegui gerar uma resposta adequada.',
        audio_base64: '',
        timestamp: new Date().toISOString()
      });
    }

    // TTS via ElevenLabs
    console.log('Gerando áudio de resposta...');
    const ttsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`;
    const ttsPayload = {
      text: replyText,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
        style: 0.0,
        use_speaker_boost: true
      }
    };

    const ttsResp = await fetch(ttsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
        'xi-api-key': ELEVEN_KEY
      },
      body: JSON.stringify(ttsPayload)
    });

    if (!ttsResp.ok) {
      const txt = await ttsResp.text().catch(() => null);
      console.error('TTS error', ttsResp.status, txt);
      return res.status(500).json({ 
        transcript: userText, 
        reply: replyText, 
        error: 'TTS error', 
        detail: txt,
        service: 'elevenlabs_tts'
      });
    }

    const buffer = Buffer.from(await ttsResp.arrayBuffer());
    const audio_base64 = buffer.toString('base64');
    
    console.log(`Áudio gerado: ${buffer.length} bytes`);

    return res.json({ 
      transcript: userText, 
      reply: replyText, 
      audio_base64,
      timestamp: new Date().toISOString(),
      services: {
        stt: 'elevenlabs',
        ai: 'openai',
        tts: 'elevenlabs'
      }
    });
  } catch (err) {
    console.error('voice/chat exception', err);
    
    // Garantir limpeza do arquivo temporário em caso de erro
    if (filePath) {
      try { 
        fs.unlinkSync(filePath); 
      } catch(e) {
        console.warn('Erro ao deletar arquivo em caso de exceção:', e.message);
      }
    }
    
    return res.status(500).json({ 
      error: String(err),
      type: 'server_exception',
      timestamp: new Date().toISOString()
    });
  }
});

// TTS-only endpoint (text -> audio) - Para feedback de chat AR
app.post('/api/voice/tts', express.json(), async (req, res) => {
  try {
    const text = req.body.text || '';
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Missing text',
        details: 'É necessário fornecer um texto para conversão em áudio'
      });
    }

    if (!ELEVEN_KEY || !ELEVEN_VOICE_ID) {
      return res.status(500).json({ 
        error: 'ELEVEN not configured',
        details: 'Serviço de síntese de voz não configurado'
      });
    }

    console.log(`TTS para: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);

    const ttsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`;
    const ttsPayload = {
      text: text.trim(),
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.5,
        style: 0.0,
        use_speaker_boost: true
      }
    };

    const ttsResp = await fetch(ttsUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Accept': 'audio/mpeg', 
        'xi-api-key': ELEVEN_KEY 
      },
      body: JSON.stringify(ttsPayload)
    });

    if (!ttsResp.ok) {
      const txt = await ttsResp.text().catch(() => null);
      console.error('TTS error', ttsResp.status, txt);
      return res.status(500).json({ 
        error: 'TTS failed', 
        detail: txt,
        status: ttsResp.status
      });
    }

    const buffer = Buffer.from(await ttsResp.arrayBuffer());
    
    // Configurar headers para streaming de áudio
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length,
      'Cache-Control': 'no-cache',
      'Accept-Ranges': 'bytes'
    });
    
    console.log(`TTS gerado: ${buffer.length} bytes`);
    res.send(buffer);
  } catch (e) {
    console.error('TTS exception:', e);
    res.status(500).json({ 
      error: String(e),
      type: 'tts_exception',
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint para limpar arquivos temporários antigos (manutenção)
app.post('/api/_cleanup', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Não disponível em produção' });
  }

  try {
    const tmpDir = path.join(__dirname, 'tmp');
    if (fs.existsSync(tmpDir)) {
      const files = fs.readdirSync(tmpDir);
      let cleaned = 0;
      
      files.forEach(file => {
        const filePath = path.join(tmpDir, file);
        const stats = fs.statSync(filePath);
        const ageInMinutes = (Date.now() - stats.mtime.getTime()) / (1000 * 60);
        
        if (ageInMinutes > 30) { // Arquivos mais antigos que 30 minutos
          fs.unlinkSync(filePath);
          cleaned++;
        }
      });
      
      res.json({ 
        cleaned,
        message: `${cleaned} arquivos temporários removidos`
      });
    } else {
      res.json({ cleaned: 0, message: 'Diretório temporário não existe' });
    }
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Middleware de tratamento de erro global
app.use((err, req, res, next) => {
  console.error('Erro global:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'Arquivo muito grande',
        details: 'O arquivo de áudio deve ter menos de 10MB'
      });
    }
    return res.status(400).json({
      error: 'Erro no upload',
      details: err.message
    });
  }
  
  res.status(500).json({
    error: 'Erro interno do servidor',
    details: process.env.NODE_ENV === 'development' ? err.message : 'Erro inesperado'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint não encontrado',
    path: req.path,
    method: req.method
  });
});

// Limpeza automática de arquivos temporários no startup
const cleanupTempFiles = () => {
  const tmpDir = path.join(__dirname, 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }
  
  try {
    const files = fs.readdirSync(tmpDir);
    files.forEach(file => {
      try {
        fs.unlinkSync(path.join(tmpDir, file));
      } catch(e) {
        // Ignorar erros de limpeza
      }
    });
    console.log(`Limpeza inicial: ${files.length} arquivos temporários removidos`);
  } catch(e) {
    console.warn('Erro na limpeza inicial:', e.message);
  }
};

// Limpeza periódica (a cada hora)
setInterval(cleanupTempFiles, 60 * 60 * 1000);

// Inicialização do servidor
app.listen(port, '0.0.0.0', () => {
  console.log(`
===========================================
🚀 AR Med Server Started Successfully
===========================================
🌐 URL: http://localhost:${port}
🏥 Especialidade: Pneumologia (AR Integration)
🤖 AI Chat: ${OPENAI_KEY ? '✅ Ativo' : '❌ Não configurado'}
🎤 Voice STT: ${ELEVEN_KEY ? '✅ Ativo' : '❌ Não configurado'}
🔊 Voice TTS: ${ELEVEN_KEY && ELEVEN_VOICE_ID ? '✅ Ativo' : '❌ Não configurado'}
📱 AR Support: ✅ Enabled
🎯 Chat Integration: ✅ AR Overlay Ready
===========================================
  `);
  
  // Limpeza inicial
  cleanupTempFiles();
  
  // Verificar conectividade básica
  if (OPENAI_KEY) {
    console.log('✓ OpenAI configurado');
  } else {
    console.warn('⚠ OpenAI não configurado - chat não funcionará');
  }
  
  if (ELEVEN_KEY) {
    console.log('✓ ElevenLabs configurado');
  } else {
    console.warn('⚠ ElevenLabs não configurado - recursos de voz não funcionarão');
  }
});