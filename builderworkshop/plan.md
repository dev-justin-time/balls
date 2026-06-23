<!DOCTYPE html>

<html class="dark" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Studio Pro 3D Workspace - Loading Mesh</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&amp;family=Geist:wght@400;600;700&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<script id="tailwind-config">
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    "colors": {
                        "on-surface": "#e5e1e4",
                        "on-secondary-fixed": "#2c0051",
                        "secondary-fixed": "#f0dbff",
                        "tertiary-fixed-dim": "#ffb786",
                        "on-surface-variant": "#c2c6d6",
                        "on-primary-fixed-variant": "#004395",
                        "on-tertiary-fixed": "#311400",
                        "on-error": "#690005",
                        "background": "#131315",
                        "primary-container": "#4d8eff",
                        "tertiary": "#ffb786",
                        "surface-container-highest": "#353437",
                        "surface-container-lowest": "#0e0e10",
                        "error": "#ffb4ab",
                        "surface-dim": "#131315",
                        "surface-container-high": "#2a2a2c",
                        "surface": "#131315",
                        "surface-container-low": "#1c1b1d",
                        "on-primary": "#002e6a",
                        "inverse-primary": "#005ac2",
                        "tertiary-container": "#df7412",
                        "on-tertiary-container": "#461f00",
                        "surface-tint": "#adc6ff",
                        "primary": "#adc6ff",
                        "outline-variant": "#424754",
                        "primary-fixed-dim": "#adc6ff",
                        "surface-bright": "#39393b",
                        "surface-variant": "#353437",
                        "on-error-container": "#ffdad6",
                        "on-primary-fixed": "#001a42",
                        "on-background": "#e5e1e4",
                        "on-primary-container": "#00285d",
                        "inverse-on-surface": "#313032",
                        "secondary-container": "#6f00be",
                        "on-secondary": "#490080",
                        "error-container": "#93000a",
                        "surface-container": "#201f22",
                        "primary-fixed": "#d8e2ff",
                        "on-secondary-container": "#d6a9ff",
                        "secondary-fixed-dim": "#ddb7ff",
                        "on-tertiary-fixed-variant": "#723600",
                        "inverse-surface": "#e5e1e4",
                        "on-tertiary": "#502400",
                        "tertiary-fixed": "#ffdcc6",
                        "on-secondary-fixed-variant": "#6900b3",
                        "outline": "#8c909f",
                        "secondary": "#ddb7ff"
                    },
                    "borderRadius": {
                        "DEFAULT": "0.125rem",
                        "lg": "0.25rem",
                        "xl": "0.5rem",
                        "full": "0.75rem"
                    },
                    "spacing": {
                        "container_padding": "24px",
                        "unit": "4px",
                        "gutter": "16px",
                        "sidebar_width": "280px",
                        "toolbar_width": "64px"
                    },
                    "fontFamily": {
                        "body-base": ["Geist"],
                        "headline-md": ["Geist"],
                        "label-mono": ["JetBrains Mono"],
                        "label-caps": ["Geist"],
                        "headline-md-mobile": ["Geist"],
                        "display-lg": ["Geist"],
                        "body-sm": ["Geist"]
                    },
                    "fontSize": {
                        "body-base": ["16px", {"lineHeight": "24px", "fontWeight": "400"}],
                        "headline-md": ["24px", {"lineHeight": "32px", "letterSpacing": "-0.02em", "fontWeight": "600"}],
                        "label-mono": ["12px", {"lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "500"}],
                        "label-caps": ["11px", {"lineHeight": "12px", "letterSpacing": "0.1em", "fontWeight": "700"}],
                        "headline-md-mobile": ["20px", {"lineHeight": "28px", "fontWeight": "600"}],
                        "display-lg": ["48px", {"lineHeight": "56px", "letterSpacing": "-0.04em", "fontWeight": "700"}],
                        "body-sm": ["14px", {"lineHeight": "20px", "fontWeight": "400"}]
                    }
                },
            },
        }
    </script>
<style>
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
            display: inline-block;
            line-height: 1;
            text-transform: none;
            letter-spacing: normal;
            word-wrap: normal;
            white-space: nowrap;
            direction: ltr;
        }

        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }

        .animate-shimmer {
            animation: shimmer 2s infinite linear;
        }

        @keyframes pulse-subtle {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }

        .animate-pulse-subtle {
            animation: pulse-subtle 3s ease-in-out infinite;
        }

        .glass-panel {
            background: rgba(28, 27, 29, 0.6);
            backdrop-filter: blur(24px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .luminous-border {
            position: relative;
            overflow: hidden;
        }

        .luminous-border::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(173, 198, 255, 0.5), transparent);
            animation: shimmer 3s infinite;
        }

        .mesh-grid {
            background-image: 
                linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
            background-size: 40px 40px;
        }
    </style>
</head>
<body class="bg-background text-on-surface font-body-base overflow-hidden h-screen w-screen">
<!-- Deep Space Shader Background (from SCREEN_5) -->

<!-- Perspective Grid Overlay -->
<div class="absolute inset-0 mesh-grid z-0 opacity-20 pointer-events-none"></div>
<!-- TopNavBar -->
<nav class="fixed top-4 left-4 right-4 rounded-full bg-background/80 backdrop-blur-xl border border-white/10 shadow-[0_0_15px_rgba(173,198,255,0.1)] flex justify-between items-center h-toolbar_width px-gutter z-40">
<div class="flex items-center gap-4">
<span class="font-headline-md text-headline-md font-bold text-on-background tracking-tight">Studio Pro 3D Workspace</span>
<div class="h-4 w-[1px] bg-white/10 mx-2"></div>
<div class="flex gap-4">
<span class="text-primary border-b-2 border-primary font-label-caps text-label-caps cursor-pointer">Viewport</span>
<span class="text-on-surface-variant hover:bg-white/5 transition-colors font-label-caps text-label-caps cursor-pointer px-2 py-1 rounded">Assets</span>
<span class="text-on-surface-variant hover:bg-white/5 transition-colors font-label-caps text-label-caps cursor-pointer px-2 py-1 rounded">Nodes</span>
</div>
</div>
<div class="flex items-center gap-4">
<button class="bg-primary/10 text-primary px-4 py-1.5 rounded-full font-label-caps text-label-caps border border-primary/20 hover:bg-primary/20 transition-all active:scale-95">
                Run Resource Agent
            </button>
<div class="flex gap-2">
<button class="text-on-surface-variant hover:bg-white/5 p-2 rounded-full transition-colors active:scale-95">
<span class="material-symbols-outlined">settings</span>
</button>
<button class="text-on-surface-variant hover:bg-white/5 p-2 rounded-full transition-colors active:scale-95">
<span class="material-symbols-outlined">account_circle</span>
</button>
</div>
</div>
</nav>
<!-- SideNavBar (Left) -->
<aside class="fixed left-4 top-20 bottom-4 w-sidebar_width rounded-xl bg-surface-container-low/60 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col py-gutter z-30">
<div class="px-gutter mb-6">
<div class="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5">
<div class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/40 relative">
<span class="material-symbols-outlined text-primary" style="font-variation-settings: 'FILL' 1;">psychology</span>
<div class="absolute -bottom-1 -right-1 w-3 h-3 bg-tertiary rounded-full border-2 border-surface shadow-[0_0_8px_rgba(255,183,134,0.6)] animate-pulse"></div>
</div>
<div>
<div class="font-label-caps text-label-caps text-secondary">Resource Agent</div>
<div class="font-body-sm text-body-sm text-on-surface-variant">Processing...</div>
</div>
</div>
</div>
<div class="flex-1 flex flex-col gap-1 px-2">
<!-- Nav Items -->
<div class="flex items-center gap-3 p-3 rounded-lg bg-primary/10 text-primary border-r-2 border-primary shadow-[0_0_15px_rgba(59,130,246,0.5)] cursor-pointer">
<span class="material-symbols-outlined">box</span>
<span class="font-body-sm text-body-sm">Mesh Operations</span>
</div>
<div class="flex items-center gap-3 p-3 rounded-lg text-on-surface-variant hover:bg-white/5 transition-colors cursor-pointer">
<span class="material-symbols-outlined">accessibility_new</span>
<span class="font-body-sm text-body-sm">Rigging</span>
</div>
<div class="flex items-center gap-3 p-3 rounded-lg text-on-surface-variant hover:bg-white/5 transition-colors cursor-pointer">
<span class="material-symbols-outlined">input</span>
<span class="font-body-sm text-body-sm">Model Input</span>
</div>
<div class="flex items-center gap-3 p-3 rounded-lg text-on-surface-variant hover:bg-white/5 transition-colors cursor-pointer">
<span class="material-symbols-outlined">psychology</span>
<span class="font-body-sm text-body-sm">Agent Status</span>
</div>
</div>
<div class="px-4 mt-auto">
<button class="w-full bg-primary text-on-primary font-label-caps text-label-caps py-3 rounded-lg hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(173,198,255,0.3)]">
                Optimize Mesh
            </button>
