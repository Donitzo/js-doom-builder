import DoomMap from '../doommap.class.js';
import Geometry from './geometry.class.js';
import Utility from '../utility.class.js';

/**
 * Represents a 2D sector enclosed by line boundaries.
 */
export default class Sector extends Geometry {
    /**
     * Internal class for sector properties.
     * @private
     */
    static #Properties = class Properties {
        /** @type {number} Floor height. */
        floorHeight = 0;
        /** @type {number} Ceiling height. */
        ceilingHeight = 128;
        /** @type {string} Floor texture name. */
        floorTexture = 'FLAT1';
        /** @type {string} Ceiling texture name. */
        ceilingTexture = 'CEIL1';
        /** @type {number} Light intensity level (0–255). */
        lightLevel = 160;
        /** @type {number} Sector tag (for triggers / scripts). */
        tag = 0;
        /** @type {number} Sector special type / behavior index. */
        special = 0;

        /**
         * Copy all sector properties from another sector.
         * @param {Sector.#Properties} other
         */
        copy(other) {
            this.floorHeight = other.floorHeight;
            this.ceilingHeight = other.ceilingHeight;
            this.floorTexture = other.floorTexture;
            this.ceilingTexture = other.ceilingTexture;
            this.lightLevel = other.lightLevel;
            this.tag = other.tag;
            this.special = other.special;
        }

        /** @returns {object} Serialized property data. */
        serialize() {
            return {
                floorHeight: this.floorHeight,
                ceilingHeight: this.ceilingHeight,
                floorTexture: this.floorTexture,
                ceilingTexture: this.ceilingTexture,
                lightLevel: this.lightLevel,
                tag: this.tag,
                special: this.special,
            };
        }

