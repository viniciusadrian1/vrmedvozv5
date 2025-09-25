// Cena 3D: Three.js + WebXR AR + GLTF do pulmão (ES Modules)
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
let hand1, hand2;
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

// Área de movimento VR (boundary circle) - AUMENTADO SIGNIFICATIVAMENTE
let playArea;
const PLAY_AREA_RADIUS = 25.0; // Ajustado para 25 metros (unidades AR = metros) // Aumentado para 25m de raio (50m de diâmetro)

// Teleport
let teleportMarker;
let isTeleporting = false;

// Variáveis para interação touch/gestos em AR
let isMovingModel = false;
let initialTouchDistance = 0;
let initialScale = 1;
let touches = [];

window.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded - iniciando cena AR com ES Modules');
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

  // Renderer com WebXR AR habilitado - CONFIGURAÇÕES PARA FUNDO TRANSPARENTE
  renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: true // Habilita transparência
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const rect = container.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height);
  renderer.xr.enabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  
  // CONFIGURAÇÕES CRUCIAIS PARA AR COM FUNDO TRANSPARENTE
  renderer.setClearColor(0x000000, 0); // Cor preta com alpha 0 (transparente)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  
  container.appendChild(renderer.domElement);

  // Cena - SEM background para permitir transparência
  scene = new THREE.Scene();
  // Para desktop, adicionar um fundo visível
  if (!renderer.xr.isPresenting) {
    scene.background = new THREE.Color(0x1e293b); // Slate-800
  }

  // Câmera - Far plane aumentado para área maior
  camera = new THREE.PerspectiveCamera(70, rect.width / rect.height, 0.01, 200); 
  camera.position.set(0, 0.3, 0.5);

  // Grupo para o modelo (permite manipulação)
  group = new THREE.Group();
  scene.add(group);

  // Luzes - ajustadas para AR com ambiente real
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

  // Luz adicional para melhor iluminação do modelo em AR
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.6);
  dir2.position.set(-1, 1, -1);
  scene.add(dir2);

  // Luz pontual para destacar o modelo
  const pointLight = new THREE.PointLight(0xffffff, 0.5, 100);
  pointLight.position.set(0, 1, 0);
  scene.add(pointLight);

  // Criar área de movimento VR (boundary circle MUITO maior)
  const playAreaGeometry = new THREE.RingGeometry(Math.max(0.1, PLAY_AREA_RADIUS - 0.2), PLAY_AREA_RADIUS, 256); 
  const playAreaMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x00ff00, 
    opacity: 0.15, // Mais transparente devido ao tamanho maior
    transparent: true,
    side: THREE.DoubleSide
  });
  playArea = new THREE.Mesh(playAreaGeometry, playAreaMaterial);
  playArea.rotation.x = -Math.PI / 2;
  playArea.position.y = 0.01; // Ligeiramente acima do chão
  playArea.visible = false; // Inicialmente invisível
  scene.add(playArea);

  // Grade de orientação para ajudar na orientação espacial
  const gridHelper = new THREE.GridHelper(PLAY_AREA_RADIUS * 2, 50, 0x444444, 0x222222);
  gridHelper.visible = false; // Inicialmente invisível, ativa em VR
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

  // Adicionar anel ao redor do marcador de teleporte para melhor visibilidade
  const RING_INNER = Math.max(TELEPORT_BASE_RADIUS * 0.9, TELEPORT_BASE_RADIUS - 0.02);
  const RING_OUTER = Math.max(RING_INNER + 0.01, TELEPORT_BASE_RADIUS * 1.15);
  const ringGeometry = new THREE.RingGeometry(RING_INNER, RING_OUTER, 32);
  const ringMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x00ffff, 
    side: THREE.DoubleSide,
    opacity: 0.8,
    transparent: true
  });
  const teleportRing = new THREE.Mesh(ringGeometry, ringMaterial);
  teleportRing.rotation.x = -Math.PI / 2;
  teleportRing.position.y = 0.001;
  teleportMarker.add(teleportRing);

  // Reticle para posicionamento
  const RETICLE_INNER = Math.max(0.02, Math.min(PLAY_AREA_RADIUS * 0.005, 0.5));
  const RETICLE_OUTER = Math.max(RETICLE_INNER + 0.01, RETICLE_INNER * 1.3);
  const reticleGeometry = new THREE.RingGeometry(RETICLE_INNER, RETICLE_OUTER, 32).rotateX(-Math.PI / 2);
  // Reticle escala com PLAY_AREA_RADIUS para ficar visível em áreas maiores
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

  // Controlador 1 (mão direita geralmente)
  controller1 = renderer.xr.getController(0);
  controller1.addEventListener('selectstart', onSelectStart);
  controller1.addEventListener('selectend', onSelectEnd);
  controller1.addEventListener('squeeze', onSqueeze);
  controller1.addEventListener('squeezestart', onSqueezeStart);
  controller1.addEventListener('squeezeend', onSqueezeEnd);
  scene.add(controller1);

  // Controlador 2 (mão esquerda geralmente)
  controller2 = renderer.xr.getController(1);
  controller2.addEventListener('selectstart', onSelectStart);
  controller2.addEventListener('selectend', onSelectEnd);
  controller2.addEventListener('squeeze', onSqueeze);
  controller2.addEventListener('squeezestart', onSqueezeStart);
  controller2.addEventListener('squeezeend', onSqueezeEnd);
  scene.add(controller2);

  // Adicionar modelos visuais dos controladores
  controllerGrip1 = renderer.xr.getControllerGrip(0);
  controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
  scene.add(controllerGrip1);

  controllerGrip2 = renderer.xr.getControllerGrip(1);
  controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
  scene.add(controllerGrip2);

  // Adicionar linha/raio aos controladores para apontar
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
  line1.scale.z = Math.min(Math.max(10, PLAY_AREA_RADIUS * 0.5), 100); // Ajusta alcance do raio com base na área de jogo
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

  // Configuração AR
  setupAR();

  // Carrega o modelo
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
          // Melhora materiais para AR
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