</div>
</aside>
<!-- BottomNavBar (Toolbar) -->
<div class="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full px-6 py-2 bg-surface-container-highest/40 backdrop-blur-lg border border-white/20 shadow-lg flex gap-8 items-center z-50">
<div class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-on-surface transition-transform hover:scale-110 cursor-pointer active:scale-90">
<span class="material-symbols-outlined">grid_on</span>
<span class="font-label-mono text-label-mono uppercase">Snap</span>
</div>
<div class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-on-surface transition-transform hover:scale-110 cursor-pointer active:scale-90">
<span class="material-symbols-outlined">open_with</span>
<span class="font-label-mono text-label-mono uppercase">Gizmo</span>
</div>
<div class="h-8 w-[1px] bg-white/10"></div>
<div class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-on-surface transition-transform hover:scale-110 cursor-pointer active:scale-90">
<span class="material-symbols-outlined">undo</span>
<span class="font-label-mono text-label-mono uppercase">Undo</span>
</div>
<div class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-on-surface transition-transform hover:scale-110 cursor-pointer active:scale-90">
<span class="material-symbols-outlined">redo</span>
<span class="font-label-mono text-label-mono uppercase">Redo</span>
</div>
</div>
<!-- MAIN LOADING OVERLAY (FOCAL POINT) -->
<div class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
<div class="w-[480px] glass-panel rounded-2xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col items-center text-center pointer-events-auto relative overflow-hidden group">
<!-- Animated shimmer accent on top border -->
<div class="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent animate-shimmer opacity-60"></div>
<!-- Icon -->
<div class="mb-6 relative">
<div class="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 text-primary">
<span class="material-symbols-outlined text-4xl animate-pulse-subtle">deployed_code</span>
</div>
<div class="absolute -top-2 -right-2 px-2 py-0.5 rounded bg-tertiary text-on-tertiary font-label-caps text-[9px] tracking-widest shadow-lg">
                    HIGH-POLY
                </div>
</div>
<!-- Loading Info -->
<h2 class="font-headline-md text-headline-md text-on-surface mb-2">Loading High-Poly Mesh...</h2>
<p class="font-body-sm text-body-sm text-on-surface-variant mb-8 px-8">Preparing geometry buffers and calculating vertex normals for 4.2M polygons. This may take a moment.</p>
<!-- High-Fidelity Progress Bar -->
<div class="w-full mb-8">
<div class="flex justify-between font-label-mono text-label-mono text-primary mb-2">
<span class="uppercase tracking-widest">Processing Buffers</span>
<span>65%</span>
</div>
<div class="h-2 w-full bg-surface-container-highest rounded-full overflow-hidden p-[1px] border border-white/5">
<div class="h-full w-[65%] bg-gradient-to-r from-primary-container to-primary rounded-full relative shadow-[0_0_12px_rgba(173,198,255,0.4)]">
<!-- Moving light glare on bar -->
<div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-1/2 -skew-x-12 animate-shimmer"></div>
</div>
</div>
</div>
<!-- Action Area -->
<div class="w-full flex items-center justify-center gap-4">
<button class="px-8 py-2.5 rounded-lg font-label-caps text-label-caps border border-outline-variant hover:bg-white/5 text-on-surface-variant transition-all active:scale-95">
                    Cancel
                </button>
</div>
<!-- Atmospheric Pulse Background (Inner Modal) -->
<div class="absolute -bottom-24 -right-24 w-64 h-64 bg-primary/5 rounded-full blur-[80px] pointer-events-none"></div>
<div class="absolute -top-24 -left-24 w-64 h-64 bg-secondary/5 rounded-full blur-[80px] pointer-events-none"></div>
</div>
</div>
<!-- Hidden Scenegraph Panel (Background reference) -->
<aside class="fixed right-4 top-20 bottom-4 w-sidebar_width rounded-xl bg-surface-container-low/60 backdrop-blur-2xl border border-white/10 p-gutter z-30 opacity-40 select-none">
<div class="font-label-caps text-label-caps text-on-surface-variant mb-4 flex justify-between">
<span>Scene Graph</span>
<span class="material-symbols-outlined text-sm">filter_list</span>
</div>
<div class="space-y-1">
<div class="flex items-center gap-2 p-1.5 text-on-surface-variant opacity-50">
<span class="material-symbols-outlined text-sm">keyboard_arrow_down</span>
<span class="material-symbols-outlined text-sm">inventory_2</span>
<span class="font-body-sm text-body-sm">Main_Assembly</span>
</div>
<div class="flex items-center gap-2 p-1.5 ml-4 bg-primary/10 text-primary border-l border-primary">
<span class="material-symbols-outlined text-sm">box</span>
<span class="font-body-sm text-body-sm">Active_Mesh_Proxy</span>
</div>
<div class="flex items-center gap-2 p-1.5 ml-4 text-on-surface-variant opacity-50">
<span class="material-symbols-outlined text-sm">lightbulb</span>
<span class="font-body-sm text-body-sm">Primary_Key_Light</span>
</div>
<div class="flex items-center gap-2 p-1.5 ml-4 text-on-surface-variant opacity-50">
<span class="material-symbols-outlined text-sm">videocam</span>
<span class="font-body-sm text-body-sm">Perspective_Camera</span>
</div>
</div>
</aside>
<!-- Background Decoration for Viewport (Mock Content) -->
<div class="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
<div class="w-[600px] h-[600px] border border-primary/5 rounded-full animate-pulse-subtle"></div>
<div class="absolute w-[400px] h-[400px] border border-secondary/5 rounded-full"></div>
</div>
</body></html>///////////////////////
///////////////////////////////////

<!DOCTYPE html>

