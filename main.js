// Cena 3D: Three.js + WebXR AR + GLTF do pulmão + Chat 3D Integrado
import * as THREE from 'three';
import { OrbitControls } from '/node_modules/three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from '/node_modules/three/examples/jsm/webxr/ARButton.js';
import { XRControllerModelFactory } from '/node_modules/three/examples/jsm/webxr/XRControllerModelFactory.js';

let renderer, scene, camera, controls;
let lungRoot = null, placeholderMesh = null, axesHelper = null;
let raycaster, tempMatrix = new THREE.Matrix4();
let group; // Grupo para manipulação em AR

// Variáveis para movimento/posicionamento em AR
let hitTestSource = null;
let hitTestSourceRequested = false;
let reticle;
let isModelPlaced = false;

// Variáveis para interação com controles VR
let controller1, controller2;
let controllerGrip1, controllerGrip2;
let controllerModelFactory;

// Variáveis para movimento e manipulação
let isGrabbing = false;
let grabbingController = null;
let previousControllerPosition = new THREE.Vector3();
let previousControllerQuaternion = new THREE.Quaternion();

// Variáveis para manipulação com dois controles
let isGrabbingWithBothControllers = false;
let initialControllersDistance = 0;
let initialModelScale = new THREE.Vector3();
let controller1InitialPos = new THREE.Vector3();
let controller2InitialPos = new THREE.Vector2();

// Área de movimento VR (boundary circle)
let playArea;
const PLAY_AREA_RADIUS = 25.0;

// Teleport
let teleportMarker;
let isTeleporting = false;

// Variáveis para interação touch/gestos em AR
let isMovingModel = false;
let initialTouchDistance = 0;
let initialScale = 1;
let touches = [];

// Variáveis para controle da interface AR
let isInARMode = false;

// === SISTEMA DE CHAT 3D INTEGRADO ===
let chatPanel = null;
let chatMessages = [];
let chatInputField = null;
let chatSendButton = null;
let chatRecordButton = null;
let chatIsVisible = false;
let chatToggleButton = null;

// Canvas para renderizar texto
let chatCanvas = null;
let chatContext = null;

// Configurações do chat 3D
const CHAT_CONFIG = {
  panel: {
    width: 1.2,
    height: 1.6,
    depth: 0.05,
    position: { x: -1.5, y: 0.8, z: 0 }
  },
  text: {
    fontSize: 24,
    lineHeight: 30,
    padding: 20,
    maxLines: 20,
    maxChars: 100
  },
  colors: {
    panel: 0x1e293b,
    border: 0x334155,
    text: 0xf1f5f9,
    userText: 0x10b981,
    botText: 0x64748b,
    button: 0x059669,
    buttonHover: 0x047857
  }
};

function create3DChatSystem() {
  if (chatPanel) return; // Já criado

  // Criar grupo para o chat
  const chatGroup = new THREE.Group();
  chatGroup.name = 'ChatSystem';
  
  // Panel principal
  const panelGeometry = new THREE.BoxGeometry(
    CHAT_CONFIG.panel.width,
    CHAT_CONFIG.panel.height,
    CHAT_CONFIG.panel.depth
  );
  
  const panelMaterial = new THREE.MeshLambertMaterial({ 
    color: CHAT_CONFIG.colors.panel,
    transparent: true,
    opacity: 0.95
  });
  
  chatPanel = new THREE.Mesh(panelGeometry, panelMaterial);
  chatPanel.position.set(
    CHAT_CONFIG.panel.position.x,
    CHAT_CONFIG.panel.position.y,
    CHAT_CONFIG.panel.position.z
  );
  
  // Adicionar borda
  const borderGeometry = new THREE.EdgesGeometry(panelGeometry);
  const borderMaterial = new THREE.LineBasicMaterial({ 
    color: CHAT_CONFIG.colors.border,
    linewidth: 2
  });
  const border = new THREE.LineSegments(borderGeometry, borderMaterial);
  chatPanel.add(border);
  
  // Canvas para texto das mensagens
  createChatCanvas();
  
  // Texture do canvas no painel
  const chatTexture = new THREE.CanvasTexture(chatCanvas);
  chatTexture.needsUpdate = true;
  
  // Material do texto
  const textMaterial = new THREE.MeshBasicMaterial({
    map: chatTexture,
    transparent: true,
    opacity: 1
  });
  
  // Plano para o texto (ligeiramente na frente do painel)
  const textGeometry = new THREE.PlaneGeometry(
    CHAT_CONFIG.panel.width - 0.1,
    CHAT_CONFIG.panel.height - 0.2
  );
  
  const textMesh = new THREE.Mesh(textGeometry, textMaterial);
  textMesh.position.z = CHAT_CONFIG.panel.depth / 2 + 0.001;
  chatPanel.add(textMesh);
  
  // Botões interativos
  createChatButtons(chatGroup);
  
  // Toggle button (sempre visível em AR)
  createToggleButton(chatGroup);
  
  chatGroup.add(chatPanel);
  chatGroup.visible = false; // Começar oculto
  
  scene.add(chatGroup);
  
  console.log('Sistema de chat 3D criado');
}

