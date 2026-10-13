# Couple artwork

## Current: Segway pair

`couple-segway-v1.png` was generated with the built-in imagegen tool using the approved standing couple and the user's Segway photo as references. Transparent 1536 × 1024 artwork, one stable pose per character. The pair stays in the bottom-right corner with a gentle 0.65 px vibration and no fading or travel. SVG wheel-rim overlays align with the two foreground hubs; spokes rotate inside their perspective-scaled coordinate systems every 1.1 seconds. The original artwork remains unchanged. Modal/hidden-page pause and reduced-motion support are preserved.

Prompt brief: preserve the approved faces, hairstyles and proportions; male with thick black bangs, black hoodie/trousers and beige New Balance sneakers; female with inward-curled shoulder-length brown hair, gray hoodie, black trousers, white matching sneakers, no bag. Each rides a separate black two-wheel Segway, facing right, both hands on handlebars and both feet on the platform. Detailed Japanese RPG pixel illustration, transparent background, full bodies and wheels, no text, no overlap.

Verified production build, 390/320 px viewport overflow, asset loading, modal pause and reduced motion. Previous run atlases below are retained as historical assets and are no longer loaded by the component.

## Current: nine-frame cycles

`man-run-v2.png` and `woman-run-v2.png` are separate transparent 3×3 atlases generated with the built-in image tool from the approved v1 reference. Each is read left to right, then top to bottom, over 900 ms. Female playback is offset by 400 ms. Both images preload before display.

Generation brief: preserve identity, black/gray hoodies, black trousers and beige/white sneakers. Nine distinct right-facing poses per person. Correct the near arm from behind the hip through the waist to in front of the chest, then return; alternate arms against legs. Equal cell sizes, consistent scale, transparent background, no bags or text. The nine-cell playback, modal pause and reduced motion were checked in Chrome.

## Previous four-frame reference

`couple-run-v1.png` is an original transparent atlas generated with the built-in image generation tool using the user's approved character art as reference. Size: 1774 × 887; four equal columns and two equal rows (male above, female below). CSS samples normalized cell coordinates without destructive resampling. Four poses play over 720 ms, with a half-cycle phase offset between characters.

Generation brief: preserve the approved modern Japanese RPG character designs; male with short thick black bangs, black hoodie and trousers, beige New Balance sneakers; female with subtly brown shoulder-length inward-curled hair, gray hoodie, black long trousers, white matching sneakers, no bags. Both run right without touching. Four frames per person: extended stride, passing pose, opposite stride, lifted-knee pose. Consistent character scale, shading, transparent background, no scene or text.

This is generated animation artwork, not an extracted asset from the reference game/video. The low-frame-rate animation is intentionally stylized. Reduced-motion users see a static pose. Source component: `src/PixelCouple.tsx`; playback styles: `src/runner-game.css`.