<html class="dark" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Studio Pro 3D Workspace - Active Selection</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<style>
        :root {
            --primary-glow: rgba(173, 198, 255, 0.5);
            --electric-blue: rgba(59, 130, 246, 0.8);
            --cyber-purple: rgba(111, 0, 190, 0.6);
        }
        body {
            background-color: #131315;
            color: #e5e1e4;
            overflow: hidden;
            font-family: 'Inter', sans-serif;
        }
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
        .glass-panel {
            backdrop-filter: blur(24px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .shimmer-border {
            position: relative;
            overflow: hidden;
        }
        .shimmer-border::after {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: linear-gradient(
                45deg,
                transparent,
                rgba(255, 255, 255, 0.05),
                transparent
            );
            transform: rotate(45deg);
            animation: shimmer 6s infinite linear;
        }
        @keyframes shimmer {
            0% { transform: translateX(-100%) rotate(45deg); }
            100% { transform: translateX(100%) rotate(45deg); }
        }
        @keyframes breath {
            0%, 100% { opacity: 0.4; box-shadow: 0 0 10px var(--cyber-purple); }
            50% { opacity: 1; box-shadow: 0 0 25px var(--cyber-purple); }
        }
        .animate-status-breath {
            animation: breath 2s ease-in-out infinite;
        }
        .active-selection-glow {
            box-shadow: 0 0 20px var(--electric-blue);
            border: 2px solid #adc6ff !important;
            filter: brightness(1.2);
        }
    </style>
<script id="tailwind-config">
        tailwind.config = {
          darkMode: "class",
          theme: {
            extend: {
              "colors": {
                      "on-surface": "#e5e1e4",
                      "on-secondary-fixed": "#2c0051",
                      "secondary-fixed": "#f0dbff",
                      "tertiary-fixed-dim": "#ffb786",
                      "on-surface-variant": "#c2c6d6",
                      "on-primary-fixed-variant": "#004395",
                      "on-tertiary-fixed": "#311400",
                      "on-error": "#690005",
                      "background": "#131315",
                      "primary-container": "#4d8eff",
                      "tertiary": "#ffb786",
                      "surface-container-highest": "#353437",
                      "surface-container-lowest": "#0e0e10",
                      "error": "#ffb4ab",
                      "surface-dim": "#131315",
                      "surface-container-high": "#2a2a2c",
                      "surface": "#131315",
                      "surface-container-low": "#1c1b1d",
                      "on-primary": "#002e6a",
                      "inverse-primary": "#005ac2",
                      "tertiary-container": "#df7412",
                      "on-tertiary-container": "#461f00",
                      "surface-tint": "#adc6ff",
                      "primary": "#adc6ff",
                      "outline-variant": "#424754",
                      "primary-fixed-dim": "#adc6ff",
                      "surface-bright": "#39393b",
                      "surface-variant": "#353437",
                      "on-error-container": "#ffdad6",
                      "on-primary-fixed": "#001a42",
                      "on-background": "#e5e1e4",
                      "on-primary-container": "#00285d",
                      "inverse-on-surface": "#313032",
                      "secondary-container": "#6f00be",
                      "on-secondary": "#490080",
                      "error-container": "#93000a",
                      "surface-container": "#201f22",
                      "primary-fixed": "#d8e2ff",
                      "on-secondary-container": "#d6a9ff",
                      "secondary-fixed-dim": "#ddb7ff",
                      "on-tertiary-fixed-variant": "#723600",
                      "inverse-surface": "#e5e1e4",
                      "on-tertiary": "#502400",
                      "tertiary-fixed": "#ffdcc6",
                      "on-secondary-fixed-variant": "#6900b3",
                      "outline": "#8c909f",
                      "secondary": "#ddb7ff"
              },
              "borderRadius": {
                      "DEFAULT": "0.125rem",
                      "lg": "0.25rem",
                      "xl": "0.5rem",
                      "full": "0.75rem"
              },
              "spacing": {
                      "container_padding": "24px",
                      "unit": "4px",
                      "gutter": "16px",
                      "sidebar_width": "280px",
                      "toolbar_width": "64px"
              },
              "fontFamily": {
                      "body-base": ["Geist"],
                      "headline-md": ["Geist"],
                      "label-mono": ["JetBrains Mono"],
                      "label-caps": ["Geist"],
                      "body-sm": ["Geist"]
              },
              "fontSize": {
                      "body-base": ["16px", {"lineHeight": "24px", "fontWeight": "400"}],
                      "headline-md": ["24px", {"lineHeight": "32px", "letterSpacing": "-0.02em", "fontWeight": "600"}],
                      "label-mono": ["12px", {"lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "500"}],
                      "label-caps": ["11px", {"lineHeight": "12px", "letterSpacing": "0.1em", "fontWeight": "700"}],
                      "body-sm": ["14px", {"lineHeight": "20px", "fontWeight": "400"}]
              }
            }
          }
        }
    </script>
</head>
<body class="h-screen w-screen relative select-none">
<!-- Viewport Background Shader -->

<!-- TopNavBar -->
<header class="fixed top-4 left-4 right-4 rounded-full bg-background/80 backdrop-blur-xl border border-white/10 shadow-[0_0_15px_rgba(173,198,255,0.1)] flex justify-between items-center h-toolbar_width px-gutter w-auto z-50">
<div class="flex items-center gap-4">
<span class="font-headline-md text-headline-md font-bold text-on-background tracking-tight">Studio Pro 3D Workspace</span>
<nav class="hidden md:flex gap-6 ml-8">
<a class="text-primary border-b-2 border-primary font-body-sm text-body-sm px-1 py-1" href="#">Editor</a>
<a class="text-on-surface-variant hover:bg-white/5 transition-colors font-body-sm text-body-sm px-1 py-1 rounded" href="#">Assets</a>
<a class="text-on-surface-variant hover:bg-white/5 transition-colors font-body-sm text-body-sm px-1 py-1 rounded" href="#">Render</a>
</nav>
</div>
<div class="flex items-center gap-3">
<button class="bg-primary text-on-primary font-label-caps text-label-caps px-4 py-2 rounded-full active:scale-95 duration-200 transition-all hover:brightness-110">
                Run Resource Agent
            </button>
<div class="flex gap-2 text-on-surface-variant">
<button class="p-2 hover:bg-white/5 rounded-full transition-colors"><span class="material-symbols-outlined">settings</span></button>
<button class="p-2 hover:bg-white/5 rounded-full transition-colors"><span class="material-symbols-outlined">account_circle</span></button>
</div>
</div>
</header>
<!-- SideNavBar (Left) -->
<aside class="fixed left-4 top-20 bottom-4 w-sidebar_width rounded-xl bg-surface-container-low/60 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col py-gutter h-auto z-40 overflow-hidden">
<div class="px-6 mb-6">
<div class="flex items-center gap-3 mb-2">
<div class="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center overflow-hidden border border-white/20">
<img class="w-full h-full object-cover" data-alt="A futuristic AI avatar portrait with neon purple circuitry patterns across a sleek metallic facial structure, set against a dark cinematic background with deep blues and purples. The lighting is dramatic and high-contrast, emphasizing the technical precision of the studio environment." src="https://lh3.googleusercontent.com/aida-public/AB6AXuBKZ6Sp2rtwnqBdlJwtrgPoT2zlzIle3N3il93z2qx1GgfeF1w3Xwy5nF3wqoZTvwu_f46sO3YCJZEDgvrgxyDMs7LpV_7gAlzSnyNlHtS245bRZbAULNR6l1DqHCoKE-TH-Qs8YwEty_jWXwsuwL5X0LfTPTN-vL4kpiz23jOurZ9yxG74U6LbeNIPNCCswMWuMF6iXyiuO2uX9YTwfHyHQVA-k-yxohVJxx8mj_x-FdaxwjHJGza1JFA33MSYMHkcz287GRqMLUO2"/>
</div>
<div>
<h3 class="font-label-caps text-label-caps text-secondary uppercase">Resource Agent</h3>
<div class="flex items-center gap-1.5">
<div class="w-2 h-2 rounded-full bg-secondary animate-status-breath"></div>
<span class="font-body-sm text-body-sm text-on-surface-variant">Processing...</span>
</div>
</div>
</div>
</div>
<nav class="flex-1 space-y-1 px-2 overflow-y-auto">
<!-- Active Tab: Mesh Operations -->
<div class="bg-primary/10 text-primary border-r-2 border-primary shadow-[0_0_15px_rgba(59,130,246,0.5)] flex items-center gap-3 px-4 py-3 cursor-pointer group">
<span class="material-symbols-outlined" data-icon="vbox">box</span>
<span class="font-body-sm text-body-sm font-semibold">Mesh Operations</span>
</div>
<!-- Other Tabs -->
<div class="text-on-surface-variant hover:bg-white/5 flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors">
<span class="material-symbols-outlined" data-icon="accessibility_new">accessibility_new</span>
<span class="font-body-sm text-body-sm">Rigging</span>
</div>
<div class="text-on-surface-variant hover:bg-white/5 flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors">
<span class="material-symbols-outlined" data-icon="input">input</span>
<span class="font-body-sm text-body-sm">Model Input</span>
</div>
<div class="text-on-surface-variant hover:bg-white/5 flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors">
<span class="material-symbols-outlined" data-icon="psychology">psychology</span>
<span class="font-body-sm text-body-sm">Agent Status</span>
</div>
<!-- Operations Content (Custom Section for Active Mesh Ops) -->
<div class="mt-6 px-4 space-y-3">
<p class="font-label-caps text-label-caps text-on-surface-variant/60 ml-2">QUICK ACTIONS</p>
<!-- ACTIVE Selection States -->
<button class="w-full active-selection-glow bg-primary/20 backdrop-blur-md rounded-lg p-3 flex flex-col items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95 group">
<span class="material-symbols-outlined text-primary scale-110" data-icon="auto_awesome_motion">auto_awesome_motion</span>
<span class="font-label-mono text-label-mono text-primary">Mirror Mesh</span>
</button>
<button class="w-full active-selection-glow bg-primary/20 backdrop-blur-md rounded-lg p-3 flex flex-col items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95 group">
<span class="material-symbols-outlined text-primary scale-110" data-icon="content_copy">content_copy</span>
<span class="font-label-mono text-label-mono text-primary">Clone Object</span>
</button>
<!-- Normal States -->
<button class="w-full bg-white/5 border border-white/10 rounded-lg p-3 flex flex-col items-center justify-center gap-2 transition-all hover:bg-white/10 active:scale-95">
<span class="material-symbols-outlined text-on-surface-variant" data-icon="layers">layers</span>
<span class="font-label-mono text-label-mono text-on-surface-variant">Boolean</span>
</button>
<button class="w-full bg-white/5 border border-white/10 rounded-lg p-3 flex flex-col items-center justify-center gap-2 transition-all hover:bg-white/10 active:scale-95">
<span class="material-symbols-outlined text-on-surface-variant" data-icon="grain">grain</span>
<span class="font-label-mono text-label-mono text-on-surface-variant">Decimate</span>
</button>
</div>
</nav>
<div class="mt-auto px-4 pb-4">
<button class="w-full py-3 bg-primary text-on-primary font-label-caps text-label-caps rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_20px_rgba(173,198,255,0.3)]">
                Optimize Mesh
            </button>
</div>
</aside>
<!-- Main Viewport Overlay UI (Right Sidebar - Scene Graph) -->
<aside class="fixed right-4 top-20 bottom-24 w-sidebar_width rounded-xl bg-surface-container-low/60 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col p-4 z-40">
<h2 class="font-label-caps text-label-caps text-on-surface-variant mb-4">SCENE GRAPH</h2>
<div class="flex-1 overflow-y-auto space-y-1">
<!-- Scene Items -->
<div class="flex items-center gap-2 p-1 text-on-surface-variant font-body-sm text-body-sm hover:bg-white/5 rounded">
<span class="material-symbols-outlined text-[16px]">expand_more</span>
<span class="material-symbols-outlined text-[18px]">account_tree</span>
<span>Root_Container</span>
</div>
<div class="ml-4 flex items-center gap-2 p-1 text-on-surface-variant font-body-sm text-body-sm hover:bg-white/5 rounded">
<span class="material-symbols-outlined text-[16px]">expand_more</span>
<span class="material-symbols-outlined text-[18px]">light_mode</span>
<span>Environment_Lights</span>
</div>
<div class="ml-4 bg-primary/10 text-primary p-1 rounded flex items-center gap-2 font-body-sm text-body-sm relative">
<div class="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
<span class="material-symbols-outlined text-[16px]">chevron_right</span>
<span class="material-symbols-outlined text-[18px]">category</span>
<span>Active_Mesh_01</span>
<span class="ml-auto material-symbols-outlined text-[14px]">visibility</span>
</div>
<div class="ml-8 border-l border-white/10 pl-2">
<div class="flex items-center gap-2 p-1 text-on-surface-variant font-body-sm text-body-sm opacity-60">
<span class="w-1 h-1 rounded-full bg-white/20"></span>
<span>VertexData</span>
</div>
<div class="flex items-center gap-2 p-1 text-on-surface-variant font-body-sm text-body-sm opacity-60">
<span class="w-1 h-1 rounded-full bg-white/20"></span>
<span>Material_Shader_FX</span>
</div>
</div>
</div>
</aside>
<!-- BottomNavBar (Toolbar) -->
<nav class="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full px-6 py-2 bg-surface-container-highest/40 backdrop-blur-lg border border-white/20 shadow-lg flex gap-8 items-center z-50">
<button class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-on-surface transition-transform hover:scale-110 active:scale-90 group">
<span class="material-symbols-outlined" data-icon="grid_on">grid_on</span>
<span class="font-label-mono text-label-mono">Snap</span>
</button>
<!-- ACTIVE Toggle: Gizmo -->
<button class="flex flex-col items-center gap-1 text-primary-container drop-shadow-[0_0_8px_rgba(173,198,255,0.6)] transition-transform hover:scale-110 active:scale-90 group">
<span class="material-symbols-outlined" data-icon="open_with" style="font-variation-settings: 'FILL' 1;">open_with</span>
<span class="font-label-mono text-label-mono">Gizmo</span>
<div class="w-1 h-1 bg-primary rounded-full mt-0.5"></div>
</button>
<button class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-on-surface transition-transform hover:scale-110 active:scale-90 group">
<span class="material-symbols-outlined" data-icon="undo">undo</span>
<span class="font-label-mono text-label-mono">Undo</span>
</button>
<button class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-on-surface transition-transform hover:scale-110 active:scale-90 group">
<span class="material-symbols-outlined" data-icon="redo">redo</span>
<span class="font-label-mono text-label-mono">Redo</span>
</button>
</nav>
<!-- Viewport Floating Widgets (Contextual Info) -->
<div class="fixed bottom-24 right-4 bg-surface-container-low/40 backdrop-blur-xl border border-white/10 p-3 rounded-xl flex items-center gap-4 z-40">
<div class="text-right">
<p class="font-label-mono text-[10px] text-on-surface-variant/50">VERTS</p>
<p class="font-label-mono text-body-sm text-primary">2,401,922</p>
</div>
<div class="w-[1px] h-8 bg-white/10"></div>
<div class="text-right">
<p class="font-label-mono text-[10px] text-on-surface-variant/50">FPS</p>
<p class="font-label-mono text-body-sm text-tertiary">144.2</p>
</div>
</div>
<!-- UI Interaction Script -->
<script>
        // Simple logic for subtle hover effects and atmospheric pulses
        document.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                // Subtle interaction sound or feedback could go here
            });
        });

        // Initialize Material Symbols correctly
        window.addEventListener('DOMContentLoaded', () => {
            console.log('Studio Pro Workspace Loaded');
        });
    </script>
