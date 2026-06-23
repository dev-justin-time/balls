// ws_rigging.js
import * as THREE from "three";
import { state } from "./ws_state.js";

export const rigSlots = {
    left1: null, left2: null,
    right1: null, right2: null
};

export function uploadBoneData(slotId, file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            rigSlots[slotId] = data;
            generateShell(slotId, data);
            alert(`Rig data loaded into ${slotId}`);
        } catch (err) {
            console.error('Rig JSON parse error:', err.message);
            alert('Invalid JSON file');
        }
    };
    reader.readAsText(file);
}

export function downloadBoneData(slotId) {
    const data = rigSlots[slotId];
    if (!data) return alert('Slot is empty');

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rig_${slotId}.json`;
    a.click();
}

// Generates a visual "shell" (skeleton) from the bone hierarchy
export function generateShell(slotId, boneData, title = "Rig Shell") {
    const group = new THREE.Group();
    group.name = `Shell_${slotId}_${title}`;

    const mat = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x004400 });

    function createBone(bone, parentPos) {
        const pos = new THREE.Vector3(bone.x || 0, bone.y || 0, bone.z || 0);

        // Draw line from parent to this bone
        if (parentPos) {
            const dir = new THREE.Vector3().subVectors(pos, parentPos);
            const len = dir.length();
            const geo = new THREE.CylinderGeometry(0.02, 0.02, len, 4);
            geo.translate(0, len/2, 0);
            geo.rotateX(Math.PI/2);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(parentPos);
            mesh.lookAt(pos);
            group.add(mesh);
        }

        // Draw joint sphere
        const jointGeo = new THREE.SphereGeometry(0.05, 8, 8);
        const joint = new THREE.Mesh(jointGeo, mat);
        joint.position.copy(pos);
        group.add(joint);

        if (bone.children) {
            bone.children.forEach(child => createBone(child, pos));
        }
    }

    if (boneData.root) createBone(boneData.root, null);

    state.modelRoot.add(group);
    return group;
}

export function startGenerativeTask() {
    const title = prompt("Enter title for this generative rigging task:");
    if (!title) return;
    console.log(`Starting generative task: ${title}`);
    // Hook your generation logic here
    return title;
}