function createChatCanvas() {
  chatCanvas = document.createElement('canvas');
  chatCanvas.width = 512;
  chatCanvas.height = 683; // Proporção aproximada do painel
  
  chatContext = chatCanvas.getContext('2d');
  
  // Configurar fonte
  chatContext.font = `${CHAT_CONFIG.text.fontSize}px Arial, sans-serif`;
  chatContext.textAlign = 'left';
  chatContext.textBaseline = 'top';
  
  updateChatCanvas();
}

function updateChatCanvas() {
  if (!chatContext) return;
  
  // Limpar canvas
  chatContext.clearRect(0, 0, chatCanvas.width, chatCanvas.height);
  
  // Fundo
  chatContext.fillStyle = '#1e293b';
  chatContext.fillRect(0, 0, chatCanvas.width, chatCanvas.height);
  
  // Header
  chatContext.fillStyle = '#334155';
  chatContext.fillRect(0, 0, chatCanvas.width, 60);
  
  // Título
  chatContext.fillStyle = '#f1f5f9';
  chatContext.font = 'bold 28px Arial';
  chatContext.fillText('Assistente Pulmonar', 20, 20);
  
  chatContext.fillStyle = '#94a3b8';
  chatContext.font = '18px Arial';
  chatContext.fillText('Especializado em pulmão', 20, 45);
  
  // Área de mensagens
  const messageAreaY = 80;
  const messageAreaHeight = chatCanvas.height - 140;
  
  chatContext.fillStyle = '#0f172a';
  chatContext.fillRect(10, messageAreaY, chatCanvas.width - 20, messageAreaHeight);
  
  // Renderizar mensagens
  let y = messageAreaY + 10;
  const maxWidth = chatCanvas.width - 40;
  
  for (let i = Math.max(0, chatMessages.length - CHAT_CONFIG.text.maxLines); i < chatMessages.length; i++) {
    const message = chatMessages[i];
    if (!message) continue;
    
    const isUser = message.type === 'user';
    chatContext.fillStyle = isUser ? '#10b981' : '#f1f5f9';
    chatContext.font = `${isUser ? 'bold ' : ''}20px Arial`;
    
    // Quebrar texto em múltiplas linhas se necessário
    const words = message.text.split(' ');
    let line = '';
    
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = chatContext.measureText(testLine);
      const testWidth = metrics.width;
      
      if (testWidth > maxWidth && n > 0) {
        chatContext.fillText(line, 20, y);
        line = words[n] + ' ';
        y += CHAT_CONFIG.text.lineHeight;
      } else {
        line = testLine;
      }
    }
    chatContext.fillText(line, 20, y);
    y += CHAT_CONFIG.text.lineHeight + 5;
    
    if (y > messageAreaY + messageAreaHeight - 30) break;
  }
  
  // Input area
  const inputY = chatCanvas.height - 50;
  chatContext.fillStyle = '#334155';
  chatContext.fillRect(10, inputY, chatCanvas.width - 20, 40);
  
  chatContext.fillStyle = '#94a3b8';
  chatContext.font = '16px Arial';
  chatContext.fillText('Use controles VR ou voz para interagir', 20, inputY + 15);
  
  // Atualizar texture
  if (chatPanel) {
    const textMesh = chatPanel.children.find(child => child.material && child.material.map);
    if (textMesh && textMesh.material.map) {
      textMesh.material.map.needsUpdate = true;
    }
  }
}

function createChatButtons(chatGroup) {
  // Botão de enviar (será ativado por voz ou controles)
  const sendButtonGeometry = new THREE.BoxGeometry(0.15, 0.08, 0.03);
  const sendButtonMaterial = new THREE.MeshLambertMaterial({ 
    color: CHAT_CONFIG.colors.button 
  });
  
  chatSendButton = new THREE.Mesh(sendButtonGeometry, sendButtonMaterial);
  chatSendButton.position.set(
    CHAT_CONFIG.panel.position.x + 0.4,
    CHAT_CONFIG.panel.position.y - 0.7,
    CHAT_CONFIG.panel.position.z + 0.1
  );
  chatSendButton.name = 'ChatSendButton';
  
  // Label do botão
  const sendLabelCanvas = document.createElement('canvas');
  sendLabelCanvas.width = 128;
  sendLabelCanvas.height = 64;
  const sendLabelContext = sendLabelCanvas.getContext('2d');
  sendLabelContext.fillStyle = '#ffffff';
  sendLabelContext.font = 'bold 24px Arial';
  sendLabelContext.textAlign = 'center';
  sendLabelContext.fillText('🎤', 64, 35);
  
  const sendLabelTexture = new THREE.CanvasTexture(sendLabelCanvas);
  const sendLabelMaterial = new THREE.MeshBasicMaterial({ 
    map: sendLabelTexture, 
    transparent: true 
  });
  const sendLabelGeometry = new THREE.PlaneGeometry(0.12, 0.06);
  const sendLabel = new THREE.Mesh(sendLabelGeometry, sendLabelMaterial);
  sendLabel.position.z = 0.02;
  chatSendButton.add(sendLabel);
  
  chatGroup.add(chatSendButton);
}

