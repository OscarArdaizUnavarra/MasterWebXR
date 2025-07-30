import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

let camera, scene, renderer;
let hand1, hand2;
let cable, camSphere, camBody, tableTop, camIndicator, camScreen, lens,
        cableGeometry, cableMaterial, path, screenMaterial, loader, textMaterial,
        textMesh, newGeometry, newPath, cableBox;
let cableRemoved = false;
let actualizarObjetos = false;
const gravity = new THREE.Vector3(0, -0.0005, 0);
const tablesGroup = new THREE.Group();

//Variables para cámara
let cameraCovered = false;
let heldCameras = new Map();
let cameraGroups = [];
const camVelocity = new THREE.Vector3(0, 0, 0);

//Variables para movil
let phones = [];
let heldPhones = new Map();

let phoneFlipped = false;
let heldPhone = null;
let phoneVelocity = new THREE.Vector3(0, -0.0005, 0);

//Variables modo instructor/usuario
let lastModeSwitchTime = 0;
let mode = 'spectator';
let modeTextMesh = null;
let modeTextTimeout = null;

let victoria = false;

//Variables sonido
let phoneSound;
let soundPlaying = false;
const listener = new THREE.AudioListener();
const audioLoader = new THREE.AudioLoader();

 
//Variables escritura fichero
let contador_juego = 0;
let contador_segundo = 0;
let lista_rotation = [];
let lista_position = [];
let lista_position_hand1 = [];
let lista_rotation_hand1 = [];
let lista_position_hand2 = [];
let lista_rotation_hand2 = [];
let lista_phone_soundstop_time = [];
let lista_cameraOff_time = [];
let lista_cableOff_time = [];
let startTime = null;
let stopTime = null;

