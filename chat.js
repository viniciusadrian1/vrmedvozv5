// chat.js - integração compatível com Chat 3D em AR e modo desktop
document.addEventListener('DOMContentLoaded', () => {
  const chatMessagesEl = document.getElementById('chatMessages');
  const chatFormEl = document.getElementById('chatForm');
  const chatInputEl = document.getElementById('chatInput');
  const sendBtnEl = document.getElementById('sendBtn');

  // Variáveis para controle de estado
  let isARMode = false;
  let currentMessagesContainer = chatMessagesEl;

  // Função para detectar mudança de modo (Desktop <-> AR)
  function updateChatMode(arMode) {
    isARMode = arMode;
    const desktopChat = document.getElementById('desktopChat');
    
    if (arMode) {
      // Modo AR ativo - chat 3D gerencia as mensagens
      console.log('Chat mode: AR 3D - Desktop chat hidden');
      if (desktopChat) {
        desktopChat.classList.add('hidden');
      }
    } else {
      // Modo Desktop - usar chat tradicional
      console.log('Chat mode: Desktop - Traditional chat visible');
      if (desktopChat) {
        desktopChat.classList.remove('hidden');
      }
    }
  }

  // Detectar mudanças no modo XR
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('xrsessionstart', () => {
      console.log('XR Session started - Chat mode: 3D AR');
      setTimeout(() => updateChatMode(true), 500);
    });
    
    window.addEventListener('xrsessionend', () => {
      console.log('XR Session ended - Chat mode: Desktop');
      setTimeout(() => updateChatMode(false), 500);
    });
  }

  // Configurar botão de gravação (apenas para desktop)
  let recordBtn = document.getElementById('recordBtn');
  
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
    // Se estivermos em AR, pular o chat desktop
    if (isARMode) {
      console.log(`AR Mode: Message "${text}" handled by 3D chat system`);
      return null;
    }

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
    // Em modo AR, não processar mensagens do desktop
    if (isARMode) {
      console.log('AR Mode active: Desktop chat disabled');
      return;
    }

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
      
      // Reproduzir TTS se disponível (apenas em desktop)
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

  // Event listeners para chat desktop (apenas quando não em AR)
  if (chatFormEl) {
    chatFormEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isARMode) {
        await handleSendMessage(chatInputEl, sendBtnEl);
      }
    });
  }

  // Sistema de gravação de voz - apenas para desktop
  let mediaRecorder = null;
  let chunks = [];
  let isRecording = false;
  let currentStream = null;

  async function startRecording(recordButton) {
    // Não permitir gravação em AR (será feita pelo sistema 3D)
    if (isARMode) {
      console.log('AR Mode: Voice recording handled by 3D system');
      return;
    }

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
    // Apenas atualizar em modo desktop
    if (isARMode) return;

    if (recordBtn) {
      if (recording) {
        recordBtn.textContent = '⏹️ Parar';
        recordBtn.classList.remove('bg-red-600', 'hover:bg-red-500');
        recordBtn.classList.add('bg-gray-600', 'hover:bg-gray-500');
      } else {
        recordBtn.textContent = '🎤 Falar';
        recordBtn.classList.remove('bg-gray-600', 'hover:bg-gray-500');
        recordBtn.classList.add('bg-red-600', 'hover:bg-red-500');
      }
    }
  }

  // Event listener para gravação desktop
  if (recordBtn) {
    recordBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (isARMode) return; // Ignorar em AR
      
      if (!isRecording) {
        await startRecording(recordBtn);
      } else {
        await stopRecording();
      }
    });
  }

  async function handleVoiceBlob(blob) {
    // Apenas processar em desktop
    if (isARMode) {
      console.log('AR Mode: Voice processing handled by 3D system');
      return;
    }

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

  // Funções globais para compatibilidade
  window.addDesktopMessage = function(text, isUser = false) {
    if (!isARMode) {
      return addMsg(text, isUser);
    }
    return null;
  };

  window.isDesktopChatActive = function() {
    return !isARMode;
  };

  // Inicialização
  console.log('Chat system initialized - Compatible with AR 3D and Desktop modes');
  
  // Verificar se já está em modo XR no carregamento
  setTimeout(() => {
    const canvas = document.querySelector('#canvas-container canvas');
    if (canvas && canvas.classList && canvas.classList.contains('xr-presenting')) {
      updateChatMode(true);
    }
  }, 1000);

  // Mensagem de boas-vindas apenas em desktop
  setTimeout(() => {
    if (!isARMode && chatMessagesEl) {
      addMsg('Olá! Sou seu assistente especializado em pneumologia. Como posso ajudá-lo hoje?', false);
    }
  }, 1500);
});