</body></html>

////////////////////////////////////////////////////

<!DOCTYPE html>

<html class="dark" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&amp;family=Inter:wght@400;500;600;700&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<style>
        :root {
            --primary-glow: rgba(173, 198, 255, 0.4);
            --accent-glow: rgba(59, 130, 246, 0.5);
            --processing-glow: rgba(221, 183, 255, 0.6);
        }
        body {
            background-color: #131315;
            color: #e5e1e4;
            overflow: hidden;
            font-family: 'Inter', sans-serif;
        }
        .glass-panel {
            backdrop-filter: blur(24px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .shimmer-border {
            position: relative;
            overflow: hidden;
        }
        .shimmer-border::after {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: conic-gradient(from 0deg, transparent, rgba(173, 198, 255, 0.2), transparent 40%);
            animation: rotate-shimmer 4s linear infinite;
        }
        @keyframes rotate-shimmer {
            100% { transform: rotate(360deg); }
        }
        .pulse-processing {
            animation: pulse-glow 2s ease-in-out infinite;
        }
        @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 10px rgba(173, 198, 255, 0.2); opacity: 1; }
            50% { box-shadow: 0 0 25px rgba(173, 198, 255, 0.5); opacity: 0.8; }
        }
        .typing-text::after {
            content: '|';
            animation: blink 1s step-end infinite;
        }
        @keyframes blink {
            from, to { opacity: 1; }
            50% { opacity: 0; }
        }
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
    </style>
