# Drool application icon

The 3.1.1 icon is a ruby liquid droplet with a subtle lowercase-d counterform,
on a pearly rounded tile. It uses a restrained macOS-style material treatment
without an Apple logo. The original transparent master is
[`public/drool-icon.png`](../public/drool-icon.png).

Created with the built-in image-generation tool. Prompt specification:

> One production-ready desktop application icon for Drool, a creative AI studio.
> A single sculpted liquid droplet subtly suggesting a lowercase d, centered on
> a softly rounded squircle tile. Premium macOS design language: clean geometry,
> satin glass and ceramic, soft highlights, shallow dimensionality, precise
> edges. Pearly white tile, coral-red droplet with ruby edges. Recognizable at
> 32 pixels. Straight-on view, transparent outside the tile, even margins.
> No words, Apple logo, watermark, sparkles, scene or presentation mockup.

Tauri's `icon` command produces the platform PNG, ICO and ICNS variants from the
master. Browser/touch PNGs use the same source. NSIS header/sidebar images place
the icon on white and use Windows-compatible 24-bit BMP. Keep the transparent
master when regenerating sizes; do not enlarge a small favicon.

The platform icon is separate from the upstream LU Cloud service marks, which
remain attributed to that service.