function setupAR() {
  // Configuração básica para AR
}

function setupTouchInteraction() {
  const canvas = renderer.domElement;
  
  // Touch events para movimentar e escalar o modelo em AR
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
}

// Funções de controle VR - MELHORADAS PARA MANIPULAÇÃO COMPLETA
function onSelectStart(event) {
  const controller = event.target;
  const otherController = controller === controller1 ? controller2 : controller1;
  
  // Verificar se o outro controle já está agarrando
  if (isGrabbing && grabbingController === otherController) {
    // Ambos os controles estão agarrando agora
    isGrabbingWithBothControllers = true;
    
    // Armazenar distância inicial entre controles
    initialControllersDistance = controller.position.distanceTo(otherController.position);
    initialModelScale.copy(group.scale);
    controller1InitialPos.copy(controller1.position);
    controller2InitialPos.copy(controller2.position);
    
    console.log('Manipulação com dois controles iniciada');
    return;
  }
  
  if (isTeleporting && teleportMarker.visible) {
    // Executar teleporte
    const xrCamera = renderer.xr.getCamera();
    const currentY = xrCamera.position.y;
    
    // Calcular offset da posição atual para o marcador
    const offsetX = teleportMarker.position.x - xrCamera.position.x;
    const offsetZ = teleportMarker.position.z - xrCamera.position.z;
    
    // Aplicar o teleporte mantendo a altura
    xrCamera.position.x += offsetX;
    xrCamera.position.z += offsetZ;
    
    console.log(`Teleportado para: x=${teleportMarker.position.x}, z=${teleportMarker.position.z}`);
    
    // Feedback háptico para confirmar teleporte
    const gamepad = controller.gamepad;
    if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
      gamepad.hapticActuators[0].pulse(0.8, 200);
    }
    
    return;
  }

  // Verificar se está apontando para o modelo ou próximo dele
  const intersections = getIntersections(controller);
  const distanceToModel = group.position.distanceTo(controller.position);
  
  if (intersections.length > 0 || distanceToModel < 2.0) {
    // Começar a agarrar o objeto (mesmo se não houver interseção direta, mas estiver próximo)
    isGrabbing = true;
    grabbingController = controller;
    
    // Armazenar posição inicial
    previousControllerPosition.copy(controller.position);
    previousControllerQuaternion.copy(controller.quaternion);
    
    // Destacar modelo selecionado
    if (lungRoot) {
      lungRoot.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.emissive = new THREE.Color(0x444444);
          child.material.emissiveIntensity = 0.3;
        }
      });
    }
    
    // Feedback háptico se disponível
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
    // Se estava usando dois controles, agora continua com apenas um
    isGrabbingWithBothControllers = false;
    // O controle que soltou deixa de agarrar, mas o outro continua
    if (grabbingController === controller) {
      grabbingController = controller === controller1 ? controller2 : controller1;
      if (!grabbingController || !isGrabbing) {
        isGrabbing = false;
      }
    }
    console.log('Manipulação com dois controles finalizada');
  } else if (isGrabbing && grabbingController === controller) {
    // Parar de agarrar completamente
    isGrabbing = false;
    grabbingController = null;
    
    // Remover destaque
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
  // Apertar o gatilho lateral para teleporte
  const controller = event.target;
  isTeleporting = true;
  
  // Mudar cor da linha para indicar modo teleporte
  const line = controller.getObjectByName('line');
  if (line) {
    line.material.color.setHex(0x00ffff);
    line.material.opacity = 0.8;
  }
}

