/*
  Simple NotificationManager: pools DOM nodes, enforces max concurrent toasts,
  rate-limits new notifications, and provides notify(message, { timeout, type, persistent }).
*/
export class NotificationManager {
    constructor(opts = {}) {
        this.maxConcurrent = opts.maxConcurrent || 3;
        this.minIntervalMs = opts.minIntervalMs || 250;
        this.containerId = opts.containerId || 'notification-container';
        this.queue = [];
        this.active = 0;
        this._lastTime = 0;

        // create container
        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = this.containerId;
            this.container.style.position = 'fixed';
            this.container.style.right = '12px';
            this.container.style.bottom = '12px';
            this.container.style.display = 'flex';
            this.container.style.flexDirection = 'column';
            this.container.style.gap = '8px';
            this.container.style.zIndex = '99999';
            document.body.appendChild(this.container);
        }

        // simple pool of elements to reuse
        this.pool = [];
    }

    _createNode() {
        const n = document.createElement('div');
        n.style.minWidth = '140px';
        n.style.maxWidth = '320px';
        n.style.background = 'linear-gradient(90deg, rgba(20,20,20,0.95), rgba(40,40,40,0.95))';
        n.style.color = '#fff';
        n.style.padding = '8px 12px';
        n.style.borderRadius = '8px';
        n.style.boxShadow = '0 6px 18px rgba(0,0,0,0.5)';
        n.style.fontSize = '13px';
        n.style.pointerEvents = 'auto';
        n.style.opacity = '0';
        n.style.transition = 'opacity 220ms, transform 220ms';
        n.style.transform = 'translateY(8px)';
        return n;
    }

    notify(message, opts = {}) {
        const now = Date.now();
        // rate-limit
        if (now - this._lastTime < this.minIntervalMs) {
            // enqueue for later
            this.queue.push({ message, opts });
            setTimeout(() => this._flushQueue(), this.minIntervalMs);
            return;
        }
        this._lastTime = now;

        if (this.active >= this.maxConcurrent) {
            // enqueue for later
            this.queue.push({ message, opts });
            return;
        }

        this._show(message, opts);
    }

    _flushQueue() {
        if (!this.queue.length) return;
        if (this.active >= this.maxConcurrent) return;
        const item = this.queue.shift();
        if (!item) return;
        this._show(item.message, item.opts);
    }

    _show(message, opts = {}) {
        const node = this.pool.pop() || this._createNode();
        node.innerText = message;
        // style by type
        if (opts.type === 'warn') {
            node.style.border = '2px solid rgba(255,200,80,0.12)';
        } else if (opts.type === 'error') {
            node.style.border = '2px solid rgba(255,80,80,0.12)';
        } else {
            node.style.border = '2px solid rgba(255,255,255,0.04)';
        }

        this.container.appendChild(node);
        // animate in
        requestAnimationFrame(() => {
            node.style.opacity = '1';
            node.style.transform = 'translateY(0)';
        });

        this.active++;
        const timeout = (opts.persistent ? 0 : (opts.timeout || 1800));
        if (timeout > 0) {
            setTimeout(() => this._hide(node), timeout);
        }
        // If persistent, provide a manual dismiss after a longer period to avoid permanent nodes
        if (opts.persistent) {
            setTimeout(() => this._hide(node), opts.maxPersistentTimeout || 15000);
        }
    }

    _hide(node) {
        try {
            node.style.opacity = '0';
            node.style.transform = 'translateY(8px)';
            setTimeout(() => {
                try {
                    if (node.parentNode === this.container) this.container.removeChild(node);
                    this.pool.push(node);
                    this.active = Math.max(0, this.active - 1);
                    // try to flush queue
                    this._flushQueue();
                } catch (e) {}
            }, 240);
        } catch (e) {
            try { if (node.parentNode === this.container) node.parentNode.removeChild(node); } catch(e){}
            this.active = Math.max(0, this.active - 1);
            this._flushQueue();
        }
    }
}