let todosMovilesApagados;
let todasCamarasApagadas;
let cableQuitado;
init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc2c2c2);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 10);
    camera.position.set(0, 1.6, 3);

    renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);
    document.body.appendChild(VRButton.createButton(renderer));

    //Empezar audio
    function resumeAudio() {
        if (renderer.xr.isPresenting) {
            if (phoneSound && !soundPlaying) {
                phoneSound.play();
                soundPlaying = true;
            }
            document.removeEventListener('click', resumeAudio);
        }
    }

    document.addEventListener('click', resumeAudio);


    // Habilitar sombras en el renderer
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Cargar modelo GLTF
    const loader = new GLTFLoader();
    loader.load(
            'Modelos/sin mesa.glb',
            function (gltf) {
                const model = gltf.scene;
                model.scale.set(0.8, 0.8, 0.8);
                model.position.set(0, 1.25, 0);

                // model.traverse(function (child) {
                //     if (child.isMesh) {
                //         child.castShadow = true;     // Proyecta sombra
                //         child.receiveShadow = true;  // Recibe sombra
                //     }
                // });

                scene.add(model);
            },
            undefined,
            function (error) {
                console.error('Error cargando el modelo:', error);
            }
    );

    // Redimensionar
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    //Sonido
    camera.add(listener); 


    // Luces
    const hemiLight = new THREE.HemisphereLight(0xdeebff, 0xcfcfcf, 1);
    hemiLight.position.set(0, 10, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(3, 10, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;

    scene.add(dirLight);

    // ===== OBJETOS =====
    // Mesa
    scene.add(tablesGroup);
    createTable(0, -1.2);
    createTable(2.2, -1.5);
    createTable(-2.2, -1.5);

    const gridHelper = new THREE.GridHelper(7.5, 7, 0x444444, 0xcccccc);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Ordenador
    // Marco exterior del monitor
    const screenFrame = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.25, 0.025),
            new THREE.MeshStandardMaterial({color: 0x111111})
            );
    screenFrame.position.set(-0.2, 0.83, -1.2);
    scene.add(screenFrame);

    // Pantalla azul
    screenMaterial = new THREE.MeshBasicMaterial({color: 0x44ccff});
    screen = new THREE.Mesh(
            new THREE.PlaneGeometry(0.28, 0.18),
            screenMaterial
            );
    screen.position.set(-0.2, 0.83, -1.187);
    scene.add(screen);

    // Texto de pantalla
    const fontLoader = new FontLoader();
    fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function (font) {
        const textGeo = new TextGeometry('Bienvenido', {
            font: font,
            size: 0.025,
            height: 0.001
        });
        const textMat = new THREE.MeshBasicMaterial({color: 0x000000});
        const textMesh = new THREE.Mesh(textGeo, textMat);
        textMesh.position.set(-0.31, 0.86, -1.186);
        scene.add(textMesh);
        screen.userData.textMesh = textMesh;
    });

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.2), new THREE.MeshStandardMaterial({color: 0x333333}));
    base.position.set(-0.2, 0.78, -1.2);
    scene.add(base);

    // Cable interactivo
    path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.35, 0.83, -1.2),
        new THREE.Vector3(-0.2, 0.83, -1.2),
        new THREE.Vector3(0.0, 0.83, -1.2),
        new THREE.Vector3(0.6, 0.83, -1.2),
        new THREE.Vector3(0.68, 0.83, -1.2),
        new THREE.Vector3(0.68, 0.4, -1.2),
        new THREE.Vector3(0.68, 0.05, -1.2)
    ]);


    cableGeometry = new THREE.TubeGeometry(path, 40, 0.01, 8, false);
    cableMaterial = new THREE.MeshStandardMaterial({color: 0x444444});
    cable = new THREE.Mesh(cableGeometry, cableMaterial);
    scene.add(cable);

    // Enchufe del cable
    const plugGeometry = new THREE.BoxGeometry(0.04, 0.02, 0.04);
    const plugMaterial = new THREE.MeshStandardMaterial({color: 0x222222});
    const cableEndPlug = new THREE.Mesh(plugGeometry, plugMaterial);
    cableEndPlug.position.set(0.68, 0.05, -1.2);
    cableEndPlug.name = 'cablePlug';
    scene.add(cableEndPlug);

    // Móvil
    // Coordenadas de mesas vacías
    const mesaAltura = 0.75;
    const mesaGrosor = 0.05;
    const movilGrosor = 0.02;
    const yPos = mesaAltura + mesaGrosor / 2 + movilGrosor / 2;

    createPhone(0.5, yPos, -1.1, 0xff0000);  // rojo
    createPhone(-2.5, yPos, -1.6, 0x00ff00); // verde
    createPhone(-2.1, yPos, -1.4, 0x0000ff); // azul
    createPhone(2.5, yPos, -1.6, 0xffff00);  // amarillo
    createPhone(2.1, yPos, -1.4, 0xff00ff);  // rosa



    phones.forEach((phoneObj) => {
        const phoneSound = new THREE.PositionalAudio(listener);
        audioLoader.load('sounds/alerta.mp3', function (buffer) {
            phoneSound.setBuffer(buffer);
            phoneSound.setRefDistance(0.2);
            phoneSound.setLoop(true);
            phoneSound.setVolume(0.5);
            phoneObj.mesh.add(phoneSound);
            phoneSound.play();
            phoneObj.sound = phoneSound;
            phoneObj.isPlaying = true;
        });
    });
    // CÁMARA
    createCamera(0, 1.5, -1.2);
    createCamera(-2.5, 1.5, -1.2);
    createCamera(2.5, 1.5, -1.2);

    // BOTON CAMBIO MODO - INSTRUCTOR/USUARIO
    // Pedestal para el botón de modo
    const alturaPedestal = 0.8;
    const buttonBase = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.1, alturaPedestal, 32),
            new THREE.MeshStandardMaterial({color: 0x444444})
            );
    buttonBase.position.set(0, alturaPedestal / 2, 0.5);
    scene.add(buttonBase);

    // Botón de modo encima del pedestal
    const buttonGeometry = new THREE.SphereGeometry(0.1, 32, 32);
    const buttonMaterial = new THREE.MeshStandardMaterial({color: 0xff28b1});
    const modeButton = new THREE.Mesh(buttonGeometry, buttonMaterial);
    modeButton.rotation.x = Math.PI / 2;
    modeButton.position.set(0, alturaPedestal + 0.02 / 2, 0.5);
    modeButton.name = "modeButton";
    scene.add(modeButton);


    // ===== MANOS XR =====
    const handModelFactory = new XRHandModelFactory();

    hand1 = renderer.xr.getHand(0);
    hand1.add(handModelFactory.createHandModel(hand1, 'mesh'));
    scene.add(hand1);

    hand2 = renderer.xr.getHand(1);
    hand2.add(handModelFactory.createHandModel(hand2, 'mesh'));
    scene.add(hand2);
}

