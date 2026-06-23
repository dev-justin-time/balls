// ws_selectionHistory.js
export function initSelectionHistory() {
    const stack = [];
    let pointer = -1;
    const MAX_HISTORY = 50;

    function push(selectionUUIDs) {
        // If we undid some actions and push a new state, truncate the future history
        if (pointer < stack.length - 1) {
            stack.splice(pointer + 1);
        }

        // Prevent pushing duplicate consecutive states
        const lastState = stack[pointer];
        if (lastState && JSON.stringify(lastState) === JSON.stringify(selectionUUIDs)) {
            return;
        }

        stack.push([...selectionUUIDs]);

        // Enforce maximum history size
        if (stack.length > MAX_HISTORY) {
            stack.shift();
        } else {
            pointer++;
        }
    }

    function undo() {
        if (pointer > 0) {
            pointer--;
            return stack[pointer];
        }
        return null;
    }

    function redo() {
        if (pointer < stack.length - 1) {
            pointer++;
            return stack[pointer];
        }
        return null;
    }

    function peek() {
        return pointer >= 0 ? stack[pointer] : null;
    }

    function clear() {
        stack.length = 0;
        pointer = -1;
    }

    return { push, undo, redo, peek, clear };
}
