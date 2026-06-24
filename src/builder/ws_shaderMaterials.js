/**
 * =====================================================================
 * @domain:    builder_visuals
 * @concern:   LumenShaders — Three.js ShaderMaterial wrappers
 * @created:   2026-06-25T00:00:00Z
 * @version:   1.0.0
 * @source:    github.com/Leonxlnx/lumenshaders
 * =====================================================================
 *
 * Ports the 9 Lumen shader modes to Three.js ShaderMaterials.
 * The GLSL is adapted from full-screen (gl_FragCoord.xy / u_res) to
 * UV-based rendering on arbitrary mesh geometry.
 *
 * Each mode is a factory function that returns a configured ShaderMaterial
 * with all uniforms initialized to the Lumen defaults.
 *
 * Usage:
 *   import { createLumenMaterial } from './ws_shaderMaterials.js';
 *   const mat = createLumenMaterial('chrome');
 *   mat.uniforms.u_c1.value.set(1, 0.5, 0.2);    // tweak
 *   mesh.material = mat;
 */

import * as THREE from 'three';

/* ───────────────────────────────────────────────────────────────────────
 * Lumen Shader GLSL — adapted from LumenShaders (WebGL2 → WebGL1/2 compat)
 * Key changes from the original:
 *   1. Switched from #version 300 es to #version 100 (or use THREE's
 *      built-in chunk system). We keep the ES 3 variant since Three.js
 *      ShaderMaterial supports it when WebGL2 is available.
 *   2. Replaced gl_FragCoord.xy / u_res UV with a passed-in vUv.
 *   3. Layout qualifiers removed; varyings are explicit.
 * ─────────────────────────────────────────────────────────────────────── */

