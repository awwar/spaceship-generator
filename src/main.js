const urlParams = new URLSearchParams(window.location.search);
let hash_name = urlParams.get('hash') ?? (Math.random() + 1).toString(36).substring(2);

let pi = Math.PI;

let SCREEN_WIDTH = window.innerWidth;
let SCREEN_HEIGHT = window.innerHeight;
let renderer, camParent, camera, scene, canvas;
let modelParent, Model, Models;

let sceneLimit = 4000.0;
let sceneHalf = sceneLimit * 0.5;

let partCount = 0;
let partLimit = 6;
let partVar = 2;
let partOffset = 192;
let activeParts = [];
let Connectors = [];
let newConnectors = [];

let grey = 0x383838;
let white = 0xEEEEEE;
let black = 0x000000;

let facemat = new Threejs.MeshBasicMaterial({color: white, opacity: 1.0, shading: Threejs.FlatShading});
let wiremat = new Threejs.MeshBasicMaterial({color: grey, opacity: 1.0, wireframe: true, wireframeLinewidth: 1.0});

let Material = [facemat, wiremat];

let partRand = new Rc4Random('' + hash_name);

let shipPartsCtx = {};

let wrlGenerator = (namedata, pointdata, facedata) => {
    return `#VRML V2.0 utf8

Transform {
  children [
    DEF ME_${namedata} Shape {
      appearance Appearance {
        material Material {
          ambientIntensity 0.1667
          diffuseColor 0.8 0.8 0.8
          specularColor 0.4012 0.4012 0.4012
          emissiveColor 0 0 0
          shininess 0.0977
          transparency 0
        }
        texture NULL
        textureTransform NULL
      }
      geometry IndexedFaceSet {
        color NULL
        coord Coordinate {
          point [
${pointdata}
          ]
        }
        colorIndex [ ]
        coordIndex [
${facedata}
        ]
        normal NULL
        creaseAngle 0
        solid TRUE
      }
    }
  ]
}`;
}


$(document).ready(function () {
    shipPartsCtx = createPartCtx();

    try {
        // create a WebGL renderer
        renderer = new Threejs.WebGLRenderer({antialias: true});

        renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);

        canvas = document.getElementById('canvas');

        canvas.appendChild(renderer.domElement);
    } catch (e) {
        console.error(e);
        alert("Your browser doesn\'t support WebGL");
    }

    camera = new Threejs.TrackballCamera({

        fov: 35,
        aspect: SCREEN_WIDTH / SCREEN_HEIGHT,
        near: 1,
        far: sceneHalf,

        rotateSpeed: 6.0,
        zoomSpeed: 1.2,
        panSpeed: 0.8,
        //
        // noZoom: false,
        // noPan: false,
        // noRotate: false,
        //
        // staticMoving: true,
        // dynamicDampingFactor: 0.3,

        keys: [65, 83, 68],

        domElement: document.getElementById('canvas')

    });
    camera.position.y = 250;
    camera.position.z = -1000;

    camParent = new Threejs.Object3D();

    camParent.addChild(camera);
    modelParent = new Threejs.Object3D();
    modelParent.rotation.x = -(pi * 0.5);
    modelParent.position.y = -50;

    // Create the scene
    scene = new Threejs.Scene();
    // scene.fog = new Threejs.Fog(black, (sceneHalf - 300), sceneHalf);

    scene.addObject(modelParent);

    scene.addObject(camParent);

    const createNewModel = () => {
        newModel();
        build();
    }

    initView(createNewModel);

    canvas = document.getElementById('canvas');
    window.addEventListener('resize', onWindowResize, false);
    canvas.addEventListener('mousedown', onDocumentMouseDown, false);
    canvas.addEventListener('touchstart', onDocumentTouchStart, false);
    canvas.addEventListener('touchmove', onDocumentTouchMove, false);

    animate();
});


// Add the 3d model
function newModel() {
    Connectors = []
    Models = [];

    partLimit += Math.round(partRand.getRandomNumber() * partVar)

    let basePart = new Threejs.Mesh(new Ship('hull', shipPartsCtx), Material);
    basePart.doubleSided = false;
    basePart.useQuaternion = true;
    basePart.offset = new Threejs.Vector3(0.0, 0.0, 1.0);
    basePart.birthTime = new Date().getTime();

    modelParent.addChild(basePart);

    Models.push(basePart);

    addConnections(basePart);
    for (let g = 0; g < newConnectors.length; g++) {
        Connectors.push(newConnectors[g]);
    }
    newConnectors = [];
}