function animate() {
    renderer.setAnimationLoop(() => {
        handleHandInteractions();

        handleModeButtonInteractions();

        handleMovil();

        handleCamera();

        updateCameraParts();

        if (renderer.xr.isPresenting && mode === 'user') {
            handleSimulationData();
        }

        renderer.render(scene, camera);
    });
}

function handleHandInteractions() {
    if (mode === 'user') {
        handleInteractionsUser(hand1);
        handleInteractionsUser(hand2);
    } else {
        handleInteractionsInstructor(hand1);
        handleInteractionsInstructor(hand2);
    }

    handleFinDeJuego();
}

function handleFinDeJuego() {
    todosMovilesApagados = phones.every(ph => !ph.isPlaying);
    todasCamarasApagadas = cameraGroups.every(cam => cam.isOff);
    cableQuitado = cableRemoved;

    if (todosMovilesApagados && todasCamarasApagadas && cableQuitado && !scene.userData.felicidadesMostrado) {
        scene.userData.felicidadesMostrado = true;

        // Cambiar fondo de escena
        scene.background = new THREE.Color(0x88ff88);

        // Mostrar texto en 3D
        const loader = new FontLoader();
        loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function (font) {
            const textGeo = new TextGeometry('Felicidades!\nHas desconectado todo', {
                font: font,
                size: 0.06,
                height: 0.01
            });

            const textMat = new THREE.MeshBasicMaterial({color: 0x000000});
            const textMesh = new THREE.Mesh(textGeo, textMat);

            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);
            const pos = camera.position.clone().add(dir.multiplyScalar(0.7));
            textMesh.position.copy(pos);
            textMesh.quaternion.copy(camera.quaternion);
            textMesh.name = 'mensajeFinal';

            scene.add(textMesh);
        });
        
        addConfetti();
        
        const victorySound = new THREE.Audio(listener);
        
        audioLoader.load('sounds/victoria.mp3', function (buffer) {
            victorySound.setBuffer(buffer);
            victorySound.setVolume(0.7);
            victorySound.play();
        });
        
        saveSimulationData();
        startTime = null;
        vaciarInformacion();
        victoria = true;
    }

}

function handleModeButtonInteractions() {
    handleModeButtonInteraction(hand1);
    handleModeButtonInteraction(hand2);
}

function handleMovil() {
    for (let phoneObj of phones) {
        let isHeld = false;
        const phone = phoneObj.mesh;

        for (let [h, p] of heldPhones.entries()) {
            if (p === phone) {
                const tip = h.joints['index-finger-tip'];
                if (tip) {
                    phone.position.copy(tip.position);
                    phone.quaternion.copy(tip.quaternion);
                }
                isHeld = true;
                break;
            }
        }

        if (!isHeld) {
            phoneVelocity.add(gravity);
            phone.position.add(phoneVelocity);

            const phoneBox = new THREE.Box3().setFromObject(phone);
            let collisionDetected = false;

            tablesGroup.children.forEach(table => {
                const tableTop = table.children.find(obj => obj.geometry instanceof THREE.BoxGeometry);
                if (!tableTop)
                    return;
                const tableBox = new THREE.Box3().setFromObject(tableTop);
                if (phoneBox.intersectsBox(tableBox)) {
                    phone.position.y = tableTop.getWorldPosition(new THREE.Vector3()).y + 0.05 / 2 + 0.02 / 2;
                    phoneVelocity.set(0, 0, 0);
                    collisionDetected = true;
                }
            });

            if (!collisionDetected && phone.position.y < 0) {
                phone.position.y = 0;
                phoneVelocity.set(0, 0, 0);
            }
        }
    }
}

