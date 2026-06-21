// Deterministic illustrated robot avatar — completely neutral, no gender, no religion, no bias.
// Every agent name gets a unique bot face. Same name always gets the same avatar.

const BG_COLORS = 'b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf,f0fdf4,fef9c3,fce7f3,e0f2fe,f3e8ff'

// Color themes used to visually distinguish the creative-pipeline robots — warm
// pinks/purples for Maya & Ananya, cool blues/steel for Hostinger. The robot
// faces themselves stay deterministic per name (and gender-neutral by design).
const BG_THEMES = {
  warm: 'ffd5dc,fce7f3,f3e8ff,c0aede',
  cool: 'b6e3f4,d1d4f9,e0f2fe,a7c7e7',
}

export function avatarUrl(name, opts = {}) {
  const seed = encodeURIComponent((name || 'Agent').trim())
  const bg   = (opts.theme && BG_THEMES[opts.theme]) || opts.backgroundColor || BG_COLORS
  return `https://api.dicebear.com/9.x/bottts/svg?seed=${seed}&backgroundColor=${bg}&radius=50`
}
