export const BALL_DB = {
  rainbow: {
    name: 'Rainbow',
    price: 0,
    tex: 'assets/image/ball/dsfk.webp',
    type: 'texture',
    ability: { key: 'coins', base: 1.0, perLevel: 0.15 },
    description: 'A vibrant multi-hued skin that slightly increases coin gain. Starter skin.'
  },
  wood: {
    name: 'Wood',
    price: 50,
    tex: 'assets/image/ball/wood_texture.webp',
    type: 'texture',
    ability: { key: 'jump', base: 1.0, perLevel: 0.07 },
    description: 'Natural wood finish, modest jump boost and warm aesthetic.'
  },
  metal: {
    name: 'Chrome',
    price: 150,
    tex: 'assets/image/ball/ball_metal.webp',
    type: 'texture',
    ability: { key: 'speed', base: 1.0, perLevel: 0.06 },
    description: 'Reflective chrome for a snappier roll and slightly improved speed.'
  },
  lava: {
    name: 'Lava',
    price: 300,
    tex: 'assets/image/ball/ball_lava.webp',
    type: 'texture',
    ability: { key: 'coins', base: 1.05, perLevel: 0.12 },
    description: 'Molten surface that increases coin pickup rate; high contrast look.'
  },
  basketball: {
    name: 'Basketball',
    price: 80,
    tex: 'assets/image/ball/Basketball.webp',
    type: 'texture',
    ability: { key: 'jump', base: 1.02, perLevel: 0.05 },
    description: 'Sporty grip and bounce characteristics, small jump bonus.'
  },
  bowling: {
    name: 'Bowling',
    price: 120,
    tex: 'assets/image/ball/bolos.webp',
    type: 'texture',
    ability: { key: 'speed', base: 1.0, perLevel: 0.05 },
    description: 'Dense feel with steady speed gains per level.'
  },
  groovy: {
    name: 'Groovy',
    price: 12000,
    tex: 'assets/image/ball/dancing-groovy.webp',
    type: 'texture',
    ability: { key: 'speed', base: 1.40, perLevel: 0.18 },
    description: 'Animated premium skin with large speed multipliers; visual centerpiece.'
  },
  p2opp: {
    name: 'P2OPP (Glass)',
    price: 7500,
    tex: 'assets/image/ball/p2opp.webp',
    type: 'texture',
    ability: { key: 'coins', base: 1.25, perLevel: 0.1 },
    description: 'High-end glass-style skin with coin bonuses and translucent effect.'
  },
  nebula: {
    name: 'Nebula',
    price: 220,
    tex: 'assets/model/scene_NEBULA.gltf',
    type: 'gltf',
    ability: { key: 'coins', base: 1.05, perLevel: 0.08 },
    description: 'Cosmic glTF-based skin that provides modest coin bonuses and visual depth.'
  },
  rock_k: {
    name: 'Rock K',
    price: 120,
    tex: 'assets/image/ball/rock_k.webp',
    type: 'texture',
    ability: { key: 'jump', base: 1.03, perLevel: 0.04 },
    description: 'Rough stone texture, reliable performance and a small jump buff.'
  },

  // Additional skins that were defined in main.js moved here to make this the single source of truth:
  diamond: { name: 'Diamond', price: 1000, tex: 'assets/image/ball/ball.webp', type: 'texture', ability: { key: 'coins', base: 1.2, perLevel: 0.12 }, description: 'Premium reflective diamond skin.' },
  obsidian: { name: 'Obsidian', price: 1500, tex: 'assets/image/ball/wawa-oh-the-misery.webp', type: 'texture', ability: { key: 'jump', base: 1.15, perLevel: 0.08 }, description: 'Dark obsidian with strong jump ability.' },
  galaxy: { name: 'Galaxy', price: 2000, tex: 'assets/image/ball/çek.webp', type: 'texture', ability: { key: 'speed', base: 1.12, perLevel: 0.08 }, description: 'Shifting galaxy pattern with speed bonus.' },
  golden: { name: 'Golden', price: 5000, tex: 'assets/image/ball/exercise-girl.webp', type: 'texture', ability: { key: 'coins', base: 1.35, perLevel: 0.14 }, description: 'High-value golden skin boosting coin gain.' },
  ember: { name: 'Ember', price: 180, tex: 'assets/image/ball/balls-nuts.gif', type: 'texture', ability: { key: 'jump', base: 1.03, perLevel: 0.06 }, description: 'Hot ember texture with small jump bonus.' },
  polished: { name: 'Polished', price: 200, tex: 'assets/image/ball/bowling-ball-bowling.webp', type: 'texture', ability: { key: 'speed', base: 1.04, perLevel: 0.05 }, description: 'Smooth polished metal skin.' },
  oak: { name: 'Oak', price: 60, tex: 'assets/image/ball/soldier3.webp', type: 'texture', ability: { key: 'jump', base: 1.01, perLevel: 0.04 }, description: 'Simple oak finish.' },
  sunset: { name: 'Sunset', price: 140, tex: 'assets/image/sky/sky_sunset.webp', type: 'texture', ability: { key: 'coins', base: 1.02, perLevel: 0.05 }, description: 'Warm sunset-hued skin.' },
  midnight: { name: 'Midnight', price: 260, tex: 'assets/image/sky/sky_night.webp', type: 'texture', ability: { key: 'speed', base: 1.06, perLevel: 0.06 }, description: 'Dark midnight skin with speed.' },
  aurora: { name: 'Aurora', price: 420, tex: 'assets/image/sky/sky_void.webp', type: 'texture', ability: { key: 'coins', base: 1.08, perLevel: 0.07 }, description: 'Aurora-like shimmer.' },
  mosaic: { name: 'Mosaic', price: 350, tex: 'assets/image/ball/hehe-dance.webp', type: 'texture', ability: { key: 'speed', base: 1.05, perLevel: 0.06 }, description: 'Colorful mosaic.' },
  marble: { name: 'Marble', price: 190, tex: 'assets/image/ball/bowling-strake.gif', type: 'texture', ability: { key: 'jump', base: 1.04, perLevel: 0.05 }, description: 'Marbled skin.' },
  citrus: { name: 'Citrus', price: 75, tex: 'assets/image/ball/life.gif', type: 'texture', ability: { key: 'coins', base: 1.01, perLevel: 0.03 }, description: 'Bright citrus theme.' },
  cobalt: { name: 'Cobalt', price: 130, tex: 'assets/image/ball/bowling-strike.gif', type: 'texture', ability: { key: 'speed', base: 1.03, perLevel: 0.04 }, description: 'Deep blue cobalt.' },
  graphite: { name: 'Graphite', price: 300, tex: 'assets/image/ball/funny-unfunny.gif', type: 'texture', ability: { key: 'coins', base: 1.06, perLevel: 0.06 }, description: 'Dark graphite finish.' },
  ember_core: { name: 'Ember Core', price: 450, tex: 'assets/image/ball/project-sekai-kamishiro-rui.gif', type: 'texture', ability: { key: 'jump', base: 1.06, perLevel: 0.07 }, description: 'Core ember variant.' },
  prism: { name: 'Prism', price: 380, tex: 'assets/image/ball/hi-silly.gif', type: 'texture', ability: { key: 'coins', base: 1.07, perLevel: 0.06 }, description: 'Prismatic reflections.' },
  driftwood: { name: 'Driftwood', price: 95, tex: 'assets/image/ball/venus_fly_trap.webp', type: 'texture', ability: { key: 'jump', base: 1.02, perLevel: 0.04 }, description: 'Weathered driftwood.' },
  chrome_stripe: { name: 'Chrome Stripe', price: 240, tex: 'assets/image/ball/hello-hi-red-heat-red-heat.gif', type: 'texture', ability: { key: 'speed', base: 1.05, perLevel: 0.06 }, description: 'Striped chrome.' },
  lava_flow: { name: 'Lava Flow', price: 320, tex: 'assets/image/ball/skeleton.webp', type: 'texture', ability: { key: 'coins', base: 1.09, perLevel: 0.07 }, description: 'Flowing lava texture.' },
  retro_orb: { name: 'Retro Orb', price: 160, tex: 'assets/image/sky/sky_sunset.webp', type: 'texture', ability: { key: 'speed', base: 1.02, perLevel: 0.03 }, description: 'Retro color orb.' },
  starlight: { name: 'Starlight', price: 600, tex: 'assets/image/sky/sky_night.webp', type: 'texture', ability: { key: 'coins', base: 1.12, perLevel: 0.08 }, description: 'Starlit sheen.' },
  cloudburst: { name: 'Cloudburst', price: 110, tex: 'assets/image/ball/1eprhbtmvoo51.webp', type: 'texture', ability: { key: 'jump', base: 1.03, perLevel: 0.05 }, description: 'Cloud-themed skin.' },
  sunmetal: { name: 'Sunmetal', price: 520, tex: 'assets/image/ball/lol-awkward.gif', type: 'texture', ability: { key: 'speed', base: 1.08, perLevel: 0.07 }, description: 'Sunlit metal.' },
  magma_core: { name: 'Magma Core', price: 700, tex: 'assets/image/ball/easter.gif', type: 'texture', ability: { key: 'coins', base: 1.15, perLevel: 0.09 }, description: 'Magma core powerful coin skin.' },
  coral: { name: 'Coral', price: 85, tex: 'assets/image/ball/love.gif', type: 'texture', ability: { key: 'jump', base: 1.01, perLevel: 0.03 }, description: 'Coral texture.' },
  sapphire: { name: 'Sapphire', price: 420, tex: 'assets/image/sky/sky_day.webp', type: 'texture', ability: { key: 'coins', base: 1.1, perLevel: 0.07 }, description: 'Sapphire toned skin.' },
  voidglass: { name: 'Voidglass', price: 980, tex: 'assets/image/ball/roblox-roblox-meme.gif', type: 'texture', ability: { key: 'speed', base: 1.12, perLevel: 0.08 }, description: 'Void-like glass skin.' },

  // Marble / alien / project assets
  marble_orochiaro: { name: 'Orochiaro Marble', price: 200, tex: 'assets/image/ball/marble_orochiaro_white_t.webp', type: 'texture', ability: { key: 'coins', base: 1.04, perLevel: 0.05 }, description: 'White marble veining.' },
  marble_grey: { name: 'Marble Grey', price: 180, tex: 'assets/image/ball/Marble-grey_t.webp', type: 'texture', ability: { key: 'speed', base: 1.03, perLevel: 0.04 }, description: 'Grey marble.' },
  marble_luar: { name: 'Marble Luar', price: 175, tex: 'assets/image/ball/Marble-luar_t.webp', type: 'texture', ability: { key: 'jump', base: 1.02, perLevel: 0.03 }, description: 'Pale marble swirls.' },
  marble9: { name: 'Ocean Marble', price: 210, tex: 'assets/image/ball/marble9.webp', type: 'texture', ability: { key: 'coins', base: 1.05, perLevel: 0.05 }, description: 'Aerial ocean marble.' },
  purpleveins: { name: 'Purple Veins', price: 160, tex: 'assets/image/ball/purpleveins.webp', type: 'texture', ability: { key: 'speed', base: 1.02, perLevel: 0.03 }, description: 'Subtle purple veins.' },
  marble8: { name: 'Beige Marble', price: 165, tex: 'assets/image/ball/marble8.webp', type: 'texture', ability: { key: 'coins', base: 1.03, perLevel: 0.04 }, description: 'Beige marble pattern.' },

  alien_11: { name: 'Alien Warm', price: 220, tex: 'assets/image/ball/alien_11.webp', type: 'texture', ability: { key: 'coins', base: 1.04, perLevel: 0.05 }, description: 'Warm alien texture.' },
  alien_14_variant: { name: 'Alien Wavy Variant', price: 230, tex: 'assets/image/ball/alien_14.webp', type: 'texture', ability: { key: 'speed', base: 1.03, perLevel: 0.04 }, description: 'Wavy alien texture variant.' },
  alien_6: { name: 'Alien Emboss', price: 200, tex: 'assets/image/ball/alien_6.webp', type: 'texture', ability: { key: 'jump', base: 1.04, perLevel: 0.05 }, description: 'Embossed alien metallic.' },
  alien28c: { name: 'Frosty Ice', price: 210, tex: 'assets/image/ball/alien28c.webp', type: 'texture', ability: { key: 'speed', base: 1.02, perLevel: 0.04 }, description: 'Frosted ice texture.' },
  alien_13: { name: 'Alien Rust', price: 205, tex: 'assets/image/ball/alien_13.webp', type: 'texture', ability: { key: 'coins', base: 1.03, perLevel: 0.04 }, description: 'Rusty alien skin.' },
  alien_8: { name: 'Circular Rings', price: 190, tex: 'assets/image/ball/alien_8.webp', type: 'texture', ability: { key: 'speed', base: 1.02, perLevel: 0.03 }, description: 'Ringed metallic pattern.' },
  alien41: { name: 'Green Abstract', price: 195, tex: 'assets/image/ball/alien41.webp', type: 'texture', ability: { key: 'jump', base: 1.02, perLevel: 0.03 }, description: 'Green abstract texture.' },
  colored_stone1: { name: 'Blue Stone', price: 170, tex: 'assets/image/ball/colored_stone1.webp', type: 'texture', ability: { key: 'coins', base: 1.02, perLevel: 0.03 }, description: 'Blue stone slab.' },
  alien_7: { name: 'Neon Ripples', price: 240, tex: 'assets/image/ball/alien_7.webp', type: 'texture', ability: { key: 'speed', base: 1.04, perLevel: 0.05 }, description: 'Iridescent ripples.' },
  alien_3: { name: 'Alien Face', price: 260, tex: 'assets/image/ball/alien_3.webp', type: 'texture', ability: { key: 'coins', base: 1.05, perLevel: 0.05 }, description: 'Alien face motif.' },
  alien_14: { name: 'Alien Wavy Ridged', price: 225, tex: 'assets/image/ball/alien_14.webp', type: 'texture', ability: { key: 'jump', base: 1.03, perLevel: 0.04 }, description: 'Wavy ridged texture.' },

  // New skins added: Cute Eye (GLTF) and Fire Glass (fiery spirit texture in a glass ball)
  eye_ball: {
    name: 'Cute Eye',
    price: 900,
    tex: 'assets/model/eye_low_poly_free_cute_eyeballs.glb',
    type: 'gltf',
    ability: { key: 'speed', base: 1.08, perLevel: 0.06 },
    description: 'A charming low-poly eye model wrapped as a dynamic skin — subtle speed boost and unique 3D look.'
  },

  fireglass: {
    name: 'Fire Glass',
    price: 2600,
    tex: 'assets/image/ball/fire_spirit.webp',
    type: 'texture',
    ability: { key: 'coins', base: 1.30, perLevel: 0.12 },
    description: 'A glass-like orb containing a fiery spirit; strong coin multiplier with translucent glass visuals.'
  },

  // --- New skins from unused assets (#2) ---
  eightball: {
    name: '8-Ball',
    price: 250,
    tex: 'assets/image/ball/8-ball-8-ball-pool.gif',
    type: 'texture',
    ability: { key: 'speed', base: 1.04, perLevel: 0.05 },
    description: 'Classic pool 8-ball with a steady roll and minor speed edge.'
  },
  dragon_orb: {
    name: 'Dragon Orb',
    price: 1800,
    tex: 'assets/image/ball/dragon-ball.webp',
    type: 'texture',
    ability: { key: 'coins', base: 1.18, perLevel: 0.10 },
    description: 'Mystical dragon sphere radiating coin fortune; premium looks and rewards.'
  },
  poke_sphere: {
    name: 'Poke Sphere',
    price: 600,
    tex: 'assets/image/ball/poke-balls-all-poke-balls.webp',
    type: 'texture',
    ability: { key: 'jump', base: 1.08, perLevel: 0.07 },
    description: 'Collector sphere with a bounce bonus — catch air, not monsters.'
  },
  tennis_chick: {
    name: 'Tennis Chick',
    price: 280,
    tex: 'assets/image/ball/tennis-ball-chick.webp',
    type: 'texture',
    ability: { key: 'jump', base: 1.04, perLevel: 0.05 },
    description: 'Fuzzy tennis fuzz meets playful chick energy; light, bouncy, fun.'
  },
  softball: {
    name: 'Softball',
    price: 220,
    tex: 'assets/image/ball/softball-ball.gif',
    type: 'texture',
    ability: { key: 'speed', base: 1.03, perLevel: 0.04 },
    description: 'Classic yellow softball — bigger than a baseball, rolls with authority.'
  },
  heavy_roller: {
    name: 'Heavy Roller',
    price: 450,
    tex: 'assets/image/ball/fat-bowling-ball.gif',
    type: 'texture',
    ability: { key: 'speed', base: 1.06, perLevel: 0.06 },
    description: 'A chunky bowling brute that bulldozes through levels with weighty rolls.'
  },
  bear_ball: {
    name: 'Bear Ball',
    price: 520,
    tex: 'assets/image/ball/bear-ball.gif',
    type: 'texture',
    ability: { key: 'jump', base: 1.07, perLevel: 0.06 },
    description: 'Grizzly-powered bounce — feels like a bear hug on every jump.'
  },
  rindo_emoji: {
    name: 'Rindo Emoji',
    price: 380,
    tex: 'assets/image/ball/emoji-rindo.webp',
    type: 'texture',
    ability: { key: 'coins', base: 1.06, perLevel: 0.06 },
    description: 'Expressive emoji ball that charms coins out of every corner.'
  },
  flushed_orb: {
    name: 'Flushed Orb',
    price: 340,
    tex: 'assets/image/ball/flushed-ball.webp',
    type: 'texture',
    ability: { key: 'speed', base: 1.04, perLevel: 0.05 },
    description: 'Embarrassed but fast — this anxious orb rolls quicker than it wants to.'
  },
  nba_pinch: {
    name: 'NBA Pinch',
    price: 440,
    tex: 'assets/image/ball/pinch-nba-ball.webp',
    type: 'texture',
    ability: { key: 'jump', base: 1.06, perLevel: 0.06 },
    description: 'Slam-dunk energy wrapped in a pinch of NBA swagger.'
  },
  ai_sphere: {
    name: 'AI Sphere',
    price: 3200,
    tex: 'assets/image/ball/balls-ai.webp',
    type: 'texture',
    ability: { key: 'speed', base: 1.25, perLevel: 0.14 },
    description: 'Neural-network-inspired skin with aggressive speed scaling; high-tech high-tier.'
  },
  cursed_cat: {
    name: 'Cursed Cat',
    price: 880,
    tex: 'assets/image/ball/cursed-cat-cat.webp',
    type: 'texture',
    ability: { key: 'coins', base: 1.14, perLevel: 0.09 },
    description: 'A mischievous feline aura that jinxes coins into your wallet. Bad luck for levels, good luck for you.'
  },
  cece_vibe: {
    name: 'Cece Vibe',
    price: 700,
    tex: 'assets/image/ball/cecesgif-cecesgifs.webp',
    type: 'texture',
    ability: { key: 'jump', base: 1.10, perLevel: 0.08 },
    description: 'Vibrant animated energy — bounces with infectious rhythm and style.'
  },
  ganyu_lick: {
    name: 'Ganyu Lick',
    price: 1100,
    tex: 'assets/image/ball/ganyu-lick.webp',
    type: 'texture',
    ability: { key: 'coins', base: 1.16, perLevel: 0.09 },
    description: 'Cryo-chilled charm that freezes extra coins into your path. Cool under pressure.'
  }
};