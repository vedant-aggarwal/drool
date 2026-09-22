# Character references

In **Stories**, add a character and choose **Add images**. PNG, JPEG and WebP originals are copied to the app's local IndexedDB storage, up to 20 MB each and 12 references per character. Rename them, preview them, download the original, or remove a reference from the character. Source files are never edited. Removing a reference or character does not change copies already used by other stories.

Choose **Save to library** to reuse a character in another project. The library includes appearance, personality, LoRA selection and reference metadata. **Add to story** creates an independent character copy; later edits do not silently change other projects. Save that copy again to retain its revised version in the library. **Remove saved copy** only removes its library entry.

On a storyboard panel, choose **Character reference** and the change strength, then approve the panel. The original is sent to the configured local image engine only when rendering. SDXL and SD 1.5 checkpoints support this path using the automatic workflow. A lower strength preserves more of the starting image; higher strength follows the new scene prompt more. Other model families and the Mac MLX route display an unsupported message and cannot silently ignore a chosen reference.

This is single-image image-to-image composition guidance, not face identity locking, IP-Adapter, or simultaneous multi-reference conditioning. No character reference bytes are embedded in story chat or sent automatically to Codex, Higgsfield or other cloud providers. The agent's storyboard panel tool can select a reference returned by `storyboard_read`, change its strength, and render an approved panel through the same supported local model families.

Reference selection and strength changes revoke panel approval. If a reference or visual instruction changes while a render is running, the old output stays in the gallery and is not attached to the edited panel.

References and library entries survive app restarts on the same profile. JSON project export includes reference metadata, **not the original image bytes**. Download originals separately when moving projects to another PC; a missing reference is reported instead of silently producing an unreferenced image. Clearing the application's local profile data also removes saved reference originals.

Validation: focused Story Studio, storyboard tool and Codex tool tests cover independent library reuse and rehydration, original upload routing, unsupported models, storage errors, reference selection validation, approval invalidation and preservation during agent edits. Real browser reference-upload verification is recorded separately in release validation.