function createToggleButton(chatGroup) {
  // Botão para mostrar/ocultar chat
  const toggleButtonGeometry = new THREE.SphereGeometry(0.05, 16, 8);
  const toggleButtonMaterial = new THREE.MeshLambertMaterial({ 
    color: CHAT_CONFIG.colors.button 
  });
  
  chatToggleButton = new THREE.Mesh(toggleButtonGeometry, toggleButtonMaterial);
  chatToggleButton.position.set(
    CHAT_CONFIG.panel.position.x + 0.8,
    CHAT_CONFIG.panel.position.y + 0.6,
    CHAT_CONFIG.panel.position.z
  );
  chatToggleButton.name = 'ChatToggleButton';
  
  // Ícone do chat
  const toggleIconCanvas = document.createElement('canvas');
  toggleIconCanvas.width = 64;
  toggleIconCanvas.height = 64;
  const toggleIconContext = toggleIconCanvas.getContext('2d');
  toggleIconContext.fillStyle = '#ffffff';
  toggleIconContext.font = 'bold 32px Arial';
  toggleIconContext.textAlign = 'center';
  toggleIconContext.fillText('💬', 32, 40);
  
  const toggleIconTexture = new THREE.CanvasTexture(toggleIconCanvas);
  const toggleIconMaterial = new THREE.MeshBasicMaterial({ 
    map: toggleIconTexture, 
    transparent: true 
  });
  const toggleIconGeometry = new THREE.PlaneGeometry(0.08, 0.08);
  const toggleIcon = new THREE.Mesh(toggleIconGeometry, toggleIconMaterial);
  toggleIcon.position.z = 0.02;
  chatToggleButton.add(toggleIcon);
  
  chatGroup.add(chatToggleButton);
}

function toggleChatVisibility() {
  if (!chatPanel) return;
  
  const chatGroup = scene.getObjectByName('ChatSystem');
  if (chatGroup) {
    chatIsVisible = !chatIsVisible;
    chatPanel.visible = chatIsVisible;
    
    // Animação suave
    if (chatIsVisible) {
      chatPanel.scale.set(0.01, 0.01, 0.01);
      const targetScale = new THREE.Vector3(1, 1, 1);
      animateScale(chatPanel, targetScale, 300);
    }
    
    console.log(`Chat 3D ${chatIsVisible ? 'exibido' : 'oculto'}`);
  }
}

function animateScale(object, targetScale, duration) {
  const startScale = object.scale.clone();
  const startTime = Date.now();
  
  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing
    const eased = 1 - Math.pow(1 - progress, 3);
    
    object.scale.lerpVectors(startScale, targetScale, eased);
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }
  
  animate();
}

function addChatMessage(text, type = 'bot') {
  if (!text || typeof text !== 'string') return;
  
  const message = {
    text: text.trim(),
    type: type, // 'user' ou 'bot'
    timestamp: Date.now()
  };
  
  chatMessages.push(message);
  
  // Limitar número de mensagens
  if (chatMessages.length > CHAT_CONFIG.text.maxLines * 2) {
    chatMessages.splice(0, chatMessages.length - CHAT_CONFIG.text.maxLines * 2);
  }
  
  updateChatCanvas();
  console.log(`Nova mensagem no chat 3D: ${text.substring(0, 50)}...`);
}

function handleChatInteraction(controller) {
  if (!controller || !renderer.xr.isPresenting) return;
  
  // Verificar interação com botões do chat
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  
  const chatGroup = scene.getObjectByName('ChatSystem');
  if (!chatGroup) return;
  
  const intersects = raycaster.intersectObjects(chatGroup.children, true);
  
  if (intersects.length > 0) {
    const intersected = intersects[0].object;
    const parent = intersected.parent;
    
    if (parent && parent.name === 'ChatToggleButton') {
      toggleChatVisibility();
      
      // Feedback háptico
      const gamepad = controller.gamepad;
      if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
        gamepad.hapticActuators[0].pulse(0.5, 100);
      }
      
      return true;
    }
    
    if (parent && parent.name === 'ChatSendButton' && chatIsVisible) {
      // Ativar gravação de voz
      startVoiceRecording();
      
      // Feedback háptico
      const gamepad = controller.gamepad;
      if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
        gamepad.hapticActuators[0].pulse(0.7, 150);
      }
      
      return true;
    }
  }
  
  return false;
}

// Sistema de voz integrado ao chat 3D
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];

async function startVoiceRecording() {
  if (isRecording) return;
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    
    addChatMessage('🎤 Gravando...', 'user');
    
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };
    
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      await sendVoiceMessage(audioBlob);
      
      // Parar stream
      stream.getTracks().forEach(track => track.stop());
    };
    
    mediaRecorder.start();
    isRecording = true;
    
    // Parar automaticamente após 10 segundos
    setTimeout(() => {
      if (isRecording) {
        stopVoiceRecording();
      }
    }, 10000);
    
  } catch (error) {
    console.error('Erro ao iniciar gravação:', error);
    addChatMessage('Erro: Não foi possível acessar o microfone', 'bot');
  }
}

