const fs = require('fs');
const path = 'C:/Users/dividicus/Downloads/web_cloud_os_by_ou812/apps/sot_visualization.html';
let code = fs.readFileSync(path, 'utf8');

// ── 1. CSS: Add legend export button styles after #legend-popup .lg-header block ──
const cssInsertPoint = `#legend-popup .lg-header {\n    padding:14px 20px; border-bottom:1px solid rgba(0,255,255,0.3);\n}`;
const cssToAdd = `\n#legend-popup .lg-header .lg-export-btn {\n    background:rgba(0,255,255,0.1); border:1px solid rgba(0,255,255,0.3);\n    color:#0ff; cursor:pointer; font-family:'Courier New',monospace; font-size:11px;\n    padding:4px 10px; border-radius:4px; transition:all 0.2s;\n    white-space:nowrap;\n}\n#legend-popup .lg-header .lg-export-btn:hover {\n    background:rgba(0,255,255,0.25); border-color:#0ff;\n}\n#legend-popup .lg-header .lg-export-btn.json-btn { background:rgba(0,255,100,0.1); border-color:rgba(0,255,100,0.3); }\n#legend-popup .lg-header .lg-export-btn.json-btn:hover { background:rgba(0,255,100,0.25); border-color:#0f6; }\n#legend-popup .lg-header .lg-export-btn.pdf-btn { background:rgba(255,100,100,0.1); border-color:rgba(255,100,100,0.3); }\n#legend-popup .lg-header .lg-export-btn.pdf-btn:hover { background:rgba(255,100,100,0.25); border-color:#f66; }`;

if (code.includes(cssInsertPoint)) {
    code = code.replace(cssInsertPoint, cssInsertPoint + cssToAdd);
    console.log('✓ CSS styles added');
} else {
    console.log('✗ CSS insertion point not found');
}

// ── 2. HTML: Add export buttons next to the close button ──
const htmlInsertPoint = `                    <span class="lg-close" id="lg-close">&times;</span>`;
const htmlToAdd = `                    <button class="lg-export-btn json-btn" id="lg-json-btn" title="Download legend as JSON file">📄 JSON</button>\n` +
    `                    <button class="lg-export-btn pdf-btn" id="lg-pdf-btn" title="Open printable legend page (browser Print → Save as PDF)">🖨️ PDF</button>\n` +
    `                    <span class="lg-close" id="lg-close">&times;</span>`;

if (code.includes(htmlInsertPoint)) {
    code = code.replace(htmlInsertPoint, htmlToAdd);
    console.log('✓ HTML buttons added');
} else {
    console.log('✗ HTML insertion point not found');
}

// ── 3. JS: Add export functions before animate() ──
const jsInsertPoint = `// ── Hover tooltips on problem spheres ──`;
const jsToAdd = `
// ── Export Legend Data ──

/** Download legend as a formatted JSON file */
function exportLegendJSON() {
    const data = {
        exportedAt: new Date().toISOString(),
        totalItems: Object.keys(LEGEND_DATA).reduce((sum, k) => sum + LEGEND_DATA[k].items.length, 0),
        ...LEGEND_DATA
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sot_legend_' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/** Open a printable HTML page with all legend data for browser Print → Save as PDF */
function exportLegendPDF() {
    let html = \`<!DOCTYPE html><html><head><meta charset="utf-8"><title>SOT Visualization Legend</title>
<style>
    @page { margin: 1.5cm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',Arial,sans-serif; background:#0a0e1a; color:#c8d6e5; padding:30px; }
    h1 { color:#0ff; font-size:24px; border-bottom:2px solid #0ff; padding-bottom:8px; margin-bottom:20px; }
    h2 { color:#0ff; font-size:18px; margin:24px 0 12px; padding-bottom:4px; border-bottom:1px solid rgba(0,255,255,0.3); }
    .cat-count { color:#889; font-size:13px; margin-bottom:16px; }
    .item { background:rgba(255,255,255,0.04); border:1px solid rgba(0,255,255,0.15); border-radius:6px; padding:12px 14px; margin-bottom:10px; }
    .item h3 { color:#fff; font-size:15px; margin-bottom:4px; }
    .item .thumb { font-size:20px; margin-right:6px; }
    .item .desc { color:#aab; font-size:13px; margin-bottom:4px; line-height:1.5; }
    .item .purpose { color:#0ff; font-size:12px; margin-bottom:2px; }
    .item .premise { color:#ffa; font-size:12px; padding-left:10px; border-left:2px solid rgba(255,255,170,0.4); margin-bottom:2px; }
    .item .data { color:#6af; font-size:11px; }
    .item .color-dot { display:inline-block; width:12px; height:12px; border-radius:50%; vertical-align:middle; margin-right:6px; }
    .footer { margin-top:30px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.1); font-size:11px; color:#667; text-align:center; }
    @media print {
        body { background:#fff; color:#333; }
        h1, h2, .item .purpose { color:#069; }
        .item { background:#f5f9ff; border-color:#9cf; }
        .item h3 { color:#000; }
        .item .premise { color:#960; }
        .item .data { color:#069; }
        .item .desc { color:#555; }
    }
</style></head><body>
<h1>🔬 SOT Visualization Legend</h1>
<p class="cat-count">Generated: \${new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>\`;

    const tabKeys = Object.keys(LEGEND_DATA);
    tabKeys.forEach((key, ki) => {
        const tab = LEGEND_DATA[key];
        html += \`<h2>\${tab.label}</h2>\`;
        html += \`<p class="cat-count">\${tab.items.length} entr\${tab.items.length === 1 ? 'y' : 'ies'}</p>\`;
        tab.items.forEach((item, ii) => {
            html += '<div class="item">';
            html += \`<h3><span class="thumb">\${item.thumb}</span> \${item.name}</h3>\`;
            if (item.color) html += \`<div style="margin-bottom:4px;"><span class="color-dot" style="background:\${item.color}"></span> Color: \${item.color}</div>\`;
            if (item.desc) html += \`<div class="desc">\${item.desc}</div>\`;
            if (item.purpose) html += \`<div class="purpose">🎯 Purpose: \${item.purpose}</div>\`;
            if (item.premise) html += \`<div class="premise">💡 Premise: \${item.premise}</div>\`;
            if (item.data) html += \`<div class="data">📊 \${item.data}</div>\`;
            if (item.obstruction !== undefined) html += \`<div class="data">🔒 Obstruction: \${item.obstruction}</div>\`;
            if (item.position) html += \`<div class="data">📍 Position: \${item.position}</div>\`;
            if (item.corridor) html += \`<div class="data">🏰 Corridor: \${item.corridor}</div>\`;
            html += '</div>';
        });
    });

    html += \`<div class="footer">SOT Visualization — State of the Art visualization of unsolved mathematical problems</div>
</body></html>\`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    // Auto-trigger print after content loads
    setTimeout(() => { win.focus(); win.print(); }, 500);
}

// ── Wire export buttons ──
document.getElementById('lg-json-btn').addEventListener('click', exportLegendJSON);
document.getElementById('lg-pdf-btn').addEventListener('click', exportLegendPDF);

`;

if (code.includes(jsInsertPoint)) {
    code = code.replace(jsInsertPoint, jsToAdd + '\n' + jsInsertPoint);
    console.log('✓ JS export functions added');
} else {
    console.log('✗ JS insertion point not found. Searching...');
    const idx = code.indexOf('Hover tooltips on problem spheres');
    if (idx > -1) {
        console.log('Found at index:', idx);
        console.log('Context:', code.substring(idx, idx + 100));
    }
}

fs.writeFileSync(path, code, 'utf8');
console.log('✓ File saved');
