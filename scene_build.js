/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Scene Builder (buildScene)
   ═══════════════════════════════════════════════ */

//  Build scene from parsed model
// ─────────────────────────────────────────────
const NODE_COLORS = {
  trimesh: 0x4a90c0, skin: 0xc070c0, dummy: 0x70b870,
  danglymesh: 0x50b8d0,
  emitter: 0xf0a030, aabb: 0xe8a020, light: 0xf8f050, reference: 0x80c0e0,
};
function nodeColor(type) { return NODE_COLORS[type] || 0x808080; }

function buildScene(model) {
  // modelGroup/wireGroup/bboxHelper wurden bereits durch clearSession() bereinigt.
  // (clearSession wird vor jedem MDL-Ladevorgang aufgerufen)

  modelGroup = new THREE.Group();

  // NWN verwendet Z-Up Koordinatensystem, Three.js erwartet Y-Up.
  // Rotation um -90° an der X-Achse: NWN-Z wird zu Three.js-Y (oben).
  const NWN_TO_THREEJS = -Math.PI / 2;
  modelGroup.rotation.x = NWN_TO_THREEJS;

  scene.add(modelGroup);

  const nodeMap = {};
  for (const n of model.nodes) nodeMap[n.name] = n;

  // Build Three.js objects
  const objects = {};
  let totalVerts = 0, totalFaces = 0;

  for (const node of model.nodes) {
    let obj;

    if ((node.type === 'trimesh' || node.type === 'skin' || node.type === 'danglymesh') && node.faces.length > 0 && node.verts.length > 0) {
      // Explode geometry: 3 verts per face (separate UV / normal per-face-vertex)
      const positions = new Float32Array(node.faces.length * 9);
      const uvs       = new Float32Array(node.faces.length * 6);
      const normals   = new Float32Array(node.faces.length * 9);
      let hasNormals  = node.normals.length > 0;

      for (let fi = 0; fi < node.faces.length; fi++) {
        const face = node.faces[fi];
        for (let k = 0; k < 3; k++) {
          const vi = face.v[k]; const ti = face.t[k];
          const v  = node.verts[vi] || [0, 0, 0];
          positions[fi * 9 + k * 3 + 0] = v[0];
          positions[fi * 9 + k * 3 + 1] = v[1];
          positions[fi * 9 + k * 3 + 2] = v[2];
          const uv = (node.tverts[ti]) || [0, 0];
          uvs[fi * 6 + k * 2 + 0] = uv[0];
          uvs[fi * 6 + k * 2 + 1] = 1 - uv[1]; // flip V
          if (hasNormals) {
            const nm = node.normals[vi] || [0, 1, 0];
            normals[fi * 9 + k * 3 + 0] = nm[0];
            normals[fi * 9 + k * 3 + 1] = nm[1];
            normals[fi * 9 + k * 3 + 2] = nm[2];
          }
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
      if (hasNormals) geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      else geo.computeVertexNormals();

      const d = node.diffuse;
      const bitmapKey = node.bitmap ? node.bitmap.toLowerCase() : '';
      const tex = bitmapKey ? (textureCache[bitmapKey] || null) : null;

      // transparencyhint 1 → Textur hat Alpha-Kanal (Decals, Splotches, Pflanzen).
      // Nur anwenden wenn die Textur auch wirklich einen Alpha-Kanal hat (DXT5/32-bit TGA/PNG).
      // DXT1-Texturen haben keinen Alpha-Kanal — transparencyhint wäre ein Modellierfehler.
      const texHasAlpha = tex ? (tex.userData.hasAlpha === true) : false;
      const useTexAlpha  = node.transparencyhint === 1 && texHasAlpha;
      const useMeshAlpha = node.alpha < 0.99;

      const mat = new THREE.MeshPhongMaterial({
        color:       tex ? new THREE.Color(1, 1, 1) : new THREE.Color(d[0] || 0.8, d[1] || 0.8, d[2] || 0.8),
        map:         tex || null,
        // NWN nutzt ein einfaches diffuses Shading — Specular ist kaum sichtbar.
        // node.shininess (z.B. 26) × 128 würde Hochglanz erzeugen; direkt nutzen ist korrekt.
        // Specular-Farbe auf max. 0.15 begrenzen um ungewolltes Glänzen zu verhindern.
        specular:    new THREE.Color(
                       Math.min(node.specular[0], 0.15),
                       Math.min(node.specular[1], 0.15),
                       Math.min(node.specular[2], 0.15)
                     ),
        shininess:   node.shininess,   // direkt, ohne ×128
        side:        THREE.DoubleSide,
        transparent: useMeshAlpha || useTexAlpha,
        opacity:     node.alpha,
        alphaTest:   useTexAlpha ? 0.1 : 0,
        depthWrite:  !useTexAlpha,
      });

      // Fallback-Farbe wenn kein Bitmap und diffuse ist schwarz
      if (!tex && d[0] === 0 && d[1] === 0 && d[2] === 0) mat.color.set(0x888888);
      // Wenn Bitmap referenziert aber Textur noch nicht geladen: Hinweis-Farbe
      if (node.bitmap && !tex) mat.color.set(nodeColor(node.type));

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      obj = mesh;

      // Wireframe-Overlay: als Kind des eigentlichen Mesh einhängen,
      // damit es die komplette Transformations-Hierarchie automatisch erbt.
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, wireframe: true, transparent: true, opacity: wireOpacity,
      });
      const wireMesh = new THREE.Mesh(geo, wireMat);
      wireMesh.visible = wireOpacity > 0;
      wireMesh.userData.isWireframe = true;
      obj.add(wireMesh);   // ← Kind von obj, nicht von wireGroup

      totalVerts += node.verts.length;
      totalFaces += node.faces.length;
    } else if (node.type === 'aabb' && node.faces.length > 0 && node.verts.length > 0) {
      // ── Walkmesh (AABB) ───────────────────────────────────────────────
      // Einfache Dreieck-Geometrie aus Verts + Faces (keine UVs/Normalen nötig).
      // Darstellung: halbtransparente Füllung + Wireframe-Overlay in Amber.
      const positions = new Float32Array(node.faces.length * 9);
      for (let fi = 0; fi < node.faces.length; fi++) {
        const face = node.faces[fi];
        for (let k = 0; k < 3; k++) {
          const v = node.verts[face.v[k]] || [0, 0, 0];
          positions[fi * 9 + k * 3 + 0] = v[0];
          positions[fi * 9 + k * 3 + 1] = v[1];
          positions[fi * 9 + k * 3 + 2] = v[2];
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.computeVertexNormals();

      // Halbtransparente Füllung
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0xe8a020,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const fillMesh = new THREE.Mesh(geo, fillMat);

      // Wireframe-Overlay
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0xe8a020,
        wireframe: true,
        transparent: true,
        opacity: 0.7,
      });
      const wireMesh = new THREE.Mesh(geo, wireMat);
      wireMesh.userData.isWireframe = true;

      // Gruppe aus Füllung + Wireframe
      obj = new THREE.Group();
      obj.add(fillMesh);
      obj.add(wireMesh);
      obj.userData.isAABB = true;

    } else {
      // Dummy / emitter / etc → small sphere marker
      const geo = new THREE.SphereGeometry(0.04, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color: nodeColor(node.type) });
      obj = new THREE.Mesh(geo, mat);
    }

    // Apply local transform.
    // Priority: animation time=0 keyframe (rest pose) > geometry orientation.
    // NWN-Format: orientation = (axis_x, axis_y, axis_z, winkel_radiant) — Achse-Winkel, KEIN Quaternion!
    //
    // skin-Nodes: Die Three.js-Mesh-Position bleibt bei (0,0,0), da die MDL-Vertices
    // im lokalen Raum des Skin-Nodes gespeichert sind und erst durch CPU-Skinning in
    // den Model-Space transformiert werden.
    // Die node.position des Skin-Nodes ist der Pivot-Offset, der beim Skinning zu
    // jedem Vertex addiert werden muss (vertex_model = vertex_local + skin_node_pos).
    const isSkinNode = node.type === 'skin';
    if (!isSkinNode) {
      const restPose = model.restPose && model.restPose[node.name];
      const oriSrc   = (restPose && restPose.orientation) ? restPose.orientation : node.orientation;
      const [ax, ay, az, angle] = oriSrc;
      obj.quaternion.copy(axisAngleToQuat(ax, ay, az, angle));
      obj.position.set(...node.position);
      obj.scale.setScalar(node.scale);
    }
    // skin: position/quaternion/scale = Three.js-Default (0/identity/1)

    obj.name = node.name;
    obj.userData.nodeData = node;
    obj.isBone = true; // NEU: Zwingend erforderlich, damit der SkeletonHelper die Hierarchie erkennt

    objects[node.name] = obj;
    nodeObjects[node.name] = obj;
  }

  // Build hierarchy
  for (const node of model.nodes) {
    const obj = objects[node.name];
    if (!obj) continue;
    const parentName = node.parent;
    if (parentName && parentName !== 'NULL' && objects[parentName]) {
      objects[parentName].add(obj);
    } else {
      modelGroup.add(obj);
    }
  }

  // Fit camera to model
  const box = new THREE.Box3().setFromObject(modelGroup);
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    orbit.target.copy(center);
    orbit.radius = maxDim * 2.2;
    orbit.theta  = 0.5; orbit.phi = 1.1;
    updateCamera();

    // Initial-Kamera für Reset speichern
    orbit.initTarget = center.clone();
    orbit.initRadius = orbit.radius;
    orbit.initTheta  = orbit.theta;
    orbit.initPhi    = orbit.phi;

    // BBox helper
    bboxHelper = new THREE.Box3Helper(box, new THREE.Color(0xc8a44a));
    bboxHelper.visible = document.getElementById('btn-bbox').classList.contains('active');
    scene.add(bboxHelper);
    
    // NEU: SkeletonHelper initialisieren
    skeletonHelper = new THREE.SkeletonHelper(modelGroup);
    // Wenn du die Farbe anpassen willst, kannst du das hier tun (Standard ist Blau/Grün-Verlauf)
    // skeletonHelper.material.color.set(0xffcc00); 
  
    // Standardmäßig an den Button-State in der HTML koppeln, falls er existiert
    const btnSkeleton = document.getElementById('btn-skeleton');
    skeletonHelper.visible = btnSkeleton ? btnSkeleton.classList.contains('active') : false;
    scene.add(skeletonHelper);
  }

  // Update stats
  document.getElementById('stat-verts').textContent = totalVerts.toLocaleString('de');
  document.getElementById('stat-faces').textContent = totalFaces.toLocaleString('de');
  document.getElementById('stat-nodes').textContent = model.nodes.length;
  document.getElementById('empty-state').style.display = 'none';
  setStatus(fmt('status_model_loaded', { name: model.name, cls: model.classification }));

  currentModel = model;
  buildNodeList(model);
  showModelInfo(model, totalVerts, totalFaces);

  // ── CPU-Skinning vorbereiten ─────────────────────────────────────────────
  // Koordinaten-Konvention: Alle Skinning-Berechnungen laufen in NWN-Z-Up-Space,
  // also VOR der -90°-X-Rotation des modelGroup. Das vermeidet Koordinaten-
  // System-Konflikte, da Skin-Vertices und Bone-Matrizen beide in NWN-Space sind.
  //
  // Die modelGroup-Rotation (-90° um X) konvertiert NWN-Z-Up nach Three.js-Y-Up
  // und wird von Three.js automatisch auf alle Child-Meshes (inkl. Skin-Meshes) angewendet.
  // Die CPU-geskinten Vertices werden in NWN-Space in den Geometry-Buffer geschrieben;
  // Three.js rendert sie korrekt, weil das Skin-Mesh Kind von modelGroup ist.

  // ── Schritt 1: Alle Bones in MDL-Geometrie-Pose setzen ─────────────────────
  // Die Bind-Matrizen MÜSSEN auf Basis der reinen Geometrie-Pose berechnet werden,
  // NICHT auf Basis der Animations-Rest-Pose (model.restPose).
  // Hintergrund: Bei Modellen mit eigenen Animationen (z.B. c_drggreen) wurde
  // model.restPose bereits aus dem t=0-Key der ersten Animation befüllt und beim
  // Erstellen der Objekte angewendet. Das führt zu falschen Bind-Matrizen, weil
  // die Bones dann in animierter Pose stehen, nicht in der neutralen Geometrie-Pose.
  // Modelle ohne eigene Animationen (z.B. c_drgred) waren nicht betroffen, da
  // model.restPose leer blieb und die Geometrie-Pose direkt genutzt wurde.
  for (const node of model.nodes) {
    if (node.type === 'skin') continue;   // Skin-Nodes haben keine eigene Pose
    const obj = objects[node.name];
    if (!obj) continue;
    const [ax, ay, az, angle] = node.orientation;
    obj.quaternion.copy(axisAngleToQuat(ax, ay, az, angle));
    obj.position.set(...node.position);
    obj.scale.setScalar(node.scale);
  }

  modelGroup.updateMatrixWorld(true);

  // NWN-Space-Matrix eines Bone: mg_inv * bone.matrixWorld
  // mg_inv: invertiert die modelGroup-Welt-Matrix (enthält -90°-X-Rotation + Position)
  const _mgInv = new THREE.Matrix4().copy(modelGroup.matrixWorld).invert();

  // Inverse Bind-Matrizen in NWN-Space für alle Bones
  const bindInverseMatrices = {};
  for (const [name, obj] of Object.entries(objects)) {
    const boneNWN = new THREE.Matrix4().multiplyMatrices(_mgInv, obj.matrixWorld);
    bindInverseMatrices[name] = boneNWN.invert();
  }

  // Pro skin-Node: Bind-Positionen in NWN-Model-Space und Gewichte pro explodiertem Vertex
  for (const node of model.nodes) {
    if (node.type !== 'skin' || !node.vertexWeights) continue;
    const obj = objects[node.name];
    if (!obj || !(obj instanceof THREE.Mesh)) continue;
    const geo = obj.geometry;

    // Vertex-Model-Space = vertex_local + skin_node_position
    // skin_node_position ist der MDL-Pivot-Offset (NWN-Space).
    const [spx, spy, spz] = node.position;   // skin node pivot in NWN model space
    const rawPos = geo.attributes.position.array;
    const bindPos = new Float32Array(rawPos.length);
    for (let k = 0; k < rawPos.length; k += 3) {
      bindPos[k]     = rawPos[k]     + spx;
      bindPos[k + 1] = rawPos[k + 1] + spy;
      bindPos[k + 2] = rawPos[k + 2] + spz;
    }
    geo.userData.bindPositions = bindPos;

    // Gewichte pro explodiertem Vertex: Explode-Schritt erzeugt 3 Verts pro Face.
    // Explodierter Vertex fi*3+k stammt von Original-Vertex node.faces[fi].v[k].
    const perVertWeights = [];
    for (let fi = 0; fi < node.faces.length; fi++) {
      for (let k = 0; k < 3; k++) {
        const vi = node.faces[fi].v[k];
        perVertWeights.push(node.vertexWeights[vi] || []);
      }
    }
    geo.userData.perVertWeights = perVertWeights;
    geo.userData.hasSkin = true;
    geo.attributes.position.usage = THREE.DynamicDrawUsage;
  }

  // Skinning-Daten global für animation.js bereitstellen
  window._nwnBindInvMatrices = bindInverseMatrices;
  window._nwnModelGroup      = modelGroup;

  // ── Schritt 2: Rest-Pose aus Animationen anwenden ───────────────────────────
  // Erst NACH der Bind-Matrix-Berechnung die Animations-Rest-Pose setzen,
  // damit die Szene in der erwarteten Ausgangsstellung erscheint.
  applyRestPose(model);
  modelGroup.updateMatrixWorld(true);

  saveGeometryPose();
  buildAnimUI(model);
}

// ─────────────────────────────────────────────