function handleCamera() {
    for (let cam of cameraGroups) {
        let isHeld = false;
        for (let [hand, heldCam] of heldCameras.entries()) {
            if (heldCam === cam) {
                const tip = hand.joints['index-finger-tip'];
                if (tip) {
                    cam.group.position.copy(tip.position);
                    cam.group.quaternion.copy(tip.quaternion);
                }
                isHeld = true;
                break;
            }
        }

        if (!isHeld) {
            if (cam.body.position.y <= 0.2) {
                cam.body.position.add(gravity);
                if (cam.body.position.y < 0.1) {
                    cam.body.position.y = 0.1;
                }
            }
        }
    }
}

function handleSimulationData() {
    contador_juego++;
    if (startTime === null) {
        startTime = performance.now();
    }

    contador_segundo++;
    if (contador_segundo === 12) {
        collectSimulationData();
        contador_segundo = 0;
    }

}

function collectSimulationData() {
    let rotation = camera.rotation;
    let position = camera.position;
    lista_rotation.push([THREE.MathUtils.radToDeg(rotation.x), THREE.MathUtils.radToDeg(rotation.y), THREE.MathUtils.radToDeg(rotation.z)]);
    lista_position.push([position.x, position.y, position.z]);

    collectHandData(hand1, lista_position_hand1, lista_rotation_hand1);
    collectHandData(hand2, lista_position_hand2, lista_rotation_hand2);
}

function collectHandData(hand, positionList, rotationList) {
    let handPosition = hand.joints['index-finger-tip'] ? hand.joints['index-finger-tip'].position : new THREE.Vector3();
    let handRotation = hand.joints['index-finger-tip'] ? hand.joints['index-finger-tip'].rotation : new THREE.Euler();
    positionList.push([handPosition.x, handPosition.y, handPosition.z]);
    rotationList.push([THREE.MathUtils.radToDeg(handRotation.x), THREE.MathUtils.radToDeg(handRotation.y), THREE.MathUtils.radToDeg(handRotation.z)]);
}

function saveSimulationData() {
    const positionBlob = new Blob([
        "Posicion de la cámara: ", JSON.stringify(lista_position), "\n",
        "Rotacion de la cámara: ", JSON.stringify(lista_rotation), "\n",
        "Posicion de la mano 1: ", JSON.stringify(lista_position_hand1), "\n",
        "Rotacion de la mano 1: ", JSON.stringify(lista_rotation_hand1), "\n",
        "Posicion de la mano 2: ", JSON.stringify(lista_position_hand2), "\n",
        "Rotacion de la mano 2: ", JSON.stringify(lista_rotation_hand2)
    ], {type: 'text/plain'});

    const touchBlob = new Blob([
        "Tiempo hasta que se han apagado los moviles: ", JSON.stringify(lista_phone_soundstop_time), "\n",
        "Tiempo hasta que se han apagado las cámaras: ", JSON.stringify(lista_cameraOff_time), "\n",
        "Tiempo hasta que se ha quitado el cable del ordenador: ", JSON.stringify(lista_cableOff_time)
    ], {type: 'text/plain'});

    downloadBlob(positionBlob, 'position_data.txt');
    downloadBlob(touchBlob, 'touchTime_data.txt');
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const file = document.createElement('a');
    file.href = url;
    file.download = filename;
    file.click();
    URL.revokeObjectURL(url);
}