function onSqueezeStart(event) {
  isTeleporting = true;
  playArea.visible = true; // Mostrar área de movimento
  
  // Feedback háptico para indicar modo teleporte
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
  
  // Restaurar cor da linha
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

const MOVE_SENSITIVITY = 1.5; // aumentado para resposta mais perceptível nos controles

function handleController(controller) {
  if (isTeleporting) {
    // Modo teleporte - mostrar marcador onde o raio atinge o chão
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    
    // Criar um plano no chão para interseção
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersection = new THREE.Vector3();
    
    if (raycaster.ray.intersectPlane(floorPlane, intersection)) {
      // Verificar se está dentro da área de movimento expandida
      const distance = Math.sqrt(intersection.x * intersection.x + intersection.z * intersection.z);
      if (distance <= PLAY_AREA_RADIUS) {
        teleportMarker.position.copy(intersection);
        teleportMarker.position.y = 0.025;
        teleportMarker.visible = true;
        
        // Indicador visual de distância - cor varia conforme distância
        const normalizedDistance = distance / PLAY_AREA_RADIUS;
        const hue = 0.5 - normalizedDistance * 0.5; // De cyan (próximo) para verde (longe)
        teleportMarker.material.color.setHSL(hue, 1, 0.5);
        
        // Animação do marcador
        const scale = 1 + Math.sin(Date.now() * 0.003) * 0.1;
        teleportMarker.scale.set(scale, 1, scale);
      } else {
        teleportMarker.visible = false;
      }
    }
  } else if (isGrabbingWithBothControllers) {
    // Manipulação com dois controles - escala e rotação mais precisa
    const currentDistance = controller1.position.distanceTo(controller2.position);
    const scaleFactor = currentDistance / initialControllersDistance;
    
    // Aplicar escala com limites expandidos
    const newScale = Math.max(0.05, Math.min(10, initialModelScale.x * scaleFactor));
    group.scale.set(newScale, newScale, newScale);
    
    // Calcular rotação baseada no movimento dos controles
    const midPoint = new THREE.Vector3();
    midPoint.addVectors(controller1.position, controller2.position).multiplyScalar(MOVE_SENSITIVITY);
    
    // Mover o modelo para o ponto médio entre os controles
    group.position.copy(midPoint);
    
    // Rotação baseada na orientação entre controles
    const direction = new THREE.Vector3();
    direction.subVectors(controller2.position, controller1.position).normalize();
    
    // Calcular ângulo de rotação
    const targetRotation = Math.atan2(direction.x, direction.z);
    
    // Aplicar rotação suave com interpolação
    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, targetRotation, 0.15);
    
    // Permitir rotação em outros eixos baseado na inclinação dos controles
    const verticalAngle = Math.asin(direction.y);
    group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, verticalAngle * 0.5, 0.1);
    
    // Feedback háptico contínuo em ambos controles
    [controller1, controller2].forEach(ctrl => {
      const gamepad = ctrl.gamepad;
      if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
        gamepad.hapticActuators[0].pulse(0.1, 20);
      }
    });
    
  } else if (isGrabbing && grabbingController === controller) {
    // Modo agarrar com um controle - mover e rotar o modelo
    const deltaMove = new THREE.Vector3();
    deltaMove.copy(controller.position).sub(previousControllerPosition);
    
    // Mover o grupo com sensibilidade ajustada
    group.position.add(deltaMove.multiplyScalar(MOVE_SENSITIVITY));
    
    // Calcular rotação baseada no movimento do controle
    const deltaRotation = new THREE.Quaternion();
    deltaRotation.copy(controller.quaternion).multiply(previousControllerQuaternion.clone().invert());
    
    // Aplicar rotação com suavização maior
    const targetQuaternion = new THREE.Quaternion();
    targetQuaternion.multiplyQuaternions(deltaRotation, group.quaternion);
    group.quaternion.slerp(targetQuaternion, 0.4);
    
    // Atualizar posições anteriores
    previousControllerPosition.copy(controller.position);
    previousControllerQuaternion.copy(controller.quaternion);
    
    // Feedback háptico contínuo suave
    const gamepad = controller.gamepad;
    if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
      // Intensidade baseada na velocidade do movimento
      const velocity = deltaMove.length();
      const intensity = Math.min(0.3, velocity * 2);
      if (intensity > 0.05) {
        gamepad.hapticActuators[0].pulse(intensity, 15);
      }
    }
  }
  
  // Atualizar visual do raio baseado no estado
  const line = controller.getObjectByName('line');
  if (line) {
    if (isGrabbing && grabbingController === controller) {
      line.material.opacity = 0.9;
      line.scale.z = 3; // Raio mais curto quando agarrando
      line.material.color.setHex(0x00ff00); // Verde quando agarrando
    } else if (isTeleporting) {
      line.material.opacity = 0.7;
      line.scale.z = 20; // Raio muito mais longo para teleporte na área expandida
      // Cor já definida em onSqueeze
    } else {
      line.material.opacity = 0.4;
      line.scale.z = 10; // Tamanho normal
      line.material.color.setHex(0xffffff); // Branco padrão
    }
  }
}

