# Plan: Connect a folder (Chrome) — folder-backed annotation with autosave + disk delete

## Context

While annotating, the user needs to (1) stop losing work on accidental back-swipe/refresh and (2) delete bad images from the dataset without the dev-tools → copy filename → Finder → delete dance. The browser cannot touch disk from drag-dropped `File` objects, so the real fix is the **File System Access API** (Chrome/Edge, secure context). Connecting the actual dataset folder lets us read images, **autosave YOLO labels back into the folder in place**, and **delete an image file from disk** — a proper desktop-grade workflow.

This also **replaces** the earlier IndexedDB "autosave + restore session" feature, which is being dropped. That feature crashed on restore: it put annotations into state and the editor rendered labels before the image was in `ImageRepository`, so `RenderEngineUtil.calculateImageScale` read `width` on a null image (`src/utils/RenderEngineUtil.ts:14`). The folder loader avoids this by awaiting image load **before** the editor mounts (the pattern the YOLO importers already use).

Target browser: Chrome/Edge ≥105 over HTTPS or `localhost` (≥105 so `showDirectoryPicker({mode: 'readwrite'})` can grant write access in the pick itself). The whole feature is gated on capability + an active folder connection; other browsers keep the existing drag-drop flow untouched.

---

## Part A — Remove the IndexedDB autosave/restore feature

Delete:
- `src/logic/autosave/AutoSaveEngine.ts`, `AutoSaveStorage.ts`, `AutoSaveTypes.ts`
- `src/views/PopupView/RestoreSessionPopup/RestoreSessionPopup.tsx` + `.scss`

Revert the wiring in:
- `src/data/enums/PopupWindowType.ts` — remove `RESTORE_SESSION`
- `src/views/PopupView/PopupView.tsx` — remove the `RESTORE_SESSION` case + import
- `src/logic/initializer/AppInitializer.ts` — remove `AutoSaveEngine.init()` + `offerSessionRestore()`
- `src/views/PopupView/ExitProjectPopup/ExitProjectPopup.tsx` — remove `AutoSaveEngine.clear()`
- `src/views/EditorView/EditorTopNavigationBar/EditorTopNavigationBar.tsx` — remove the autosave toggle (will be re-added as a folder-autosave toggle in Part B)

---

## Part B — Folder connection feature

### Reused existing code (do not reinvent)
- Crash-safe load sequence to mirror: `src/logic/import/yolo/YOLOPolygonImporter.ts` (`await ImageDataUtil.loadMissingImages(...)` before annotations render).
- Lazy per-image loading is free: `Editor.loadImage` (`src/views/EditorView/Editor/Editor.tsx:114`) already loads any `loadStatus=false` image straight from `imageData.fileData`, so a `File` obtained via `FileSystemFileHandle.getFile()` works in the existing lazy path unchanged. Note `FileUtil.loadImage` reads images as **base64 data URLs** — eager-loading must stay limited to images that actually need it (see open sequence).
- `ImageDataUtil.createImageDataFromFileData`, `ImageDataUtil.loadMissingImages` (`src/utils/ImageDataUtil.ts`).
- Write YOLO: `RectLabelsExporter.wrapRectLabelIntoYOLO(rect, labelNames, imageSize)` and `YOLOPolygonExporter.wrapPolygonLabelIntoYOLO(polygon, labelNames, imageSize)`.
- Read YOLO: `YOLOUtils.parseYOLOAnnotationsFromString`, `parseYOLOPolygonAnnotationsFromString`, `parseLabelsNamesFromString` (`src/logic/import/yolo/YOLOUtils.ts`).
- `imageSize` from `ImageRepository.getById(id)` → `{width, height}`.
- Store-subscription + ref-equality skip + lodash `debounce` pattern (from the now-removed `AutoSaveEngine`) for the folder autosave engine.
- IndexedDB wrapper shape (from the now-removed `AutoSaveStorage`) for persisting the directory handle.
- `GenericYesNoPopup`, `submitNewNotification` + `NotificationUtil`, `ImageButton`, `TextButton`, `ImageActions.getImageByIndex`.

