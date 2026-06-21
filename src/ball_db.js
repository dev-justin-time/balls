export const BALL_DB = {
  rainbow: {
    name: 'Rainbow',
    price: 0,
    tex: 'Gemini_Generated_Image_dsfkzqdsfkzqdsfk.png',
    type: 'texture',
    ability: { key: 'coins', base: 1.0, perLevel: 0.15 },
    description: 'A vibrant multi-hued skin that slightly increases coin gain. Starter skin.'
  },
  wood: {
    name: 'Wood',
    price: 50,
    tex: 'wood_texture.png',
    type: 'texture',
    ability: { key: 'jump', base: 1.0, perLevel: 0.07 },
    description: 'Natural wood finish, modest jump boost and warm aesthetic.'
  },
  metal: {
    name: 'Chrome',
    price: 150,
    tex: 'ball_metal.png',
    type: 'texture',
    ability: { key: 'speed', base: 1.0, perLevel: 0.06 },
    description: 'Reflective chrome for a snappier roll and slightly improved speed.'
  },
  lava: {
    name: 'Lava',
    price: 300,
    tex: 'ball_lava.png',
    type: 'texture',
    ability: { key: 'coins', base: 1.05, perLevel: 0.12 },
    description: 'Molten surface that increases coin pickup rate; high contrast look.'
  },
  basketball: {
    name: 'Basketball',
    price: 80,
    tex: 'Basketball.png',
    type: 'texture',
    ability: { key: 'jump', base: 1.02, perLevel: 0.05 },
    description: 'Sporty grip and bounce characteristics, small jump bonus.'
  },
  bowling: {
    name: 'Bowling',
    price: 120,
    tex: 'bolos.png',
    type: 'texture',
    ability: { key: 'speed', base: 1.0, perLevel: 0.05 },
    description: 'Dense feel with steady speed gains per level.'
  },
  groovy: {
    name: 'Groovy',
    price: 12000,
    tex: 'dancing-groovy.webp',
    type: 'texture',
    ability: { key: 'speed', base: 1.40, perLevel: 0.18 },
    description: 'Animated premium skin with large speed multipliers; visual centerpiece.'
  },
  p2opp: {
    name: 'P2OPP (Glass)',
    price: 7500,
    tex: 'p2opp.gif',
    type: 'texture',
    ability: { key: 'coins', base: 1.25, perLevel: 0.1 },
    description: 'High-end glass-style skin with coin bonuses and translucent effect.'
  },
  nebula: {
    name: 'Nebula',
    price: 220,
    tex: 'scene_NEBULA.gltf',
    type: 'texture',
    ability: { key: 'coins', base: 1.05, perLevel: 0.08 },
    description: 'Cosmic glTF-based skin that provides modest coin bonuses and visual depth.'
  },
  rock_k: {
    name: 'Rock K',
    price: 120,
    tex: 'rock_k.jpg',
    type: 'texture',
    ability: { key: 'jump', base: 1.03, perLevel: 0.04 },
    description: 'Rough stone texture, reliable performance and a small jump buff.'
  },

  // Additional skins that were defined in main.js moved here to make this the single source of truth:
  diamond: { name: 'Diamond', price: 1000, tex: 'ball_metal.png', type: 'texture', ability: { key: 'coins', base: 1.2, perLevel: 0.12 }, description: 'Premium reflective diamond skin.' },
  obsidian: { name: 'Obsidian', price: 1500, tex: 'ball_lava.png', type: 'texture', ability: { key: 'jump', base: 1.15, perLevel: 0.08 }, description: 'Dark obsidian with strong jump ability.' },
  galaxy: { name: 'Galaxy', price: 2000, tex: 'Gemini_Generated_Image_dsfkzqdsfkzqdsfk.png', type: 'texture', ability: { key: 'speed', base: 1.12, perLevel: 0.08 }, description: 'Shifting galaxy pattern with speed bonus.' },
  golden: { name: 'Golden', price: 5000, tex: 'ball_metal.png', type: 'texture', ability: { key: 'coins', base: 1.35, perLevel: 0.14 }, description: 'High-value golden skin boosting coin gain.' },
  ember: { name: 'Ember', price: 180, tex: 'ball_lava.png', type: 'texture', ability: { key: 'jump', base: 1.03, perLevel: 0.06 }, description: 'Hot ember texture with small jump bonus.' },
  polished: { name: 'Polished', price: 200, tex: 'ball_metal.png', type: 'texture', ability: { key: 'speed', base: 1.04, perLevel: 0.05 }, description: 'Smooth polished metal skin.' },
  oak: { name: 'Oak', price: 60, tex: 'wood_texture.png', type: 'texture', ability: { key: 'jump', base: 1.01, perLevel: 0.04 }, description: 'Simple oak finish.' },
  sunset: { name: 'Sunset', price: 140, tex: 'sky_sunset.png', type: 'texture', ability: { key: 'coins', base: 1.02, perLevel: 0.05 }, description: 'Warm sunset-hued skin.' },
  midnight: { name: 'Midnight', price: 260, tex: 'sky_night.png', type: 'texture', ability: { key: 'speed', base: 1.06, perLevel: 0.06 }, description: 'Dark midnight skin with speed.' },
  aurora: { name: 'Aurora', price: 420, tex: 'sky_void.png', type: 'texture', ability: { key: 'coins', base: 1.08, perLevel: 0.07 }, description: 'Aurora-like shimmer.' },
  mosaic: { name: 'Mosaic', price: 350, tex: 'Gemini_Generated_Image_dsfkzqdsfkzqdsfk.png', type: 'texture', ability: { key: 'speed', base: 1.05, perLevel: 0.06 }, description: 'Colorful mosaic.' },
  marble: { name: 'Marble', price: 190, tex: 'ball_metal.png', type: 'texture', ability: { key: 'jump', base: 1.04, perLevel: 0.05 }, description: 'Marbled skin.' },
  citrus: { name: 'Citrus', price: 75, tex: 'Basketball.png', type: 'texture', ability: { key: 'coins', base: 1.01, perLevel: 0.03 }, description: 'Bright citrus theme.' },
  cobalt: { name: 'Cobalt', price: 130, tex: 'bolos.png', type: 'texture', ability: { key: 'speed', base: 1.03, perLevel: 0.04 }, description: 'Deep blue cobalt.' },
  graphite: { name: 'Graphite', price: 300, tex: 'ball_metal.png', type: 'texture', ability: { key: 'coins', base: 1.06, perLevel: 0.06 }, description: 'Dark graphite finish.' },
  ember_core: { name: 'Ember Core', price: 450, tex: 'ball_lava.png', type: 'texture', ability: { key: 'jump', base: 1.06, perLevel: 0.07 }, description: 'Core ember variant.' },
  prism: { name: 'Prism', price: 380, tex: 'Gemini_Generated_Image_dsfkzqdsfkzqdsfk.png', type: 'texture', ability: { key: 'coins', base: 1.07, perLevel: 0.06 }, description: 'Prismatic reflections.' },
  driftwood: { name: 'Driftwood', price: 95, tex: 'wood_texture.png', type: 'texture', ability: { key: 'jump', base: 1.02, perLevel: 0.04 }, description: 'Weathered driftwood.' },
  chrome_stripe: { name: 'Chrome Stripe', price: 240, tex: 'ball_metal.png', type: 'texture', ability: { key: 'speed', base: 1.05, perLevel: 0.06 }, description: 'Striped chrome.' },
  lava_flow: { name: 'Lava Flow', price: 320, tex: 'ball_lava.png', type: 'texture', ability: { key: 'coins', base: 1.09, perLevel: 0.07 }, description: 'Flowing lava texture.' },
  retro_orb: { name: 'Retro Orb', price: 160, tex: 'sky_sunset.png', type: 'texture', ability: { key: 'speed', base: 1.02, perLevel: 0.03 }, description: 'Retro color orb.' },
  starlight: { name: 'Starlight', price: 600, tex: 'sky_night.png', type: 'texture', ability: { key: 'coins', base: 1.12, perLevel: 0.08 }, description: 'Starlit sheen.' },
  cloudburst: { name: 'Cloudburst', price: 110, tex: '1eprhbtmvoo51.png', type: 'texture', ability: { key: 'jump', base: 1.03, perLevel: 0.05 }, description: 'Cloud-themed skin.' },
  sunmetal: { name: 'Sunmetal', price: 520, tex: 'ball_metal.png', type: 'texture', ability: { key: 'speed', base: 1.08, perLevel: 0.07 }, description: 'Sunlit metal.' },
  magma_core: { name: 'Magma Core', price: 700, tex: 'ball_lava.png', type: 'texture', ability: { key: 'coins', base: 1.15, perLevel: 0.09 }, description: 'Magma core powerful coin skin.' },
  coral: { name: 'Coral', price: 85, tex: 'Basketball.png', type: 'texture', ability: { key: 'jump', base: 1.01, perLevel: 0.03 }, description: 'Coral texture.' },
  sapphire: { name: 'Sapphire', price: 420, tex: 'bolos.png', type: 'texture', ability: { key: 'coins', base: 1.1, perLevel: 0.07 }, description: 'Sapphire toned skin.' },
  voidglass: { name: 'Voidglass', price: 980, tex: 'Gemini_Generated_Image_dsfkzqdsfkzqdsfk.png', type: 'texture', ability: { key: 'speed', base: 1.12, perLevel: 0.08 }, description: 'Void-like glass skin.' },

  // Marble / alien / project assets
  marble_orochiaro: { name: 'Orochiaro Marble', price: 200, tex: 'marble_orochiaro_white_t.jpg', type: 'texture', ability: { key: 'coins', base: 1.04, perLevel: 0.05 }, description: 'White marble veining.' },
  marble_grey: { name: 'Marble Grey', price: 180, tex: 'Marble-grey_t.jpg', type: 'texture', ability: { key: 'speed', base: 1.03, perLevel: 0.04 }, description: 'Grey marble.' },
  marble_luar: { name: 'Marble Luar', price: 175, tex: 'Marble-luar_t.jpg', type: 'texture', ability: { key: 'jump', base: 1.02, perLevel: 0.03 }, description: 'Pale marble swirls.' },
  marble9: { name: 'Ocean Marble', price: 210, tex: 'marble9.jpg', type: 'texture', ability: { key: 'coins', base: 1.05, perLevel: 0.05 }, description: 'Aerial ocean marble.' },
  purpleveins: { name: 'Purple Veins', price: 160, tex: 'purpleveins.jpg', type: 'texture', ability: { key: 'speed', base: 1.02, perLevel: 0.03 }, description: 'Subtle purple veins.' },
  marble8: { name: 'Beige Marble', price: 165, tex: 'marble8.jpg', type: 'texture', ability: { key: 'coins', base: 1.03, perLevel: 0.04 }, description: 'Beige marble pattern.' },

  alien_11: { name: 'Alien Warm', price: 220, tex: 'alien_11.jpg', type: 'texture', ability: { key: 'coins', base: 1.04, perLevel: 0.05 }, description: 'Warm alien texture.' },
  alien_14_variant: { name: 'Alien Wavy Variant', price: 230, tex: 'alien_14 (1).jpg', type: 'texture', ability: { key: 'speed', base: 1.03, perLevel: 0.04 }, description: 'Wavy alien texture variant.' },
  alien_6: { name: 'Alien Emboss', price: 200, tex: 'alien_6.jpg', type: 'texture', ability: { key: 'jump', base: 1.04, perLevel: 0.05 }, description: 'Embossed alien metallic.' },
  alien28c: { name: 'Frosty Ice', price: 210, tex: 'alien28c.jpg', type: 'texture', ability: { key: 'speed', base: 1.02, perLevel: 0.04 }, description: 'Frosted ice texture.' },
  alien_13: { name: 'Alien Rust', price: 205, tex: 'alien_13.jpg', type: 'texture', ability: { key: 'coins', base: 1.03, perLevel: 0.04 }, description: 'Rusty alien skin.' },
  alien_8: { name: 'Circular Rings', price: 190, tex: 'alien_8.jpg', type: 'texture', ability: { key: 'speed', base: 1.02, perLevel: 0.03 }, description: 'Ringed metallic pattern.' },
  alien41: { name: 'Green Abstract', price: 195, tex: 'alien41.jpg', type: 'texture', ability: { key: 'jump', base: 1.02, perLevel: 0.03 }, description: 'Green abstract texture.' },
  colored_stone1: { name: 'Blue Stone', price: 170, tex: 'colored_stone1.jpg', type: 'texture', ability: { key: 'coins', base: 1.02, perLevel: 0.03 }, description: 'Blue stone slab.' },
  alien_7: { name: 'Neon Ripples', price: 240, tex: 'alien_7.jpg', type: 'texture', ability: { key: 'speed', base: 1.04, perLevel: 0.05 }, description: 'Iridescent ripples.' },
  alien_3: { name: 'Alien Face', price: 260, tex: 'alien_3.jpg', type: 'texture', ability: { key: 'coins', base: 1.05, perLevel: 0.05 }, description: 'Alien face motif.' },
  alien_14: { name: 'Alien Wavy Ridged', price: 225, tex: 'alien_14.jpg', type: 'texture', ability: { key: 'jump', base: 1.03, perLevel: 0.04 }, description: 'Wavy ridged texture.' },

  // New skins added: Cute Eye (GLTF) and Fire Glass (fiery spirit texture in a glass ball)
  eye_ball: {
    name: 'Cute Eye',
    price: 900,
    tex: 'eye_low_poly_free_cute_eyeballs.glb',
    type: 'gltf',
    ability: { key: 'speed', base: 1.08, perLevel: 0.06 },
    description: 'A charming low-poly eye model wrapped as a dynamic skin — subtle speed boost and unique 3D look.'
  },

  fireglass: {
    name: 'Fire Glass',
    price: 2600,
    tex: 'Fire Spirit.webp',
    type: 'texture',
    ability: { key: 'coins', base: 1.30, perLevel: 0.12 },
    description: 'A glass-like orb containing a fiery spirit; strong coin multiplier with translucent glass visuals.'
  }
};