function handleInteractionsUser(hand) {
    const indexTip = hand.joints['index-finger-tip'];
    if (!indexTip)
        return;

    const handPos = indexTip.position;
    const grabbing = isPinching(hand);

    //MOVIL
    // Agarrar el móvil
    if (!heldPhones.has(hand) && grabbing) {
        for (let ph of phones) {
            if (handPos.distanceTo(ph.mesh.position) < 0.1) {
                heldPhones.set(hand, ph.mesh);
                if (ph.sound && ph.isPlaying) {
                    ph.sound.stop();
                    ph.isPlaying = false;
                    ph.mesh.material.color.set(0x333333);
                    ph.apagado = true;

                    if (startTime !== null) {
                        stopTime = performance.now();
                        const elapsedSeconds = (stopTime - startTime) / 1000;
                        lista_phone_soundstop_time.push(elapsedSeconds);
                    }
                }
                break;
            }
        }
    }

    // SOLTAR MÓVIL
    if (heldPhones.has(hand) && !grabbing) {
        heldPhones.delete(hand);
    }

    //CABLE
    //Quitar cable
    if (!cableRemoved) {
        const plug = scene.getObjectByName('cablePlug');
        const plugBox = new THREE.Box3().setFromObject(plug);
        if (plugBox.containsPoint(handPos)) {
            cableRemoved = true;

            // Apagar pantalla
            screenMaterial.color.set(0x000000);
            if (screen.userData.textMesh) {
                scene.remove(screen.userData.textMesh);
                delete screen.userData.textMesh;
            }

            plug.material.color.set(0xff0000);
            if (startTime !== null) {
                stopTime = performance.now();
                const elapsedSeconds = (stopTime - startTime) / 1000;
                lista_cableOff_time.push(elapsedSeconds);
            }
        }
    }
    //CAMARA
    for (let cam of cameraGroups) {
        if (!cam.isOff && handPos.distanceTo(cam.group.position) < 0.2) {
            cam.indicator.material.color.set(0xff0000);
            cam.screen.material.color.set(0x222222);
            cam.isOff = true;

            if (startTime !== null) {
                stopTime = performance.now();
                const elapsedSeconds = (stopTime - startTime) / 1000;
                lista_cameraOff_time.push(elapsedSeconds);
            }
        }
    }
}

function handleInteractionsInstructor(hand) {
    const indexTip = hand.joints['index-finger-tip'];
    if (!indexTip)
        return;

    const handPos = indexTip.position;
    const grabbing = isPinching(hand);

    //MOVIL
    if (!heldPhones.has(hand) && grabbing) {
        for (let ph of phones) {
            if (handPos.distanceTo(ph.mesh.position) < 0.1) {
                heldPhones.set(hand, ph.mesh);
                break;
            }
        }
    }

    // SOLTAR MÓVIL
    if (heldPhones.has(hand) && !grabbing) {
        heldPhones.delete(hand);
    }

    // CAMARA
    if (!heldCameras.has(hand) && grabbing) {
        for (let cam of cameraGroups) {
            if (handPos.distanceTo(cam.group.position) < 0.1) {
                heldCameras.set(hand, cam);
                break;
            }
        }
    }
    if (heldCameras.has(hand) && !grabbing) {
        heldCameras.delete(hand);
    }
}

function handleModeButtonInteraction(hand) {
    const indexTip = hand.joints['index-finger-tip'];
    if (!indexTip)
        return;

    const tipPos = indexTip.position;
    const button = scene.getObjectByName("modeButton");

    if (!button)
        return;

    const distance = tipPos.distanceTo(button.position);
    const currentTime = performance.now();

    if (distance < 0.05) {
        if (!button.userData.pressed && currentTime - lastModeSwitchTime > 1000) {
            
            if(mode === 'user' && startTime !== null && !victoria){
                saveSimulationData();
                startTime = null;
                vaciarInformacion();
            }
            
            (mode === 'instructor') ? actualizarObjetos = true : actualizarObjetos = false;
            mode = (mode === 'user') ? 'instructor' : 'user';
            if(mode === 'user'){
                victoria = false;
            }
            button.material.color.set(mode === 'user' ? 0x0077ff : 0xff7700);
            console.log("Modo cambiado a:", mode);
            lastModeSwitchTime = currentTime;
            button.userData.pressed = true;
            showModeChangeMessage(mode);
        }
        if (actualizarObjetos) {
            reinicarObjetos();
        }
    } else {
        button.userData.pressed = false;
    }
}

