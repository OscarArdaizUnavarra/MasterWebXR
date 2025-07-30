import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

import { XRButton } from 'threeXR/XRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

import { OBB } from 'three/addons/math/OBB.js';

let container;
let camera, scene, renderer;
let controller1, controller2;
let controllerGrip1, controllerGrip2;

let supportHaptic = false;

let hitBoxBox;

let geometryPair = [];
let lastObject = null;
const geometries = [
    new THREE.BoxGeometry(0.2, 0.2, 0.2),
    new THREE.ConeGeometry(0.1, 0.2, 64),
    new THREE.CylinderGeometry(0.1, 0.1, 0.2, 64),
    new THREE.IcosahedronGeometry(0.1, 6)
    // new THREE.TorusGeometry( 0.2, 0.04, 64, 32 )
];

let raycaster;

const intersected = [];
let group;
const modes = ["instructor", "user"];
let mode = modes[0];
let squeezeing = 0;
let squeezes = 0;
let startTime;
let timeTextMesh;
let id = 1;
let timeController;

const controllers = [];

let gameOver = false;  // Variable para manejar el estado del juego
let started = false;
let startTimePassed = false;

let posicionesCabeza = [];
let rotacionesCabeza = [];
let posicionesMandos = [];  // Array para guardar posiciones de los dos mandos
let ultimoTiempoMetrica = 0;

init();
animate();

function init() {

    container = document.createElement('div');
    document.body.appendChild(container);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x808080);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.6, 3);

    const floorGeometry = new THREE.PlaneGeometry(4, 4);
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x252525,
        roughness: 1.0,
        metalness: 0.0
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = - Math.PI / 2;
    floor.receiveShadow = true;
    // scene.add(floor);

    scene.add(new THREE.HemisphereLight(0x808080, 0x606060));

    const light = new THREE.DirectionalLight(0xffffff);
    light.position.set(0, 6, 0);
    light.castShadow = true;
    light.shadow.camera.top = 2;
    light.shadow.camera.bottom = - 2;
    light.shadow.camera.right = 2;
    light.shadow.camera.left = - 2;
    light.shadow.mapSize.set(4096, 4096);
    scene.add(light);

    group = new THREE.Group();
    scene.add(group);

    //

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.xr.enabled = true;
    renderer.xr.addEventListener('sessionstart', sessionStart);
    container.appendChild(renderer.domElement);

    // document.body.appendChild(XRButton.createButton(renderer));

    const arButton = document.createElement('button');
    arButton.textContent = 'ENTRAR EN MR';
    arButton.style.position = 'absolute';
    arButton.style.bottom = '20px';
    arButton.style.left = '20px';
    arButton.style.padding = '10px';
    arButton.style.background = '#222';
    arButton.style.color = '#fff';
    arButton.style.border = '1px solid #fff';
    document.body.appendChild(arButton);

    arButton.addEventListener('click', async () => {
        if (navigator.xr) {
            const session = await navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['hit-test', 'local-floor'],
                optionalFeatures: ['dom-overlay'],
                domOverlay: { root: document.body }
            });
            renderer.xr.setSession(session);
            startAudio(camera);
        } else {
            alert('WebXR AR no está disponible en este dispositivo o navegador.');
        }
    });
    scene.background = null;

    // controllers

    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('selectstart', onSelectStart);
    controller1.addEventListener('selectend', onSelectEnd);
    controller1.addEventListener('squeezestart', onSqueezeStart);
    controller1.addEventListener('squeezeend', onSqueezeEnd);
    scene.add(controller1);

    controller2 = renderer.xr.getController(1);
    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('selectend', onSelectEnd);
    controller2.addEventListener('squeezestart', onSqueezeStart);
    controller2.addEventListener('squeezeend', onSqueezeEnd);
    scene.add(controller2);

    const controllerModelFactory = new XRControllerModelFactory();

    controllerGrip1 = renderer.xr.getControllerGrip(0);

    controllerGrip1.addEventListener('connected', controllerConnected);
    controllerGrip1.addEventListener('disconnected', controllerDisconnected);

    controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
    scene.add(controllerGrip1);

    controllerGrip2 = renderer.xr.getControllerGrip(1);

    controllerGrip2.addEventListener('connected', controllerConnected);
    controllerGrip2.addEventListener('disconnected', controllerDisconnected);

    controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
    scene.add(controllerGrip2);

    //

    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, - 1)]);

    const line = new THREE.Line(geometry);
    line.name = 'line';
    line.scale.z = 0.001;

    controller1.add(line.clone());
    controller2.add(line.clone());

    raycaster = new THREE.Raycaster();

    //

    window.addEventListener('resize', onWindowResize);
}