<script id="tailwind-config">
        tailwind.config = {
          darkMode: "class",
          theme: {
            extend: {
              "colors": {
                "on-surface": "#e5e1e4",
                "on-secondary-fixed": "#2c0051",
                "secondary-fixed": "#f0dbff",
                "tertiary-fixed-dim": "#ffb786",
                "on-surface-variant": "#c2c6d6",
                "on-primary-fixed-variant": "#004395",
                "on-tertiary-fixed": "#311400",
                "on-error": "#690005",
                "background": "#131315",
                "primary-container": "#4d8eff",
                "tertiary": "#ffb786",
                "surface-container-highest": "#353437",
                "surface-container-lowest": "#0e0e10",
                "error": "#ffb4ab",
                "surface-dim": "#131315",
                "surface-container-high": "#2a2a2c",
                "surface": "#131315",
                "surface-container-low": "#1c1b1d",
                "on-primary": "#002e6a",
                "inverse-primary": "#005ac2",
                "tertiary-container": "#df7412",
                "on-tertiary-container": "#461f00",
                "surface-tint": "#adc6ff",
                "primary": "#adc6ff",
                "outline-variant": "#424754",
                "primary-fixed-dim": "#adc6ff",
                "surface-bright": "#39393b",
                "surface-variant": "#353437",
                "on-error-container": "#ffdad6",
                "on-primary-fixed": "#001a42",
                "on-background": "#e5e1e4",
                "on-primary-container": "#00285d",
                "inverse-on-surface": "#313032",
                "secondary-container": "#6f00be",
                "on-secondary": "#490080",
                "error-container": "#93000a",
                "surface-container": "#201f22",
                "primary-fixed": "#d8e2ff",
                "on-secondary-container": "#d6a9ff",
                "secondary-fixed-dim": "#ddb7ff",
                "on-tertiary-fixed-variant": "#723600",
                "inverse-surface": "#e5e1e4",
                "on-tertiary": "#502400",
                "tertiary-fixed": "#ffdcc6",
                "on-secondary-fixed-variant": "#6900b3",
                "outline": "#8c909f",
                "secondary": "#ddb7ff"
              },
              "borderRadius": {
                "DEFAULT": "0.125rem",
                "lg": "0.25rem",
                "xl": "0.5rem",
                "full": "0.75rem"
              },
              "spacing": {
                "container_padding": "24px",
                "unit": "4px",
                "gutter": "16px",
                "sidebar_width": "280px",
                "toolbar_width": "64px"
              },
              "fontFamily": {
                "body-base": ["Inter"],
                "headline-md": ["Inter"],
                "label-mono": ["JetBrains Mono"],
                "label-caps": ["Inter"],
                "body-sm": ["Inter"]
              },
              "fontSize": {
                "body-base": ["16px", {"lineHeight": "24px", "fontWeight": "400"}],
                "headline-md": ["24px", {"lineHeight": "32px", "letterSpacing": "-0.02em", "fontWeight": "600"}],
                "label-mono": ["12px", {"lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "500"}],
                "label-caps": ["11px", {"lineHeight": "12px", "letterSpacing": "0.1em", "fontWeight": "700"}],
                "body-sm": ["14px", {"lineHeight": "20px", "fontWeight": "400"}]
              }
            }
          }
        }
    </script>
</head>
<body class="bg-background h-screen w-screen overflow-hidden">
<!-- Viewport Background (Deep Space Shader) -->
<div class="fixed inset-0 z-0">

</div>
<!-- Top Navigation Bar -->
<header class="fixed top-4 left-4 right-4 rounded-full glass-panel bg-background/80 backdrop-blur-xl border border-white/10 shadow-[0_0_15px_rgba(173,198,255,0.1)] flex justify-between items-center h-toolbar_width px-gutter z-50">
<div class="flex items-center gap-4">
<span class="font-headline-md text-headline-md font-bold text-on-background tracking-tight">Studio Pro 3D Workspace</span>
</div>
<div class="flex items-center gap-4">
<button class="flex items-center gap-2 px-6 py-2 rounded-full bg-primary-container text-on-primary-container font-medium pulse-processing transition-all active:scale-95">
<span class="material-symbols-outlined animate-spin" style="font-size: 18px;">autorenew</span>
<span>Agent Thinking...</span>
</button>
<div class="flex items-center gap-2">
<button class="p-2 text-on-surface-variant hover:bg-white/5 rounded-full transition-colors material-symbols-outlined">account_circle</button>
<button class="p-2 text-on-surface-variant hover:bg-white/5 rounded-full transition-colors material-symbols-outlined">settings</button>
</div>
</div>
</header>
<!-- Sidebar Navigation -->
<aside class="fixed left-4 top-20 bottom-4 w-sidebar_width rounded-xl glass-panel bg-surface-container-low/60 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col py-gutter z-40 overflow-hidden">
<div class="px-gutter mb-6">
<div class="flex items-center gap-3">
<div class="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
<span class="material-symbols-outlined text-primary pulse-processing" data-weight="fill">psychology</span>
</div>
<div>
<h2 class="text-label-caps font-label-caps text-secondary uppercase">Resource Agent</h2>
<p class="text-body-sm font-body-sm text-on-surface-variant animate-pulse">Processing...</p>
</div>
</div>
</div>
<nav class="flex-1 space-y-1 px-2">
<div class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-on-surface-variant hover:bg-white/5 transition-colors cursor-pointer font-body-sm text-body-sm">
<span class="material-symbols-outlined text-xl">box</span>
<span>Mesh Operations</span>
</div>
<div class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-on-surface-variant hover:bg-white/5 transition-colors cursor-pointer font-body-sm text-body-sm">
<span class="material-symbols-outlined text-xl">accessibility_new</span>
<span>Rigging</span>
</div>
<div class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-on-surface-variant hover:bg-white/5 transition-colors cursor-pointer font-body-sm text-body-sm">
<span class="material-symbols-outlined text-xl">input</span>
<span>Model Input</span>
</div>
<div class="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary border-r-2 border-primary shadow-[0_0_15px_rgba(59,130,246,0.5)] font-body-sm text-body-sm">
<span class="material-symbols-outlined text-xl" data-weight="fill">psychology</span>
<span>Agent Status</span>
</div>
</nav>
<div class="mt-auto px-gutter py-4 border-t border-white/5">
<button class="w-full py-3 rounded-lg bg-primary text-on-primary font-bold transition-all hover:brightness-110 active:scale-95 disabled:opacity-50" disabled="">
                Optimize Mesh
            </button>
</div>
</aside>
<!-- Main Viewport Canvas (Placeholder for 3D Content) -->
<main class="ml-[300px] mr-[340px] mt-24 mb-20 relative h-full flex items-center justify-center pointer-events-none">
<div class="w-full h-full glass-panel rounded-2xl flex items-center justify-center border border-white/5 overflow-hidden">
<!-- Simulated 3D Viewport Content -->
<div class="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(59,130,246,0.1),_transparent)]"></div>
<div class="flex flex-col items-center gap-4 text-on-surface-variant/40">
<span class="material-symbols-outlined text-6xl" style="font-variation-settings: 'wght' 100;">view_in_ar</span>
<p class="font-label-mono text-label-mono uppercase tracking-[0.2em]">Live Viewport Preview</p>
</div>
</div>
</main>
<!-- Agent Log Side Panel (Right) -->
<section class="fixed right-4 top-20 bottom-4 w-sidebar_width rounded-xl glass-panel bg-surface-container-high/60 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col z-40">
<div class="p-gutter border-b border-white/5 flex items-center justify-between">
<h3 class="font-label-caps text-label-caps text-on-surface-variant">Live Topology Log</h3>
<span class="w-2 h-2 rounded-full bg-primary animate-ping"></span>
</div>
<div class="flex-1 p-4 font-label-mono text-label-mono space-y-4 overflow-y-auto" id="agent-log">
<div class="flex gap-2 text-on-surface-variant">
<span class="text-primary opacity-50">[0.00s]</span>
<span class="typing-text">Initializing topology scan...</span>
</div>
<div class="flex gap-2 text-on-surface-variant">
<span class="text-primary opacity-50">[1.24s]</span>
<span>Checking manifold integrity: 100%</span>
</div>
<div class="flex gap-2 text-primary">
<span class="opacity-50">[2.85s]</span>
<span class="animate-pulse">Analyzing topology...</span>
</div>
<div class="flex gap-2 text-on-surface-variant/60">
<span class="opacity-50">[3.10s]</span>
<span>Optimizing UV islands...</span>
</div>
<!-- Log messages will be appended here -->
</div>
<div class="p-gutter bg-surface-container-lowest/40 border-t border-white/5">
<div class="flex items-center gap-3 mb-3">
<div class="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
<div class="h-full bg-primary w-2/3 animate-[progress_10s_ease-in-out_infinite]"></div>
</div>
<span class="text-label-mono font-label-mono text-primary">68%</span>
</div>
<div class="flex items-center gap-2 text-on-surface-variant/80 text-body-sm font-body-sm">
<span class="material-symbols-outlined text-sm animate-spin">sync_saved_locally</span>
<span>Auto-saving intermediate nodes...</span>
</div>
</div>
</section>
<!-- Bottom Tool Bar -->
<nav class="fixed bottom-4 left-1/2 -translate-x-1/2 glass-panel bg-surface-container-highest/40 backdrop-blur-lg rounded-full px-6 py-2 border border-white/20 shadow-lg flex gap-8 items-center z-50">
<button class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-on-surface transition-transform hover:scale-110 active:scale-90 font-label-mono text-label-mono">
<span class="material-symbols-outlined">grid_on</span>
<span>Snap</span>
</button>
<button class="flex flex-col items-center gap-1 text-primary-container drop-shadow-[0_0_8px_rgba(173,198,255,0.6)] font-label-mono text-label-mono">
<span class="material-symbols-outlined">open_with</span>
<span>Gizmo</span>
</button>
<button class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-on-surface transition-transform hover:scale-110 active:scale-90 font-label-mono text-label-mono">
<span class="material-symbols-outlined">undo</span>
<span>Undo</span>
</button>
<button class="flex flex-col items-center gap-1 text-on-surface-variant hover:text-on-surface transition-transform hover:scale-110 active:scale-90 font-label-mono text-label-mono">
<span class="material-symbols-outlined">redo</span>
<span>Redo</span>
</button>
</nav>
<!-- Agent Activity Indicator Overlay (Center) -->
<div class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-20">

</div>
<script>
        // Micro-interactions for Agent Log
        const logContainer = document.getElementById('agent-log');
        const tasks = [
            "Calculating face normals...",
            "Simplifying high-poly density...",
            "Generating LOD hierarchies...",
            "Merging coincident vertices...",
            "Resolving non-manifold edges...",
            "Baking occlusion maps...",
            "Compiling spatial shaders..."
        ];

        function addLog() {
            const time = (Math.random() * 10 + 3).toFixed(2);
            const task = tasks[Math.floor(Math.random() * tasks.length)];
            const logEntry = document.createElement('div');
            logEntry.className = 'flex gap-2 text-on-surface-variant transition-all duration-500 transform translate-y-2 opacity-0';
            logEntry.innerHTML = `
                <span class="text-primary opacity-50">[${time}s]</span>
                <span>${task}</span>
            `;
            
            logContainer.appendChild(logEntry);
            
            // Trigger animation
            setTimeout(() => {
                logEntry.classList.remove('translate-y-2', 'opacity-0');
            }, 50);

            // Keep log manageable
            if (logContainer.children.length > 15) {
                logContainer.removeChild(logContainer.firstChild);
            }
            
            logContainer.scrollTop = logContainer.scrollHeight;
        }

        setInterval(addLog, 2500);

        // Simple Progress Logic
        const progressEl = document.querySelector('.animate-\\[progress_10s_ease-in-out_infinite\\]');
        let currentProgress = 68;
        setInterval(() => {
            currentProgress = (currentProgress + 0.1) % 100;
            const progressText = document.querySelector('.text-primary.font-label-mono');
            if (progressText) progressText.innerText = `${Math.floor(currentProgress)}%`;
        }, 1000);
    </script>
<style>
        @keyframes progress {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(0%); }
        }
    </style>
</body></html

         //////////////////////////////////////////////

         moble

<!DOCTYPE html>

<html class="dark" lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0, viewport-fit=cover" name="viewport"/>
<title>NEON_STUDIO_V1 | Mobile 3D Interface</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@500;700&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
<style>
        @keyframes pulse-border {
            0%, 100% { opacity: 0.2; }
            50% { opacity: 0.6; }
        }
        .glow-active {
            box-shadow: 0 0 12px rgba(173, 198, 255, 0.4);
        }
        .glass-border {
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .neon-text-glow {
            text-shadow: 0 0 8px rgba(173, 198, 255, 0.8);
        }
        ::-webkit-scrollbar {
            display: none;
        }
        input[type="range"] {
            -webkit-appearance: none;
            background: transparent;
        }
        input[type="range"]::-webkit-slider-runnable-track {
            background: rgba(173, 198, 255, 0.1);
            height: 4px;
            border-radius: 2px;
        }
        input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            height: 16px;
            width: 16px;
            border-radius: 50%;
            background: #adc6ff;
            margin-top: -6px;
            box-shadow: 0 0 8px #adc6ff;
        }
    </style>
<!-- Include Tailwind Config -->
<script id="tailwind-config">
      tailwind.config = {
        darkMode: "class",
        theme: {
          extend: {
            "colors": {
                    "surface-dim": "#0b1326",
                    "on-secondary": "#490080",
                    "primary-fixed-dim": "#adc6ff",
                    "primary-container": "#4d8eff",
                    "secondary-container": "#6f00be",
                    "on-tertiary-container": "#002f36",
                    "on-tertiary-fixed": "#001f25",
                    "surface-container-highest": "#2d3449",
                    "surface-container-low": "#131b2e",
                    "error-container": "#93000a",
                    "on-secondary-fixed": "#2c0051",
                    "on-primary-fixed": "#001a42",
                    "tertiary-fixed-dim": "#2fd9f4",
                    "on-background": "#dae2fd",
                    "tertiary-fixed": "#a2eeff",
                    "tertiary-container": "#009fb4",
                    "secondary": "#ddb7ff",
                    "on-surface": "#dae2fd",
                    "outline-variant": "#424754",
                    "background": "#0b1326",
                    "on-error": "#690005",
                    "on-secondary-container": "#d6a9ff",
                    "primary-fixed": "#d8e2ff",
                    "inverse-primary": "#005ac2",
                    "surface-bright": "#31394d",
                    "inverse-surface": "#dae2fd",
                    "surface-tint": "#adc6ff",
                    "surface-container": "#171f33",
                    "tertiary": "#2fd9f4",
                    "outline": "#8c909f",
                    "secondary-fixed-dim": "#ddb7ff",
                    "on-surface-variant": "#c2c6d6",
                    "on-primary-fixed-variant": "#004395",
                    "secondary-fixed": "#f0dbff",
                    "surface": "#0b1326",
                    "on-primary": "#002e6a",
                    "primary": "#adc6ff",
                    "on-secondary-fixed-variant": "#6900b3",
                    "surface-variant": "#2d3449",
                    "on-tertiary-fixed-variant": "#004e5a",
                    "on-tertiary": "#00363e",
                    "on-error-container": "#ffdad6",
                    "surface-container-high": "#222a3d",
                    "surface-container-lowest": "#060e20",
                    "error": "#ffb4ab",
                    "on-primary-container": "#00285d",
                    "inverse-on-surface": "#283044"
            },
            "borderRadius": {
                    "DEFAULT": "0.125rem",
                    "lg": "0.25rem",
                    "xl": "0.5rem",
                    "full": "0.75rem"
            },
            "spacing": {
                    "stack-lg": "24px",
                    "stack-md": "12px",
                    "touch-target-min": "44px",
                    "panel-gap": "8px",
                    "stack-xs": "4px",
                    "safe-margin": "16px"
            },
            "fontFamily": {
                    "headline-md-mobile": ["Inter"],
                    "display-lg": ["Inter"],
                    "label-sm": ["JetBrains Mono"],
                    "label-caps": ["JetBrains Mono"],
                    "headline-md": ["Inter"],
                    "body-base": ["Inter"]
            },
            "fontSize": {
                    "headline-md-mobile": ["20px", {"lineHeight": "1.3", "fontWeight": "600"}],
                    "display-lg": ["32px", {"lineHeight": "1.2", "letterSpacing": "-0.02em", "fontWeight": "700"}],
                    "label-sm": ["10px", {"lineHeight": "12px", "fontWeight": "500"}],
                    "label-caps": ["12px", {"lineHeight": "16px", "letterSpacing": "0.1em", "fontWeight": "700"}],
                    "headline-md": ["24px", {"lineHeight": "1.3", "fontWeight": "600"}],
                    "body-base": ["16px", {"lineHeight": "1.5", "fontWeight": "400"}]
            }
          },
        },
      }
    </script>
<style>
    body {
      min-height: max(884px, 100dvh);
    }
  </style>
</head>
<body class="bg-surface-dim text-on-surface overflow-hidden h-screen w-screen selection:bg-primary/30">
<!-- Viewport: 3D Scene Layer -->
<div class="fixed inset-0 z-0 bg-black">
<!-- Background Animation: Deep Space WebGL -->

<!-- Center Mock 3D Object (Placeholder) -->
<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
<div class="w-64 h-64 rounded-full bg-gradient-to-tr from-primary/20 to-secondary/30 blur-3xl animate-pulse"></div>
<img class="absolute w-[80%] max-w-[400px] object-contain drop-shadow-[0_0_30px_rgba(173,198,255,0.3)]" data-alt="A futuristic, semi-transparent 3D mesh of a complex organic creature, glowing with ethereal cyan and purple wireframe lines. The background is a deep cosmic void with floating particles. The lighting is dramatic, high-contrast cinematic sci-fi style, emphasizing depth and technical precision in a dark-mode cyberpunk interface." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDcJCF5ZxaUYbhJ_0VcuccVDM2JBx9yn29lteQ5DfDYAvLyYRGLLenhO8WMwgndr2e1meC52AwVHFtbh4eCymgMz6QkJQzSImwNemnxpIRtnt-Q9fJBwZTtM0qpG8kUQhFlD4PK-eZyKCh4W-wYrsj35uKMuGTF7rDHxGFmlTHd8K4KtGVyE66xGIGJdEVep9Bu7_ts4DCM5cKT_4vjubOAXs7LBgLrXkt92Q_-g8H9HWKTmKCgY85n6xupLXByfOn3FAw2acKHdVBt"/>
</div>
</div>
<!-- Top Navigation Bar (Shared Component: TopAppBar) -->
<header class="fixed top-0 w-full bg-surface-container/60 backdrop-blur-xl text-primary font-headline-md-mobile text-headline-md-mobile border-b border-white/10 shadow-[0_0_8px_rgba(173,198,255,0.2)] flex items-center justify-between px-safe-margin h-touch-target-min z-50">
<div class="flex items-center gap-stack-md">
<span class="material-symbols-outlined text-primary" style="font-variation-settings: 'FILL' 0;">layers</span>
<span class="font-label-caps text-label-caps tracking-widest text-tertiary">NEON_STUDIO_V1</span>
</div>
<div class="flex items-center gap-stack-md">
<button class="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200">undo</button>
<button class="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200">redo</button>
<button class="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors active:scale-95 duration-200">settings</button>
</div>
</header>
<!-- Side Tool Selection (Shared Component: NavigationDrawer) -->
<nav class="fixed left-safe-margin top-1/2 -translate-y-1/2 h-auto rounded-xl py-stack-md w-16 bg-surface-container-low/80 backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col gap-panel-gap items-center z-40">
<div class="text-secondary font-bold font-label-caps text-label-caps mb-2 px-1 text-center">MODES</div>
<button class="flex flex-col items-center justify-center gap-1 w-full py-2 transition-all text-secondary border-l-2 border-secondary bg-secondary-container/20" id="nav-sculpt" onclick="switchTab('sculpt')">
<span class="material-symbols-outlined">draw</span>
<span class="text-[8px] font-label-caps">SCULPT</span>
</button>
<button class="flex flex-col items-center justify-center gap-1 w-full py-2 transition-all text-on-surface-variant opacity-60 hover:bg-white/5" id="nav-rig" onclick="switchTab('rig')">
<span class="material-symbols-outlined">app_settings_alt</span>
<span class="text-[8px] font-label-caps">RIG</span>
</button>
<button class="flex flex-col items-center justify-center gap-1 w-full py-2 transition-all text-on-surface-variant opacity-60 hover:bg-white/5" id="nav-mod" onclick="switchTab('mod')">
<span class="material-symbols-outlined">format_paint</span>
<span class="text-[8px] font-label-caps">PAINT</span>
</button>
</nav>
<!-- Bottom Editing Panel (Floating Glass Panel) -->
<main class="fixed bottom-24 left-1/2 -translate-x-1/2 w-[92%] max-w-lg bg-surface-container-lowest/60 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl z-40 p-stack-md" id="editing-panel">
<!-- Sculpting Content -->
<div class="tab-content flex flex-col gap-stack-md" id="panel-sculpt">
<div class="flex justify-between items-center mb-1">
<span class="font-label-caps text-label-caps text-primary neon-text-glow">SCULPTING TOOLS</span>
<span class="material-symbols-outlined text-primary text-sm">auto_fix_high</span>
</div>
<div class="grid grid-cols-3 gap-stack-md">
<button class="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary active:scale-95 transition-transform">
<span class="material-symbols-outlined">back_hand</span>
<span class="text-[10px] font-label-caps">GRAB</span>
</button>
<button class="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-white/5 border border-white/10 text-on-surface-variant hover:border-primary/40 active:scale-95 transition-transform">
<span class="material-symbols-outlined">blur_on</span>
<span class="text-[10px] font-label-caps">INFLATE</span>
</button>
<button class="flex flex-col items-center justify-center gap-1 p-2 rounded-lg bg-white/5 border border-white/10 text-on-surface-variant hover:border-primary/40 active:scale-95 transition-transform">
<span class="material-symbols-outlined">brush</span>
<span class="text-[10px] font-label-caps">SMOOTH</span>
</button>
</div>
<div class="space-y-4 pt-2">
<div class="flex flex-col gap-1">
<div class="flex justify-between text-[10px] font-label-caps text-on-surface-variant">
<span>BRUSH SIZE</span>
<span class="text-primary">48px</span>
</div>
<input class="w-full h-1" max="100" min="1" type="range" value="48"/>
</div>
<div class="flex flex-col gap-1">
<div class="flex justify-between text-[10px] font-label-caps text-on-surface-variant">
<span>INTENSITY</span>
<span class="text-primary">0.7</span>
</div>
<input class="w-full h-1" max="1" min="0" step="0.1" type="range" value="0.7"/>
</div>
</div>
</div>
<!-- Rigging Content (Hidden by default) -->
<div class="tab-content hidden flex flex-col gap-stack-md" id="panel-rig">
<div class="flex justify-between items-center mb-1">
<span class="font-label-caps text-label-caps text-secondary">SKELETON RIG</span>
<span class="material-symbols-outlined text-secondary text-sm">link</span>
</div>
<div class="grid grid-cols-2 gap-stack-md">
<div class="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
<span class="font-label-sm text-label-sm">JOINT L1</span>
<div class="flex gap-2">
<span class="material-symbols-outlined text-secondary text-base cursor-pointer">arrow_upward</span>
<span class="material-symbols-outlined text-secondary text-base cursor-pointer">arrow_downward</span>
</div>
</div>
<div class="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
<span class="font-label-sm text-label-sm">JOINT R1</span>
<div class="flex gap-2">
<span class="material-symbols-outlined text-secondary text-base cursor-pointer">arrow_upward</span>
<span class="material-symbols-outlined text-secondary text-base cursor-pointer">arrow_downward</span>
</div>
</div>
<div class="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
<span class="font-label-sm text-label-sm">JOINT L2</span>
<div class="flex gap-2">
<span class="material-symbols-outlined text-secondary text-base cursor-pointer">arrow_upward</span>
<span class="material-symbols-outlined text-secondary text-base cursor-pointer">arrow_downward</span>
</div>
</div>
<div class="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
<span class="font-label-sm text-label-sm">JOINT R2</span>
<div class="flex gap-2">
<span class="material-symbols-outlined text-secondary text-base cursor-pointer">arrow_upward</span>
<span class="material-symbols-outlined text-secondary text-base cursor-pointer">arrow_downward</span>
</div>
</div>
</div>
<button class="w-full py-3 mt-2 rounded-full bg-secondary text-on-secondary font-label-caps text-label-caps shadow-[0_0_15px_rgba(221,183,255,0.4)] active:scale-[0.98] transition-transform">
                RUN AUTO-RIG
            </button>
</div>
<!-- Modification Content (Hidden by default) -->
<div class="tab-content hidden flex flex-col gap-stack-md" id="panel-mod">
<div class="flex justify-between items-center mb-1">
<span class="font-label-caps text-label-caps text-tertiary">MESH MODIFIERS</span>
<span class="material-symbols-outlined text-tertiary text-sm">grid_view</span>
</div>
<div class="grid grid-cols-2 gap-stack-md">
<button class="flex items-center gap-3 p-4 rounded-xl bg-surface-container-high border border-white/5 hover:border-tertiary/40 transition-colors">
<span class="material-symbols-outlined text-tertiary">motion_photos_auto</span>
<div class="text-left">
<div class="text-[12px] font-bold">Hollow Out</div>
<div class="text-[9px] opacity-60">Generate 2mm shell</div>
</div>
</button>
<button class="flex items-center gap-3 p-4 rounded-xl bg-surface-container-high border border-white/5 hover:border-tertiary/40 transition-colors">
<span class="material-symbols-outlined text-tertiary">texture</span>
<div class="text-left">
<div class="text-[12px] font-bold">Patch Hole</div>
<div class="text-[9px] opacity-60">Close mesh defects</div>
</div>
</button>
</div>
<div class="p-4 rounded-xl bg-tertiary/10 border border-tertiary/30 mt-2 flex items-center justify-between">
<div>
<div class="text-[10px] font-label-caps text-tertiary">POLYGON COUNT</div>
<div class="text-lg font-bold">142,804 <span class="text-[10px] font-normal opacity-60">tris</span></div>
</div>
<span class="material-symbols-outlined text-tertiary text-4xl opacity-20">memory</span>
</div>
</div>
</main>
<!-- Bottom Nav Bar (Shared Component: BottomNavBar) -->
<nav class="fixed bottom-safe-margin left-1/2 -translate-x-1/2 rounded-full w-[90%] max-w-md bg-surface-container-lowest/40 backdrop-blur-md border border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.4)] flex justify-around items-center h-[64px] px-stack-lg z-50">
<button class="flex items-center justify-center bg-primary text-on-primary rounded-full w-touch-target-min h-touch-target-min shadow-[0_0_12px_rgba(173,198,255,0.6)] active:scale-90 transition-transform duration-150">
<span class="material-symbols-outlined">home</span>
</button>
<button class="flex items-center justify-center text-on-surface-variant w-touch-target-min h-touch-target-min hover:bg-white/10 rounded-full active:scale-90 transition-transform duration-150">
<span class="material-symbols-outlined">undo</span>
</button>
<button class="flex items-center justify-center text-on-surface-variant w-touch-target-min h-touch-target-min hover:bg-white/10 rounded-full active:scale-90 transition-transform duration-150">
<span class="material-symbols-outlined">redo</span>
</button>
<button class="flex items-center justify-center text-on-surface-variant w-touch-target-min h-touch-target-min hover:bg-white/10 rounded-full active:scale-90 transition-transform duration-150">
<span class="material-symbols-outlined">tune</span>
</button>
</nav>
<!-- Micro-interactions Script -->
<script>
        function switchTab(tabName) {
            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
            
            // Show target tab content
            document.getElementById(`panel-${tabName}`).classList.remove('hidden');
            
            // Update side nav active styles
            const navIds = ['sculpt', 'rig', 'mod'];
            navIds.forEach(id => {
                const btn = document.getElementById(`nav-${id}`);
                const colorClass = id === 'sculpt' ? 'secondary' : (id === 'mod' ? 'tertiary' : 'secondary');
                
                if (id === tabName) {
                    btn.classList.remove('text-on-surface-variant', 'opacity-60', 'hover:bg-white/5');
                    btn.classList.add(`text-${colorClass}`, 'border-l-2', `border-${colorClass}`, `bg-${colorClass}-container/20`);
                } else {
                    btn.className = `flex flex-col items-center justify-center gap-1 w-full py-2 transition-all text-on-surface-variant opacity-60 hover:bg-white/5`;
                }
            });

            // Adjust panel highlights based on tab context
            const panel = document.getElementById('editing-panel');
            if (tabName === 'sculpt') {
                panel.style.borderColor = 'rgba(173, 198, 255, 0.3)';
            } else if (tabName === 'rig') {
                panel.style.borderColor = 'rgba(221, 183, 255, 0.3)';
            } else if (tabName === 'mod') {
                panel.style.borderColor = 'rgba(47, 217, 244, 0.3)';
            }
        }
        
        // Simple entrance animation
        window.addEventListener('load', () => {
            const panel = document.getElementById('editing-panel');
            panel.style.transform = 'translate(-50%, 20px)';
            panel.style.opacity = '0';
            setTimeout(() => {
                panel.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
                panel.style.transform = 'translate(-50%, 0)';
                panel.style.opacity = '1';
            }, 100);
        });
    </script>
</body></html>
         