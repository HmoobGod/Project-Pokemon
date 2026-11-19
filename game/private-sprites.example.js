// TEMPLATE — copy to game/public/private-sprites/sprites.js (that folder is git-ignored) and fill in.
// Only list sheets you are allowed to use. A sprite is ONLY used when its credit block is complete;
// otherwise that role keeps the original placeholder shape. Credit text is shown in-game exactly as
// written here, so copy author names, source and licence from the asset's own records — never guess.
//
// Roles: player, chaser (small enemy), brute (big enemy), boss (zone Guardian), legendary (Shrine Legendary). Any role you leave out stays a placeholder.
// image:       path inside private-sprites/ (.png or .webp, no "..", no http)
// frameWidth / frameHeight: size of ONE frame in pixels
// frames:      frames per row (animation length)
// directions:  1 (single row) or 8 (rows: Down, DownRight, Right, UpRight, Up, UpLeft, Left, DownLeft)
// fps:         animation speed (0 = first frame only)
// height:      on-screen height in world units (player is about 1.8)
// portrait:    OPTIONAL face picture for the HUD (e.g. SpriteCollab portrait/<id>/Normal.png), same credit
// name:        OPTIONAL name shown in the HUD (1-24 characters)
window.ARENA_PRIVATE_SPRITES = {
  version: 1,
  sprites: {
    player: {
      image: 'player/Walk-Anim.png',
      frameWidth: 0, // <-- fill in (e.g. from the sheet's AnimData.xml "Walk" FrameWidth)
      frameHeight: 0, // <-- fill in
      frames: 4,
      directions: 8,
      fps: 8,
      height: 1.8,
      // portrait: 'player/Normal.png',
      // name: '',
      credit: {
        title: '', // <-- e.g. the sprite's name/ID
        authors: [], // <-- every credited artist for this sheet, as listed by the source
        source: '', // <-- where you got it (e.g. repository + folder)
        license: '', // <-- e.g. 'CC BY-NC 4.0'
        licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/',
      },
    },
  },
};