function sessionStart(event) {
    setTimeout(() => {
        // Text
        timeController = getLeftController();
        const loader = new FontLoader();
        loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function (font) {
            const geometry = new TextGeometry('Inst', {
                font: font,
                size: 0.1,
                height: 0.01
            });

            const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
            timeTextMesh = new THREE.Mesh(geometry, material);

            // Colocar el texto en una posición fija en el espacio 3D
            timeTextMesh.position.set(timeController.position.x, timeController.position.y, timeController.position.z); // Ajusta la posición como desees

            timeTextMesh.scale.set(0.5, 0.5, 0.5); // Ajusta el tamaño

            timeTextMesh.rotation.set(timeController.rotation.x, timeController.rotation.y, timeController.rotation.z);

            // Rotar en eje Y
            const localYAxis = new THREE.Vector3(0, 1, 0); // eje Y local
            localYAxis.applyQuaternion(timeController.quaternion); // lo convierte al sistema global
            let angle = Math.PI / 2; // Rotar 90 grados
            timeTextMesh.rotateOnWorldAxis(localYAxis, angle);

            // Mover en eje Z
            let direction = getControllerDirection(timeController);
            timeTextMesh.position.x -= 0.28 * direction.x;
            timeTextMesh.position.y -= 0.28 * direction.y;
            timeTextMesh.position.z -= 0.28 * direction.z;

            // Rotar en eje X
            const localXAxis = new THREE.Vector3(-1, 0, 0); // eje X local
            localXAxis.applyQuaternion(timeController.quaternion); // lo convierte al sistema global
            angle = Math.PI / 7; // Rotar 25.7 grados
            timeTextMesh.rotateOnWorldAxis(localXAxis, angle);

            // Añadir a cámara
            timeController.attach(timeTextMesh);

            startTimePassed = true;
        });
    }, 1000);
}

function controllerConnected(evt) {

    controllers.push({
        gamepad: evt.data.gamepad,
        grip: evt.target,
        colliding: false,
        playing: false
    });
    supportHaptic = 'hapticActuators' in controllers[0].gamepad && controllers[0].gamepad.hapticActuators != null && controllers[0].gamepad.hapticActuators.length > 0;
}

function controllerDisconnected(evt) {

    const index = controllers.findIndex(o => o.controller === evt.target);
    if (index !== - 1) {

        controllers.splice(index, 1);

    }

}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

}

function onSelectStart(event) {

    const controller = event.target;
    const intersections = getIntersections(controller);
    if (mode == modes[0]) {
        if (intersections.length == 0) {
            const geometry = lastObject ? lastObject.geometry.clone() : geometries[Math.floor(Math.random() * geometries.length)];
            geometry.computeBoundingBox();
            geometry.userData.obb = new OBB();
            geometry.userData.obb.fromBox3(geometry.boundingBox);
            const material = new THREE.MeshStandardMaterial({
                color: lastObject ? lastObject.material.color : Math.random() * 0xffffff,
                roughness: 0.7,
                metalness: 0.0
            });

            const object = new THREE.Mesh(geometry, material);
            object.position.x = controller.position.x;
            object.position.y = controller.position.y;
            object.position.z = controller.position.z;

            object.castShadow = true;
            object.receiveShadow = true;
            object.pair = lastObject ? lastObject.pair : id++;
            object.originalColor = object.material.color;
            hitBoxBox = new THREE.Mesh(geometry, new
                THREE.MeshBasicMaterial({
                    color: 0x000000,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.5
                }));
            object.add(hitBoxBox);

            object.material.emissive.b = 1;
            controller.attach(object);

            controller.userData.selected = object;

            lastObject = lastObject ? null : object;
        } else {
            const intersection = intersections[0];

            const object = intersection;
            object.material.emissive.b = 1;
            controller.attach(object);

            controller.userData.selected = object;
        }
    } else if (mode == modes[1]) {
        if (intersections.length > 0) {
            const intersection = intersections[0];

            const object = intersection;
            object.material.emissive.b = 1;

            controller.userData.selected = object;
        }
    }
}

function vibrar(controller, duration) {
    //Vibrar el controlados times veces durante duration milisegundos
    console.log("Vibrar el controladores durante " + duration + " milisegundos");
    if (supportHaptic) {
        controller.gamepad.hapticActuators[0].pulse(1, duration);
    } else {
        console.log("El controlador no soporta vibración");
    }
}