### New files
- `src/types/file-system-access.d.ts` — minimal ambient typings (TS 4.7.4 `lib.dom` lacks them): `Window.showDirectoryPicker`, `FileSystemDirectoryHandle.values()/entries()`, `FileSystemFileHandle.createWritable()`, `FileSystemHandle.queryPermission/requestPermission`, `FileSystemWritableFileStream`.
- `src/logic/imageRepository/FileSystemRepository.ts` — static singleton (mirrors `ImageRepository`): holds `directoryHandle`, cached `labels/` dir handle, `id → FileSystemFileHandle` map, `id → basename` map. `isConnected()`, `getOrCreateLabelsDir()`, `removeImageEntry(id)`, `reset()`.
- `src/logic/fileSystem/FileSystemPermissionUtil.ts` — `verify(handle)` (queryPermission only), `requestInGesture(handle)` (requestPermission — call from a click handler only; needed by the **reconnect** path only — the open path gets readwrite at pick time).
- `src/logic/fileSystem/FileSystemImporter.ts` — `pickDirectory()` (`showDirectoryPicker({mode: 'readwrite'})` — one prompt grants read+write), `enumerateImageFiles(dir)` (filter `kind==='file'` + jpg/jpeg/png, sort by name), `loadFolder(dir): Promise<FolderLoadResult>` implementing the crash-safe sequence and reading existing labels.
- `src/logic/fileSystem/FileSystemLabelWriter.ts` — `writeLabelsNamesFile(dir, labelNames)` (root `labels.txt`), `writeImageLabelFile(labelsDir, imageData, labelNames)` (writes `labels/<base>.txt`; **auto-per-image**: polygons if the image has any, else boxes; empty content → `removeEntry` the stale `.txt`).
- `src/logic/fileSystem/FolderAutoSaveEngine.ts` — store subscription, debounced (~1.5s), per-image **reference diff** so only the edited image's `.txt` is rewritten (always rewrite the tiny `labels.txt`); **label-names change → `rewriteAll()`** (see autosave section). `attach/detach/flushPending/rewriteAll/persist`, enabled flag in localStorage (default on), `queryPermission` each tick and pause + warn if permission lost.
- `src/logic/fileSystem/FolderProjectActions.ts` — store bridge: `openFolder()`, `openFolderFromHandle(handle)`, `deleteActiveImage()`, holds `pendingReconnectHandle`.
- `src/logic/fileSystem/FileSystemHandleStorage.ts` — IndexedDB persistence of `{handle, name, savedAt}` (handles are structured-cloneable).
- `src/views/PopupView/ReconnectFolderPopup/ReconnectFolderPopup.tsx` (+`.scss`) — "Reconnect to <folder>?" via `GenericYesNoPopup`; Accept (user gesture) → `requestInGesture` → `openFolderFromHandle`.
- `src/utils/ClipboardUtil.ts` — `copyText(text)` with `navigator.clipboard` + fallback.

### The crash-safe open sequence (`FolderProjectActions.openFolder`)
1. Guard `PlatformModel.supportsFileSystemAccessAPI`; else error notification, return.
2. `dir = await FileSystemImporter.pickDirectory()` — `showDirectoryPicker({mode: 'readwrite'})`, so the pick itself grants read+write (no separate `requestPermission`, single prompt). Swallow `AbortError` (user cancel).
3. Show `LOADER` popup. `result = await FileSystemImporter.loadFolder(dir)` — inside it:
   - Enumerate image files → build `ImageData[]` (store file handles + basenames), all `loadStatus=false`.
   - If `labels.txt` + `labels/` exist: parse classes; read each existing `labels/<base>.txt`; **eager-load only the images that have a label file** (`loadMissingImages` on that subset, then set their `loadStatus=true`) — YOLO coordinate math needs the image size, and annotations must never enter state before their image is in `ImageRepository` (the restore-crash lesson). Per-file first-line token count picks box (5 tokens) vs polygon (≥7) parser.
   - Images without label files — and the entire no-labels case — stay `loadStatus=false`: the editor lazy-loads them from `imageData.fileData` exactly like drag-drop (`Editor.loadImage`). Opening a fresh folder decodes **nothing** upfront, so large folders open fast and don't hold base64 data URLs for every image.
4. **Dispatch order (mounts editor last):** `updateImageData(result.imagesData)` → `updateActiveImageIndex(0)` → `updateActiveLabelType(result.activeLabelType)` → if labels present `updateLabelNames(result.labelNames)` → **`updateProjectData({...projectData, type: ProjectType.OBJECT_DETECTION})` LAST** (`updateProjectData` takes a full `ProjectData` — same spread as `ImagesDropZone.startEditor`). Clear LOADER.
5. `FolderAutoSaveEngine.attach()` + persist handle via `FileSystemHandleStorage.save(...)`. If no labels found → open `INSERT_LABEL_NAMES`. Success notification with image/annotation counts.
6. On any failure (empty folder, permission, load error): notify and **do not** flip project type.

