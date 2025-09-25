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
let selectedObject = null;

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
let controller2InitialPos = new THREE.Vector3();

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

// ===== VARIÁVEIS DO CHAT 3D =====
let chatPanel3D = null;
let chatMessages3D = [];
let chatVisible = false;
let chatInput3D = null;
let chatSendButton3D = null;
let chatRecordButton3D = null;
let chatContainer = null;
let currentMessageY = 0;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let currentStream = null;

// Configurações do chat 3D
const CHAT_CONFIG = {
  panelWidth: 0.6,
  panelHeight: 0.8,
  messageHeight: 0.08,
  messageSpacing: 0.01,
  maxMessages: 10,
  fontSize: 0.03,
  buttonSize: 0.06
};

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

  setupLighting();
  setupARElements();
  setupControllers();
  setupChat3D();
  loadLungModel();
  setupARButton();
  setupEventListeners();
  setupTouchInteraction();

  // Controles para modo desktop
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.3;
  controls.maxDistance = 10.0;
  controls.target.set(0, 0, 0);
  controls.enabled = !renderer.xr.isPresenting;

  raycaster = new THREE.Raycaster();
}

function setupLighting() {
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
}

function setupARElements() {
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
  const teleportGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.05, 32);
  const teleportMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x00ffff,
    opacity: 0.5,
    transparent: true
  });
  teleportMarker = new THREE.Mesh(teleportGeometry, teleportMaterial);
  teleportMarker.visible = false;
  scene.add(teleportMarker);

  // Reticle para posicionamento
  const reticleGeometry = new THREE.RingGeometry(0.02, 0.03, 32).rotateX(-Math.PI / 2);
  const reticleMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.7
  });
  reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);
}

function setupControllers() {
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

  // Adicionar linhas aos controladores
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
  line1.scale.z = 10;
  controller1.add(line1.clone());
  
  const line2 = new THREE.Line(lineGeometry, lineMaterial);
  line2.name = 'line';
  line2.scale.z = 10;
  controller2.add(line2.clone());
}

// ===== SETUP DO CHAT 3D =====
function setupChat3D() {
  chatContainer = new THREE.Group();
  chatContainer.position.set(-0.8, 0, 0); // Posicionado à esquerda do modelo
  chatContainer.visible = false;
  scene.add(chatContainer);

  createChatPanel();
  createChatButtons();
}

function createChatPanel() {
  // Painel principal do chat
  const panelGeometry = new THREE.PlaneGeometry(CHAT_CONFIG.panelWidth, CHAT_CONFIG.panelHeight);
  const panelMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x0f172a,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide
  });
  chatPanel3D = new THREE.Mesh(panelGeometry, panelMaterial);
  chatContainer.add(chatPanel3D);

  // Borda do painel
  const borderGeometry = new THREE.EdgesGeometry(panelGeometry);
  const borderMaterial = new THREE.LineBasicMaterial({ color: 0x10b981 });
  const border = new THREE.LineSegments(borderGeometry, borderMaterial);
  chatPanel3D.add(border);

  // Título do chat
  createTextMesh('Assistente Pulmonar', 0.04, 0x10b981, 0, CHAT_CONFIG.panelHeight/2 - 0.05, 0.001, chatPanel3D);
  createTextMesh('Especializado em pulmão', 0.02, 0x64748b, 0, CHAT_CONFIG.panelHeight/2 - 0.1, 0.001, chatPanel3D);
}

function createChatButtons() {
  // Botão de enviar
  const sendGeometry = new THREE.PlaneGeometry(CHAT_CONFIG.buttonSize, CHAT_CONFIG.buttonSize);
  const sendMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x10b981,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  });
  chatSendButton3D = new THREE.Mesh(sendGeometry, sendMaterial);
  chatSendButton3D.position.set(CHAT_CONFIG.panelWidth/2 - CHAT_CONFIG.buttonSize, -CHAT_CONFIG.panelHeight/2 + CHAT_CONFIG.buttonSize, 0.001);
  chatSendButton3D.userData = { type: 'sendButton' };
  chatContainer.add(chatSendButton3D);

  // Texto do botão enviar
  createTextMesh('▶', 0.03, 0xffffff, 0, 0, 0.001, chatSendButton3D);

  // Botão de gravar
  const recordGeometry = new THREE.PlaneGeometry(CHAT_CONFIG.buttonSize, CHAT_CONFIG.buttonSize);
  const recordMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xdc2626,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  });
  chatRecordButton3D = new THREE.Mesh(recordGeometry, recordMaterial);
  chatRecordButton3D.position.set(CHAT_CONFIG.panelWidth/2 - CHAT_CONFIG.buttonSize * 2.2, -CHAT_CONFIG.panelHeight/2 + CHAT_CONFIG.buttonSize, 0.001);
  chatRecordButton3D.userData = { type: 'recordButton' };
  chatContainer.add(chatRecordButton3D);

  // Texto do botão gravar
  createTextMesh('🎤', 0.025, 0xffffff, 0, 0, 0.001, chatRecordButton3D);

  // Área de input (visual)
  const inputGeometry = new THREE.PlaneGeometry(CHAT_CONFIG.panelWidth - 0.2, 0.08);
  const inputMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x1e293b,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide
  });
  chatInput3D = new THREE.Mesh(inputGeometry, inputMaterial);
  chatInput3D.position.set(-CHAT_CONFIG.buttonSize, -CHAT_CONFIG.panelHeight/2 + CHAT_CONFIG.buttonSize, 0.001);
  chatContainer.add(chatInput3D);

  // Placeholder text
  createTextMesh('Pergunte sobre pulmão...', 0.02, 0x64748b, -CHAT_CONFIG.panelWidth/2 + 0.02, 0, 0.001, chatInput3D);
}