        /**
         * Deserializes properties.
         *
         * @param {object} data - Serialized property data.
         */
        deserialize(data) {
            this.floorHeight = data.floorHeight;
            this.ceilingHeight = data.ceilingHeight;
            this.floorTexture = data.floorTexture;
            this.ceilingTexture = data.ceilingTexture;
            this.lightLevel = data.lightLevel;
            this.tag = data.tag;
            this.special = data.special;
        }
    };

    #lines = [];
    /** @type {Line[]} Boundary lines of this sector (read-only). */
    get lines() {
        return this.#lines;
    }

    #flatXY = [];
    /** @type {number[]} Flat vertex coordinates [x0, y0, x1, y1, ...] (read-only). */
    get flatXY() {
        return this.#flatXY;
    }

    /** @type {?DoomMap} The map this sector belongs to. */
    #map = null;

    /** @type {?Sector} Parent sector this sector is contained within. */
    #parent = null;
    get parent() {
        return this.#parent;
    }

    /** @type {Sector[]} Direct child sectors contained within this sector. */
    #children = [];
    get children() {
        return this.#children;
    }

    #properties = new Sector.#Properties();
    /** @type {Sector.#Properties} Properties. */
    get properties() {
        return this.#properties;
    }

    /**
     * Constructs a new sector from a set of connected {@link Line} objects.
     *
     * @param {object} [params] - Visual and geometric parameters.
     * @param {number} [params.floorHeight=0] - Floor elevation.
     * @param {number} [params.ceilingHeight=128] - Ceiling elevation.
     * @param {string} [params.floorTexture='FLAT1'] - Floor texture.
     * @param {string} [params.ceilingTexture='CEIL1'] - Ceiling texture.
     * @param {number} [params.lightLevel=160] - Light level.
     * @param {Map<string, Line>} lineMap - Map of existing lines by key.
     * @param {Array<{v0:{x:number,y:number}, v1:{x:number,y:number}, front:boolean}>} lines
     *        Line descriptors to attach to this sector.
     */
    constructor(lineMap, lines) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        lines.forEach(line => {
            minX = Math.min(minX, line.v0.x, line.v1.x);
            minY = Math.min(minY, line.v0.y, line.v1.y);
            maxX = Math.max(maxX, line.v0.x, line.v1.x);
            maxY = Math.max(maxY, line.v0.y, line.v1.y);
        });

        super({ min: { x: minX, y: minY }, max: { x: maxX, y: maxY } });

        // Build line and vertex sequence
        lines.forEach((line, i) => {
            const key = DoomMap.createLineKey(line.v0.x, line.v0.y, line.v1.x, line.v1.y);
            const l = lineMap.get(key);
            if (l === undefined) {
                throw new Error(`Sector reference to missing line: ${key}`);
            }

            this.#lines.push(l);

            if (line.front) {
                if (l.front.sector !== null) {
                    throw new Error('Line already assigned to a front sector');
                }
                l.front.sector = this;

                if (i === 0) {
                    this.#flatXY.push(l.v0.x, l.v0.y);
                }
                this.#flatXY.push(l.v1.x, l.v1.y);
            } else {
                if (l.back.sector !== null) {
                    throw new Error('Line already assigned to a back sector');
                }
                l.back.sector = this;

                if (i === 0) {
                    this.#flatXY.push(l.v1.x, l.v1.y);
                }
                this.#flatXY.push(l.v0.x, l.v0.y);
            }
        });
    }

    /**
     * Adds this sector to the given {@link DoomMap}, associating it with line sides.
     * Also finds any inner child sector.
     *
     * @param {DoomMap} map - The map to add this sector to.
     */
    addToMap(map) {
        if (this.#map !== null) {
            throw new Error('Sector has already been added to a map');
        }
        this.#map = map;

        const b1 = this.bounds;

        // Find the most immediate parent that fully contains this sector
        map.iterateSectors(other => {
            if (other === this) {
                return;
            }

            const b2 = other.bounds;
            const isInside =
                b1.min.x >= b2.min.x &&
                b1.min.y >= b2.min.y &&
                b1.max.x <= b2.max.x &&
                b1.max.y <= b2.max.y &&
                Utility.polygonContainsAllVertices(this.#flatXY, other.flatXY);

            if (isInside && (!this.#parent || other.childOf(this.#parent))) {
                this.#parent = other;
            }
        }, b1.min, b1.max);

        // Register as a child of parent
        if (this.#parent !== null) {
            this.#parent.#children.push(this);
        }

        // Adopt any pre-existing children that fall fully within this sector
        map.iterateSectors(other => {
            if (other === this || other.#parent !== this.#parent) {
                return;
            }

            const b2 = other.bounds;
            const contains =
                b2.min.x >= b1.min.x &&
                b2.min.y >= b1.min.y &&
                b2.max.x <= b1.max.x &&
                b2.max.y <= b1.max.y &&
                Utility.polygonContainsAllVertices(other.flatXY, this.#flatXY);

            if (contains) {
                if (other.parent !== null) {
                    const i = other.parent.#children.indexOf(other);
                    other.parent.#children.splice(i, 1);
                }
                this.#children.push(other);
                other.#parent = this;
            }
        }, b1.min, b1.max);

        // Update external sides to point to the parent sector
        this.#lines.forEach(line => {
            if (line.front.sector === this && line.back.sector === null) {
                line.back.sector = this.#parent;
            } else if (line.back.sector === this && line.front.sector === null) {
                line.front.sector = this.#parent;
            }
        });
    }

    /**
     * Removes this sector from its map and repairs parent/child links.
     */
    removeFromMap() {
        if (this.#map === null) {
            throw new Error('Sector has not been added to a map');
        }

        // Restore external sides to point back to parent sector
        this.#lines.forEach(line => {
            if (line.front.sector === this) {
                line.front.sector = this.#parent;
            } else if (line.back.sector === this) {
                line.back.sector = this.#parent;
            }
        });

        // Reparent child sectors
        this.#children.forEach(child => {
            child.#parent = this.#parent;
            if (this.#parent !== null) {
                this.#parent.#children.push(child);
            }
        });
        this.#children.length = 0;

        // Remove from parent’s child list
        if (this.#parent !== null) {
            const i = this.#parent.#children.indexOf(this);
            if (i === -1) {
                throw new Error('Missing child in sector');
            }
            this.#parent.#children.splice(i, 1);
            this.#parent = null;
        }

        this.#map = null;
    }

    /**
     * Creates a shallow clone of this sector.
     *
     * @param {Map<string, Line>} lineMap - Map of existing lines by key.
     * @param {Array<{v0:{x:number,y:number}, v1:{x:number,y:number}, front:boolean}>} lines
     *        Line descriptors to attach to this sector.
     * @returns {Sector} New cloned sector.
     */
    clone(lineMap, lines) {
        const sector = new Sector(lineMap, lines);
        sector.#properties.copy(this.#properties);
        return sector;
    }

    /**
     * Serializes this sector into a plain object.
     *
     * @returns {object} Serialized sector data.
     */
    serialize() {
        return {
            properties: this.#properties.serialize(),
            lines: this.#lines.map(line => ({
                v0: { x: line.v0.x, y: line.v0.y },
                v1: { x: line.v1.x, y: line.v1.y },
                front: line.front.sector === this,
            })),
        };
    }

    /**
     * Deserializes a {@link Sector} from serialized data.
     *
     * @param {object} data - Serialized sector data.
     * @param {Map<string, Line>} lineMap - Map of existing lines.
     * @returns {Sector} Deserialized sector.
     */
    static deserialize(data, lineMap) {
        const sector = new Sector(lineMap, data.lines);
        sector.#properties.deserialize(data.properties);
        return sector;
    }

    /**
     * Clears all line references from this sector.
     */
    clearLines() {
        if (this.#map !== null) {
            throw new Error('Attempted to clear sector lines without calling removeFromMap() first');
        }

        this.#lines.forEach(line => {
            if (line.back.sector === this) {
                line.back.sector = null;
            } else if (line.front.sector === this) {
                line.front.sector = null;
            } else {
                throw new Error('Line not connected to this sector');
            }
        });
        this.#lines.length = 0;
    }

    /**
     * Returns whether this sector is a descendant of another sector.
     *
     * @param {Sector} parent - The potential ancestor.
     * @returns {boolean} True if this sector is a child (direct or indirect) of `parent`.
     */
    childOf(parent) {
        let p = this.#parent;
        while (p) {
            if (p === parent) {
                return true;
            }
            p = p.#parent;
        }
        return false;
    }

    /**
     * Computes merged vertex loops representing the boundaries
     * between this sector and all its immediate child sectors.
     *
     * Each loop corresponds to the visible border of one or more
     * directly connected child sectors, expressed as a flat [x, y, ...] array.
     *
     * @returns {number[][]} Array of flat XY loops.
     */
    mergeChildVectors() {
        const loops = [];

        const visitedLines = new Set();

        // Trace a continuous loop around one child boundary, following the edges bordering this sector
        const traceLoop = (startLine, child) => {
            const loop = [];

            let current = startLine;
            const vertex = current.front.sector === child ? current.v0 : current.v1;
            let nextVertex = current.front.sector === child ? current.v1 : current.v0;

            loop.push(vertex.x, vertex.y);

            while (true) {
                loop.push(nextVertex.x, nextVertex.y);

                visitedLines.add(current);

                // Find next line connected at nextVertex that also borders parent - child
                const nextLine = child.lines.find(line => {
                    if (visitedLines.has(line)) {
                        return false;
                    }
                    if (line.v0 !== nextVertex && line.v1 !== nextVertex) {
                        return false;
                    }
                    const sharesParent =
                        line.front.sector === child && line.back.sector === this ||
                        line.back.sector === child && line.front.sector === this;

                    return sharesParent;
                });

                if (!nextLine || nextLine === startLine) {
                    break;
                }

                current = nextLine;
                nextVertex = current.v0 === nextVertex ? current.v1 : current.v0;
            }

            // Ensure CCW winding
            if (Utility.signedArea2d(loop) < 0) {
                for (let i = 0, j = loop.length - 2; i < j; i += 2, j -= 2) {
                    const tx = loop[i];
                    const ty = loop[i + 1];
                    loop[i] = loop[j];
                    loop[i + 1] = loop[j + 1];
                    loop[j] = tx;
                    loop[j + 1] = ty;
                }
            }

            return loop;
        };

        // Iterate over all direct child sectors
        this.children.forEach(child => {
            child.lines.forEach(line => {
                // The child sector is on the outer boundary if it touches this sector
                const isBoundary = line.back.sector === this || line.front.sector === this;
                if (!isBoundary || visitedLines.has(line)) {
                    return;
                }

                const loop = traceLoop(line, child);
                if (loop.length >= 6) {
                    loops.push(loop);
                }
            });
        });

        return loops;
    }
}