function onSelectEnd(event) {

    const controller = event.target;
    if (mode == modes[0]) {
        if (controller.userData.selected !== undefined) {

            const object = controller.userData.selected;
            object.material.emissive.b = 0;
            group.attach(object);

            controller.userData.selected = undefined;

        }
    } else if (mode == modes[1]) {
        if (!gameOver) {
            if (controller.userData.selected !== undefined) {

                const object = controller.userData.selected;

                controller.userData.selected = undefined;

                //añadir objeto a geometryPair
                geometryPair.push(object);
                if (geometryPair.length == 1) {
                    //Vibrar una vez corta
                    console.log("Vibrar una vez corta");
                    //saber si es controller[0] o controller[1]
                    vibrar(controller == controller1 ? controllers[0] : controllers[1], 200);
                }
                if (geometryPair.length == 2) {
                    //si las dos geometrías tiene el mismo atributo pair
                    if (geometryPair[0].pair == geometryPair[1].pair && geometryPair[0].uuid != geometryPair[1].uuid) {
                        for (let i = 0; i < geometryPair.length; i++) {
                            const object = geometryPair[i];
                            group.remove(object);
                        }
                        //Vibrar una vez corta de nuevo
                        console.log("Vibrar una vez corta de nuevo");
                        vibrar(controller == controller1 ? controllers[0] : controllers[1], 200);
                        // Comprobar si no hay más objetos
                        if (group.children.length === 0) {
                            gameOver = true;
                            guardarMetricas();
                        }
                    } else {
                        // Volver a color anterior
                        for (let i = 0; i < geometryPair.length; i++) {
                            const object = geometryPair[i];
                            object.material.color.set(object.originalColor);
                            object.material.emissive.b = 0;
                            group.attach(object);
                        }
                        //Vibrar una vez prolongada
                        console.log("Vibrar una vez prolongada");
                        vibrar(controller == controller1 ? controllers[0] : controllers[1], 1000);
                    }
                    geometryPair = [];
                }
            }
        }
    }
}

function onSqueezeStart(event) {

    squeezeing++;

}

function onSqueezeEnd(event) {

    if (squeezeing > 1) {
        gameOver = started === true && mode === modes[1];
        if (group.children.length === 0 || group.children.length % 2 !== 0 || gameOver) {
            console.log("Modo instructor");
            mode = modes[0];
            gameOver = false;
            started = false;
            squeezes = 0;
            squeezeing--;
            if (timeTextMesh) {
                timeTextMesh.geometry.dispose();
            }
            // Borrar objetos restantes
            // for (let i = group.children.length - 1; i >= 0; i--) {
            //     const obj = group.children[i];
            //     group.remove(obj);
            //     if (obj.geometry) obj.geometry.dispose();
            //     if (obj.material) {
            //         if (Array.isArray(obj.material)) {
            //             obj.material.forEach(mat => mat.dispose());
            //         } else {
            //             obj.material.dispose();
            //         }
            //     }
            // }
            // geometryPair = [];
            return;
        }

        console.log("Modo user");

        squeezes++;
        mode = modes[1];

        // Ocultar objetos
        for (const object of group.children) {
            object.visible = false;
        }
        if (squeezes === 2) {
            started = true;
            startTime = Date.now();

            // Mostrar objetos
            for (const object of group.children) {
                object.visible = true;
            }
        }
    }
    squeezeing--;
}

function getControllerDirection(controller) {
    const direction = new THREE.Vector3(0, 0, -1); // -Z es hacia donde apunta localmente
    direction.applyQuaternion(controller.quaternion); // transforma del espacio local al global

    return direction.normalize();
}

function getIntersections(controller) {

    let intersections = [];

    // Crear la OBB para el controlador
    let controllerOBB = new OBB();
    controllerOBB.center.setFromMatrixPosition(controller.matrixWorld);
    //controllerOBB.halfSize.set(0.005, 0.005, 0.005); // Ajusta el tamaño si es necesario

    // Revisar cada objeto en la escena
    for (const object of group.children) {
        if (object.geometry && object.geometry.userData.obb) {
            let objectOBB = new OBB();
            objectOBB.copy(object.geometry.userData.obb);
            objectOBB.applyMatrix4(object.matrixWorld);

            // Verificar si hay intersección con el controlador
            if (controllerOBB.intersectsOBB(objectOBB)) {
                intersections.push(object);
            }
        }
    }

    return intersections;

}

function intersectObjects(controller) {

    // Do not highlight when already selected

    if (controller.userData.selected !== undefined) return;

    // Get intersections with OBB
    const intersections = getIntersections(controller);

    if (intersections.length > 0) {

        const intersection = intersections[0];

        const object = intersection;
        object.material.emissive.r = 1;
        intersected.push(object);

    }

}

function cleanIntersected() {

    while (intersected.length) {

        const object = intersected.pop();
        object.material.emissive.r = 0;

    }

}

function getControllerPositionInCameraCoordinates(controller) {
    // Obtener la posición en la escena
    const controllerPosition = controller.position.clone();

    // Aplicar la inversa de la matriz de la cámara para obtener las coordenadas en el espacio de la cámara
    camera.updateMatrixWorld(); // Asegúrate de que la cámara esté actualizada
    const controllerPosInCamera = controllerPosition.applyMatrix4(camera.matrixWorldInverse);

    return controllerPosInCamera;

}