function stopVoiceRecording() {
  if (!isRecording || !mediaRecorder) return;
  
  isRecording = false;
  mediaRecorder.stop();
  
  addChatMessage('⏹️ Processando...', 'user');
}

async function sendVoiceMessage(audioBlob) {
  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    
    const response = await fetch('/api/voice/chat', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const result = await response.json();
    
    // Exibir transcrição
    if (result.transcript) {
      addChatMessage(result.transcript, 'user');
    }
    
    // Exibir resposta
    if (result.reply) {
      addChatMessage(result.reply, 'bot');
    }
    
    // Reproduzir áudio da resposta
    if (result.audio_base64) {
      playAudioResponse(result.audio_base64);
    }
    
  } catch (error) {
    console.error('Erro ao processar voz:', error);
    addChatMessage('Erro ao processar áudio. Tente novamente.', 'bot');
  }
}

function playAudioResponse(audioBase64) {
  try {
    const audioBlob = base64ToBlob(audioBase64, 'audio/mpeg');
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    audio.play().catch(err => {
      console.warn('Erro ao reproduzir áudio:', err);
    });
    
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
    };
  } catch (error) {
    console.error('Erro ao reproduzir resposta de áudio:', error);
  }
}

function base64ToBlob(base64, type) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type });
}

// Resto do código original continua aqui...
window.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded - iniciando cena AR com Chat 3D integrado');
  init();
  animate();
});