function addPart(depth, cPick, pPick) {

    // No deeper than two parts!
    if (depth > 1) {
        return;
    }

    if (Connectors.length === 0) {
        partCount = partLimit;
        return;
    }

    depth += 1;
    partCount += 1;

    // Pick a connection
    if (cPick === undefined) {
        cPick = Math.round(partRand.getRandomNumber() * (Connectors.length - 1));
    }
    //cPick = 0;

    let connection = Connectors[cPick];

    // Make a part
    let part;
    if (pPick === undefined) {
        part = new Threejs.Mesh(new Ship('part', shipPartsCtx), Material);
        pPick = part.geometry.part.id;
    } else {
        part = new Threejs.Mesh(new Ship('part', shipPartsCtx, pPick), Material);
    }

    part.birthTime = new Date().getTime();

    part.doubleSided = false;
    part.useQuaternion = true;
    modelParent.addChild(part);
    Models.push(part);
    activeParts.push(part);

    let d = new Threejs.Quaternion();
    d.copy(connection.quaternion);

    part.quaternion.copy(d);
    part.position.copy(connection.position);

    part.update();

    part.target = new Threejs.Vector3();
    part.target.copy(part.position);

    part.offset = new Threejs.Vector3(0.0, 0.0, 1.0);
    part.offset = d.multiplyVector3(part.offset); // part.matrix.multiplyVector3(part.offset);
    part.offset.setLength(partOffset);
    part.position.addSelf(part.offset);

    // Remove the connection that just got attached
    Connectors.splice(cPick, 1);

    // Add the new connections from this part
    addConnections(part);

    // See if there's another connector mirroring this one
    let cLen = Connectors.length
    if (cLen) {
        let cV = new Threejs.Vector3();
        let cC = new Threejs.Vector3();

        cV.copy(connection.position);
        //cy = rounder(connection.position.y)
        //cz = rounder(connection.position.z)

        for (let g = 0; g < cLen; g++) {
            let c = Connectors[g];
            cC.copy(c.position);
            cC.x = -cC.x
            let dist = cC.distanceTo(cV);
            if (dist < 0.5) { //rounder(c.position.y) == cy && rounder(c.position.z) == cz){
                addPart(depth, g, pPick);
                break;
            }
        }
    }

}


// Make some new Connectors available!
function addConnections(part) {
    let con = part.geometry.part.connectors;
    let cLen = con.length;

    if (cLen) {
        let mat = part.matrix;

        for (let g = 0; g < cLen; g++) {

            let c = con[g];

            let n = new Threejs.Object3D();
            n.name = c.name;
            n.position = new Threejs.Vector3(c.position[0], c.position[1], c.position[2]);
            n.quaternion = new Threejs.Quaternion(c.quaternion[0], c.quaternion[1], c.quaternion[2], c.quaternion[3]);
            //n.quaternion.copy(c.quaternion);
            n.useQuaternion = true;
            n.update();

            let m = new Threejs.Matrix4();
            m.multiply(mat, n.matrix);

            n.position = m.getPosition();
            n.quaternion.setFromRotationMatrix(m);

            newConnectors.push(n);
        }
    }
}

// Animate function
function animate() {
    render();
    requestAnimationFrame(animate);
}

function build() {
    do {
        if (partCount >= partLimit) {
            for (let m = 0; m < Models.length; m++) {
                Model = Models[m];
                if (Model.target !== undefined) {
                    Model.position.copy(Model.target);
                }
            }

            return;
        }

        for (let m = 0; m < activeParts.length; m++) {
            Model = activeParts[m];
            if (Model.target !== undefined) {
                Model.position.copy(Model.target);
            }
        }

        activeParts = [];
        newConnectors = [];
        addPart(0);
        for (let g = 0; g < newConnectors.length; g++) {
            Connectors.push(newConnectors[g]);
        }

        // If we're at our limit... let's clean up the active parts
    } while (true);
}

// Each render of a frame!
// We update the models in here
function render() {
    renderer.render(scene, camera);
}

// Get the points and faces for the model!
function getModelData() {
    modelParent.rotation.x = -(pi * 0.5);
    modelParent.rotation.z = 0.0;
    let pointList = '';
    let faceList = '';
    let offset = 0;

    for (let m = 0; m < Models.length; m++) {

        // Lets get all the coordinates for the points in a neat string
        Model = Models[m];

        let verts = Model.geometry.vertices;
        let mat = Model.matrixWorld
        let vLen = verts.length

        for (let i = 0; i < vLen; i++) {

            p = mat.multiplyVector3(verts[i].position);
            //p = verts[i].position;

            let x = roundIsh(p.x);
            let y = roundIsh(p.y);
            let z = roundIsh(p.z);

            pointList += '            ' + x + ' ' + y + ' ' + z + ",\r\n";
        }

        // Get all the faces (indexes of points) in a neat string

        let faces = Model.geometry.faces;
        let fLen = faces.length;

        for (let i = 0; i < fLen; i++) {

            let v = faces[i];

            let a = v.a + offset;
            let b = v.b + offset;
            let c = v.c + offset;
            let d = v.d + offset;

            // Make two tris (no quads in wrl);
            faceList += '          ' + a + ', ' + b + ', ' + c + ", -1,\r\n";
            // Only make the second tri if it's not a quad
            if (!isNaN(d)) {
                faceList += '          ' + a + ', ' + c + ', ' + d + ", -1,\r\n";
            }

        }

        offset += vLen;

    }

    return wrlGenerator('ship', pointList, faceList);
}


