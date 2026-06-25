/* ═══════════════════════════════════════════════
   NWN MDL Viewer — Danglymesh Simulation
   (Procedural sine-wave vertex animation)
   ═══════════════════════════════════════════════

   Simulates NWN danglymesh physics (cloaks, hair,
   chains, foliage) using a procedural sine-wave
   approach instead of a full spring solver.

   Each vertex is displaced from its rest position
   by overlapping sine waves with slightly different
   frequencies, weighted by its constraint value:
     0   = rigid (no movement)
     1   = fully free (maximum displacement)

   The three displacement components use different
   frequencies and phase offsets for an organic look.
   The result is similar to what a player would see
   when a character stands idle and the cloth sways.

   Dependencies (globals from other modules):
     currentModel  – scene.js
     nodeObjects   – scene.js
     animState     – animation.js  (per-animation dangly overrides)

   Public API:
     tickDangly(dt)   – call once per frame (dt in seconds)
     danglyWallTime   – reset in session.js on clearSession()
   ═══════════════════════════════════════════════ */

let danglyWallTime = 0;

function tickDangly(dt) {
  danglyWallTime += dt;
  if (!currentModel) return;

  for (const node of currentModel.nodes) {
    if (node.type !== 'danglymesh') continue;

    const obj = nodeObjects[node.name];
    if (!obj || !obj.geometry) continue;

    const geo = obj.geometry;
    if (!geo.userData.isDangly) continue;

    // ── Per-animation displacement/period overrides ──────────────────────
    // Aurora stores per-anim dangly params in anim node blocks (not keyframes).
    // displacement=0 in an anim block = disabled for this animation.
    // Negative values indicate an active effect (take absolute value).
    const animNode = (typeof animState !== 'undefined' && animState.current)
      ? animState.current.nodes[node.name]
      : null;

    const effDisp = (animNode && animNode.danglyDisplacement !== null)
      ? Math.abs(animNode.danglyDisplacement)
      : geo.userData.danglyDisplacement;

    const animPer = (animNode && animNode.danglyPeriod !== null)
      ? Math.abs(animNode.danglyPeriod)
      : 0;
    const effPeriod = (animPer > 0.001 ? animPer : geo.userData.danglyPeriod) || 1.0;

    // displacement=0 → dangly deactivated for this animation → snap to rest
    if (effDisp < 0.0001) {
      geo.attributes.position.array.set(geo.userData.danglyRest);
      geo.attributes.position.needsUpdate = true;
      geo.computeBoundingSphere();
      continue;
    }

    const rest   = geo.userData.danglyRest;
    const constr = geo.userData.danglyConstraints;
    const phase  = geo.userData.danglyPhase;
    const pos    = geo.attributes.position.array;

    // Normalised time within the swing period
    const t = danglyWallTime / effPeriod;

    for (let i = 0, n = (pos.length / 3) | 0; i < n; i++) {
      const w = constr[i];
      if (w < 0.001) continue;   // rigid vertex — skip

      const amp = effDisp * w;

      // Three overlapping sine waves with different frequencies and phase offsets
      // produce a more natural, non-repeating-looking swing than a single sine.
      pos[i * 3]     = rest[i * 3]     + Math.sin(t           + phase)       * amp * 0.6;
      pos[i * 3 + 1] = rest[i * 3 + 1] + Math.sin(t * 1.3     + phase + 1.1) * amp;
      pos[i * 3 + 2] = rest[i * 3 + 2] + Math.sin(t * 0.7     + phase + 2.3) * amp * 0.4;
    }

    geo.attributes.position.needsUpdate = true;
    // Recompute bounding sphere so frustum culling stays correct
    geo.computeBoundingSphere();
  }
}