const LUMEN_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const LUMEN_FRAG = `
precision highp float;
precision highp int;

varying vec2 vUv;

uniform vec2  u_res;
uniform float u_phase;
uniform float u_seed;
uniform int   u_mode;

uniform vec3  u_c1, u_c2, u_c3, u_c4, u_bg;
uniform float u_hue, u_sat, u_exposure, u_contrast;

uniform float u_scale;
uniform float u_complex;
uniform float u_warp;
uniform float u_flow;
uniform float u_stretch;

uniform float u_light, u_gloss, u_lightAngle, u_irid, u_glow;

uniform float u_grain, u_cell, u_lines, u_ca, u_vig, u_soft;
uniform float u_travel;

uniform int   u_synth;
uniform int   u_modeB;
uniform int   u_mixOp;
uniform float u_blend;

uniform int   u_genome;
uniform vec4  u_g1, u_g2, u_g3;

#define HAS_GENOME 1
#define TAU 6.28318530718
#define PI  3.14159265359

/* ---------------- noise ---------------- */

float hash11(float n){
  n = fract(n * 0.1031);
  n *= n + 33.33;
  n *= n + n;
  return fract(n);
}
float hash21(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p){
  float n = hash21(p);
  return vec2(n, hash21(p+n+17.13));
}

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash21(i);
  float b = hash21(i+vec2(1,0));
  float c = hash21(i+vec2(0,1));
  float d = hash21(i+vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}

mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

float fbm(vec2 p){
  float v = 0.0, a = 0.5, tot = 0.0;
  mat2 R = rot(0.62);
  for (int i = 0; i < 8; i++){
    float w = clamp(u_complex - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    v += a*w*vnoise(p);
    tot += a*w;
    a *= 0.55;
    p = R*p*2.03 + 11.7;
  }
  return v/max(tot, 1e-4);
}

vec2 LT(){ return vec2(cos(TAU*u_phase), sin(TAU*u_phase)) * u_travel; }
vec2 SO(){ return vec2(hash11(u_seed*0.137 + 0.731)*61.7, hash11(u_seed*0.213 + 7.0)*47.3); }

/* ---------------- color ---------------- */

vec3 palette(float t){
  t = clamp(t, 0.0, 1.0);
  float x = t*3.0;
  vec3 c = mix(u_c1, u_c2, smoothstep(0.0,1.0,x));
  c = mix(c, u_c3, smoothstep(1.0,2.0,x));
  c = mix(c, u_c4, smoothstep(2.0,3.0,x));
  return c;
}
vec3 paletteCyc(float t){
  t = fract(t);
  float x = t*4.0;
  vec3 c = mix(u_c1, u_c2, smoothstep(0.0,1.0,x));
  c = mix(c, u_c3, smoothstep(1.0,2.0,x));
  c = mix(c, u_c4, smoothstep(2.0,3.0,x));
  c = mix(c, u_c1, smoothstep(3.0,4.0,x));
  return c;
}

vec3 hueRotate(vec3 c, float deg){
  float a = deg*PI/180.0;
  float cs = cos(a), sn = sin(a);
  mat3 m = mat3(
    0.299+0.701*cs+0.168*sn, 0.587-0.587*cs+0.330*sn, 0.114-0.114*cs-0.497*sn,
    0.299-0.299*cs-0.328*sn, 0.587+0.413*cs+0.035*sn, 0.114-0.114*cs+0.292*sn,
    0.299-0.300*cs+1.250*sn, 0.587-0.588*cs-1.050*sn, 0.114+0.886*cs-0.203*sn);
  return c*m;
}

vec2 toP(vec2 uv){
  float asp = u_res.x/u_res.y;
  vec2 p = (uv - 0.5) * vec2(asp, 1.0) * (3.0/max(u_scale, 0.15));
  p.x *= mix(1.0, 0.38, clamp(u_stretch, 0.0, 1.0));
  p.y *= mix(1.0, 0.38, clamp(-u_stretch, 0.0, 1.0));
  return p;
}

/* ===== MODE 0 — LIQUID CHROME ===== */

float chromeH(vec2 p, vec2 w){
  vec2 so = SO(), lt = LT();
  return fbm((p + w)*0.85 + so*0.5 + u_flow*0.6*lt);
}

vec3 sceneChrome(vec2 uv){
  vec2 p = toP(uv);
  p.x *= 0.48;
  vec2 so = SO(), lt = LT();
  vec2 w = u_warp*0.9*vec2(fbm(p*0.5+so+lt)-0.5, fbm(p*0.5+so+7.31-lt)-0.5)*2.4;
  float e = 0.06;
  float h  = chromeH(p, w);
  float hx = chromeH(p+vec2(e,0), w);
  float hy = chromeH(p+vec2(0,e), w);
  float relief = 3.4+u_warp*1.6;
  vec3 n = normalize(vec3(-(hx-h)/e*relief, -(hy-h)/e*relief, 1.0));
  float la = u_lightAngle*PI/180.0;
  vec3 L = normalize(vec3(cos(la), sin(la), 0.55));
  float diff = max(dot(n, L), 0.0);
  vec3 Hv = normalize(L+vec3(0,0,1));
  float spec  = pow(max(dot(n, Hv), 0.0), u_gloss);
  float spec2 = pow(max(dot(n, normalize(vec3(-L.xy, 0.9))), 0.0), u_gloss*0.45);
  float fres  = pow(1.0-max(n.z, 0.0), 2.4);
  vec3 alb  = palette(clamp(h*1.1+u_irid*n.x*0.7,0,1));
  vec3 alb2 = palette(clamp(0.55-n.x*0.7+h*0.25,0,1));
  vec3 col = u_bg*(0.55+0.45*diff);
  col += alb*pow(diff, 2.4)*0.30;
  col += alb*spec*u_light*3.0;
  col += alb2*spec2*u_light*1.35;
  col += palette(clamp(fres*0.85+u_irid*n.y*0.4,0,1))*fres*u_light*0.55;
  col += vec3(1.0)*pow(spec, 3.0)*u_light*0.5;
  return col;
}

/* ===== MODE 1 — SILK RIBBONS ===== */

vec3 sceneSilk(vec2 uv){
  vec2 p = toP(uv);
  vec2 so = SO(), lt = LT();
  p = rot(-0.30+0.6*(hash11(u_seed*0.31+3)-0.5))*p;
  vec2 wq = p*vec2(0.42,0.50)+so+lt*0.55;
  float wave = vnoise(wq)*0.70+vnoise(wq*2.13+5)*0.30;
  float freq = u_lines*0.16;
  float tt = p.y*freq+(wave-0.5)*(4.5+u_warp*3.5)+p.x*0.30;
  float ft = fract(tt)-0.5;
  float band = abs(ft)*2.0;
  float prof = sqrt(max(1.0-band*band,0));
  vec3 n = normalize(vec3(0.35*(wave-0.5), ft*2.0, max(prof,0.05)));
  float la = u_lightAngle*PI/180.0;
  vec3 L = normalize(vec3(cos(la), sin(la), 0.62));
  float diff = max(dot(n, L), 0.0);
  float spec = pow(max(dot(n,normalize(L+vec3(0,0,1))),0), u_gloss);
  float id = hash11(floor(tt)*7.77+hash11(u_seed*0.171)*43);
  vec3 alb = paletteCyc(id*0.97+wave*0.22+u_irid*0.25*n.y);
  vec3 col = alb*(0.05+0.95*pow(diff,1.7));
  col += alb*spec*u_light*1.9;
  col += vec3(1.0)*pow(spec,2.5)*u_light*0.6;
  col *= 0.45+0.55*prof;
  float env = smoothstep(1.8,0.55,abs(p.y*0.7+(wave-0.5)*3.4));
  return mix(u_bg, col, env);
}

/* ===== MODE 2 — SOFT BLOOM ===== */

vec3 blobField(vec2 p, float warpAmt){
  vec2 so = SO();
  p += warpAmt*0.55*vec2(fbm(p*0.8+so)-0.5, fbm(p*0.8-so)-0.5)*2.0;
  vec3 col = u_bg;
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    vec2 hc = hash22(vec2(fi*3.17, u_seed*0.731+fi));
    vec2 base = (hc-0.5)*vec2(2.2,1.6);
    float orbR = 0.18+0.4*hash11(u_seed*0.117+fi*9.1);
    float ph = u_phase+hash11(fi+u_seed*0.291);
    float dir = hash11(fi*5+u_seed*0.49)>0.5?1:-1;
    vec2 pos = base+orbR*u_travel*vec2(cos(TAU*ph*dir),sin(TAU*ph*dir));
    float rad = (0.45+0.6*hash11(fi*2.3+u_seed*0.371+4))*u_soft;
    float d = length(p-pos);
    float g = exp(-(d*d)/(rad*rad));
    vec3 bc = palette(fract(fi*0.249+hash11(fi+u_seed*0.523)*0.18));
    col = mix(col, bc, g*0.92);
  }
  return col;
}

vec3 sceneBloom(vec2 uv){ return blobField(toP(uv), u_warp); }

/* ===== MODE 3 — AURA RINGS ===== */

vec3 sceneAura(vec2 uv){
  vec2 p = toP(uv);
  vec2 so = SO();
  vec2 c = (hash22(vec2(u_seed*0.37,8.8))-0.5)*vec2(0.5,0.6);
  vec2 d2 = p-c;
  float ang = atan(d2.y,d2.x);
  float d = length(d2);
  d += (0.06+0.08*u_warp)*fbm(vec2(ang*1.2,d*1.4)+so+LT()*0.5)*smoothstep(0,0.3,d)-0.05;
  d += 0.045*u_travel*sin(TAU*u_phase);
  float t = pow(max(d*0.66,0), mix(1.55,0.8,clamp(u_soft*0.65,0,1)));
  vec3 col = palette(smoothstep(0.04,0.96,t));
  col = mix(col, u_bg, smoothstep(0.68,1.18,t));
  col = mix(col, mix(u_bg,vec3(1),0.5), smoothstep(0.26,0,t)*0.45);
  float ring = exp(-pow((t-0.46)*4.6,2));
  col = mix(col, col*1.18+0.06, ring*0.5);
  return col;
}

/* ===== MODE 4 — LIGHT RAYS ===== */

vec3 sceneRays(vec2 uv){
  vec2 p = toP(uv);
  vec2 so = SO();
  vec2 O = vec2((hash11(u_seed+1.7)-0.5)*0.8, 1.9);
  vec2 dir = p-O;
  float ang = atan(dir.x, -dir.y);
  float r = length(dir);
  float beams = fbm(vec2(ang*(2+u_lines*0.12),0)+so+LT()*0.5);
  beams = pow(clamp(beams*1.25,0,1), 2+u_warp*2);
  float fall = smoothstep(3.4,0.7,r);
  float glowB = beams*fall;
  vec3 col = u_bg;
  vec3 beamCol = palette(clamp(0.85-glowB*0.9,0,1));
  col = mix(col, beamCol, clamp(glowB*1.7,0,1));
  col = mix(col, palette(0.92), smoothstep(1.2,3.2,r)*0.85);
  return col;
}

/* ===== MODE 5 — HALFTONE ===== */

vec3 sceneHalftone(vec2 uv){
  float asp = u_res.x/u_res.y;
  vec2 so = SO(), lt = LT();
  vec2 guv = uv*vec2(asp,1)*u_cell*0.55;
  vec2 gp = floor(guv);
  vec2 gf = fract(guv)-0.5;
  vec2 cuv = (gp+0.5)/(u_cell*0.55)/vec2(asp,1);
  vec2 cp = toP(cuv);
  vec2 q = cp+u_warp*0.9*vec2(fbm(cp*0.7+so+lt)-0.5,fbm(cp*0.7-so-lt)-0.5)*2;
  float f = fbm(q+so);
  f = smoothstep(0.30,0.80,f);
  float radius = sqrt(f)*0.62;
  float dotm = smoothstep(radius,radius-0.12,length(gf));
  float hueF = fbm(q*0.55+so+31.7);
  vec3 ink = palette(clamp(hueF*1.5-0.22,0,1));
  return mix(u_bg, ink, dotm*(0.30+0.70*f));
}

/* ===== MODE 6 — DATA GLYPHS ===== */

const int GLYPHS[8] = int[8](31599, 11415, 29330, 31727, 1488, 448, 128, 9362);

vec3 sceneGlyphs(vec2 uv){
  float asp = u_res.x/u_res.y;
  vec2 so = SO(), lt = LT();
  vec2 guv = uv*vec2(asp,1)*vec2(u_cell*0.5,u_cell*0.5/1.55);
  vec2 gp = floor(guv);
  vec2 gf = fract(guv);
  vec2 cuv = (gp+0.5)/vec2(u_cell*0.5,u_cell*0.5/1.55)/vec2(asp,1);
  vec2 cp = toP(cuv);
  float b = fbm(cp*0.8+so+lt);
  b = pow(clamp(b*1.65-0.30,0,1), 2.3);
  float step8 = floor(u_phase*8);
  b *= 0.55+0.9*hash21(vec2(gp.x*1.31, step8));
  b += 0.018;
  float swap = hash21(gp+vec2(floor(u_phase*8)*13, u_seed));
  int gi = int(floor(swap*7.999));
  int glyph = GLYPHS[gi];
  vec2 cell = (gf-0.5)/0.74+0.5;
  vec3 col = u_bg;
  if (cell.x>0&&cell.x<1&&cell.y>0&&cell.y<1){
    int px = int(floor(cell.x*3));
    int py = int(floor((1-cell.y)*5));
    int bit = (glyph>>((4-py)*3+(2-px)))&1;
    vec3 ink = palette(clamp(b*1.3,0,1));
    col += ink*float(bit)*b*2.2;
  }
  return col;
}

/* ===== MODE 7 — REEDED GLASS ===== */

vec3 boldField(vec2 p){
  vec2 so = SO();
  float f1 = fbm(p*0.4+so+LT()*0.7);
  float ang = TAU*hash11(u_seed*0.071+2);
  float diag = 0.5+0.30*(cos(ang)*p.x+sin(ang)*p.y);
  vec3 col = palette(clamp(diag+(f1-0.5)*1.5,0,1));
  col = mix(col, u_bg, smoothstep(0.60,0.18,f1)*0.85);
  return col;
}

vec3 sceneReeded(vec2 uv){
  float ridgeFreq = max(u_lines*0.55,6);
  float nx = uv.x*ridgeFreq;
  float ci = floor(nx);
  float lx = fract(nx)-0.5;
  float lens = sin(lx*PI);
  float refr = lx*0.22*u_warp+lens*0.08*u_warp;
  float srcX = (ci+0.5+refr)/ridgeFreq;
  vec3 col = boldField(toP(vec2(srcX, uv.y))*0.8);
  float ridge = cos(lx*PI);
  float shade = 0.78+0.28*ridge;
  float groove = smoothstep(0.48,0.40,abs(lx));
  col *= mix(0.54, shade, groove);
  float spec = pow(max(ridge,0), mix(12,36,clamp(u_gloss/120,0,1)));
  col += vec3(1)*spec*u_light*0.14;
  return col;
}

/* ===== MODE 8 — PIXEL BLOOM ===== */

vec3 sceneMosaic(vec2 uv){
  float asp = u_res.x/u_res.y;
  float cells = max(u_cell*0.22,3);
  vec2 g = vec2(cells*asp,cells);
  vec2 q = (floor(uv*g)+0.5)/g;
  vec3 col = blobField(toP(q), u_warp*0.5);
  float h = hash21(floor(uv*g)+u_seed);
  col *= 0.97+0.05*h;
  return col;
}

/* ===== GENOME synthesizer ===== */

float gnVoro(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float d = 8.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++){
    vec2 gv = vec2(x,y);
    vec2 o = hash22(i+gv+floor(u_seed));
    d = min(d, length(gv+o-f));
  }
  return d;
}

float gnField(int ft, vec2 p){
  vec2 so = SO(), lt = LT();
  if (ft == 0) return fbm(p+so+lt);
  if (ft == 1){
    float v = 1.0-abs(2.0*fbm(p+so+lt)-1.0);
    return pow(v,1+u_g3.x*4);
  }
  if (ft == 2){
    float a = sin(p.x*2.1+fbm(p*0.7+so+lt)*6);
    float b = sin(p.y*1.7+fbm(p.yx*0.8-so-lt)*6);
    return a*b*0.25+0.5;
  }
  if (ft == 3){
    float d = length(p)+(fbm(p*0.9+so+lt)-0.5)*1.2;
    return fract(d*(1+u_g3.x*2));
  }
  if (ft == 4){
    float v = gnVoro(p*1.4+lt*0.8);
    return pow(clamp(v,0,1),0.8+u_g3.x*2);
  }
  if (ft == 5){
    float f1 = fbm(p+so+lt);
    return fbm(p+2.4*vec2(f1,1-f1)+so);
  }
  if (ft == 6){
    float bx = sin(p.x*(2.2+u_g3.x*4.5)+lt.x*2);
    float by = cos(p.y*(1.6+u_g3.x*3.2)-lt.y*2);
    return bx*by*0.28+0.5+fbm(p*0.25+so)*0.08;
  }
  if (ft == 7){
    vec2 q = p*(1.8+u_g3.z*1.2);
    float j = fbm(p*0.35+so)*0.15;
    float gx = step(0.5,fract(q.x+j));
    float gy = step(0.5,fract(q.y-j));
    return mix(gx*gy,1-gx*gy,0.5+0.5*sin(lt.x*3));
  }
  if (ft == 8){
    float v = gnVoro(p*1.65+lt*0.55);
    return smoothstep(0.02,0.20,v);
  }
  if (ft == 9){
    float a = atan(p.y,p.x)+lt.x*0.6;
    float d = length(p);
    return fract(sin(a*3+u_seed*0.01)*0.5+d*(0.75+u_g3.x)+fbm(p*0.28+so)*0.18);
  }
  if (ft == 10){
    float h1 = sin((p.x+p.y)*(6+u_g3.x*6)+lt.x);
    float h2 = sin((p.x-p.y)*(6+u_g3.x*6)-lt.y);
    float hatch = smoothstep(-0.15,0.55,h1*h2);
    return mix(fbm(p*0.45+so)*0.35,hatch,0.72);
  }
  vec2 cell = fract(p*(0.85+u_g3.z*0.8))-0.5;
  float dd = length(cell);
  float pulse = sin(TAU*u_phase+hash21(floor(p*(0.85+u_g3.z*0.8)))*6.28)*0.08;
  return smoothstep(0.34+pulse,0.04,dd);
}

vec2 gnDomain(int dop, vec2 p){
  p = rot(u_g3.w*TAU)*p;
  if (dop == 1) return vec2(atan(p.y,p.x)*(1+floor(u_g1.w*0.5)),length(p)*1.6);
  if (dop == 2){
    float n = 2+floor(u_g1.w);
    float a = atan(p.y,p.x);
    float seg = TAU/n;
    a = abs(mod(a,seg)-seg*0.5);
    return vec2(cos(a),sin(a))*length(p);
  }
  if (dop == 3) return abs(p);
  if (dop == 4) return (fract(p*0.5)-0.5)*2.6;
  if (dop == 5){
    float seg = TAU/6;
    float a = atan(p.y,p.x);
    a = abs(mod(a,seg)-seg*0.5);
    return vec2(cos(a),sin(a))*length(p);
  }
  if (dop == 6){
    vec2 q = p*0.62;
    vec2 cell = floor(q);
    vec2 f = fract(q)-0.5;
    if (mod(cell.y,2)>0.5) f.x += 0.5;
    return f*2.4;
  }
  return p;
}

vec3 gnColor(int cm, float t, vec2 p){
  t = clamp(t,0,1);
  if (cm == 1) return paletteCyc(t*1.4);
  if (cm == 2){
    float steps = 3+floor(u_g3.y*5);
    return palette(floor(t*steps)/(steps-1));
  }
  if (cm == 3) return mix(u_bg, u_c1, smoothstep(0.15,0.75,t));
  if (cm == 4){
    float bands = 4+floor(u_g3.y*5);
    return palette(floor(t*bands)/max(bands-1,1));
  }
  if (cm == 5){
    float ang = atan(p.y,p.x)/PI*0.5+0.5;
    return paletteCyc(mix(t,ang,0.52));
  }
  return palette(t);
}

vec3 sceneGenome(vec2 uv){
  vec2 p0 = toP(uv);
  int ft  = int(u_g1.x);
  int dop = int(u_g1.y);
  int cm  = int(u_g2.x);
  int sh  = int(u_g2.y);
  int ov  = int(u_g2.z);
  vec2 p = gnDomain(dop, p0*(0.6+u_g3.z*1.4));
  vec2 so = SO();
  p += u_g1.z*u_warp*0.8*vec2(fbm(p*0.6+so)-0.5,fbm(p*0.6-so)-0.5)*2;
  float e = 0.05;
  float f  = gnField(ft, p);
  float fx = gnField(ft, p+vec2(e,0));
  float fy = gnField(ft, p+vec2(0,e));
  vec2 grad = vec2((fx-f)/e,(fy-f)/e);
  vec3 col = gnColor(cm, f*1.15-0.05, p);
  if (sh == 1){
    vec3 n = normalize(vec3(-grad.x*2,-grad.y*2,1));
    float la = u_lightAngle*PI/180;
    vec3 L = normalize(vec3(cos(la),sin(la),0.6));
    float diff = max(dot(n,L),0);
    float spec = pow(max(dot(n,normalize(L+vec3(0,0,1))),0), u_gloss);
    col *= 0.35+0.8*diff;
    col += vec3(1)*spec*u_light*0.7;
  } else if (sh == 2){
    float g = (abs(fx-f)+abs(fy-f))*1.25;
    col = mix(u_bg, col, 0.35);
    col += palette(clamp(f+0.2,0,1))*smoothstep(0.01,0.14,g)*u_light*1.4;
  } else if (sh == 3){
    col *= smoothstep(0,0.55,f)*1.15;
    col = mix(u_bg, col, smoothstep(0.08,0.35,f));
  } else if (sh == 4){
    float fres = pow(1-clamp(length(grad)*1.4,0,1),2.2);
    col *= 0.86+0.14*abs(sin(p0.x*u_lines*0.28));
    col += vec3(1)*fres*u_light*0.16;
  }
  if (ov == 1){
    float s = sin(p0.x*u_g2.w*40+f*6);
    col *= 0.82+0.18*smoothstep(-0.2,0.4,s);
  } else if (ov == 2){
    vec2 gd = fract(p0*u_g2.w*16)-0.5;
    col *= 0.78+0.22*smoothstep(0.42,0.30,length(gd));
  } else if (ov == 3){
    col *= 0.86+0.14*sin(uv.y*u_res.y*0.7+f*3);
  } else if (ov == 4){
    float wx = sin(p0.x*28+f*4);
    float wy = sin(p0.y*28-f*4);
    col *= 0.90+0.10*smoothstep(-0.2,0.5,wx*wy);
  }
  return col;
}

/* ---------------- dispatch + post ---------------- */

vec3 sceneFor(int m, vec2 uv){
  if (m == 0) return sceneChrome(uv);
  if (m == 1) return sceneSilk(uv);
  if (m == 2) return sceneBloom(uv);
  if (m == 3) return sceneAura(uv);
  if (m == 4) return sceneRays(uv);
  if (m == 5) return sceneHalftone(uv);
  if (m == 6) return sceneGlyphs(uv);
  if (m == 7) return sceneReeded(uv);
  return sceneMosaic(uv);
}

vec3 scene(vec2 uv){
  if (u_genome == 1) return sceneGenome(uv);
  return sceneFor(u_mode, uv);
}

void main(){
  vec2 uv = vUv;
  vec3 col = scene(uv);

  if (u_ca > 0.004){
    float asp0 = u_res.x/u_res.y;
    float r2 = length((uv-0.5)*vec2(asp0,1));
    float w = clamp(u_ca,0,1)*smoothstep(0.18,0.85,r2)*0.45;
    vec3 shifted = vec3(hueRotate(col,10).r, col.g, hueRotate(col,-10).b);
    col = mix(col, shifted, w);
  }

  float lum = dot(col, vec3(0.299,0.587,0.114));
  col += u_glow * col * lum * 0.85;

  if (abs(u_hue) > 0.5) col = hueRotate(col, u_hue);
  float l2 = dot(col, vec3(0.299,0.587,0.114));
  col = mix(vec3(l2), col, u_sat);
  col *= u_exposure;
  col = (col-0.5)*u_contrast+0.5;

  float asp = u_res.x/u_res.y;
  vec2 vc = (uv-0.5)*vec2(asp,1);
  col *= 1-u_vig*smoothstep(0.35,1.05,length(vc));

  float gstep = floor(u_phase*24);
  float gr = hash21(vUv*u_res*0.71+vec2(gstep*3.1,gstep*7.7));
  col += (gr-0.5)*u_grain*0.55;

  gl_FragColor = vec4(clamp(col,0,1), 1);
}
`;

