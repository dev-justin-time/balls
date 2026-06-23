// ws_selectGroups.js
export function initSelectGroups(modelRoot) {
    const groups = new Map(); // name -> Set<uuid>

    function createGroup(name, objects = []) {
        const uuids = new Set(objects.map(o => o.uuid));
        groups.set(name, uuids);
    }

    function deleteGroup(name) {
        groups.delete(name);
    }

    function renameGroup(oldName, newName) {
        if (groups.has(oldName) && !groups.has(newName)) {
            groups.set(newName, groups.get(oldName));
            groups.delete(oldName);
        }
    }

    function addToGroup(name, object) {
        if (!groups.has(name)) groups.set(name, new Set());
        groups.get(name).add(object.uuid);
    }

    function removeFromGroup(name, object) {
        if (groups.has(name)) {
            groups.get(name).delete(object.uuid);
        }
    }

    function listGroups() {
        return Array.from(groups.keys());
    }

    function getObjectsByGroup(name) {
        const uuids = groups.get(name);
        if (!uuids) return [];

        const found = [];
        modelRoot.traverse(c => {
            if (uuids.has(c.uuid)) found.push(c);
        });
        return found;
    }

    return {
        createGroup, deleteGroup, renameGroup,
        addToGroup, removeFromGroup,
        listGroups, getObjectsByGroup
    };
}
