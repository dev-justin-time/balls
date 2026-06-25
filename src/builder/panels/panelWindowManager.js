/**
 * Panel Window Manager — Floating, draggable, resizable tool panels for the builder.
 *
 * Ported from Web Cloud OS WindowManager (MIT license, Puter Technologies Inc.)
 * Adapted for Going Balls builder tool panels. Key differences:
 *   - No VFS dependency (panels use DOM only)
 *   - Z-index starts at 1000 to stay above game UI
 *   - Dark theme titlebar matching builder aesthetics
 *   - Panel minimizes to a compact tab bar
 *   - Cascade offset is larger to keep panels from overlapping
 *
 * Usage:
 *   import { PanelWindowManager } from './panels/panelWindowManager.js';
 *   const pwm = new PanelWindowManager(document.getElementById('builder-panels'));
 *   pwm.openPanel('Selection Tools', (win) => {
 *     win.body.innerHTML = `<button>...`;
 *   });
 */

export class PanelWindowManager {
    /**
     * @param {HTMLElement} container - The DOM element that holds all floating panels
     * @param {object} [options]
     * @param {number} [options.baseZ=1000] - Starting z-index
     * @param {number} [options.cascadeOffset=32] - Pixels to offset each new panel
     * @param {number} [options.minWidth=220]
     * @param {number} [options.minHeight=120]
     */
    constructor(container, options = {}) {
        this.container = container;
        this.baseZ = options.baseZ || 1000;
        this.cascadeOffset = options.cascadeOffset || 32;
        this.minWidth = options.minWidth || 220;
        this.minHeight = options.minHeight || 120;
        this.z = this.baseZ;
        this.windows = [];
        this._windowCount = 0;

        this._initGlobalListeners();
    }

    // ── Public API ───────────────────────────────────────────

    /**
     * Open a floating panel window.
     *
     * @param {string} title - Panel title shown in the title bar
     * @param {function} contentFactory - Called with { el, setTitle, body }
     *        where el is the window's root DOM element, setTitle(newTitle) updates
     *        the title bar, and body is the content container div.
     * @returns {object} The window wrapper { el, setTitle, body }
     */
    openPanel(title, contentFactory) {
        // 1. Clone window template or create one
        const template = document.getElementById('builder-panel-template');
        const el = template
            ? template.content.cloneNode(true).firstElementChild
            : this._createDefaultWindow();

        if (!el || !el.classList) {
            console.warn('[PanelWM] Failed to create window element');
            return null;
        }

        // 2. Cascade position
        const offset = this._windowCount * this.cascadeOffset;
        el.style.left = (24 + offset) + 'px';
        el.style.top = (24 + offset) + 'px';
        el.style.zIndex = this.z;

        // 3. Set title
        const titleEl = el.querySelector('.panel-title');
        if (titleEl) titleEl.textContent = title;

        // 4. Build wrapper
        const wrapper = {
            el,
            setTitle: (newTitle) => {
                if (titleEl) titleEl.textContent = newTitle;
            },
            body: el.querySelector('.panel-body'),
        };

        // 5. Wire controls
        this._wireControls(el, wrapper);

        // 6. Add to container
        this.container.appendChild(el);
        this.windows.push(wrapper);
        this._windowCount++;

        // 7. Call content factory
        if (contentFactory && wrapper.body) {
            try {
                contentFactory(wrapper);
            } catch (e) {
                console.warn('[PanelWM] Content factory error:', e);
                if (wrapper.body) wrapper.body.innerHTML = `<div style="color:#ff6666;padding:12px;font-size:11px;">
                    Panel error: ${e.message}</div>`;
            }
        }

        this._focusWindow(wrapper, el);
        return wrapper;
    }

    /**
     * Close a specific panel window.
     */
    closePanel(wrapper) {
        if (!wrapper || !wrapper.el) return;
        this._closeWindow(wrapper, wrapper.el);
    }

    /**
     * Close all panel windows (e.g., when exiting builder).
     */
    closeAll() {
        // Iterate backwards since _closeWindow mutates the array
        for (let i = this.windows.length - 1; i >= 0; i--) {
            const w = this.windows[i];
            if (w && w.el && w.el.parentNode) {
                w.el.parentNode.removeChild(w.el);
            }
        }
        this.windows = [];
        this._windowCount = 0;
        this.z = this.baseZ;
    }

    /**
     * Hide all panels without destroying them (e.g., toggle visibility).
     */
    hideAll() {
        this.windows.forEach(w => {
            if (w.el) w.el.style.display = 'none';
        });
    }

    /**
     * Show all hidden panels.
     */
    showAll() {
        this.windows.forEach(w => {
            if (w.el) w.el.style.display = '';
        });
    }

    // ── Internal ─────────────────────────────────────────────

    _initGlobalListeners() {
        // Focus panels when clicking inside them
        this._focusHandler = (e) => {
            const winEl = e.target.closest('.builder-panel');
            if (!winEl) return;
            const wrapper = this.windows.find(w => w.el === winEl);
            if (wrapper) this._focusWindow(wrapper, winEl);
        };
        document.addEventListener('pointerdown', this._focusHandler);
    }

    /**
     * Clean up global listeners and remove all panel elements.
     * Call this from the builder's dispose() to prevent memory leaks.
     */
    dispose() {
        document.removeEventListener('pointerdown', this._focusHandler);
        this.closeAll();
    }

    _focusWindow(wrapper, el) {
        this.z += 1;
        el.style.zIndex = this.z;
    }