/* ───────────────────────────────────────────────────────────────────────
 * Mode names & metadata
 * ─────────────────────────────────────────────────────────────────────── */

export const SHADER_MODES = [
  { id: 'chrome',  name: 'Liquid Chrome',   mode: 0, icon: '🔮' },
  { id: 'silk',    name: 'Silk Ribbons',    mode: 1, icon: '🧵' },
  { id: 'bloom',   name: 'Soft Bloom',      mode: 2, icon: '🌸' },
  { id: 'aura',    name: 'Aura Rings',      mode: 3, icon: '🌀' },
  { id: 'rays',    name: 'Light Rays',      mode: 4, icon: '☀️' },
  { id: 'halftone',name: 'Halftone Dots',   mode: 5, icon: '🔵' },
  { id: 'glyphs',  name: 'Data Glyphs',     mode: 6, icon: '🔣' },
  { id: 'reeded',  name: 'Reeded Glass',    mode: 7, icon: '🪟' },
  { id: 'mosaic',  name: 'Pixel Bloom',     mode: 8, icon: '🧩' },
];

/* ───────────────────────────────────────────────────────────────────────
 * Default uniform values
 * ─────────────────────────────────────────────────────────────────────── */

const DEFAULT_UNIFORMS = {
  u_res:     { value: new THREE.Vector2(1024, 1024) },
  u_phase:   { value: 0.0 },
  u_seed:    { value: Math.random() * 1000 },
  u_mode:    { value: 0 },

  u_c1: { value: new THREE.Color(0xff4444) },
  u_c2: { value: new THREE.Color(0x44aaff) },
  u_c3: { value: new THREE.Color(0xffaa44) },
  u_c4: { value: new THREE.Color(0xaa44ff) },
  u_bg: { value: new THREE.Color(0x111111) },

  u_hue:      { value: 0.0 },
  u_sat:      { value: 1.0 },
  u_exposure: { value: 1.0 },
  u_contrast: { value: 1.0 },

  u_scale:    { value: 1.0 },
  u_complex:  { value: 4.0 },
  u_warp:     { value: 0.5 },
  u_flow:     { value: 0.5 },
  u_stretch:  { value: 0.0 },

  u_light:      { value: 1.0 },
  u_gloss:      { value: 40.0 },
  u_lightAngle: { value: 45.0 },
  u_irid:       { value: 0.5 },
  u_glow:       { value: 0.2 },

  u_grain: { value: 0.05 },
  u_cell:  { value: 12.0 },
  u_lines: { value: 10.0 },
  u_ca:    { value: 0.02 },
  u_vig:   { value: 0.15 },
  u_soft:  { value: 0.12 },
  u_travel:{ value: 0.15 },

  u_synth: { value: 0 },
  u_modeB: { value: 1 },
  u_mixOp: { value: 0 },
  u_blend: { value: 0.5 },

  u_genome: { value: 0 },
  u_g1: { value: new THREE.Vector4(0, 0, 0.5, 0) },
  u_g2: { value: new THREE.Vector4(0, 0, 0, 1.0) },
  u_g3: { value: new THREE.Vector4(0.2, 0.5, 0.5, 0) },
};