function getLeftController() {
    // Obtener las posiciones de los controladores en el espacio de la cámara
    const controller1PosInCamera = getControllerPositionInCameraCoordinates(controller1);
    const controller2PosInCamera = getControllerPositionInCameraCoordinates(controller2);

    return controller1PosInCamera.x < controller2PosInCamera.x ? controller1 : controller2;
}

function guardarMetricas() {
    const datos =
        "Posiciones cabeza:\n" + JSON.stringify(posicionesCabeza) + "\n\n" +
        "Rotaciones cabeza:\n" + JSON.stringify(rotacionesCabeza) + "\n\n" +
        "Posiciones mandos:\n" + JSON.stringify(posicionesMandos) + "\n\n" +
        "Tiempo de sesion:\n" + Math.floor((Date.now() - startTime) / 10);

    // Obtener la fecha y hora actual en formato YYYYMMDDHHMMSS
    const fecha = new Date();
    const fechaStr = fecha.getFullYear().toString() +
        String(fecha.getMonth() + 1).padStart(2, '0') +
        String(fecha.getDate()).padStart(2, '0') +
        String(fecha.getHours()).padStart(2, '0') +
        String(fecha.getMinutes()).padStart(2, '0') +
        String(fecha.getSeconds()).padStart(2, '0');

    const nombreArchivo = 'metricas_usuario_' + fechaStr + '.txt';

    const blob = new Blob([datos], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
}

//

function animate() {

    renderer.setAnimationLoop(render);

}

function render() {
    cleanIntersected();

    intersectObjects(controller1);
    intersectObjects(controller2);

    if (startTimePassed === true) {
        // Timer
        let newText = "";
        if (mode === modes[1]) {
            if (squeezes <= 1) {
                newText = "User";
            } else if (squeezes > 1 && group.children.length > 0 && gameOver === false) {
                const elapsedTime = Math.floor((Date.now() - startTime) / 10);  // Tiempo en segundos
                if (elapsedTime > 6000) {  // 60 segundos
                    // Acabar prueba
                    gameOver = true;  // Detener el juego
                    console.log("Tiempo finalizado. Juego terminado." + elapsedTime);
                    guardarMetricas();
                }
                // Actualizar el texto 3D con el tiempo
                newText = gameOver ? "FIN" : (elapsedTime < 1000 ? `0${Math.floor(elapsedTime / 100)}.${elapsedTime % 100}` : `${Math.floor(elapsedTime / 100)}.${elapsedTime % 100}`);
            }
        } else if (mode === modes[0]) {
            newText = "Inst";
        }

        if (gameOver === false || newText === "FIN") {
            // Actualizar el contenido del Mesh (esto necesita regenerar la geometría)
            const loader = new FontLoader();
            loader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function (font) {
                const geometry = new TextGeometry(newText, {
                    font: font,
                    size: 0.1,
                    height: 0.01
                });

                // Regenerar el material para la nueva geometría
                if (timeTextMesh && timeTextMesh.geometry) {
                    timeTextMesh.geometry.dispose();  // Eliminar la geometría anterior
                    timeTextMesh.geometry = geometry; // Asignar la nueva geometría
                }
            });
        }
    }
    if (started == true && gameOver == false) {
        let tiempoActual = performance.now();
        if (tiempoActual - ultimoTiempoMetrica >= 200) {  // cada 200 ms

            // Guardar posición de la cabeza
            posicionesCabeza.push({
                x: camera.position.x,
                y: camera.position.y,
                z: camera.position.z
            });

            // Guardar rotación de la cabeza
            rotacionesCabeza.push({
                x: THREE.MathUtils.radToDeg(camera.rotation.x),
                y: THREE.MathUtils.radToDeg(camera.rotation.y),
                z: THREE.MathUtils.radToDeg(camera.rotation.z)
            });

            // Guardar posición de los mandos
            posicionesMandos.push({
                mando1: {
                    x: controller1.position.x,
                    y: controller1.position.y,
                    z: controller1.position.z
                },
                mando2: {
                    x: controller2.position.x,
                    y: controller2.position.y,
                    z: controller2.position.z
                }
            });

            console.log("Capturada métrica de cabeza y mandos");

            ultimoTiempoMetrica = tiempoActual;
        }
    }

    renderer.render(scene, camera);

}

/*
Pendiente: 
 ✔️ controller izquierdo (posicion en base a camara o pillar controladores izquierdo y derecho al principio y quedarse así)
 ✔️ color original
 ✔️ 1 min y se acaba
 ✔️ vibración
   recoger métricas (código en miAulario)
 */

/*
Métricas usuario: movimientos de gafas y mandos
Métricas instructor: distancias entre posicionamientos de figuras (sumar distancia entre todas las figuras individualmente)
*/