function onTouchStart(event) {
    event.preventDefault && event.preventDefault();
  if (!renderer.xr.isPresenting) return;
  
  event.preventDefault();
  touches = Array.from(event.touches);
  
  if (touches.length === 1) {
    // Um toque - prepara para mover o modelo
    isMovingModel = true;
  } else if (touches.length === 2) {
    // Dois toques - prepara para escalar (pinch zoom)
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
    // Um toque - move o modelo na tela
    const touch = touches[0];
    const x = (touch.clientX / window.innerWidth) * 2 - 1;
    const y = -(touch.clientY / window.innerHeight) * 2 + 1;
    
    // Criar um raio da câmera através do ponto tocado
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    
    // Calcular ponto no plano a 1 metro de distância
    const planeDistance = 1.0;
    const direction = new THREE.Vector3();
    raycaster.ray.direction.normalize();
    direction.copy(raycaster.ray.direction).multiplyScalar(planeDistance);
    
    // Atualizar posição do modelo
    group.position.copy(camera.position).add(direction);
    
  } else if (touches.length === 2) {
    // Dois toques - escalar o modelo (pinch to zoom)
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const scale = (distance / initialTouchDistance) * initialScale;
    // Limitar escala entre 0.1 e 5
    const clampedScale = Math.max(0.1, Math.min(5, scale));
    group.scale.set(clampedScale, clampedScale, clampedScale);
    
    // Rotação com dois dedos
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

  // Centraliza na origem
  root.position.sub(center);

  // Escala para 30cm de altura (maior para melhor visibilidade)
  const targetHeight = 0.30;
  const currentHeight = size.y || 1.0;
  const scale = targetHeight / currentHeight;
  root.scale.setScalar(scale);

  root.position.y = 0;
}

function resetCamera() {
  if (renderer.xr.isPresenting) {
    // Em AR/VR, reseta a posição do modelo para frente da câmera
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    // Posiciona o modelo a 0.5 metros de distância (mais próximo)
    group.position.copy(camera.position);
    group.position.add(cameraDirection.multiplyScalar(MOVE_SENSITIVITY));
    group.position.y = camera.position.y - 0.15;
    
    group.rotation.set(0, 0, 0);
    group.scale.set(1, 1, 1);
    group.visible = true;
    isModelPlaced = true;
    
    console.log('Modelo reposicionado em AR/VR');
  } else {
    // Desktop
    camera.position.set(0, 0.3, 0.5);
    controls.target.set(0, 0, 0);
    controls.update();
    scene.background = new THREE.Color(0x1e293b);
  }
}

function onXRSessionStart() {
  console.log('AR/VR Session iniciada');
  controls.enabled = false;
  isModelPlaced = false;
  
  // Remove o fundo da cena para AR
  scene.background = null;
  
  // Garante que o fundo seja totalmente transparente durante AR
  renderer.setClearColor(0x000000, 0);
  
  // Mostrar área de movimento em VR (visibilidade reduzida)
  playArea.visible = false; // Começa invisível, aparece apenas com squeeze
  
  // Posiciona o modelo automaticamente na frente da câmera
  setTimeout(() => {
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    
    // Posiciona o modelo a 0.5 metros de distância
    group.position.copy(camera.position);
    group.position.add(cameraDirection.multiplyScalar(MOVE_SENSITIVITY));
    group.position.y = camera.position.y - 0.15;
    
    // Torna o modelo visível
    group.visible = true;
    isModelPlaced = true;
    
    console.log('Modelo posicionado automaticamente em AR/VR');
    
    // Mostra instruções de interação
    showARInstructions();
  }, 1000);

  // Inicializa hit testing para reposicionamento opcional
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
}

function showARInstructions() {
  const arInstructions = document.getElementById('arInstructions');
  if (arInstructions) {
    arInstructions.innerHTML = `
      <div style="background: rgba(0,0,0,0.8); padding: 20px; border-radius: 10px; color: white;">
        <p>🎮 <strong>Controles Meta Quest 2:</strong></p>
        <p>• <strong>Gatilho principal:</strong> Agarrar e mover o modelo 3D</p>
        <p>• <strong>Gatilho lateral:</strong> Ativar teleporte (área de ${PLAY_AREA_RADIUS}m de raio)</p>
        <p>• <strong>Ambos controles:</strong> Escalar e rotar com precisão</p>
        <p>• <strong>Botão Resetar:</strong> Reposicionar modelo na frente</p>
        <br>
        <p style="color: #00ff00;">✅ Área de movimento: ${PLAY_AREA_RADIUS * 2}m de diâmetro disponível!</p>
      </div>
    `;
    arInstructions.classList.remove('hidden');
    arInstructions.style.position = 'fixed';
    arInstructions.style.top = '20px';
    arInstructions.style.left = '50%';
    arInstructions.style.transform = 'translateX(-50%)';
    arInstructions.style.zIndex = '1000';
    
    // Remove instruções após 15 segundos
    setTimeout(() => {
      arInstructions.classList.add('hidden');
    }, 15000);
  }
}

function onXRSessionEnd() {
  console.log('AR/VR Session finalizada');
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
  
  // Restaura o fundo para visualização desktop
  scene.background = new THREE.Color(0x1e293b);
  renderer.setClearColor(0x1e293b, 1);
}

function onWindowResize() {
  const container = document.getElementById('canvas-container');
  const rect = container.getBoundingClientRect();
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  renderer.setSize(rect.width, rect.height);
}

function animate() {
  
// Desktop: allow moving model when Alt + drag
let isMouseDragging = false;
let lastMousePos = new THREE.Vector2();
renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.altKey) {
        isMouseDragging = true;
        lastMousePos.set(e.clientX, e.clientY);
        controls.enabled = false;
    }
});
renderer.domElement.addEventListener('mousemove', (e) => {
    if (isMouseDragging && selectedObject) {
        const deltaX = (e.clientX - lastMousePos.x) / window.innerWidth;
        const deltaY = (e.clientY - lastMousePos.y) / window.innerHeight;
        // move on XZ plane
        selectedObject.position.x += deltaX * 10 * MOVE_SENSITIVITY;
        selectedObject.position.z -= deltaY * 10 * MOVE_SENSITIVITY;
        lastMousePos.set(e.clientX, e.clientY);
    }
});
renderer.domElement.addEventListener('mouseup', (e) => {
    if (isMouseDragging) {
        isMouseDragging = false;
        controls.enabled = true;
    }
});