/**
 * Colors passed as hex strings or { r, g, b } objects are converted
 * to THREE.Color. Pre-set colors are applied as defaults.
 */
export function createDefaultUniforms(overrides = {}) {
  const u = {};
  for (const [key, val] of Object.entries(DEFAULT_UNIFORMS)) {
    u[key] = { value: val.value.clone ? val.value.clone() : val.value };
  }
  // Apply overrides with type guard for scalar vs Three.js objects
  for (const [key, val] of Object.entries(overrides)) {
    if (u[key]) {
      const v = val.value !== undefined ? val.value : val;
      const target = u[key].value;
      if (target && typeof target === 'object') {
        if (target.isVector2) {
          if (Array.isArray(v)) target.set(v[0], v[1]);
          else target.copy(v);
        } else if (target.isVector4) {
          if (Array.isArray(v)) target.set(v[0], v[1], v[2], v[3]);
          else target.copy(v);
        } else if (target.isColor) {
          target.set(v);
        } else {
          u[key].value = v;
        }
      } else {
        u[key].value = v;
      }
    }
  }
  return u;
}

/* ───────────────────────────────────────────────────────────────────────
 * ShaderMaterial factory
 * ─────────────────────────────────────────────────────────────────────── */

/**
 * Create a Three.js ShaderMaterial for a given Lumen shader mode.
 *
 * @param {string|number} mode - Mode id string ('chrome', 'silk', etc.) or index (0-8)
 * @param {object} [uniformOverrides] - Custom uniform values
 * @param {number} [res=1024] - Internal resolution for u_res
 * @returns {THREE.ShaderMaterial}
 */