function initView(createNewModel) {
    createNewModel();

    $('#wrldownload').click(function () {
        let wrl = getModelData();
        let element = document.createElement('a');
        element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(wrl));
        element.setAttribute('download', 'ship-' + Date.now() + '.wrl');

        element.style.display = 'none';
        document.body.appendChild(element);

        element.click();

        document.body.removeChild(element);
    });

    $('#seed').text(hash_name);

    $('#generate-next').click(() => location.reload());
}


function onWindowResize() {
    SCREEN_WIDTH = window.innerWidth;
    SCREEN_HEIGHT = window.innerHeight;
    camera.aspect = SCREEN_WIDTH / SCREEN_HEIGHT;
    camera.updateProjectionMatrix();
    renderer.setSize(SCREEN_WIDTH, SCREEN_HEIGHT);
}

function onDocumentMouseDown(event) {
    event.preventDefault();
    canvas.addEventListener('mouseup', onDocumentMouseUp, false);
    canvas.addEventListener('mouseout', onDocumentMouseOut, false);
}

function onDocumentMouseUp() {
    canvas.removeEventListener('mouseup', onDocumentMouseUp, false);
    canvas.removeEventListener('mouseout', onDocumentMouseOut, false);
}

function onDocumentMouseOut() {
    canvas.removeEventListener('mouseup', onDocumentMouseUp, false);
    canvas.removeEventListener('mouseout', onDocumentMouseOut, false);
}

function onDocumentTouchStart(event) {
    if (event.touches.length !== 1) {
        return;
    }
    event.preventDefault();
}

function onDocumentTouchMove(event) {
    if (event.touches.length !== 1) {
        return;
    }
    event.preventDefault();
}


// Just make sure we've got slightly neat numbers for exports
function roundIsh(nr) {
    return Math.round(nr * 10000000000) / 10000000000;
}

function rounder(nr) {
    return Math.round(nr * 100) / 100;
}

// Convert degrees to radians
function radians(nr) {
    return pi * (nr / 180);
}

// Convert radians to degrees
function degrees(nr) {
    return nr * (180 / pi);
}

function Rc4Random(seed) {
    let keySchedule = [];
    let keySchedule_i = 0;
    let keySchedule_j = 0;

    function init(seed) {
        for (let i = 0; i < 256; i++)
            keySchedule[i] = i;

        let j = 0;
        for (let i = 0; i < 256; i++) {
            j = (j + keySchedule[i] + seed.charCodeAt(i % seed.length)) % 256;

            let t = keySchedule[i];
            keySchedule[i] = keySchedule[j];
            keySchedule[j] = t;
        }
    }

    init(seed);

    function getRandomByte() {
        keySchedule_i = (keySchedule_i + 1) % 256;
        keySchedule_j = (keySchedule_j + keySchedule[keySchedule_i]) % 256;

        let t = keySchedule[keySchedule_i];
        keySchedule[keySchedule_i] = keySchedule[keySchedule_j];
        keySchedule[keySchedule_j] = t;

        return keySchedule[(keySchedule[keySchedule_i] + keySchedule[keySchedule_j]) % 256];
    }

    this.getRandomNumber = function () {
        let number = 0;
        let multiplier = 1;
        for (let i = 0; i < 8; i++) {
            number += getRandomByte() * multiplier;
            multiplier *= 256;
        }
        return number / 18446744073709551616;
    }
}

let Ship = function (type, partsCtx, pick) {
    let scope = this;

    scope.scale = 10;

    scope.settings = [];

    Threejs.Geometry.call(this);

    let items;

    if (type === undefined || type === 'part') {
        items = partsCtx.parts
    } else {
        items = partsCtx.hulls
    }

    if (pick === undefined) {
        scope.pick = Math.round(partRand.getRandomNumber() * (items.length - 1));
    } else {
        scope.pick = pick;
    }

    scope.part = items[scope.pick];

    for (let i = 0; i < scope.part.vertices.length; i++) {
        v(scope.part.vertices[i]);
    }

    for (let i = 0; i < scope.part.faces.length; i++) {
        let face = scope.part.faces[i];
        if (face.length === 4) {
            f4(face);
        } else {
            f3(face);
        }
    }

    this.computeCentroids();
    this.computeFaceNormals();

    function v(co) {
        scope.vertices.push(new Threejs.Vertex(new Threejs.Vector3(co[0], co[1], co[2])));
    }

    function f3(v) {
        scope.faces.push(new Threejs.Face3(v[0], v[1], v[2]));
    }

    function f4(v) {
        scope.faces.push(new Threejs.Face4(v[0], v[1], v[2], v[3]));
    }

};

Ship.prototype = new Threejs.Geometry();
Ship.prototype.constructor = Ship;