function vaciarInformacion(){
    lista_position = [];
    lista_rotation = [];
    lista_position_hand1 = [];
    lista_rotation_hand1 = [];
    lista_position_hand2 = [];
    lista_rotation_hand2 = [];
    lista_phone_soundstop_time = [];
    lista_cameraOff_time = [];
    lista_cableOff_time = [];
}

function reinicarObjetos() {
    // Reiniciar móviles
    phones.forEach((phoneObj) => {

        phoneObj.mesh.material.color.set(phoneObj.colorOriginal);

        // Reproducir sonido si estaba parado
        if (phoneObj.sound && !phoneObj.isPlaying) {
            phoneObj.sound.play();
            phoneObj.isPlaying = true;
        }
    });

    // Reiniciar cámaras
    cameraGroups.forEach((cam) => {
        cam.indicator.material.color.set(0x00ff00); // verde
        cam.screen.material.color.set(0x0088ff);    // azul
        cam.isOff = false;
    });

    // Reiniciar cable y ordenador
    const plug = scene.getObjectByName('cablePlug');
    if (plug) {
        plug.material.color.set(0x222222); // color original del enchufe
    }
    cableRemoved = false;

    // Reactivar pantalla del ordenador
    screenMaterial.color.set(0x44ccff); // color azul

    // Añadir de nuevo el texto en la pantalla
    const fontLoader = new FontLoader();
    fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function (font) {
        const textGeo = new TextGeometry('Bienvenido', {
            font: font,
            size: 0.025,
            height: 0.001
        });
        const textMat = new THREE.MeshBasicMaterial({color: 0x000000});
        const textMesh = new THREE.Mesh(textGeo, textMat);
        textMesh.position.set(-0.31, 0.86, -1.186);
        scene.add(textMesh);
        screen.userData.textMesh = textMesh;
    });

    scene.background = new THREE.Color(0xc2c2c2);
    const mensaje = scene.getObjectByName('mensajeFinal');
    if (mensaje)
        scene.remove(mensaje);
    scene.userData.felicidadesMostrado = false;
}



function isPinching(hand) {
    const indexTip = hand.joints['index-finger-tip'];
    const thumbTip = hand.joints['thumb-tip'];
    if (indexTip && thumbTip) {
        const dist = indexTip.position.distanceTo(thumbTip.position);
        return dist < 0.020;
    }
    return false;
}

function createTable(x, z) {
    const table = new THREE.Group();

    const tableMaterial = new THREE.MeshStandardMaterial({color: 0x9d9d9d});
    const tableTopGeometry = new THREE.BoxGeometry(1.3, 0.05, 0.6);
    const top = new THREE.Mesh(tableTopGeometry, tableMaterial);
    top.position.set(0, 0.75, 0);
    table.add(top);

    const legMaterial = new THREE.MeshStandardMaterial({color: 0x454545});
    const legGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.75, 8);
    const legOffsets = [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]];
    legOffsets.forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(legGeometry, legMaterial);
        leg.position.set(lx, 0.375, lz);
        table.add(leg);
    });

    table.position.set(x, 0, z);
    tablesGroup.add(table);
}

function createPhone(x, y, z, color) {
    const phoneMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.02, 0.2),
            new THREE.MeshStandardMaterial({color: color})
            );
    phoneMesh.position.set(x, y, z);
    scene.add(phoneMesh);
    phones.push({
        mesh: phoneMesh,
        sound: null,
        isPlaying: false,
        colorOriginal: color,
        apagado: false
    });
}