function createTextMesh(text, size, color, x, y, z, parent) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 512;
  canvas.height = 128;
  
  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  
  context.font = `${size * 800}px Arial`;
  context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  
  const material = new THREE.MeshBasicMaterial({ 
    map: texture, 
    transparent: true,
    side: THREE.DoubleSide
  });
  const geometry = new THREE.PlaneGeometry(text.length * size * 0.6, size * 1.2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  
  if (parent) {
    parent.add(mesh);
  }
  
  return mesh;
}

function addMessage3D(text, isUser = false) {
  // Limitar número de mensagens
  if (chatMessages3D.length >= CHAT_CONFIG.maxMessages) {
    const oldMessage = chatMessages3D.shift();
    chatPanel3D.remove(oldMessage);
  }

  const messageColor = isUser ? 0x10b981 : 0x475569;
  const textColor = 0xffffff;
  
  // Criar fundo da mensagem
  const messageWidth = Math.min(CHAT_CONFIG.panelWidth - 0.1, text.length * 0.015);
  const messageGeometry = new THREE.PlaneGeometry(messageWidth, CHAT_CONFIG.messageHeight);
  const messageMaterial = new THREE.MeshBasicMaterial({ 
    color: messageColor,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  });
  const messageMesh = new THREE.Mesh(messageGeometry, messageMaterial);
  
  // Posicionar mensagem
  const xPos = isUser ? CHAT_CONFIG.panelWidth/2 - messageWidth/2 - 0.05 : -CHAT_CONFIG.panelWidth/2 + messageWidth/2 + 0.05;
  messageMesh.position.set(xPos, currentMessageY, 0.001);
  
  // Adicionar texto
  const textMesh = createTextMesh(text.substring(0, 50), CHAT_CONFIG.fontSize, textColor, 0, 0, 0.001, messageMesh);
  
  chatPanel3D.add(messageMesh);
  chatMessages3D.push(messageMesh);
  
  currentMessageY -= CHAT_CONFIG.messageHeight + CHAT_CONFIG.messageSpacing;
  
  // Reset posição se necessário
  if (currentMessageY < -CHAT_CONFIG.panelHeight/2 + 0.2) {
    currentMessageY = CHAT_CONFIG.panelHeight/2 - 0.2;
  }
  
  return messageMesh;
}

function toggleChat3D() {
  chatVisible = !chatVisible;
  chatContainer.visible = chatVisible;
  
  if (chatVisible) {
    // Posicionar chat próximo ao usuário
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    chatContainer.position.copy(camera.position);
    chatContainer.position.add(cameraDirection.multiplyScalar(1.5));
    chatContainer.position.y = camera.position.y;
    
    // Fazer o chat olhar para a câmera
    chatContainer.lookAt(camera.position);
  }
  
  console.log('Chat 3D', chatVisible ? 'ativado' : 'desativado');
}

async function handleChatInput(text) {
  if (!text || !text.trim()) return;
  
  // Adicionar mensagem do usuário
  addMessage3D(text, true);
  
  try {
    // Enviar para servidor
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: text }] })
    });
    
    if (!response.ok) throw new Error('Erro na API');
    
    const data = await response.json();
    
    // Adicionar resposta do bot
    addMessage3D(data.answer, false);
    
    // TTS se disponível
    try {
      const ttsResponse = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: data.answer })
      });
      
      if (ttsResponse.ok) {
        const blob = await ttsResponse.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(console.warn);
      }
    } catch (e) {
      console.warn('TTS failed:', e);
    }
  } catch (error) {
    console.error('Chat error:', error);
    addMessage3D('Erro ao processar mensagem', false);
  }
}

