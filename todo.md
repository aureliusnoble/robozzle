# Robot Skin Ideas

## Currently Implemented
- [x] Classic (default) - Free
- [x] 3D Green - 25 stars
- [x] 3D Red - 50 stars
- [x] 3D Golden - 75 stars

---

## Planned Skins

### No Gate (Available to All)

| Skin | Cost | Particles |
|------|------|-----------|
| Frog | 25 | - |
| Bee | 25 | - |
| Panda | 30 | - |
| Camouflage | 35 | - |
| Zebra | 35 | - |
| Ginger Cat | 50 | - |

### 5-Star Gate (Must have solved a 5-star puzzle)

| Skin | Cost | Particles |
|------|------|-----------|
| Ghost | 45 | - |
| Bat | 50 | - |
| Fox | 55 | - |
| Leopard Print | 60 | - |
| 8-Bit Pixel | 75 | - |
| Wireframe | 75 | - |

### 10-Star Gate (Must have solved a 10-star puzzle)

| Skin | Cost | Particles |
|------|------|-----------|
| Zombie | 80 | - |
| Synthwave | 100 | Neon glow trail |
| Crystal | 120 | Sparkle aura |
| Steampunk | 130 | Steam puffs |
| Ice Golem | 140 | Frost particles |
| Shadow | 150 | Shadow wisps |
| Dragon | 175 | Fire breath embers |
| Fire Elemental | 175 | Rising flames |
| Phoenix | 175 | Ember trail |
| Unicorn | 200 | Rainbow shimmer trail |


### 15-Star Gate (Must have solved a 15-star puzzle)

| Skin | Cost | Particles |
|------|------|-----------|
| Gold | 400 | Golden glint sparkles |
| Diamond | 500 | Prismatic sparkle aura |

---

## Particle Effects Explained

Particle effects are small animated elements that appear around or trail behind the robot during gameplay. They make premium skins feel more special and visually distinct.

### Types of Particle Effects

**Trails** - Particles that follow behind the robot as it moves
- *Ember trail* (Phoenix): Small orange/red sparks that fade out behind the robot
- *Neon glow trail* (Synthwave): Bright pink/cyan streaks that linger briefly
- *Rainbow shimmer trail* (Unicorn): Pastel rainbow sparkles that trail behind

**Auras** - Particles that float around the robot at all times
- *Sparkle aura* (Crystal): Tiny white/rainbow glints that orbit the robot
- *Prismatic sparkle aura* (Diamond): Intense color-shifting sparkles with light refraction effect
- *Shadow wisps* (Shadow): Dark purple/black smoke tendrils that swirl around

**Ambient Effects** - Particles that emit upward or outward from the robot
- *Rising flames* (Fire Elemental): Small flames that flicker up from the robot's body
- *Frost particles* (Ice Golem): Tiny ice crystals and snowflakes drifting off
- *Steam puffs* (Steampunk): Small white puffs that emit periodically from "pipes"
- *Fire breath embers* (Dragon): Occasional sparks from the front when facing forward
- *Golden glint sparkles* (Gold): Subtle golden stars that twinkle on the surface

### Implementation Notes

- Particles should be subtle enough not to distract from gameplay
- Consider a user setting to disable particles for performance/preference
- Particles only render on the user's own robot (not when viewing others' solutions) to reduce visual clutter
- Use CSS animations or canvas for lightweight implementation
- Keep particle count low (5-15 particles max) for mobile performance

---

## Summary

| Gate | Skins | Cost Range |
|------|-------|------------|
| None | 6 | 25-50 stars |
| 5-star | 6 | 45-75 stars |
| 10-star | 9 | 80-200 stars |
| 15-star | 3 | 300-500 stars |
| **Total** | **24** | |