    _closeWindow(wrapper, el) {
        if (el.parentNode) el.parentNode.removeChild(el);
        const idx = this.windows.indexOf(wrapper);
        if (idx >= 0) this.windows.splice(idx, 1);
    }

    _wireControls(el, wrapper) {
        // Close button
        const closeBtn = el.querySelector('.panel-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closePanel(wrapper);
            });
        }

        // Minimize button
        const minBtn = el.querySelector('.panel-min');
        if (minBtn) {
            minBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const body = el.querySelector('.panel-body');
                if (body) {
                    const isCollapsed = body.style.display === 'none';
                    body.style.display = isCollapsed ? '' : 'none';
                    minBtn.textContent = isCollapsed ? '−' : '□';
                    // Resize handle visibility
                    const resizer = el.querySelector('.panel-resizer');
                    if (resizer) resizer.style.display = isCollapsed ? 'none' : '';
                }
            });
        }

        // Dragging
        this._makeDraggable(el);

        // Resizing
        const resizer = el.querySelector('.panel-resizer');
        if (resizer) this._makeResizable(el, resizer);
    }

    _makeDraggable(el) {
        const titlebar = el.querySelector('.panel-titlebar');
        if (!titlebar) return;

        let isDragging = false;
        let startX, startY, startLeft, startTop;

        const onPointerDown = (e) => {
            // Ignore if clicking a button or input in the titlebar
            if (e.target.closest('button, input, select')) return;

            isDragging = true;
            const rect = el.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            startLeft = rect.left;
            startTop = rect.top;
            el.style.cursor = 'grabbing';
            el.setPointerCapture(e.pointerId);
        };

        const onPointerMove = (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const containerRect = this.container.getBoundingClientRect();

            let left = startLeft + dx;
            let top = startTop + dy;

            // Clamp to container (with some margin)
            const margin = 20;
            left = Math.max(margin - el.offsetWidth + 60,
                Math.min(containerRect.width - margin, left));
            top = Math.max(margin - 20,
                Math.min(containerRect.height - margin, top));

            el.style.left = left + 'px';
            el.style.top = top + 'px';
        };

        const onPointerUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
            el.style.cursor = '';
            el.releasePointerCapture(e.pointerId);
        };

        titlebar.addEventListener('pointerdown', onPointerDown);
        titlebar.addEventListener('pointermove', onPointerMove);
        titlebar.addEventListener('pointerup', onPointerUp);
        titlebar.addEventListener('pointercancel', onPointerUp);
    }

    _makeResizable(el, handle) {
        let isResizing = false;
        let startX, startY, startW, startH;

        const onPointerDown = (e) => {
            isResizing = true;
            const rect = el.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            startW = rect.width;
            startH = rect.height;
            el.setPointerCapture(e.pointerId);
        };

        const onPointerMove = (e) => {
            if (!isResizing) return;
            const dw = e.clientX - startX;
            const dh = e.clientY - startY;
            const newW = Math.max(this.minWidth, startW + dw);
            const newH = Math.max(this.minHeight, startH + dh);
            el.style.width = newW + 'px';
            el.style.height = newH + 'px';
        };

        const onPointerUp = (e) => {
            if (!isResizing) return;
            isResizing = false;
            el.releasePointerCapture(e.pointerId);
        };

        handle.addEventListener('pointerdown', onPointerDown);
        handle.addEventListener('pointermove', onPointerMove);
        handle.addEventListener('pointerup', onPointerUp);
        handle.addEventListener('pointercancel', onPointerUp);
    }

    _createDefaultWindow() {
        /* Creates a panel window element without requiring a <template> in HTML */
        const el = document.createElement('div');
        el.className = 'builder-panel';
        el.style.cssText = `
            position:absolute; width:260px; min-width:220px;
            border-radius:10px; overflow:hidden;
            background:linear-gradient(180deg,#1a1a2e 0%,#12122a 100%);
            border:1px solid rgba(100,100,200,0.2);
            box-shadow:0 8px 32px rgba(0,0,0,0.5);
            font-family:'Segoe UI',system-ui,sans-serif; font-size:12px; color:#ddd;
            display:flex; flex-direction:column;
        `;

        el.innerHTML = `
            <div class="panel-titlebar" style="
                display:flex; align-items:center; padding:6px 10px;
                background:linear-gradient(90deg,#1e1e3a,#2a1a3e);
                border-bottom:1px solid rgba(100,100,200,0.15);
                cursor:grab; user-select:none; flex-shrink:0;
            ">
                <span class="panel-title" style="
                    flex:1; font-size:11px; font-weight:600;
                    color:#a88bff; letter-spacing:0.3px;
                    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
                "></span>
                <button class="panel-min" style="
                    background:none; border:none; color:#666; cursor:pointer;
                    font-size:12px; padding:0 4px; line-height:1;
                " title="Minimize">−</button>
                <button class="panel-close" style="
                    background:none; border:none; color:#666; cursor:pointer;
                    font-size:12px; padding:0 4px; line-height:1;
                " title="Close">✕</button>
            </div>
            <div class="panel-body" style="
                flex:1; overflow-y:auto; padding:8px 10px;
                min-height:40px;
            "></div>
            <div class="panel-resizer" style="
                width:12px; height:12px; position:absolute;
                bottom:0; right:0; cursor:nwse-resize; touch-action:none;
                background:linear-gradient(135deg,transparent 50%,rgba(100,100,200,0.2) 50%);
            "></div>
        `;

        return el;
    }
}
