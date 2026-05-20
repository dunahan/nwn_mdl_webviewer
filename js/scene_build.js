/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Scene Builder (buildScene)
   ═══════════════════════════════════════════════ */

//  Build scene from parsed model
// ─────────────────────────────────────────────
const NODE_COLORS = {
  trimesh: 0x4a90c0, skin: 0xc070c0, dummy: 0x70b870,
  animmesh: 0x6ab84a,
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

    if ((node.type === 'trimesh' || node.type === 'skin' || node.type === 'danglymesh' || node.type === 'animmesh') && node.faces.length > 0 && node.verts.length > 0) {
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

      // Basis-UVs sichern — wird beim Animationswechsel (resetToPose) benoetigt,
      // damit animmesh-Nodes wieder in den Grundzustand zurueckkehren koennen.
      geo.userData.baseUVs = uvs.slice();

      // animmesh: Face->Tvert-Mapping fuer UV-Animation speichern.
      // animation.js berechnet daraus pro Frame die korrekten UV-Koordinaten.
      if (node.type === 'animmesh') {
        const faceTverts = new Int16Array(node.faces.length * 3);
        for (let fi = 0; fi < node.faces.length; fi++) {
          const face = node.faces[fi];
          faceTverts[fi * 3 + 0] = face.t[0];
          faceTverts[fi * 3 + 1] = face.t[1];
          faceTverts[fi * 3 + 2] = face.t[2];
        }
        geo.userData.animFaceTverts = faceTverts;
        geo.userData.animVertCount  = node.tverts.length;
      }

      // ── MTR-Lookup: materialname → MTR-Cache hat Vorrang vor bitmap ───────
      // mtrCache ist in mtr.js global definiert und beim buildScene()-Aufruf
      // bereits befüllt (Ladereihenfolge: Texturen+MTR → buildScene).
      const mtrKey = node.materialname
        ? node.materialname.toLowerCase()
        : (node.bitmap ? node.bitmap.toLowerCase() : null);
      const mtr = (mtrKey && typeof mtrCache !== 'undefined') ? (mtrCache[mtrKey] || null) : null;

      // Effektiver renderhint: MTR überschreibt MDL-Node-Wert.
      // Wichtig: NWN:EE setzt renderhint oft nur im MTR, nicht im MDL selbst.
      const effectiveRenderhint = (mtr && mtr.renderhint)
        ? mtr.renderhint
        : (node.renderhint || '');

      // Tangenten setzen wenn renderhint Normal-Mapping erfordert.
      // Pfad A: MDL enthält bereits Tangenten → direkt unrollen (bevorzugt, exakte Autorendaten).
      // Pfad B: Fallback via computeTangents() wenn keine Tangenten im MDL vorhanden.
      const needsTangents = effectiveRenderhint &&
        (effectiveRenderhint.toLowerCase() === 'normalandspecmapped' ||
         effectiveRenderhint.toLowerCase() === 'normaltangents');

      // Pfad A — Parsed Tangents aus MDL nutzen
      // Sanity-Check: Anzahl muss mit verts übereinstimmen, sonst Fallback
      const hasParsedTangents = needsTangents &&
        node.tangents && node.tangents.length > 0 &&
        node.tangents.length === node.verts.length;

      if (hasParsedTangents) {
        // Tangenten in Flat-Array unrollen (Face-Vertex-Reihenfolge wie positions/normals).
        // Three.js erwartet vec4: [tx, ty, tz, w] — w = Handedness (+1 / -1).
        // w = sign(dot(cross(N, T), B))
        const tangentArr = new Float32Array(node.faces.length * 3 * 4);
        for (let fi = 0; fi < node.faces.length; fi++) {
          const face = node.faces[fi];
          for (let fk = 0; fk < 3; fk++) {
            const vi = face.v[fk];
            const tg = node.tangents[vi];
            if (!tg) continue;
            const [tx, ty, tz, bx, by, bz, nx, ny, nz] = tg;
            // cross(N, T)
            const cx = ny * tz - nz * ty;
            const cy = nz * tx - nx * tz;
            const cz = nx * ty - ny * tx;
            const w = (cx * bx + cy * by + cz * bz) >= 0 ? 1 : -1;
            const base = (fi * 3 + fk) * 4;
            tangentArr[base + 0] = tx;
            tangentArr[base + 1] = ty;
            tangentArr[base + 2] = tz;
            tangentArr[base + 3] = w;
          }
        }
        geo.setAttribute('tangent', new THREE.BufferAttribute(tangentArr, 4));
        geo.userData.hasTangents = true;

      } else if (needsTangents) {
        // Pfad B — Fallback: Tangenten berechnen.
        // computeTangents() erfordert Index-Buffer → sequentiellen Index anlegen.
        if (!geo.index) {
          const n = positions.length / 3;
          const idx = new Uint32Array(n);
          for (let i = 0; i < n; i++) idx[i] = i;
          geo.setIndex(new THREE.BufferAttribute(idx, 1));
        }
        geo.computeTangents();
        geo.userData.hasTangents = true;
      }

      const d = node.diffuse;

      // Diffuse-Textur: MTR texture0 > node.bitmap
      const diffuseKey = (mtr && mtr.textures[0])
        ? mtr.textures[0].toLowerCase()
        : (node.bitmap ? node.bitmap.toLowerCase() : '');
      const tex = diffuseKey ? (textureCache[diffuseKey] || null) : null;

      // Normal-Map: MTR texture1 (nur wenn Tangenten berechnet wurden — sonst sinnlos)
      const normalTexKey = (mtr && mtr.textures[1] && needsTangents)
        ? mtr.textures[1].toLowerCase() : null;
      const normalTex = normalTexKey ? (textureCache[normalTexKey] || null) : null;

      // Specular-Map → Roughness-Map (invertiert): MTR texture2
      // invertSpecToRoughnessMap() ist in textures.js definiert; cache-Key mit Suffix
      // damit die invertierte Version separat gecacht wird.
      const specTexKey = (mtr && mtr.textures[2]) ? mtr.textures[2].toLowerCase() : null;
      const specTex    = specTexKey ? (textureCache[specTexKey] || null) : null;
      const roughTex   = specTex ? invertSpecToRoughnessMap(specTex, specTexKey + '_inv') : null;

      // MTR-Parameter: Roughness und Specularity (names sind case-sensitive laut parseMTR)
      const mtrRoughParam = mtr?.params?.['Roughness']?.values?.[0] ?? null;
      const mtrSpecParam  = mtr?.params?.['Specularity']?.values?.[0] ?? null;

      // transparencyhint 1 → Textur hat Alpha-Kanal (Decals, Splotches, Pflanzen).
      // Nur anwenden wenn die Textur auch wirklich einen Alpha-Kanal hat (DXT5/32-bit TGA/PNG).
      // DXT1-Texturen haben keinen Alpha-Kanal — transparencyhint wäre ein Modellierfehler.
      const texHasAlpha  = tex ? (tex.userData.hasAlpha === true) : false;
      const useTexAlpha  = node.transparencyhint === 1 && texHasAlpha;
      const useMeshAlpha = node.alpha < 0.99;
      const useMtrTrans  = mtr ? mtr.transparency : false;

      // Roughness + Metalness:
      // Wenn roughnessMap vorhanden → scalar = Multiplikator (1.0 = Map volle Wirkung).
      // Wenn kein roughnessMap → aus MDL-Phong-Werten konvertieren.
      // MTR-Roughness-Parameter überschreibt beides wenn explizit gesetzt.
      const roughness = roughTex
        ? (mtrRoughParam !== null ? mtrRoughParam : 1.0)
        : (mtrRoughParam !== null
            ? mtrRoughParam
            : Math.max(0.1, 1.0 - Math.min(node.shininess / 64.0, 0.9)));
      const specMax   = Math.max(node.specular[0], node.specular[1], node.specular[2]);
      const metalness = mtrSpecParam !== null
        ? Math.min(mtrSpecParam * 0.4, 0.6)
        : Math.min(specMax * 1.5, 0.6);

      const mat = new THREE.MeshStandardMaterial({
        color:        tex ? new THREE.Color(1, 1, 1) : new THREE.Color(d[0] || 0.8, d[1] || 0.8, d[2] || 0.8),
        map:          tex       || null,
        normalMap:    normalTex || null,
        roughnessMap: roughTex  || null,
        roughness,
        metalness,
        side:        THREE.DoubleSide,
        transparent: useMeshAlpha || useTexAlpha || useMtrTrans,
        opacity:     node.alpha,
        alphaTest:   useTexAlpha ? 0.1 : 0,
        depthWrite:  !useTexAlpha,
      });

      // Fallback-Farbe wenn kein Bitmap und diffuse ist schwarz
      if (!tex && d[0] === 0 && d[1] === 0 && d[2] === 0) mat.color.set(0x888888);
      // Wenn Textur referenziert (via bitmap oder MTR texture0) aber noch nicht geladen: Hinweis-Farbe
      if ((node.bitmap || (mtr && mtr.textures[0])) && !tex) mat.color.set(nodeColor(node.type));

      // selfillumcolor → Emissive (EFFECT-Modelle mit Eigenleuchten, z. B. vdr_globemin, vim_cntglobe)
      // WICHTIG: emissiveMap = tex setzen, damit die *Textur* selbst leuchtet und nicht
      // das gesamte Material weiß wird (mat.emissive ohne Map = Vollfarbe über alles).
      if (node.selfIllumColor) {
        const [sr, sg, sb] = node.selfIllumColor;
        if ((sr > 0 || sg > 0 || sb > 0) && tex) {
          mat.emissiveMap       = tex;
          mat.emissive.setRGB(sr, sg, sb);
          mat.emissiveIntensity = 1.0;
        }
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Originalwerte merken — wird von updateMeshOpacity zum Zurücksetzen genutzt
      mesh.userData.baseOpacity     = node.alpha;
      mesh.userData.baseTransparent = useMeshAlpha || useTexAlpha;
      mesh.userData.baseDepthWrite  = !useTexAlpha;
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

    } else if (node.type === 'emitter') {
      // ── Emitter-Marker ────────────────────────────────────────────────
      // Koordinatensystem-Hinweis:
      //   modelGroup hat rotation.x = -π/2  →  R_x(-π/2) transformiert Vektoren:
      //     lokal (x,y,z) → welt (x, z, -y)
      //   Daraus folgt:
      //     lokal -Z → welt +Y  (aufwärts, Partikelrichtung) ← Pfeile
      //     lokal -Y → welt +Z  (zur Kamera)                 ← Preview-Quad
      const group = new THREE.Group();

      // Farbe aus colorStart, Fallback-Orange falls zu dunkel
      const cs = node.colorStart || [1, 0.6, 0.1];
      const lum = cs[0] * 0.299 + cs[1] * 0.587 + cs[2] * 0.114;
      const emitColor = lum < 0.05
        ? new THREE.Color(0xf0a030)
        : new THREE.Color(cs[0], cs[1], cs[2]);

      // Marker-Deckkraft: 50 % wenn der Emitter aktiv ist (Partikel übernehmen die Darstellung),
      // sonst volle Opazität als Platzhalter-Indikator.
      // Ein Emitter gilt als aktiv wenn entweder statische birthrate > 0 ODER
      // birthratekey in einer Animation vorhanden ist.
      const hasAnimBirthrate = (model.animations || []).some(
        anim => (anim.nodes[node.name]?.emitterKeys?.birthrate?.length ?? 0) > 0
      );
      const markerActive = (node.birthrate > 0 || hasAnimBirthrate) && node.emitterTexture;
      const markerOpacity = markerActive ? 0.5 : 1.0;

      // Zentrum: Kugel
      const sGeo = new THREE.SphereGeometry(0.06, 8, 6);
      const sMat = new THREE.MeshBasicMaterial({ color: emitColor, transparent: markerActive, opacity: markerOpacity });
      group.add(new THREE.Mesh(sGeo, sMat));

      // Ring in XZ-Ebene (nach Rotation horizontal = Emitteröffnung)
      const rGeo = new THREE.TorusGeometry(0.15, 0.012, 6, 20);
      const rMat = new THREE.MeshBasicMaterial({ color: emitColor, transparent: true, opacity: 0.75 * markerOpacity });
      const ring = new THREE.Mesh(rGeo, rMat);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);

      // Richtungspfeile: lokal -Z → nach modelGroup-Rotation welt +Y (oben)
      const arrowPts = new Float32Array([
        // Mittelstrahl
         0,    0,  0,       0,    0,  -0.22,
        // Pfeilspitzen-Schenkel
        -0.06, 0, -0.14,    0,    0,  -0.22,
         0.06, 0, -0.14,    0,    0,  -0.22,
        // Seitenstrahlen (Spread andeuten)
        -0.12, 0,  0,      -0.08, 0,  -0.16,
         0.12, 0,  0,       0.08, 0,  -0.16,
      ]);
      const aGeo = new THREE.BufferGeometry();
      aGeo.setAttribute('position', new THREE.Float32BufferAttribute(arrowPts, 3));
      const aMat = new THREE.LineBasicMaterial({ color: emitColor, transparent: true, opacity: 0.85 * markerOpacity });
      group.add(new THREE.LineSegments(aGeo, aMat));

      // ── Textur-Preview-Quad ───────────────────────────────────────────
      // PlaneGeometry hat Normal = lokal +Z.
      // rotation.x = +π/2 dreht die Normale auf lokal -Y.
      // Nach modelGroup-Rotation: lokal -Y → welt +Z (zur Kamera) → sichtbar.
      const emTexName = node.emitterTexture || null;
      const emTex     = emTexName ? textureCache[emTexName] : null;
      // Größe aus sizeStart, Mindestgröße 0.15
      const qSize = Math.max(node.sizeStart || 0.5, 0.15);
      const qGeo  = new THREE.PlaneGeometry(qSize, qSize);
      const qMat  = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite:  false,
        side:        THREE.DoubleSide,
        alphaTest:   0.05,
        color:       emTex ? 0xffffff : emitColor,
        map:         emTex || null,
        opacity:     emTex ? 1.0 : 0.0,   // unsichtbar bis Textur da
      });
      if ((node.blend || '').toLowerCase() === 'additive') {
        qMat.blending = THREE.AdditiveBlending;
        qMat.alphaTest = 0;
      }
      const quad = new THREE.Mesh(qGeo, qMat);
      quad.rotation.x = Math.PI / 2;   // Normal → lokal -Y → welt +Z (zur Kamera)
      quad.userData.isEmitterPreview  = true;
      quad.userData.emitterTexName    = emTexName;
      quad.userData.emitterBlend      = (node.blend || '').toLowerCase();
      // Preview-Quad ausblenden wenn der Partikel-Emitter aktiv ist —
      // dann übernimmt emitter.js die Darstellung.
      quad.visible = !markerActive;
      group.add(quad);

      // userData am Gruppen-Objekt für applyTexturesToScene
      group.userData.hasEmitterPreview = true;
      group.userData.emitterTexName    = emTexName;

      obj = group;

    } else if (node.type === 'light') {
      // ── Light-Node ────────────────────────────────────────────────────────
      const group = new THREE.Group();

      // Marker: kleine Kugel in Lichtfarbe (aufgehellt damit sichtbar)
      const lc = node.lightColor;
      const markerColor = new THREE.Color(
        Math.max(lc[0], 0.45),
        Math.max(lc[1], 0.45),
        Math.max(lc[2], 0.45)
      );
      const sGeo = new THREE.SphereGeometry(0.05, 8, 6);
      const sMat = new THREE.MeshBasicMaterial({ color: markerColor });
      group.add(new THREE.Mesh(sGeo, sMat));

      // Linienkreuz: zeigt Lichtposition im Raum an
      const linePts = new Float32Array([
        -0.13,0,0,  0.13,0,0,
         0,-0.13,0,  0,0.13,0,
         0,0,-0.13,  0,0,0.13,
      ]);
      const lGeo = new THREE.BufferGeometry();
      lGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePts, 3));
      const lMat = new THREE.LineBasicMaterial({ color: markerColor, transparent: true, opacity: 0.55 });
      group.add(new THREE.LineSegments(lGeo, lMat));

      // Three.js-Licht anlegen
      const lightColor = new THREE.Color(lc[0], lc[1], lc[2]);
      let mdlLight;
      if (node.lightAmbientOnly) {
        // ambientonly → AmbientLight mit reduzierter Intensität (würde sonst Szene überfluten)
        mdlLight = new THREE.AmbientLight(lightColor, node.lightMultiplier * 0.25);
      } else {
        // PointLight: decay=1 (linearer Abfall, näher an NWN-Verhalten als physikalisch korrekt)
        mdlLight = new THREE.PointLight(lightColor, node.lightMultiplier, node.lightRadius, 1);
        mdlLight.castShadow = false;   // Shadow von Modell-Lichtern zu teuer für Viewer
      }
      group.add(mdlLight);

      // Referenz für animation.js (colorkey / radiuskey / multiplierkey)
      group.userData.mdlLight      = mdlLight;
      group.userData.isLightNode   = true;

      obj = group;

    } else {
      // Dummy / reference / unbekannte Typen → kleine Kugel
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
    orbit.radius = Math.max(maxDim * 2.2, 2.0);
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
  } else {
    // Leere Box: Emitter-only Modell ohne messbare Ausdehnung (z.B. nur Emitter-Marker)
    orbit.target.set(0, 0, 0);
    orbit.radius = 3;
    orbit.theta  = 0.5; orbit.phi = 1.1;
    orbit.initTarget = new THREE.Vector3(0, 0, 0);
    orbit.initRadius = 3;
    orbit.initTheta  = 0.5;
    orbit.initPhi    = 1.1;
    updateCamera();
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
    const [oax, oay, oaz, oangle] = node.orientation;
    
    // Skin-Node-Rotation auf Bind-Positionen anwenden
    const skinQuat = axisAngleToQuat(oax, oay, oaz, oangle);
    const hasRot = Math.abs(1.0 - Math.abs(skinQuat.w)) > 1e-4;
    const rotMat = hasRot
      ? new THREE.Matrix4().makeRotationFromQuaternion(skinQuat)
      : null;
    
    const rawPos = geo.attributes.position.array;
    const bindPos = new Float32Array(rawPos.length);
    const _vtmp = new THREE.Vector3();
    
/*  for (let k = 0; k < rawPos.length; k += 3) {
      bindPos[k]     = rawPos[k]     + spx;
      bindPos[k + 1] = rawPos[k + 1] + spy;
      bindPos[k + 2] = rawPos[k + 2] + spz;
    }*/
    
    for (let k = 0; k < rawPos.length; k += 3) {
      _vtmp.set(rawPos[k], rawPos[k + 1], rawPos[k + 2]);
      if (rotMat) _vtmp.applyMatrix4(rotMat);
      bindPos[k]     = _vtmp.x + spx;
      bindPos[k + 1] = _vtmp.y + spy;
      bindPos[k + 2] = _vtmp.z + spz;
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
  
  // ── Schritt 3: Skin-Meshes initial in Rest-Pose bringen ──────────────────────
  // applySkinning() muss auch ohne Animationen einmal aufgerufen werden,
  // damit die Skin-Vertices vom lokalen Skin-Node-Space (nur vertex_local)
  // in den Model-Space transformiert werden (vertex_local + skin_node_pivot).
  // Bei Modellen mit Animationen geschieht das erst durch selectAnim() →
  // applyAnimFrame() → applySkinning() – hier stellt der direkte Aufruf
  // sicher, dass auch reine Geometrie-Modelle (z.B. Umhang ohne Animationen)
  // korrekt positioniert sind.
  // Da die Bones jetzt in der Geometry-Pose stehen (= Bind-Pose), ergibt sich
  // skinMat = currentBone × inverseBind = identity, d.h. jeder Vertex landet
  // exakt an seiner Bind-Position (vertex_local + skin_node_pivot).
  applySkinning();

  // ── Schritt 4: Partikel-Emitter starten ────────────────────────────────────
  // initAllEmitters() erzeugt für jeden aktiven Emitter-Node einen Partikel-Pool.
  // Texturen aus textureCache werden direkt genutzt — wenn sie noch nicht geladen
  // sind, sorgt refreshEmitterTextures() in applyTexturesToScene() für den Start.
  if (typeof initAllEmitters === 'function') initAllEmitters(model);
}

// ─────────────────────────────────────────────