renderer.setAnimationLoop(render);
}

function render() {
  // Processar controladores VR
  if (renderer.xr.isPresenting) {
    handleController(controller1);
    handleController(controller2);
  }
  
  // Hit testing opcional para reposicionamento
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

  // Atualiza controles desktop
  if (controls && controls.enabled) {
    controls.update();
  }
  
  // Animação do placeholder
  if (placeholderMesh) {
    placeholderMesh.rotation.y += 0.01;
  }
  
  // Animação suave de rotação quando não selecionado (apenas em desktop)
  if (lungRoot && !selectedObject && !renderer.xr.isPresenting && !isGrabbing) {
    lungRoot.rotation.y += 0.002;
  }
  
  // Animação do teleport marker quando visível
  if (teleportMarker && teleportMarker.visible) {
    // Animação de rotação do anel
    const ring = teleportMarker.children[0];
    if (ring) {
      ring.rotation.z += 0.02;
    }
  }
  
  renderer.render(scene, camera);
}

// Log de erros
window.addEventListener('error', (e) => {
  console.error('GlobalError:', e.message, e.filename, e.lineno);
});

console.log(`
===========================================
AR/VR Scene Initialized
===========================================
• Play Area: ${PLAY_AREA_RADIUS * 2}m diameter (${PLAY_AREA_RADIUS}m radius)
• Meta Quest 2 Controls: Fully Enabled
• Teleport System: Active
• Dual Controller Manipulation: Active
• Max Far Plane: 200m
===========================================
`);