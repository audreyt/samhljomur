// The parts of Pretext (https://github.com/chenglou/pretext, MIT) the page uses.
// build.ts bundles this file and inlines it, so the page loads nothing from
// anywhere but talasaman.is. Pretext breaks lines by arithmetic over widths the
// browser's own canvas measures, so a layout can be known before it is drawn.
import { layoutNextLine, layoutWithLines, measureLineStats, prepareWithSegments, clearCache } from "@chenglou/pretext";

(globalThis as any).Pretext = { layoutNextLine, layoutWithLines, measureLineStats, prepareWithSegments, clearCache };