### Entry button
- `src/views/MainView/ImagesDropZone/ImagesDropZone.tsx` — add an "Open folder" `TextButton` in the `.DropZoneButtons` row, `onClick={() => FolderProjectActions.openFolder()}`. Disabled (with tooltip) when `!PlatformModel.supportsFileSystemAccessAPI`. Icon `ico/files.png`.

### Bottom bar: copy + delete (`src/views/EditorView/EditorBottomNavigationBar/EditorBottomNavigationBar.tsx`)
- **Copy** `ImageButton` (`ico/file.png`) → `ClipboardUtil.copyText(imageData.fileData.name)` + success notification. Shown always.
- **Delete** `ImageButton` (`ico/trash.png`) → `FolderProjectActions.deleteActiveImage()`. Shown only when `FileSystemRepository.isConnected()`.

### Delete behavior (`deleteActiveImage`) — move to `.trash`, no confirm
1. `FolderAutoSaveEngine.flushPending()` (lodash `debounce.flush()` — **flush, not cancel**: a cancel would silently drop un-persisted edits to *other* images from the last ~1.5s), then `detach()`; `EditorModel.viewPortActionsDisabled = true`.
2. Copy image bytes (and its `labels/<base>.txt`) into a `.trash/` subfolder (`getDirectoryHandle('.trash',{create:true})`), then `dir.removeEntry(fileName)` + `labelsDir.removeEntry('<base>.txt')` (ignore NotFound).
3. Compute `next = imagesData.filter(i => i !== target)` and `newIndex = min(index, next.length - 1)`. **Dispatch `updateActiveImageIndex(newIndex)` BEFORE `updateImageData(next)`** — `newIndex` is in range for both the old and new arrays, so no intermediate render can observe an out-of-range active index; the editor reload triggers off the image-id change (`Editor.componentDidUpdate` compares `imageData.id`). Then `updateActiveLabelId(null)`. If `next.length === 0` → full teardown mirroring `ExitProjectPopup.onAccept` exactly (all six dispatches, incl. `updateActiveLabelNameId(null)` + `updateFirstLabelCreatedFlag(false)`) back to MainView.
4. `ImageRepository.removeById(id)` (small new method) + `FileSystemRepository.removeImageEntry(id)`.
5. Re-attach autosave; reset its `prevImagesData` baseline; `viewPortActionsDisabled = false`.

### Autosave to folder (`FolderAutoSaveEngine`)
- Attaches only when a folder is connected; on by default; toggle in the top bar.
- Subscribe to store; skip when `state.labels` reference unchanged. Debounced persist (~1.5s):
  - **If the `labelNames` array reference changed vs the baseline → `rewriteAll()`.** YOLO class ids are *positions* in `labels.txt`; renaming/reordering/deleting a class silently invalidates every per-image file on disk, so the per-image diff alone would leave stale class indices on unedited images.
  - Otherwise per-image **reference diff** (`labelRects`/`labelPolygons`/`labelNameIds`) vs the baseline, so only the edited image's `labels/<base>.txt` is rewritten (auto-per-image format). Always rewrite the tiny `labels.txt`.
- Writer guard: skip an image whose `ImageRepository.getById(id)` is missing — a never-loaded image cannot have edits, and all annotated images were eager-loaded at open, so this only protects against pathological orderings.
- `queryPermission` each run; if lost — or any write throws (`NotAllowedError` etc.) — warning notification + pause until reconnect/toggle. All disk writes wrapped in try/catch: a failed write must never crash the store subscriber.
- `visibilitychange → hidden` flushes the pending debounce — cheap insurance against closing the tab inside the 1.5s window.
- `rewriteAll()` on initial open and when the toggle is switched back on.