function init() {
  console.log('init() chamado');
  const container = document.getElementById('canvas-container');
  if (!container) {
    console.error('Container #canvas-container não encontrado');
    return;
  }

  // Renderer com WebXR AR habilitado
  renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: true 
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const rect = container.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height);
  renderer.xr.enabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  
  container.appendChild(renderer.domElement);

  // Cena
  scene = new THREE.Scene();
  if (!renderer.xr.isPresenting) {
    scene.background = new THREE.Color(0x1e293b);
  }

  // Câmera
  camera = new THREE.PerspectiveCamera(70, rect.width / rect.height, 0.01, 200); 
  camera.position.set(0, 0.3, 0.5);

  // Grupo para o modelo
  group = new THREE.Group();
  scene.add(group);

  // Luzes
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);
  
  const dir1 = new THREE.DirectionalLight(0xffffff, 1.0);
  dir1.position.set(1, 2, 1);
  dir1.castShadow = true;
  dir1.shadow.mapSize.width = 2048;
  dir1.shadow.mapSize.height = 2048;
  dir1.shadow.camera.near = 0.1;
  dir1.shadow.camera.far = 100;
  dir1.shadow.camera.left = -20;
  dir1.shadow.camera.right = 20;
  dir1.shadow.camera.top = 20;
  dir1.shadow.camera.bottom = -20;
  scene.add(dir1);

  const dir2 = new THREE.DirectionalLight(0xffffff, 0.6);
  dir2.position.set(-1, 1, -1);
  scene.add(dir2);

  const pointLight = new THREE.PointLight(0xffffff, 0.5, 100);
  pointLight.position.set(0, 1, 0);
  scene.add(pointLight);

  // Área de movimento VR
  const playAreaGeometry = new THREE.RingGeometry(Math.max(0.1, PLAY_AREA_RADIUS - 0.2), PLAY_AREA_RADIUS, 256); 
  const playAreaMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x00ff00, 
    opacity: 0.15,
    transparent: true,
    side: THREE.DoubleSide
  });
  playArea = new THREE.Mesh(playAreaGeometry, playAreaMaterial);
  playArea.rotation.x = -Math.PI / 2;
  playArea.position.y = 0.01;
  playArea.visible = false;
  scene.add(playArea);

  // Grade de orientação
  const gridHelper = new THREE.GridHelper(PLAY_AREA_RADIUS * 2, 50, 0x444444, 0x222222);
  gridHelper.visible = false;
  scene.add(gridHelper);

  // Marcador de teleporte
  const TELEPORT_BASE_RADIUS = Math.max(0.05, Math.min(PLAY_AREA_RADIUS * 0.01, 1.0));
  const TELEPORT_HEIGHT = 0.05;
  const teleportGeometry = new THREE.CylinderGeometry(TELEPORT_BASE_RADIUS, TELEPORT_BASE_RADIUS, TELEPORT_HEIGHT, 32);
  const teleportMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x00ffff,
    opacity: 0.5,
    transparent: true
  });
  teleportMarker = new THREE.Mesh(teleportGeometry, teleportMaterial);
  teleportMarker.visible = false;
  scene.add(teleportMarker);

  // Reticle
  const RETICLE_INNER = Math.max(0.02, Math.min(PLAY_AREA_RADIUS * 0.005, 0.5));
  const RETICLE_OUTER = Math.max(RETICLE_INNER + 0.01, RETICLE_INNER * 1.3);
  const reticleGeometry = new THREE.RingGeometry(RETICLE_INNER, RETICLE_OUTER, 32).rotateX(-Math.PI / 2);
  const reticleMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.7
  });
  reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Configuração dos controladores VR
  controllerModelFactory = new XRControllerModelFactory();

  controller1 = renderer.xr.getController(0);
  controller1.addEventListener('selectstart', onSelectStart);
  controller1.addEventListener('selectend', onSelectEnd);
  controller1.addEventListener('squeeze', onSqueeze);
  controller1.addEventListener('squeezestart', onSqueezeStart);
  controller1.addEventListener('squeezeend', onSqueezeEnd);
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller2.addEventListener('selectstart', onSelectStart);
  controller2.addEventListener('selectend', onSelectEnd);
  controller2.addEventListener('squeeze', onSqueeze);
  controller2.addEventListener('squeezestart', onSqueezeStart);
  controller2.addEventListener('squeezeend', onSqueezeEnd);
  scene.add(controller2);

  controllerGrip1 = renderer.xr.getControllerGrip(0);
  controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
  scene.add(controllerGrip1);

  controllerGrip2 = renderer.xr.getControllerGrip(1);
  controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
  scene.add(controllerGrip2);

  // Linha dos controladores
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1)
  ]);
  const lineMaterial = new THREE.LineBasicMaterial({ 
    color: 0xffffff,
    linewidth: 2,
    opacity: 0.5,
    transparent: true
  });
  
  const line1 = new THREE.Line(lineGeometry, lineMaterial);
  line1.name = 'line';
  line1.scale.z = Math.min(Math.max(10, PLAY_AREA_RADIUS * 0.5), 100);
  controller1.add(line1.clone());
  
  const line2 = new THREE.Line(lineGeometry, lineMaterial);
  line2.name = 'line';
  line2.scale.z = Math.min(Math.max(10, PLAY_AREA_RADIUS * 0.5), 100);
  controller2.add(line2.clone());

  // Eixos de referência
  axesHelper = new THREE.AxesHelper(0.2);
  group.add(axesHelper);

  // Placeholder
  const placeholderGeo = new THREE.BoxGeometry(0.1, 0.3, 0.1);
  const placeholderMat = new THREE.MeshStandardMaterial({ color: 0x22c55e });
  placeholderMesh = new THREE.Mesh(placeholderGeo, placeholderMat);
  placeholderMesh.castShadow = true;
  group.add(placeholderMesh);

  // Controles para modo desktop
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.3;
  controls.maxDistance = 10.0;
  controls.target.set(0, 0, 0);
  controls.enabled = !renderer.xr.isPresenting;

  // Carregar modelo
  const loader = new GLTFLoader();
  loader.load(
    'models/lung.glb',
    (gltf) => {
      lungRoot = gltf.scene || gltf.scenes[0];
      centerAndScaleModel(lungRoot);
      
      // Habilita sombras no modelo
      lungRoot.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material.envMapIntensity = 0.3;
            if (child.material.metalness !== undefined) {
              child.material.metalness = Math.min(child.material.metalness, 0.3);
            }
            if (child.material.emissive) {
              child.material.emissiveIntensity = 0.2;
            }
          }
        }
      });
      
      group.add(lungRoot);
      
      if (placeholderMesh) {
        group.remove(placeholderMesh);
        placeholderMesh.geometry.dispose();
        placeholderMesh.material.dispose();
        placeholderMesh = null;
      }
      console.log('Pulmão carregado com sucesso para AR');
    },
    (xhr) => {
      if (xhr.total) {
        const pct = ((xhr.loaded / xhr.total) * 100).toFixed(0);
        if (pct % 10 === 0) console.log(`Carregando pulmão: ${pct}%`);
      }
    },
    (error) => {
      console.error('Falha ao carregar models/lung.glb', error);
    }
  );

  // Botão AR
  const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay', 'dom-overlay-for-handheld-ar', 'hand-tracking', 'layers'],
    domOverlay: { root: document.body }
  });
  document.getElementById('arButtonContainer').appendChild(arButton);

  // Botões de controle
  document.getElementById('resetCameraBtn').addEventListener('click', resetCamera);
  document.getElementById('toggleAxesBtn').addEventListener('click', () => {
    if (axesHelper) axesHelper.visible = !axesHelper.visible;
  });
  document.getElementById('mouseModeBtn').addEventListener('click', () => {
    if (renderer?.xr?.isPresenting) {
      const session = renderer.xr.getSession();
      if (session) session.end();
    }
  });

  // Eventos
  window.addEventListener('resize', onWindowResize);
  renderer.xr.addEventListener('sessionstart', onXRSessionStart);
  renderer.xr.addEventListener('sessionend', onXRSessionEnd);

  // Event listeners para interação touch em AR
  setupTouchInteraction();

  // Raycaster para interação
  raycaster = new THREE.Raycaster();
}

function setupTouchInteraction() {
  const canvas = renderer.domElement;
  
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
}

