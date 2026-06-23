import * as THREE from "three";
import { state } from "./ws_state.js";

// Safely initialize WebsimSocket if it exists in the environment
const room = typeof WebsimSocket !== 'undefined' ? new WebsimSocket() : null;

// Export room so other modules can use it if needed
export { room };

// The actual agent logic, exposed as a clean async function
export async function runAgent() {
    if (!room) {
        console.warn("WebsimSocket not available. Agent run skipped.");
        alert("WebsimSocket not available in this environment.");
        return;
    }

    const meshes = [];
    state.modelRoot.traverse((c) => { if (c.isMesh) meshes.push(c); });

    let triangleCount = 0;
    const textures = new Set();
    let materialsCount = 0;

    for (const m of meshes) {
        if (m.geometry) {
            const geom = m.geometry;
            const tri = geom.index ? Math.floor(geom.index.count / 3) : Math.floor((geom.attributes.position ? geom.attributes.position.count : 0) / 3);
            triangleCount += tri;
        }
        if (m.material) {
            materialsCount += 1;
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            for (const mat of mats) {
                if (mat.map && mat.map.image && mat.map.image.src) textures.add(mat.map.image.src);
            }
        }
    }

    const approxVertexBytes = 12 * 4;
    const approxPerTriangle = 3 * approxVertexBytes;
    const estimatedGeometryMemMB = Math.max(0, (triangleCount * approxPerTriangle) / (1024 * 1024));

    const texBytes = textures.size * 1 * 1024 * 1024;
    const estimatedTextureMemMB = texBytes / (1024 * 1024);

    const bbox = new THREE.Box3().setFromObject(state.modelRoot);
    const size = bbox.getSize(new THREE.Vector3());

    const report = {
        type: 'resource_report',
        mesh_count: meshes.length,
        triangle_count: triangleCount,
        materials: materialsCount,
        texture_count: textures.size,
        estimated_geometry_mb: Math.round(estimatedGeometryMemMB * 100) / 100,
        estimated_texture_mb: Math.round(estimatedTextureMemMB * 100) / 100,
        bbox_size: { x: Math.round(size.x * 1000) / 1000, y: Math.round(size.y * 1000) / 1000, z: Math.round(size.z * 1000) / 1000 },
        timestamp: new Date().toISOString(),
        summary: `Meshes: ${meshes.length}, Triangles: ${triangleCount}, Textures: ${textures.size}, Est MB: ${Math.round((estimatedGeometryMemMB + estimatedTextureMemMB) * 100) / 100}`
    };

    try {
        const rec = await room.collection('resource_report').create(report);
        alert('Resource Agent finished. Report saved (id: ' + rec.id + ').\n' + report.summary);
        return rec;
    } catch (err) {
        console.error('Agent error', err);
        alert('Resource Agent error: ' + err.message);
    }
}

// UI Wiring: Registers the click handler internally
export function setupAgent() {
    const runAgentBtn = document.getElementById('run-agent');
    if (runAgentBtn) {
        runAgentBtn.addEventListener('click', async () => {
            runAgentBtn.disabled = true;
            runAgentBtn.textContent = 'Running...';
            try {
                await runAgent();
            } catch (e) {
                console.error(e);
            } finally {
                runAgentBtn.disabled = false;
                runAgentBtn.textContent = 'Run Resource Agent';
            }
        });
    }
}
