import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { state } from "./ws_state.js";

// UI Wiring: Registers the click handler internally
export function setupExporter() {
    const exportBtn = document.getElementById('export-glb');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const exporter = new GLTFExporter();
            exporter.parse(state.modelRoot, (gltf) => {
                const isBinary = gltf instanceof ArrayBuffer;
                const blob = new Blob([isBinary ? gltf : JSON.stringify(gltf)], {
                    type: isBinary ? 'model/gltf-binary' : 'application/json'
                });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'scene.gltf';
                a.click();
                URL.revokeObjectURL(a.href);
            }, { binary: false, truncateDrawRange: true });
        });
    }
}
