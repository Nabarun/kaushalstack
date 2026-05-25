// Deterministic illustrated robot avatar — completely neutral, no gender, no religion, no bias.
// Every agent name gets a unique bot face. Same name always gets the same avatar.

const BG_COLORS = 'b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf,f0fdf4,fef9c3,fce7f3,e0f2fe,f3e8ff'

export function avatarUrl(name) {
  const seed = encodeURIComponent((name || 'Agent').trim())
  return `https://api.dicebear.com/9.x/bottts/svg?seed=${seed}&backgroundColor=${BG_COLORS}&radius=50`
}