// Funções de controle VR - ATUALIZADAS PARA INCLUIR CHAT
function onSelectStart(event) {
  const controller = event.target;
  
  // Verificar primeiro se é interação com chat
  if (handleChatInteraction(controller)) {
    return; // Chat tratou a interação
  }
  
  const otherController = controller === controller1 ? controller2 : controller1;
  
  if (isGrabbing && grabbingController === otherController) {
    isGrabbingWithBothControllers = true;
    initialControllersDistance = controller.position.distanceTo(otherController.position);
    initialModelScale.copy(group.scale);
    controller1InitialPos.copy(controller1.position);
    controller2InitialPos.copy(controller2.position);
    console.log('Manipulação com dois controles iniciada');
    return;
  }
  
  if (isTeleporting && teleportMarker.visible) {
    const xrCamera = renderer.xr.getCamera();
    const offsetX = teleportMarker.position.x - xrCamera.position.x;
    const offsetZ = teleportMarker.position.z - xrCamera.position.z;
    
    xrCamera.position.x += offsetX;
    xrCamera.position.z += offsetZ;
    
    console.log(`Teleportado para: x=${teleportMarker.position.x}, z=${teleportMarker.position.z}`);
    
    const gamepad = controller.gamepad;
    if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
      gamepad.hapticActuators[0].pulse(0.8, 200);
    }
    return;
  }

  // Verificar se está apontando para o modelo
  const intersections = getIntersections(controller);
  const distanceToModel = group.position.distanceTo(controller.position);
  
  if (intersections.length > 0 || distanceToModel < 2.0) {
    isGrabbing = true;
    grabbingController = controller;
    
    previousControllerPosition.copy(controller.position);
    previousControllerQuaternion.copy(controller.quaternion);
    
    if (lungRoot) {
      lungRoot.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.emissive = new THREE.Color(0x444444);
          child.material.emissiveIntensity = 0.3;
        }
      });
    }
    
    const gamepad = controller.gamepad;
    if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
      gamepad.hapticActuators[0].pulse(0.6, 100);
    }
    
    console.log('Objeto agarrado com controle', controller === controller1 ? '1' : '2');
  }
}

function onSelectEnd(event) {
  const controller = event.target;
  
  if (isGrabbingWithBothControllers) {
    isGrabbingWithBothControllers = false;
    if (grabbingController === controller) {
      grabbingController = controller === controller1 ? controller2 : controller1;
      if (!grabbingController || !isGrabbing) {
        isGrabbing = false;
      }
    }
    console.log('Manipulação com dois controles finalizada');
  } else if (isGrabbing && grabbingController === controller) {
    isGrabbing = false;
    grabbingController = null;
    
    if (lungRoot) {
      lungRoot.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.emissive = new THREE.Color(0x000000);
          child.material.emissiveIntensity = 0;
        }
      });
    }
    
    console.log('Objeto solto');
  }
}

function onSqueeze(event) {
  const controller = event.target;
  isTeleporting = true;
  
  const line = controller.getObjectByName('line');
  if (line) {
    line.material.color.setHex(0x00ffff);
    line.material.opacity = 0.8;
  }
}

function onSqueezeStart(event) {
  isTeleporting = true;
  playArea.visible = true;
  
  const controller = event.target;
  const gamepad = controller.gamepad;
  if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
    gamepad.hapticActuators[0].pulse(0.3, 50);
  }
}

function onSqueezeEnd(event) {
  const controller = event.target;
  isTeleporting = false;
  teleportMarker.visible = false;
  playArea.visible = false;
  
  const line = controller.getObjectByName('line');
  if (line) {
    line.material.color.setHex(0xffffff);
    line.material.opacity = 0.5;
  }
}

function getIntersections(controller) {
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  
  return raycaster.intersectObjects(group.children, true);
}

const MOVE_SENSITIVITY = 1.5;