function createCamera(x, y, z) {
    const camGroup = new THREE.Group();

    const camBody = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.1, 0.1),
            new THREE.MeshStandardMaterial({color: 0x222222})
            );

    const lens = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.01, 32),
            new THREE.MeshStandardMaterial({color: 0x4444ff})
            );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0, 0.05);

    const camIndicator = new THREE.Mesh(
            new THREE.SphereGeometry(0.01),
            new THREE.MeshStandardMaterial({color: 0x00ff00})
            );
    camIndicator.position.set(0.09, 0.03, 0.05);

    const camScreen = new THREE.Mesh(
            new THREE.PlaneGeometry(0.12, 0.06),
            new THREE.MeshBasicMaterial({color: 0x0088ff})
            );
    camScreen.position.set(0, 0, -0.055);

    camGroup.add(camBody, lens, camIndicator, camScreen);
    camGroup.position.set(x, y, z);
    scene.add(camGroup);

    cameraGroups.push({
        group: camGroup,
        body: camBody,
        indicator: camIndicator,
        screen: camScreen,
        isOff: false
    });
}

function showModeChangeMessage(newMode) {
    if (modeTextMesh) {
        scene.remove(modeTextMesh);
        clearTimeout(modeTextTimeout);
    }

    const loader = new FontLoader();
    loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function (font) {
        const textGeo = new TextGeometry(`Modo: ${newMode}`, {
            font: font,
            size: 0.05,
            height: 0.005
        });

        const textMaterial = new THREE.MeshBasicMaterial({color: 0x000000});
        modeTextMesh = new THREE.Mesh(textGeo, textMaterial);

        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.multiplyScalar(0.5);
        const pos = camera.position.clone().add(camDir);
        modeTextMesh.position.copy(pos);
        modeTextMesh.quaternion.copy(camera.quaternion);
        scene.add(modeTextMesh);

        modeTextTimeout = setTimeout(() => {
            scene.remove(modeTextMesh);
            modeTextMesh = null;
        }, 3000);
    });
}

function updateCameraParts() {
    for (let cam of cameraGroups) {
        const bodyPos = cam.body.position;
        cam.group.children.forEach(child => {
            if (child === cam.body)
                return;

            // Detectar y actualizar lente
            if (child.geometry instanceof THREE.CylinderGeometry) {
                child.position.set(bodyPos.x, bodyPos.y, bodyPos.z + 0.05);
            }

            // Detectar y actualizar LED
            if (child.geometry instanceof THREE.SphereGeometry) {
                child.position.set(bodyPos.x + 0.09, bodyPos.y + 0.03, bodyPos.z + 0.05);
            }

            // Detectar y actualizar pantalla trasera
            if (child.geometry instanceof THREE.PlaneGeometry) {
                child.position.set(bodyPos.x, bodyPos.y, bodyPos.z - 0.055);
            }
        });
    }
}

function addConfetti() {
    const confettiCount = 1000;
    const confettiGeometry = new THREE.SphereGeometry(0.01, 6, 6);
    const confettiGroup = new THREE.Group();
    scene.add(confettiGroup);

    for (let i = 0; i < confettiCount; i++) {
        const color = new THREE.Color(`hsl(${Math.random() * 360}, 100%, 60%)`);
        const material = new THREE.MeshBasicMaterial({ color: color });
        const confetti = new THREE.Mesh(confettiGeometry, material);

        confetti.position.set(
            (Math.random() - 0.5) * 8,
            2.5 + Math.random(),
            (Math.random() - 0.5) * 6
        );

        confetti.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.01,
            -0.01 - Math.random() * 0.01,
            (Math.random() - 0.5) * 0.01
        );

        confettiGroup.add(confetti);
    }

    const dropInterval = setInterval(() => {
        confettiGroup.children.forEach(p => {
            p.position.add(p.userData.velocity);
            p.rotation.x += 0.1;
            p.rotation.y += 0.1;
        });
    }, 16);

    setTimeout(() => {
        clearInterval(dropInterval);
        scene.remove(confettiGroup);
    }, 8000);
}