### Reconnect on reload (`AppInitializer` + `ReconnectFolderPopup`)
- `AppInitializer.inti()` → `offerFolderReconnect()`: `FileSystemHandleStorage.load()`; if a record exists and no project active, `queryPermission`; stash handle on `FolderProjectActions.pendingReconnectHandle` and open `PopupWindowType.RECONNECT_FOLDER`. If denied/missing → clear record.
- `ReconnectFolderPopup` Accept (gesture) → `requestInGesture(handle)` → `openFolderFromHandle(handle)` (runs `loadFolder` without the picker). Reject → close (keep record).
- Add `PopupWindowType.RECONNECT_FOLDER` + register in `PopupView.tsx`.

### Top-bar toggle + status (`src/views/EditorView/EditorTopNavigationBar/EditorTopNavigationBar.tsx`)
- Folder-autosave on/off `ImageButton` (`ico/refresh.png`), shown only when connected; `useState(FolderAutoSaveEngine.isEnabled())`; tooltip shows ON/OFF + folder name.

### Supporting wiring
- `src/staticModels/PlatformModel.ts` + `src/utils/PlatformUtil.ts` — add `supportsFileSystemAccessAPI`; set it in `AppInitializer.detectDeviceParams`.
- `src/logic/imageRepository/ImageRepository.ts` — add `removeById(id)`.
- `src/views/PopupView/ExitProjectPopup/ExitProjectPopup.tsx` — on exit, `FolderAutoSaveEngine.detach()` + `FileSystemRepository.reset()` (keep the persisted handle so reconnect still works next visit).
- `src/data/enums/Notification.ts` + `src/data/info/NotificationsData.ts` — add entries: FS-API-unsupported, folder-empty, permission-denied, autosave-paused, load-error, filename-copied/copy-failed. (`NotificationsDataMap` is a `Record`, so missing entries fail compilation — self-checking.)
- Optional polish: `AppInitializer.handleAccidentalPageExit` — skip the beforeunload "are you sure" warning when a folder is connected and autosave is enabled (the work is already on disk).

### Edge cases
Cancel picker (AbortError → no-op); empty folder (notify, no mount); permission denied/lost (notify, pause, no crash); basename collision `a.jpg`+`a.png` → warn; delete last image → return to MainView; clearing all labels on an image → its `.txt` removed; large folders: only *annotated* images are decoded at open (a fresh folder decodes nothing — lazy like drag-drop), LOADER spinner shown while label files parse; folder enumeration is shallow (`values()`), so the `labels/` and `.trash/` subdirectories are naturally skipped (`kind==='file'` filter), as are `.DS_Store` & co. (extension filter).

---

## Decisions locked
- **Label format:** auto-per-image (polygons if any on the image, else boxes).
- **Delete:** move to `.trash/` subfolder, no confirmation (fast, recoverable).
- **Reconnect:** persist handle + auto-offer "Reconnect to <folder>?" on reload.
- **Classes file:** `labels.txt` at folder root (matches make-sense's own YOLO import convention).
- **Layout:** `labels/<basename>.txt` per image inside the chosen folder.

---

## Verification (Chrome, `npm run dev` over localhost)
1. `npx tsc --noEmit` passes (ambient `.d.ts` covers the API; every new Notification has a data entry). Build with `vite build` (use the install workaround: `npm install --ignore-scripts`, then rebuild the esbuild platform binary).
2. **Open folder, no labels:** pick a jpg/png folder → editor on first image near-instantly (no upfront decode of the whole folder) → INSERT_LABEL_NAMES; **no** "reading 'width'" console error; prev/next works (lazy load per image). Only **one** permission prompt (readwrite at pick).
3. **Open folder, with labels:** pre-make `labels.txt` + `labels/<base>.txt` (boxes, then polygons) → annotations render immediately, names loaded, no INSERT popup, correct `activeLabelType`.
4. **Autosave:** draw/move a shape, wait ~1.5s → only that image's `labels/<base>.txt` updates on disk; `labels.txt` present; clearing all shapes removes the `.txt`. **Rename a class** (UPDATE_LABEL popup) → *every* `labels/<base>.txt` is rewritten with the new indices (rewriteAll), not just the active image's. Toggle off → no writes; on → full flush.
5. **Delete:** trash button → image + label file appear in `.trash/`, removed from folder, editor advances, counter decremented; delete to empty → back to MainView.
6. **Copy filename:** success notification; paste matches `fileData.name`.
7. **Reconnect:** refresh → "Reconnect to <folder>?" → Accept → permission prompt (or silent) → folder reloads with annotations.
8. **Unsupported browser:** Firefox/Safari → Open-folder disabled / unsupported notification; rest of app unaffected.