export function createLumenMaterial(mode, uniformOverrides = {}, res = 1024) {
  // Resolve mode index
  let modeIndex;
  if (typeof mode === 'number') {
    modeIndex = Math.max(0, Math.min(8, Math.floor(mode)));
  } else {
    const entry = SHADER_MODES.find(m => m.id === mode || m.name === mode);
    modeIndex = entry ? entry.mode : 0;
  }

  const uniforms = createDefaultUniforms({
    u_mode: { value: modeIndex },
    u_res:  { value: new THREE.Vector2(res, res) },
    u_seed: { value: Math.floor(Math.random() * 9999) },
    ...uniformOverrides,
  });

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: LUMEN_VERT,
    fragmentShader: LUMEN_FRAG,
    side: THREE.DoubleSide,
    transparent: false,
  });

  // Attach metadata for the panel UI
  mat.userData.lumenMode = modeIndex;
  mat.userData.lumenId = mode;

  return mat;
}

/**
 * Update the phase uniform on a lumen material (call from animation loop).
 * @param {THREE.ShaderMaterial} mat
 * @param {number} phase - 0..1 loop phase
 */
export function updateLumenPhase(mat, phase) {
  if (mat.uniforms && mat.uniforms.u_phase) {
    mat.uniforms.u_phase.value = phase % 1.0;
  }
}

/**
 * Clone a lumen material for independent use.
 * @param {THREE.ShaderMaterial} mat
 * @returns {THREE.ShaderMaterial}
 */
export function cloneLumenMaterial(mat) {
  const u = {};
  for (const [key, val] of Object.entries(mat.uniforms)) {
    const v = val.value;
    u[key] = { value: v.clone ? v.clone() : v };
  }
  const clone = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: mat.vertexShader,
    fragmentShader: mat.fragmentShader,
    side: mat.side,
    transparent: mat.transparent,
  });
  clone.userData = { ...mat.userData };
  return clone;
}
