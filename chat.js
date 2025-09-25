// chat.js - integração com modo AR e desktop
document.addEventListener('DOMContentLoaded', () => {
  const chatMessagesEl = document.getElementById('chatMessages');
  const arChatMessagesEl = document.getElementById('arChatMessages');
  const chatFormEl = document.getElementById('chatForm');
  const chatInputEl = document.getElementById('chatInput');
  const arChatInputEl = document.getElementById('arChatInput');
  const sendBtnEl = document.getElementById('sendBtn');
  const arSendBtnEl = document.getElementById('arSendBtn');

  // Variáveis para controle de estado
  let isARMode = false;
  let currentMessagesContainer = chatMessagesEl;

  // Função para detectar mudança de modo (Desktop <-> AR)
  function updateChatMode(arMode) {
    isARMode = arMode;
    const desktopChat = document.getElementById('desktopChat');
    const toggleChatBtn = document.getElementById('toggleChatBtn');
    const arChatOverlay = document.getElementById('arChatOverlay');
    
    if (arMode) {
      // Modo AR ativo
      desktopChat.classList.add('hidden');
      toggleChatBtn.classList.remove('hidden');
      currentMessagesContainer = arChatMessagesEl;
      
      // Sincronizar mensagens do desktop para AR
      syncMessagesToAR();
    } else {
      // Modo Desktop
      desktopChat.classList.remove('hidden');
      toggleChatBtn.classList.add('hidden');
      arChatOverlay.classList.add('hidden');
      window.arChatVisible = false;
      currentMessagesContainer = chatMessagesEl;
      
      // Sincronizar mensagens do AR para desktop
      syncMessagesToDesktop();
    }
  }

  // Função para sincronizar mensagens entre containers
  function syncMessagesToAR() {
    if (arChatMessagesEl && chatMessagesEl) {
      arChatMessagesEl.innerHTML = chatMessagesEl.innerHTML;
      scrollToBottom(arChatMessagesEl);
    }
  }

  function syncMessagesToDesktop() {
    if (chatMessagesEl && arChatMessagesEl) {
      chatMessagesEl.innerHTML = arChatMessagesEl.innerHTML;
      scrollToBottom(chatMessagesEl);
    }
  }

  // Detectar mudanças no modo XR
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('xrsessionstart', () => {
      console.log('Modo AR ativado - ajustando interface do chat');
      setTimeout(() => updateChatMode(true), 500);
    });
    
    window.addEventListener('xrsessionend', () => {
      console.log('Modo AR desativado - voltando ao chat desktop');
      setTimeout(() => updateChatMode(false), 500);
    });
  }

  // Configurar botão de gravação (existente ou criar)
  let recordBtn = document.getElementById('recordBtn');
  let arRecordBtn = document.getElementById('arRecordBtn');
  
  if (!recordBtn && sendBtnEl && sendBtnEl.parentNode) {
    recordBtn = document.createElement('button');
    recordBtn.id = 'recordBtn';
    recordBtn.type = 'button';
    recordBtn.className = 'px-3 py-2 rounded bg-red-600 hover:bg-red-500 text-white mr-2';
    recordBtn.textContent = '🎤 Falar';
    sendBtnEl.parentNode.insertBefore(recordBtn, sendBtnEl);
  }

  // Funções auxiliares
  function escapeHtml(s) { 
    if (!s) return ''; 
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); 
  }
  
  function scrollToBottom(container = currentMessagesContainer) { 
    if (!container) return;
    try { 
      container.scrollTop = container.scrollHeight; 
    } catch(e){
      console.warn('Erro ao fazer scroll:', e);
    } 
  }

  function addMsg(text, user = true, container = null) {
    const targetContainer = container || currentMessagesContainer;
    if (!targetContainer) {
      console.warn('Container de mensagens não encontrado');
      return null;
    }

    const wrapper = document.createElement('div');
    const messageClass = user ? 'flex justify-end my-2' : 'flex justify-start my-2';
    const bubbleClass = user 
      ? 'max-w-[85%] rounded-lg bg-emerald-700 text-white px-3 py-2 text-sm' 
      : 'max-w-[85%] rounded-lg bg-gray-100 text-gray-900 px-3 py-2 text-sm';
    
    wrapper.className = messageClass;
    wrapper.innerHTML = `<div class="${bubbleClass}">${escapeHtml(text)}</div>`;
    
    targetContainer.appendChild(wrapper);
    scrollToBottom(targetContainer);
    
    // Sincronizar entre containers se necessário
    if (isARMode && targetContainer === arChatMessagesEl && chatMessagesEl) {
      const syncWrapper = wrapper.cloneNode(true);
      chatMessagesEl.appendChild(syncWrapper);
    } else if (!isARMode && targetContainer === chatMessagesEl && arChatMessagesEl) {
      const syncWrapper = wrapper.cloneNode(true);
      arChatMessagesEl.appendChild(syncWrapper);
    }
    
    return wrapper;
  }

  async function fetchAnswerFromServer(text) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ messages: [ { role: 'user', content: text } ] })
    });
    
    if (!res.ok) {
      const t = await res.text().catch(() => null);
      throw new Error(t || res.statusText || 'Erro /api/chat');
    }
    
    const j = await res.json();
    return j.answer || j.reply || '';
  }

  async function handleSendMessage(inputEl, sendBtn) {
    const text = inputEl.value.trim();
    if (!text) return;
    
    addMsg(text, true);
    inputEl.value = '';
    sendBtn.disabled = true;
    
    const thinkingEl = addMsg('⏳ Pensando...', false);
    
    try {
      const answer = await fetchAnswerFromServer(text);
      if (thinkingEl) thinkingEl.remove();
      addMsg(answer, false);
      
      // Reproduzir TTS se disponível
      try {
        const ttsResp = await fetch('/api/voice/tts', { 
          method: 'POST', 
          headers: {'Content-Type':'application/json'}, 
          body: JSON.stringify({ text: answer }) 
        });
        
        if (ttsResp.ok) {
          const blob = await ttsResp.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play().catch(() => console.log('TTS playback failed'));
        }
      } catch(e) { 
        console.warn('TTS play failed', e); 
      }
    } catch (err) {
      console.error('Erro no chat:', err);
      if (thinkingEl) thinkingEl.remove();
      addMsg('Erro ao consultar o chat: ' + (err.message || err), false);
    } finally {
      sendBtn.disabled = false;
    }
  }

  // Event listeners para chat desktop
  if (chatFormEl) {
    chatFormEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSendMessage(chatInputEl, sendBtnEl);
    });
  }

  // Event listeners para chat AR
  if (arSendBtnEl) {
    arSendBtnEl.addEventListener('click', async (e) => {
      e.preventDefault();
      await handleSendMessage(arChatInputEl, arSendBtnEl);
    });
  }

  if (arChatInputEl) {
    arChatInputEl.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await handleSendMessage(arChatInputEl, arSendBtnEl);
      }
    });
  }

  // Sistema de gravação de voz - Variáveis compartilhadas
  let mediaRecorder = null;
  let chunks = [];
  let isRecording = false;
  let currentStream = null;

  async function startRecording(recordButton) {
    if (isRecording) return;
    
    try {
      currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch(err) {
      alert('Permissão de microfone negada ou indisponível: ' + (err.message || err));
      return;
    }
    
    mediaRecorder = new MediaRecorder(currentStream);
    chunks = [];
    
    mediaRecorder.ondataavailable = e => { 
      if (e.data && e.data.size > 0) chunks.push(e.data); 
    };
    
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      await handleVoiceBlob(blob);
      try { 
        currentStream.getTracks().forEach(t => t.stop()); 
      } catch(e){}
    };
    
    mediaRecorder.start();
    isRecording = true;
    
    // Atualizar todos os botões de gravação
    updateRecordingButtons(true);
  }

  async function stopRecording() {
    if (!isRecording) return;
    
    try { 
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop(); 
      }
    } catch(e){}
    
    isRecording = false;
    updateRecordingButtons(false);
  }

  function updateRecordingButtons(recording) {
    const buttons = [recordBtn, arRecordBtn].filter(btn => btn);
    
    buttons.forEach(btn => {
      if (recording) {
        btn.textContent = '⏹️ Parar';
        btn.classList.remove('bg-red-600', 'hover:bg-red-500');
        btn.classList.add('bg-gray-600', 'hover:bg-gray-500');
      } else {
        btn.textContent = btn.id === 'arRecordBtn' ? '🎤' : '🎤 Falar';
        btn.classList.remove('bg-gray-600', 'hover:bg-gray-500');
        btn.classList.add('bg-red-600', 'hover:bg-red-500');
      }
    });
  }

  // Event listeners para gravação
  if (recordBtn) {
    recordBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!isRecording) {
        await startRecording(recordBtn);
      } else {
        await stopRecording();
      }
    });
  }

  if (arRecordBtn) {
    arRecordBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!isRecording) {
        await startRecording(arRecordBtn);
      } else {
        await stopRecording();
      }
    });
  }

  async function handleVoiceBlob(blob) {
    const tempEl = addMsg('⏳ Transcrevendo áudio...', true);
    const fd = new FormData();
    fd.append('file', blob, 'recording.webm');
    
    try {
      const res = await fetch('/api/voice/chat', { method: 'POST', body: fd });
      
      if (!res.ok) {
        const t = await res.text().catch(() => null);
        if (tempEl) tempEl.remove();
        addMsg('Erro ao processar áudio: ' + (t || res.statusText), false);
        return;
      }
      
      const j = await res.json();
      
      if (j.transcript) {
        const inner = tempEl?.querySelector('div');
        if (inner) {
          inner.innerHTML = escapeHtml(j.transcript);
        } else {
          if (tempEl) tempEl.remove();
          addMsg(j.transcript, true);
        }
      } else {
        if (tempEl) tempEl.remove();
        addMsg('(Áudio enviado, sem transcrição)', true);
      }
      
      if (j.reply) {
        addMsg(j.reply, false);
      }
      
      if (j.audio_base64) {
        try {
          const audioBlob = base64ToBlob(j.audio_base64, 'audio/mpeg');
          const url = URL.createObjectURL(audioBlob);
          const audio = new Audio(url);
          await audio.play().catch(e => console.warn('Audio play failed', e));
        } catch(e) { 
          console.warn('Audio decode failed', e); 
        }
      }
    } catch (err) {
      console.error('Erro no processamento de voz:', err);
      if (tempEl) tempEl.remove();
      addMsg('Erro ao enviar áudio: ' + (err.message || err), false);
    }
  }

  function base64ToBlob(base64, mime) {
    const bytes = atob(base64 || '');
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      out[i] = bytes.charCodeAt(i);
    }
    return new Blob([out], { type: mime });
  }

  // Inicialização
  console.log('Chat system initialized for AR/Desktop modes');
  
  // Verificar se já está em modo XR no carregamento
  setTimeout(() => {
    if (document.querySelector('#canvas-container canvas')?.classList.contains('xr-presenting')) {
      updateChatMode(true);
    }
  }, 1000);
});