function handleController(controller) {
  if (isTeleporting) {
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    
    if (raycaster.ray.intersectPlane(floorPlane, intersection)) {
      const distance = Math.sqrt(intersection.x * intersection.x + intersection.z * intersection.z);
      if (distance <= PLAY_AREA_RADIUS) {
        teleportMarker.position.copy(intersection);
        teleportMarker.position.y = 0.025;
        teleportMarker.visible = true;
        
        const normalizedDistance = distance / PLAY_AREA_RADIUS;
        const hue = 0.5 - normalizedDistance * 0.5;
        teleportMarker.material.color.setHSL(hue, 1, 0.5);
        
        const scale = 1 + Math.sin(Date.now() * 0.003) * 0.1;
        teleportMarker.scale.set(scale, 1, scale);
      } else {
        teleportMarker.visible = false;
      }
    }
  } else if (isGrabbingWithBothControllers) {
    const currentDistance = controller1.position.distanceTo(controller2.position);
    const scaleFactor = currentDistance / initialControllersDistance;
    
    const newScale = Math.max(0.05, Math.min(10, initialModelScale.x * scaleFactor));
    group.scale.set(newScale, newScale, newScale);
    
    const midPoint = new THREE.Vector3();
    midPoint.addVectors(controller1.position, controller2.position).multiplyScalar(MOVE_SENSITIVITY);
    
    group.position.copy(midPoint);
    
    const direction = new THREE.Vector3();
    direction.subVectors(controller2.position, controller1.position).normalize();
    
    const targetRotation = Math.atan2(direction.x, direction.z);
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, targetRotation, 0.15);
    
    const verticalAngle = Math.asin(direction.y);
    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, verticalAngle * 0.5, 0.1);
    
    [controller1, controller2].forEach(ctrl => {
      const gamepad = ctrl.gamepad;
      if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
        gamepad.hapticActuators[0].pulse(0.1, 20);
      }
    });
    
  } else if (isGrabbing && grabbingController === controller) {
    const deltaMove = new THREE.Vector3();
    deltaMove.copy(controller.position).sub(previousControllerPosition);
    
    group.position.add(deltaMove.multiplyScalar(MOVE_SENSITIVITY));
    
    const deltaRotation = new THREE.Quaternion();
    deltaRotation.copy(controller.quaternion).multiply(previousControllerQuaternion.clone().invert());
    
    const targetQuaternion = new THREE.Quaternion();
    targetQuaternion.multiplyQuaternions(deltaRotation, group.quaternion);
    group.quaternion.slerp(targetQuaternion, 0.4);
    
    previousControllerPosition.copy(controller.position);
    previousControllerQuaternion.copy(controller.quaternion);
    
    const gamepad = controller.gamepad;
    if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
      const velocity = deltaMove.length();
      const intensity = Math.min(0.3, velocity * 2);
      if (intensity > 0.05) {
        gamepad.hapticActuators[0].pulse(intensity, 15);
      }
    }
  }
  
  const line = controller.getObjectByName('line');
  if (line) {
    if (isGrabbing && grabbingController === controller) {
      line.material.opacity = 0.9;
      line.scale.z = 3;
      line.material.color.setHex(0x00ff00);
    } else if (isTeleporting) {
      line.material.opacity = 0.7;
      line.scale.z = 20;
    } else {
      line.material.opacity = 0.4;
      line.scale.z = 10;
      line.material.color.setHex(0xffffff);
    }
  }
}

function onTouchStart(event) {
  event.preventDefault && event.preventDefault();
  if (!renderer.xr.isPresenting) return;
  
  event.preventDefault();
  touches = Array.from(event.touches);
  
  if (touches.length === 1) {
    isMovingModel = true;
  } else if (touches.length === 2) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    initialTouchDistance = Math.sqrt(dx * dx + dy * dy);
    initialScale = group.scale.x;
  }
}

function onTouchMove(event) {
  event.preventDefault && event.preventDefault();
  if (!renderer.xr.isPresenting || !isModelPlaced) return;
  
  event.preventDefault();
  touches = Array.from(event.touches);
  
  if (touches.length === 1 && isMovingModel) {
    const touch = touches[0];
    const x = (touch.clientX / window.innerWidth) * 2 - 1;
    const y = -(touch.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    
    const planeDistance = 1.0;
    const direction = new THREE.Vector3();
    raycaster.ray.direction.normalize();
    direction.copy(raycaster.ray.direction).multiplyScalar(planeDistance);
    
    group.position.copy(camera.position).add(direction);
    
  } else if (touches.length === 2) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const scale = (distance / initialTouchDistance) * initialScale;
    const clampedScale = Math.max(0.1, Math.min(5, scale));
    group.scale.set(clampedScale, clampedScale, clampedScale);
    
    const centerX = (touches[0].clientX + touches[1].clientX) / 2;
    const angle = Math.atan2(dy, dx);
    if (this.lastAngle !== undefined) {
      const deltaAngle = angle - this.lastAngle;
      group.rotation.y += deltaAngle;
    }
    this.lastAngle = angle;
  }
}

function onTouchEnd(event) {
  event.preventDefault && event.preventDefault();
  event.preventDefault();
  touches = Array.from(event.touches);
  
  if (touches.length === 0) {
    isMovingModel = false;
    this.lastAngle = undefined;
  }
}

function centerAndScaleModel(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  root.position.sub(center);

  const targetHeight = 0.30;
  const currentHeight = size.y || 1.0;
  const scale = targetHeight / currentHeight;
  root.scale.setScalar(scale);

  root.position.y = 0;
}

function resetCamera() {
  if (renderer.xr.isPresenting) {
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    group.position.copy(camera.position);
    group.position.add(cameraDirection.multiplyScalar(MOVE_SENSITIVITY));
    group.position.y = camera.position.y - 0.15;
    
    group.rotation.set(0, 0, 0);
    group.scale.set(1, 1, 1);
    group.visible = true;
    isModelPlaced = true;
    
    console.log('Modelo reposicionado em AR/VR');
  } else {
    camera.position.set(0, 0.3, 0.5);
    controls.target.set(0, 0, 0);
    controls.update();
    scene.background = new THREE.Color(0x1e293b);
  }
}

