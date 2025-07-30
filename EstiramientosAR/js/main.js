import * as THREE from "three";

import { XRButton } from "threeXR/XRButton.js";

import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";

import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";

let container;
let camera, scene, renderer;
let controller1, controller2;
let controllerGrip1, controllerGrip2;
const controllers = [];

const RED = new THREE.Color(0xff0000);
const BLUE = new THREE.Color(0x0000ff);
const VERDE = new THREE.Color(0x00ff00);

const loader = new FontLoader();

// Vibración
let supportHaptic = false;

const MAX_DIST_FOR_VIBRATION = 1;
const BALL_RADIUS = 0.2;

///////////

let isInstructor = true;
const STATES = {
    INSTRUCTOR_CALIBRATION: 0,
    USER_CALIBRATION: 1,
    INSTRUCTOR_EXCERCISE: 2,
    USER_EXCERCISE: 3
};
let state = STATES.INSTRUCTOR_CALIBRATION;

let instructorCalibration, userCalibration;
let instructorHeadsetHeight, userHeadsetHeight;
let headsetSphere = null;
let spheres = [];

let excercisePossiblePositions = [
    { x: -0.5, z: -0.5 },
    { x: 0.5, z: -0.5 },
    { x: -0.5, z: 0.5 },
    { x: 0.5, z: 0.5 },
];
let excerciseSpheresPositions = [];
let currentPositionIndex = 0;

const LABEL = {
    INSTRUCTOR_CALIBRATION: "PULSE AMBOS GATILLOS CUANDO ESTE LISTO\n       PARA EMPEZAR A DEFINIR EJERCICIOS",
    USER_CALIBRATION: "PULSE AMBOS GATILLOS CUANDO ESTE LISTO\n      PARA EMPEZAR A HACER EJERCICIOS",
    INSTRUCTOR_EXCERCISE: "CREACION DEL EJERCICIO ",
    USER_EXCERCISE: "EJECUCION DEL EJERCICIO "
};

// Crear un objeto de texto vacío

let textMesh = new THREE.Mesh();
textMesh.material = new THREE.MeshBasicMaterial({ color: 0x000000 });
textMesh.position.set(0, 2.2, -2);
let sizeTextMesh = 0.1;

let lookAtMesh = new THREE.Mesh();
lookAtMesh.material = new THREE.MeshBasicMaterial({ color: 0x000000 });
lookAtMesh.position.set(0, 1.6, -2);
let sizeLookAtMesh = 0.1;

// Arrays para métricas

const tctLogs = [];
const mdsLogs = [];

let startTime;
let minDist;
let bestPos;
let pressedNum = 0;

///////////

init();
animate();

