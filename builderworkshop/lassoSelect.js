// lassoSelect.js
import * as THREE from "three";

export function initLassoSelect() {
    let points = [];
    let isDrawing = false;

    function start(x, y) {
        points = [{ x, y }];
        isDrawing = true;
    }

    function addPoint(x, y) {
        if (isDrawing) {
            points.push({ x, y });
        }
    }

    function end() {
        isDrawing = false;
        return points.slice();
    }

    // Ray-casting algorithm to determine if a 2D point is inside a polygon
    function isPointInPolygon(px, py, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            
            const intersect = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function computeSelection(polygon, camera, modelRoot) {
        if (!polygon || polygon.length < 3) return [];
        
        const found = [];
        const tempV = new THREE.Vector3();

        modelRoot.traverse(obj => {
            if (!obj.isMesh || !obj.geometry) return;
            
            // Compute bounding box center in world space
            if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
            const box = obj.geometry.boundingBox.clone();
            box.applyMatrix4(obj.matrixWorld);
            box.getCenter(tempV);

            // Project 3D center to 2D screen space (NDC)
            tempV.project(camera);
            
            // Convert NDC (-1 to 1) to screen pixels
            const screenX = (tempV.x * 0.5 + 0.5) * window.innerWidth;
            const screenY = (-tempV.y * 0.5 + 0.5) * window.innerHeight;

            if (isPointInPolygon(screenX, screenY, polygon)) {
                found.push(obj);
            }
        });

        return found;
    }

    return { 
        start, addPoint, end, computeSelection, 
        isDrawing: () => isDrawing, 
        getPoints: () => points 
    };
}