function onXRSessionStart() {
  console.log('AR/VR Session iniciada - Chat 3D ativado');
  isInARMode = true;
  controls.enabled = false;
  isModelPlaced = false;
  
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  playArea.visible = false;
  
  // Criar sistema de chat 3D
  create3DChatSystem();
  
  // Posicionar modelo automaticamente
  setTimeout(() => {
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    group.position.copy(camera.position);
    group.position.add(cameraDirection.multiplyScalar(MOVE_SENSITIVITY));
    group.position.y = camera.position.y - 0.15;
    
    group.visible = true;
    isModelPlaced = true;
    
    console.log('Modelo posicionado automaticamente em AR/VR');
    
    // Mostrar mensagem de boas-vindas no chat 3D
    addChatMessage('Olá! Sou seu assistente pulmonar. Use os controles VR para interagir comigo ou pressione o botão de voz.', 'bot');
    
    showARInstructions();
  }, 1000);

  const session = renderer.xr.getSession();
  
  session.requestReferenceSpace('viewer').then((referenceSpace) => {
    session.requestHitTestSource({ space: referenceSpace }).then((source) => {
      hitTestSource = source;
    }).catch(err => {
      console.log('Hit test não disponível:', err);
    });
  });

  session.addEventListener('end', () => {
    hitTestSourceRequested = false;
    hitTestSource = null;
  });

  window.dispatchEvent(new CustomEvent('xrsessionstart'));
}

function showARInstructions() {
  const arInstructions = document.getElementById('arInstructions');
  if (arInstructions) {
    arInstructions.innerHTML = `
      <div style="background: rgba(0,0,0,0.8); padding: 20px; border-radius: 10px; color: white;">
        <p>🎮 <strong>Controles Meta Quest 2 + Chat 3D:</strong></p>
        <p>• <strong>Gatilho principal:</strong> Agarrar modelo OU interagir com chat 3D</p>
        <p>• <strong>Gatilho lateral:</strong> Ativar teleporte (área de ${PLAY_AREA_RADIUS}m)</p>
        <p>• <strong>Botão Chat (💬):</strong> Mostrar/ocultar painel de chat 3D</p>
        <p>• <strong>Botão Microfone (🎤):</strong> Gravar mensagem de voz</p>
        <p>• <strong>Ambos controles:</strong> Escalar e rotar com precisão</p>
        <br>
        <p style="color: #10b981;">✨ Chat 3D integrado ao ambiente AR!</p>
      </div>
    `;
    arInstructions.classList.remove('hidden');
    arInstructions.style.position = 'fixed';
    arInstructions.style.top = '20px';
    arInstructions.style.left = '50%';
    arInstructions.style.transform = 'translateX(-50%)';
    arInstructions.style.zIndex = '1000';
    
    setTimeout(() => {
      arInstructions.classList.add('hidden');
    }, 15000);
  }
}

function onXRSessionEnd() {
  console.log('AR/VR Session finalizada - Chat 3D desativado');
  isInARMode = false;
  controls.enabled = true;
  group.visible = true;
  reticle.visible = false;
  isModelPlaced = false;
  isMovingModel = false;
  playArea.visible = false;
  isGrabbing = false;
  grabbingController = null;
  isGrabbingWithBothControllers = false;
  isTeleporting = false;
  teleportMarker.visible = false;
  
  // Remover chat 3D
  const chatGroup = scene.getObjectByName('ChatSystem');
  if (chatGroup) {
    scene.remove(chatGroup);
    chatPanel = null;
    chatIsVisible = false;
    console.log('Sistema de chat 3D removido');
  }
  
  scene.background = new THREE.Color(0x1e293b);
  renderer.setClearColor(0x1e293b, 1);

  window.dispatchEvent(new CustomEvent('xrsessionend'));
}

function onWindowResize() {
  const container = document.getElementById('canvas-container');
  const rect = container.getBoundingClientRect();
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  renderer.setSize(rect.width, rect.height);
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render() {
  // Processar controladores VR
  if (renderer.xr.isPresenting) {
    handleController(controller1);
    handleController(controller2);
  }
  
  // Hit testing opcional
  if (renderer.xr.isPresenting && hitTestSource && !isModelPlaced) {
    const frame = renderer.xr.getFrame();
    const hitTestResults = frame.getHitTestResults(hitTestSource);

    if (hitTestResults.length > 0) {
      const hit = hitTestResults[0];
      reticle.visible = true;
      reticle.matrix.fromArray(hit.getPose(renderer.xr.getReferenceSpace()).transform.matrix);
    } else {
      reticle.visible = false;
    }
  }

  if (controls && controls.enabled) {
    controls.update();
  }
  
  if (placeholderMesh) {
    placeholderMesh.rotation.y += 0.01;
  }
  
  if (lungRoot && !isGrabbing && !renderer.xr.isPresenting) {
    lungRoot.rotation.y += 0.002;
  }
  
  if (teleportMarker && teleportMarker.visible) {
    const ring = teleportMarker.children[0];
    if (ring) {
      ring.rotation.z += 0.02;
    }
  }
  
  renderer.render(scene, camera);
}

window.addEventListener('error', (e) => {
  console.error('GlobalError:', e.message, e.filename, e.lineno);
});

console.log(`
===========================================
AR/VR Scene + 3D Chat System Initialized
===========================================
• Play Area: ${PLAY_AREA_RADIUS * 2}m diameter
• Meta Quest 2 Controls: Fully Enabled
• 3D Chat System: Integrated in AR Environment
• Voice Recognition: Active
• Teleport System: Active
• Dual Controller Manipulation: Active
===========================================
`);