function init() {
    container = document.createElement("div");
    document.body.appendChild(container);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x808080);

    camera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.1,
        100
    );
    camera.position.set(0, 1.6, 3);

    const floorGeometry = new THREE.PlaneGeometry(4, 4);
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0xeeeeee,
        roughness: 1.0,
        metalness: 0.0,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    scene.add(new THREE.HemisphereLight(0x808080, 0x606060));

    const light = new THREE.DirectionalLight(0xffffff);
    light.position.set(0, 6, 0);
    light.castShadow = true;
    light.shadow.camera.top = 2;
    light.shadow.camera.bottom = -2;
    light.shadow.camera.right = 2;
    light.shadow.camera.left = -2;
    light.shadow.mapSize.set(4096, 4096);
    scene.add(light);

    //

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    document.body.appendChild(XRButton.createButton(renderer));

    // controllers

    controller1 = renderer.xr.getController(0);
    controller1.addEventListener("selectstart", onSelectStart);
    controller1.addEventListener("selectend", onSelectEnd);
    scene.add(controller1);

    controller2 = renderer.xr.getController(1);
    controller2.addEventListener("selectstart", onSelectStart);
    controller2.addEventListener("selectend", onSelectEnd);
    scene.add(controller2);

    const controllerModelFactory = new XRControllerModelFactory();

    controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.addEventListener("connected", controllerConnected);
    controllerGrip1.addEventListener("disconnected", controllerDisconnected);
    controllerGrip1.add(
        controllerModelFactory.createControllerModel(controllerGrip1)
    );
    scene.add(controllerGrip1);

    controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.addEventListener("connected", controllerConnected);
    controllerGrip2.addEventListener("disconnected", controllerDisconnected);
    controllerGrip2.add(
        controllerModelFactory.createControllerModel(controllerGrip2)
    );
    scene.add(controllerGrip2);

    // Añadir textos a la escena
    scene.add(textMesh);
    scene.add(lookAtMesh);

    // Eventos

    window.addEventListener("resize", onWindowResize);

    document.getElementById("XRButton").addEventListener("click", function () {
        renderText(textMesh, LABEL.INSTRUCTOR_CALIBRATION, sizeTextMesh);

        // Crear una esfera y texto para indicar donde mirar
        mirarAEstePunto();
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
}

function controllerConnected(evt) {
    controllers.push({
        gamepad: evt.data.gamepad,
        grip: evt.target,
        colliding: false,
        playing: false,
    });

    supportHaptic =
        "hapticActuators" in controllers[0].gamepad &&
        controllers[0].gamepad.hapticActuators != null &&
        controllers[0].gamepad.hapticActuators.length > 0;
}

function controllerDisconnected(evt) {
    const index = controllers.findIndex((o) => o.controller === evt.target);
    if (index !== -1) {
        controllers.splice(index, 1);
    }
}

function mirarAEstePunto() {
    // Esfera azul
    const sphereGeometry = new THREE.SphereGeometry(0.025, 32, 32);
    const blueMaterial = new THREE.MeshBasicMaterial({ color: BLUE });
    const blueSphere = new THREE.Mesh(sphereGeometry, blueMaterial);
    blueSphere.position.set(0, 1.5, -2);
    scene.add(blueSphere);

    // Cargar texto
    renderText(lookAtMesh, "MIRA A ESTE PUNTO", sizeLookAtMesh);
}

function renderText(mesh, text, size) {
    loader.load(
        "https://threejs.org/examples/fonts/helvetiker_regular.typeface.json",
        function (font) {
            const geometry = new TextGeometry(text, {
                font: font,
                size: size,
                height: 0.01,
                depth: 0.001,
            });

            mesh.geometry = geometry;
            mesh.geometry.center();
        }
    );
}

function obtainDistance() {
    return controller1.position.distanceTo(controller2.position);
}

function obtainHeadsetPosition() {
    const position = new THREE.Vector3();
    position.setFromMatrixPosition(camera.matrixWorld);
    return position.y;
}

function drawHeadsetSphere() {
    // Geometría
    const sphereGeometry = new THREE.SphereGeometry(BALL_RADIUS, 32, 32);

    new THREE.MeshBasicMaterial({ color: 0x00ff00 });

    // Materiales
    const greenMaterial = new THREE.MeshBasicMaterial({
        color: VERDE, // Verde
        transparent: true, // Transparente
        opacity: 0.3, // Opacidad 30%
        side: THREE.BackSide, // Rellena en el interior
    });

    // Esfera
    headsetSphere = new THREE.Mesh(sphereGeometry, greenMaterial);
    scene.add(headsetSphere);
}

function adjustPositionsForUser() {
    //const ratio = userCalibration / instructorCalibration;
    const ratio = 1;

    const headsetInstructor = headsetSphere.position.clone();
    const controller1Instructor = excerciseSpheresPositions[currentPositionIndex][0].clone();
    const controller2Instructor = excerciseSpheresPositions[currentPositionIndex][1].clone();

    const HC1 = headsetInstructor.clone();
    HC1.sub(controller1Instructor);

    const HC2 = headsetInstructor.clone();
    HC2.sub(controller2Instructor);

    const expectedPositionC1 = headsetSphere.position.clone();
    expectedPositionC1.addScaledVector(HC1, -ratio);

    const expectedPositionC2 = headsetSphere.position.clone();
    expectedPositionC2.addScaledVector(HC2, -ratio);

    // Crear las esferas para el usuario
    const userSpheres = drawSpheresInPosition(
        expectedPositionC1,
        expectedPositionC2
    );

    // Retornar las posiciones ajustadas del usuario
    return userSpheres;
}

function drawSpheresInPosition(
    userController1Position,
    userController2Position
) {
    // Geometría
    const sphereGeometry = new THREE.SphereGeometry(0.1, 32, 32);

    // Materiales
    const redMaterial = new THREE.MeshBasicMaterial({
        color: RED, // Roja
        transparent: true, // Transparente
        opacity: 0.5, // Opacidad 50%
    });

    const blueMaterial = new THREE.MeshBasicMaterial({
        color: BLUE, // Azul
        transparent: true, // Transparente
        opacity: 0.5, // Opacidad 50%
    });

    // Esferas
    const sphere1 = new THREE.Mesh(sphereGeometry, redMaterial);
    sphere1.position.copy(userController1Position);
    scene.add(sphere1);

    const sphere2 = new THREE.Mesh(sphereGeometry, blueMaterial);
    sphere2.position.copy(userController2Position);
    scene.add(sphere2);

    return [sphere1, sphere2];
}

function removeSpheres(spheres) {
    // Comprobaciones
    if (!Array.isArray(spheres) || spheres.length !== 2) return;

    // Eliminar las esferas de la escena
    spheres.forEach((sphere) => {
        if (sphere && sphere instanceof THREE.Mesh) {
            scene.remove(sphere);
        }
    });
}

function onSelectStart() {
    if (++pressedNum < 2) return;

    switch (state) {
        case STATES.INSTRUCTOR_CALIBRATION:
            instructorCalibration = obtainDistance();
            instructorHeadsetHeight = obtainHeadsetPosition();

            if (headsetSphere != null)
                scene.remove(headsetSphere);

            drawHeadsetSphere();

            state = STATES.INSTRUCTOR_EXCERCISE;

            renderText(textMesh, LABEL.INSTRUCTOR_EXCERCISE + (currentPositionIndex + 1), sizeTextMesh);

            break;

        case STATES.USER_CALIBRATION:
            userCalibration = obtainDistance();
            userHeadsetHeight = obtainHeadsetPosition();

            drawHeadsetSphere();

            state = STATES.USER_EXCERCISE;

            renderText(textMesh, LABEL.USER_EXCERCISE + (currentPositionIndex + 1), sizeTextMesh);

            spheres = adjustPositionsForUser();

            minDist = -1;
            startTime = Date.now(); 

            break;

        case STATES.INSTRUCTOR_EXCERCISE:
            excerciseSpheresPositions[currentPositionIndex] = [controller1.position.clone(), controller2.position.clone()];

            currentPositionIndex++;

            if (currentPositionIndex == excercisePossiblePositions.length) {
                isInstructor = !isInstructor;
                currentPositionIndex = 0;
                state = STATES.USER_CALIBRATION;

                scene.remove(headsetSphere);

                renderText(textMesh, LABEL.USER_CALIBRATION, sizeTextMesh);
            } else {
                renderText(textMesh, LABEL.INSTRUCTOR_EXCERCISE + (currentPositionIndex + 1), sizeTextMesh);
            }

            break;

        case STATES.USER_EXCERCISE:
            removeSpheres(spheres);

            mdsLogs.push(bestPos);
            tctLogs.push(Date.now() - startTime);

            currentPositionIndex++;

            if (currentPositionIndex == excercisePossiblePositions.length) {
                isInstructor = !isInstructor;
                currentPositionIndex = 0;
                state = STATES.INSTRUCTOR_CALIBRATION;

                scene.remove(headsetSphere);

                renderText(textMesh, LABEL.INSTRUCTOR_CALIBRATION, sizeTextMesh);

                saveFiles();
            } else {
                spheres = adjustPositionsForUser();
                renderText(textMesh, LABEL.USER_EXCERCISE + (currentPositionIndex + 1), sizeTextMesh);
                minDist = -1;
                startTime = Date.now();
            }

            break;
    }
}

function onSelectEnd() {
    pressedNum--;
 }

//

function animate() {
    renderer.setAnimationLoop(render);
}

function render() {
    if (state == STATES.INSTRUCTOR_EXCERCISE) {
        headsetSphere.position.x =
            excercisePossiblePositions[currentPositionIndex].x;
        headsetSphere.position.y = instructorHeadsetHeight;
        headsetSphere.position.z =
            excercisePossiblePositions[currentPositionIndex].z;

        updateStandingPosition();

    } else if (state == STATES.USER_EXCERCISE) {
        headsetSphere.position.x =
            excercisePossiblePositions[currentPositionIndex].x;
        headsetSphere.position.y = userHeadsetHeight;
        headsetSphere.position.z =
            excercisePossiblePositions[currentPositionIndex].z;

        updateStandingPosition();
        vibrateOnDistance();
        calcMinDist();
    }

    renderer.render(scene, camera);
}

function updateStandingPosition() {
    headsetSphere.updateMatrixWorld();
    headsetSphere.updateMatrix();
}

function vibrateOnDistance() {
    if (controllers.length < 2 || spheres.length < 2) return;

    vibrameEsta(controllers[0], spheres[0]);
    vibrameEsta(controllers[1], spheres[1]);
}

function vibrameEsta(controller, ball) {
    const d = controller.grip.position.distanceTo(ball.position);

    if ((d > MAX_DIST_FOR_VIBRATION) | !supportHaptic) return;
    if (d <= BALL_RADIUS) controller.gamepad.hapticActuators[0].pulse(100, 3);

    const intensity =
        1 - (d - BALL_RADIUS) / (MAX_DIST_FOR_VIBRATION - BALL_RADIUS);

    controller.gamepad.hapticActuators[0].pulse(intensity, 20);
}

function calcMinDist() {
    const cd1 = controllers[0].grip.position.distanceTo(spheres[0].position);
    const cd2 = controllers[1].grip.position.distanceTo(spheres[1].position);
    const hd  = camera.position.distanceTo(headsetSphere.position);

    const totalDist = cd1 + cd2 + hd;

    if (totalDist < minDist || minDist === -1) {
        minDist = totalDist;
        bestPos = {
            minDist: minDist,
            c1: controllers[0].grip.position,
            c2: controllers[1].grip.position,
            h: camera.position,
            expectedC1: spheres[0].position,
            expectedC2: spheres[1].position,
            expectedH: headsetSphere.position
        }
    }
}

function saveFiles() {
    const blob = new Blob([`{\n\t"TCT": `, JSON.stringify(tctLogs), `,\n\t"MDS": `, JSON.stringify(mdsLogs), `\n}`], { type: 'application/json' });

    tctLogs = [];
    mdsLogs = [];

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `metricas_${Date.now()}.json`;

    a.click();

    URL.revokeObjectURL(url);
}