async function startVoiceRecording() {
  if (isRecording) return stopVoiceRecording();
  
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(currentStream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = handleVoiceData;
    
    mediaRecorder.start();
    isRecording = true;
    
    // Atualizar visual do botão
    if (chatRecordButton3D) {
      chatRecordButton3D.material.color.setHex(0x059669);
    }
    
    console.log('Gravação iniciada');
  } catch (error) {
    console.error('Erro ao iniciar gravação:', error);
  }
}

function stopVoiceRecording() {
  if (!isRecording) return;
  
  mediaRecorder.stop();
  currentStream.getTracks().forEach(track => track.stop());
  isRecording = false;
  
  // Restaurar visual do botão
  if (chatRecordButton3D) {
    chatRecordButton3D.material.color.setHex(0xdc2626);
  }
  
  console.log('Gravação finalizada');
}

async function handleVoiceData() {
  const blob = new Blob(audioChunks, { type: 'audio/webm' });
  const formData = new FormData();
  formData.append('file', blob, 'recording.webm');
  
  addMessage3D('🎤 Processando áudio...', true);
  
  try {
    const response = await fetch('/api/voice/chat', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) throw new Error('Erro no processamento de voz');
    
    const data = await response.json();
    
    // Remover mensagem temporária
    if (chatMessages3D.length > 0) {
      const lastMessage = chatMessages3D.pop();
      chatPanel3D.remove(lastMessage);
      currentMessageY += CHAT_CONFIG.messageHeight + CHAT_CONFIG.messageSpacing;
    }
    
    if (data.transcript) {
      addMessage3D(data.transcript, true);
    }
    
    if (data.reply) {
      addMessage3D(data.reply, false);
      
      // Reproduzir áudio de resposta
      if (data.audio_base64) {
        const audioBlob = base64ToBlob(data.audio_base64, 'audio/mpeg');
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        audio.play().catch(console.warn);
      }
    }
  } catch (error) {
    console.error('Erro no processamento de voz:', error);
    addMessage3D('Erro ao processar áudio', false);
  }
}

function base64ToBlob(base64, mimeType) {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    array[i] = bytes.charCodeAt(i);
  }
  return new Blob([array], { type: mimeType });
}

function loadLungModel() {
  // Eixos de referência
  axesHelper = new THREE.AxesHelper(0.2);
  group.add(axesHelper);

  // Placeholder
  const placeholderGeo = new THREE.BoxGeometry(0.1, 0.3, 0.1);
  const placeholderMat = new THREE.MeshStandardMaterial({ color: 0x22c55e });
  placeholderMesh = new THREE.Mesh(placeholderGeo, placeholderMat);
  placeholderMesh.castShadow = true;
  group.add(placeholderMesh);

  // Carregar modelo do pulmão
  const loader = new GLTFLoader();
  loader.load(
    'models/lung.glb',
    (gltf) => {
      lungRoot = gltf.scene || gltf.scenes[0];
      centerAndScaleModel(lungRoot);
      
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

function setupARButton() {
  const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay', 'dom-overlay-for-handheld-ar', 'hand-tracking', 'layers'],
    domOverlay: { root: document.body }
  });
  document.getElementById('arButtonContainer').appendChild(arButton);
}

function setupEventListeners() {
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

  // Botão de chat específico para AR
  document.getElementById('toggleChatBtn').addEventListener('click', toggleChat3D);

  window.addEventListener('resize', onWindowResize);
  renderer.xr.addEventListener('sessionstart', onXRSessionStart);
  renderer.xr.addEventListener('sessionend', onXRSessionEnd);
}

function setupTouchInteraction() {
  const canvas = renderer.domElement;
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
}

// Funções de controle VR - incluindo interação com chat
function onSelectStart(event) {
  const controller = event.target;
  
  // Verificar se clicou no chat
  if (chatVisible) {
    const intersections = getControllerIntersections(controller, [chatSendButton3D, chatRecordButton3D]);
    if (intersections.length > 0) {
      const object = intersections[0].object;
      if (object.userData.type === 'sendButton') {
        // Simular envio de mensagem (você pode implementar input de texto aqui)
        handleChatInput('Como funciona o pulmão?');
        return;
      } else if (object.userData.type === 'recordButton') {
        startVoiceRecording();
        return;
      }
    }
  }
  
  // Lógica existente para manipulação do modelo...
  const otherController = controller === controller1 ? controller2 : controller1;
  
  if (isGrabbing && grabbingController === otherController) {
    isGrabbingWithBothControllers = true;
    initialControllersDistance = controller.position.distanceTo(otherController.position);
    initialModelScale.copy(group.scale);
    console.log('Manipulação com dois controles iniciada');
    return;
  }
  
  const intersections = getIntersections(controller);
  const distanceToModel = group.position.distanceTo(controller.position);
  
  if (intersections.length > 0 || distanceToModel < 2.0) {