import Line from './geometry/line.class.js';
import Sector from './geometry/sector.class.js';
import Thing from './geometry/thing.class.js';
import Vertex from './geometry/vertex.class.js';
import History from './history.class.js';
import Utility from './utility.class.js';

/**
 * Doom-style map data structure.
 */
export default class DoomMap extends EventTarget {
    /** @type {number} Spatial grid size in map units. */
    static #SPATIAL_GRID_CELL_SIZE = 128;

    /** @type {object} Map metadata and global properties. */
    #metadata = {
        /** @type {string} Internal map name (e.g., "MAP01" or "E1M1"). */
        name: 'MAP01',
        /** @type {string} Display name for the map (optional). */
        title: 'Untitled Map',
        /** @type {string} Author name or mapper credit. */
        author: '',
        /** @type {string} Music lump or resource name (e.g., "D_E1M1"). */
        music: '',
        /** @type {string} Sky texture name (e.g., "SKY1"). */
        skyTexture: 'SKY1',
        /** @type {number} Ambient light level override (optional). */
        ambientLight: 0,
        /** @type {object} Gameplay and engine flags. */
        flags: {
            /** @type {boolean} Whether monsters should spawn in the map. */
            monstersEnabled: true,
            /** @type {boolean} Whether the map is available in deathmatch mode. */
            deathmatch: true,
            /** @type {boolean} Allow player jumping if the engine supports it. */
            allowJump: false,
            /** @type {boolean} Allow freelook if supported. */
            allowFreelook: true,
            /** @type {boolean} Whether to use Doom II format behaviors. */
            doom2Format: false,
        },
    };
    get metadata() {
        return this.#metadata;
    }

    /** @type {History} */
    #history = new History();
    /** @returns {History} */
    get history() {
        return this.#history;
    }

    /** @type {Vertex[]} */
    #vertices = [];
    /** @type {Map<string, Vertex>} */
    #vertexMap = new Map();

    /** @type {Line[]} */
    #lines = [];
    /** @type {Map<string, Line>} */
    #lineMap = new Map();
    /** @type {Set<Line>} */
    #modifiedLines = new Set();

    /** @type {Sector[]} */
    #sectors = [];

    /** @type {Thing[]} */
    #things = [];

    /** @type {Set<object>} */
    #selection = new Set();

    /** @type {Map<number, Map<number, Set<object>>>} */
    #spatialGrid = new Map();

    ////////////////////////////////////////////////////////////////////////////
    // String keys

    static createVertexKey(x, y) {
        return `${x},${y}`;
    }
    static createLineKey(x0, y0, x1, y1) {
        return (x0 < x1) || (x0 === x1 && y0 <= y1)
            ? `${x0},${y0}:${x1},${y1}`
            : `${x1},${y1}:${x0},${y0}`;
    }

    static createHalfEdgeKey(a, b) {
        return `${a.x},${a.y}:${b.x},${b.y}`;
    }

    ////////////////////////////////////////////////////////////////////////////
    // Events

    #emitChange(type, detail = {}) {
        this.dispatchEvent(new CustomEvent(type, {
            detail: { map: this, ...detail },
            bubbles: false,
        }));
    }

    ////////////////////////////////////////////////////////////////////////////
    // Registration helpers

    #addVertex(vertex) {
        const key = DoomMap.createVertexKey(vertex.x, vertex.y);

        this.#history.do(() => {
            this.#vertices.push(vertex);
            this.#vertexMap.set(key, vertex);
            this.#addToSpatialGrid(vertex);

            this.#emitChange('vertexadded', { vertex });
        }, () => {
            const v = this.#vertexMap.get(key);
            if (v !== undefined) {
                this.#removeFromSpatialGrid(v);
                this.#vertices.splice(this.#vertices.indexOf(v), 1);
                this.#vertexMap.delete(key);

                this.#emitChange('vertexremoved', { vertex: v });
            }
        }, key);
    }

    #removeVertex(vertex) {
        const i = this.#vertices.indexOf(vertex);
        if (i === -1) {
            throw new Error('Attempted to remove non-existent vertex');
        }

        const key = DoomMap.createVertexKey(vertex.x, vertex.y);

        this.#history.do(() => {
            this.#removeFromSpatialGrid(vertex);
            this.#vertices.splice(i, 1);
            this.#vertexMap.delete(key);

            this.#emitChange('vertexremoved', { vertex });
        }, () => {
            let v = this.#vertexMap.get(key);
            if (v === undefined) {
                v = new Vertex(vertex.x, vertex.y);
                this.#vertices.push(v);
                this.#vertexMap.set(key, v);
                this.#addToSpatialGrid(v);

                this.#emitChange('vertexadded', { vertex: v });
            }
        }, key);
    }

    #addLine(line) {
        const key = DoomMap.createLineKey(line.v0.x, line.v0.y, line.v1.x, line.v1.y);

        this.#history.do(() => {
            this.#modifiedLines.add(line);
            this.#lines.push(line);
            this.#lineMap.set(key, line);
            this.#addToSpatialGrid(line);

            this.#emitChange('lineadded', { line });
        }, () => {
            const l = this.#lineMap.get(key);
            if (l !== undefined) {
                this.#modifiedLines.add(l);
                this.#removeFromSpatialGrid(l);
                l.clearVertices();
                this.#lines.splice(this.#lines.indexOf(l), 1);
                this.#lineMap.delete(key);

                this.#emitChange('lineremoved', { line: l });
            }
        }, key);
    }

    #removeLine(line) {
        const i = this.#lines.indexOf(line);
        if (i === -1) {
            throw new Error('Attempted to remove non-existent line');
        }

        const key = DoomMap.createLineKey(line.v0.x, line.v0.y, line.v1.x, line.v1.y);

        this.#history.do(() => {
            this.#modifiedLines.add(line);
            this.#removeFromSpatialGrid(line);
            line.clearVertices();
            this.#lines.splice(i, 1);
            this.#lineMap.delete(key);

            this.#emitChange('lineremoved', { line });
        }, () => {
            let l = this.#lineMap.get(key);
            if (l === undefined) {
                l = line.clone(this.#vertexMap, line.v0, line.v1);
                this.#modifiedLines.add(l);
                this.#lines.push(l);
                this.#lineMap.set(key, l);
                this.#addToSpatialGrid(l);

                this.#emitChange('lineadded', { line: l });
            }
        }, key);
    }

    #addSector(sector) {
        sector.addToMap(this);
        this.#sectors.push(sector);
        this.#addToSpatialGrid(sector);

        this.#emitChange('sectoradded', { sector });
    }

    #removeSector(sector) {
        const i = this.#sectors.indexOf(sector);
        if (i === -1) {
            throw new Error('Attempted to remove non-existent sector');
        }
        sector.clearLines();
        this.#removeFromSpatialGrid(sector);
        this.#sectors.splice(i, 1);
        sector.removeFromMap();

        this.#emitChange('sectorremoved', { sector });
    }

    #addThing(thing) {
        this.#history.do(() => {
            const i = this.#things.indexOf(thing);
            if (i === -1) {
                this.#things.push(thing);
                this.#addToSpatialGrid(thing);

                this.#emitChange('thingadded', { thing });
            }
        }, () => {
            const i = this.#things.indexOf(thing);
            if (i > -1) {
                this.#removeFromSpatialGrid(thing);
                this.#things.splice(i, 1);

                this.#emitChange('thingremoved', { thing });
            }
        });
    }

    #removeThing(thing) {
        const i = this.#things.indexOf(thing);
        if (i === -1) {
            throw new Error('Attempted to remove non-existent thing');
        }

        this.#history.do(() => {
            const i = this.#things.indexOf(thing);
            if (i > -1) {
                this.#removeFromSpatialGrid(thing);
                this.#things.splice(i, 1);

                this.#emitChange('thingremoved', { thing });
            }
        }, () => {
            const i = this.#things.indexOf(thing);
            if (i === -1) {
                this.#things.push(thing);
                this.#addToSpatialGrid(thing);

                this.#emitChange('thingadded', { thing });
            }
        });
    }

    ////////////////////////////////////////////////////////////////////////////
    // Sector construction

    rebuildSectors() {
        // Nothing to do if no geometry was touched since last rebuild
        if (this.#modifiedLines.size === 0) {
            return;
        }

        // Take all modified lines plus their 1-ring neighbors (lines that share a vertex)
        const localLines = new Set();
        const localVertices = new Set();
        this.#modifiedLines.forEach(line => {
            localLines.add(line);
            localVertices.add(line.v0);
            localVertices.add(line.v1);
        });
        localVertices.forEach(vertex => {
            vertex.lines.forEach(line => {
                localLines.add(line);
            });
        });

        // Any sector touching the working set is invalid
        // 1. Remember each line's previous sector on both sides as templates for new sectors
        // 2) Collect the set of all such sectors so we can remove them after rebuilding
        const invalidated = new Set();
        localLines.forEach(line => {
            if (line.front.sector !== null) {
                line.front.sectorOld = line.front.sector;
                invalidated.add(line.front.sector);
            } else {
                line.front.sectorOld = null;
            }
            if (line.back.sector !== null) {
                line.back.sectorOld = line.back.sector;
                invalidated.add(line.back.sector);
            } else {
                line.back.sectorOld = null;
            }
        });

        // Remove invalidated sectors
        invalidated.forEach(sector => {
            this.#removeSector(sector);
        });

        // Convert each undirected line into two directed half-edges (v0->v1 and v1->v0)
        // Walk these directed edges in CCW order so the face stays on the left
        // Edge record: { from, to, line, forward, visited }
        const edges = [];
        // Vertex -> Edge[] (sorted by polar angle around the vertex)
        const outgoing = new Map();

        const pushOutgoing = (vertex, edge) => {
            let array = outgoing.get(vertex);
            if (array === undefined) {
                array = [];
                outgoing.set(vertex, array);
            }
            array.push(edge);
        };

        localLines.forEach(line => {
            const ef = { from: line.v0, to: line.v1, line, forward: true,  visited: false };
            const er = { from: line.v1, to: line.v0, line, forward: false, visited: false };
            edges.push(ef, er);
            pushOutgoing(line.v0, ef);
            pushOutgoing(line.v1, er);
        });

        // Sort outgoing edges at each vertex by absolute angle to pick the next-left edge
        outgoing.forEach((array, vertex) => {
            array.sort((a, b) => {
                const aa = Utility.angleTo(vertex.x, vertex.y, a.to.x, a.to.y);
                const bb = Utility.angleTo(vertex.x, vertex.y, b.to.x, b.to.y);
                return aa - bb;
            });
        });

        // Given an incoming directed edge e: (u->v), stand at v and pick the outgoing edge
        // that makes the smallest positive CCW turn from the reverse direction (v->u)
        const nextLeft = edge => {
            const pivot = edge.to;
            const outs = outgoing.get(pivot);
            if (outs === undefined || outs.length === 0) {
                return null;
            }

            const baseAngle = Utility.angleTo(pivot.x, pivot.y, edge.from.x, edge.from.y);

            let best = null;
            let bestDelta = Infinity;

            outs.forEach(candidate => {
                const candAngle = Utility.angleTo(pivot.x, pivot.y, candidate.to.x, candidate.to.y);
                // CCW turn size
                const delta = Utility.angleToCcw(baseAngle, candAngle);
                if (delta > 0 && delta < bestDelta) {
                    best = candidate;
                    bestDelta = delta;
                }
            });

            if (best === null) {
                // Fallback: take the largest delta
                let maxDelta = -1;
                outs.forEach(candidate => {
                    const candAngle = Utility.angleTo(pivot.x, pivot.y, candidate.to.x, candidate.to.y);
                    const delta = Utility.angleToCcw(baseAngle, candAngle);
                    if (delta > maxDelta) {
                        maxDelta = delta;
                        best = candidate;
                    }
                });
            }
            return best ?? outs[0];
        };

        // Trace CCW loops (left-hand rule). Mark edges visited only once we confirm a valid CCW loop.
        // Keep only positive-area loops (CCW), which are interior faces
        const loops = [];
        edges.forEach(start => {
            if (start.visited) {
                continue;
            }

            const loopEdges = [];
            const xy = [];
            let e = start;
            let guard = 0;
            let closed = false;

            // Walk edges until we return to the start (closed) or fail
            while (e && !loopEdges.includes(e)) {
                loopEdges.push(e);
                xy.push(e.from.x, e.from.y);

                e = nextLeft(e);
                if (e === null) {
                    break;
                }

                // Safety guard
                if (++guard > 100000) {
                    break;
                }

                if (e === start) {
                    closed = true;
                    break;
                }
            }

            // Must be a closed polygon with at least 3 vertices
            if (!closed || xy.length < 6) {
                continue;
            }

            // Close ring for area test
            xy.push(xy[0], xy[1]);

            // Positive area means CCW = interior face
            if (Utility.signedArea2d(xy) > 0) {
                // Mark edges as consumed by a loop
                loopEdges.forEach(edge => {
                    edge.visited = true;
                });
                loops.push({ edges: loopEdges, xy });
            }
        });

        // For each interior loop, reconstruct (or clone) a sector and assign it to the
        // left side of each edge in the loop:
        //  - If the edge is "forward" (v0->v1), the left side is the line's FRONT
        //  - If the edge is "reverse" (v1->v0), the left side is the line's BACK
        loops.forEach(loop => {
            const newLines = loop.edges.map(edge => ({
                v0: edge.line.v0,
                v1: edge.line.v1,
                front: edge.forward,
            }));

            // Try to find a template sector from whatever used to be on the left side of any edge
            let templateSector = null;

            for (const edge of loop.edges) {
                let oldLeft = null;

                if (edge.forward) {
                    oldLeft = edge.line.front.sectorOverride ?? edge.line.front.sectorOld ?? null;
                } else {
                    oldLeft = edge.line.back.sectorOverride ?? edge.line.back.sectorOld ?? null;
                }

                if (oldLeft !== null) {
                    templateSector = oldLeft;
                    break;
                }
            }

            // Reconstruct a new sector from the template, or create a blank one
            const sector = templateSector
                ? templateSector.clone(this.#lineMap, newLines)
                : new Sector(this.#lineMap, newLines);

            this.#addSector(sector);
        });

        this.#lines.forEach(line => {
            line.front.sectorOverride = null;
            line.back.sectorOverride = null;
        });

        this.#modifiedLines.clear();

        this.#emitChange('sectorsrebuilt', { sectors: this.#sectors });
    }

    ////////////////////////////////////////////////////////////////////////////
    // Spatial grid

    #addToSpatialGrid(geometry) {
        const bounds = geometry.bounds;

        const minX = Math.floor(bounds.min.x / DoomMap.#SPATIAL_GRID_CELL_SIZE);
        const minY = Math.floor(bounds.min.y / DoomMap.#SPATIAL_GRID_CELL_SIZE);
        const maxX = Math.floor(bounds.max.x / DoomMap.#SPATIAL_GRID_CELL_SIZE);
        const maxY = Math.floor(bounds.max.y / DoomMap.#SPATIAL_GRID_CELL_SIZE);

        for (let x = minX; x <= maxX; x++) {
            let column = this.#spatialGrid.get(x);
            if (!column) {
                column = new Map();
                this.#spatialGrid.set(x, column);
            }
            for (let y = minY; y <= maxY; y++) {
                let cell = column.get(y);
                if (!cell) {
                    cell = new Set();
                    column.set(y, cell);
                }
                cell.add(geometry);
            }
        }
    }

    #removeFromSpatialGrid(geometry) {
        const bounds = geometry.bounds;

        const minX = Math.floor(bounds.min.x / DoomMap.#SPATIAL_GRID_CELL_SIZE);
        const minY = Math.floor(bounds.min.y / DoomMap.#SPATIAL_GRID_CELL_SIZE);
        const maxX = Math.floor(bounds.max.x / DoomMap.#SPATIAL_GRID_CELL_SIZE);
        const maxY = Math.floor(bounds.max.y / DoomMap.#SPATIAL_GRID_CELL_SIZE);

        for (let x = minX; x <= maxX; x++) {
            const column = this.#spatialGrid.get(x);
            if (!column) {
                continue;
            }
            for (let y = minY; y <= maxY; y++) {
                const cell = column.get(y);
                if (!cell) {
                    continue;
                }
                cell.delete(geometry);
                if (cell.size === 0) {
                    column.delete(y);
                }
            }
            if (column.size === 0) {
                this.#spatialGrid.delete(x);
            }
        }
    }

    ////////////////////////////////////////////////////////////////////////////
    // Math helpers

    #wouldSegmentCrossAny(x0, y0, x1, y1, boundsMin, boundsMax, ignore = null) {
        let result = null;

        this.iterateLines(line => {
            if (ignore !== null && ignore.has(line)) {
                return true;
            }

            const x2 = line.v0.x;
            const y2 = line.v0.y;
            const x3 = line.v1.x;
            const y3 = line.v1.y;

            const sharesEndpoint =
                (x0 === x2 && y0 === y2) || (x0 === x3 && y0 === y3) ||
                (x1 === x2 && y1 === y2) || (x1 === x3 && y1 === y3);
            if (sharesEndpoint) {
                return true;
            }

            if (Utility.segmentsProperlyIntersect(x0, y0, x1, y1, x2, y2, x3, y3)) {
                result = line;
                return false;
            }
            if (Utility.collinearOverlapMoreThanEndpoint(x0, y0, x1, y1, x2, y2, x3, y3)) {
                result = line;
                return false;
            }

            return true;
        }, boundsMin, boundsMax);

        return result;
    }

    ////////////////////////////////////////////////////////////////////////////
    // Properties

    setSideProperty(line, property, value, isFront) {
        const side = isFront ? line.front : line.back;
        if (!(property in side) || typeof value !== typeof side[property] ||
            !(typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string')) {
            throw new Error(`Invalid side property "${property}"`);
        }

        const last = side[property];
        if (last === value) {
            return;
        }

        this.#history.do(() => {
            side[property] = value;

            this.#emitChange('sidechanged', { line, property, isFront, value });
        }, () => {
            side[property] = last;

            this.#emitChange('sidechanged', { line, property, isFront, value: last });
        }, line, (isFront ? 'front' : 'back') + ':' + property);
    }


    setLineFlag(line, property, value) {
        if (!(property in line.flags) || typeof value !== typeof line.flags[property] ||
            !(typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string')) {
            throw new Error(`Invalid flags property "${property}"`);
        }

        const last = line.flags[property];
        if (last === value) {
            return;
        }

        this.#history.do(() => {
            line.flags[property] = value;

            this.#emitChange('flagschanged', { line, property, value });
        }, () => {
            line.flags[property] = last;

            this.#emitChange('flagschanged', { line, property, value: last });
        }, line, 'flag:' + property);
    }

    setSectorProperty(sector, property, value) {
        if (!(property in sector.properties) || typeof value !== typeof sector.properties[property] ||
            !(typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string')) {
            throw new Error(`Invalid sector property "${property}"`);
        }

        const last = sector.properties[property];
        if (last === value) {
            return;
        }

        this.#history.do(() => {
            sector.properties[property] = value;

            this.#emitChange('sectorchanged', { sector, property, value });
        }, () => {
            sector.properties[property] = last;

            this.#emitChange('sectorchanged', { sector, property, value: last });
        }, sector, property);
    }

    setMapProperty(property, value) {
        if (!(property in this.#metadata) || typeof value !== typeof this.#metadata[property] ||
            !(typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string')) {
            throw new Error(`Invalid metadata property "${property}"`);
        }

        const last = this.#metadata[property];
        if (last === value) {
            return;
        }

        this.#history.do(() => {
            this.#metadata[property] = value;

            this.#emitChange('metadatachanged', { property, value });
        }, () => {
            this.#metadata[property] = last;

            this.#emitChange('metadatachanged', { property, value: last });
        }, this, property);
    }

    ////////////////////////////////////////////////////////////////////////////
    // Geometry iterators

    #iterateGeometry(array, func, boundsMin = null, boundsMax = null, selectionOnly = false) {
        if (boundsMin === null || boundsMax === null) {
            if (selectionOnly) {
                const Type = array[0]?.constructor ?? null;
                this.#selection.forEach(geometry => {
                    if (Type && (geometry instanceof Type)) {
                        func(geometry, true);
                    }
                });
                return;
            }

            for (const geometry of array) {
                if (func(geometry, this.#selection.has(geometry)) === false) {
                    return;
                }
            }
            return;
        }

        const grid = this.#spatialGrid;
        const cellSize = DoomMap.#SPATIAL_GRID_CELL_SIZE;

        const minX = Math.floor(boundsMin.x / cellSize);
        const minY = Math.floor(boundsMin.y / cellSize);
        const maxX = Math.floor(boundsMax.x / cellSize);
        const maxY = Math.floor(boundsMax.y / cellSize);

        const visited = new Set();

        for (let x = minX; x <= maxX; x++) {
            const column = grid.get(x);
            if (column === undefined) {
                continue;
            }

            for (let y = minY; y <= maxY; y++) {
                const cell = column.get(y);
                if (cell === undefined) {
                    continue;
                }

                for (const geometry of cell) {
                    if (visited.has(geometry)) {
                        continue;
                    }
                    visited.add(geometry);

                    const selected = this.#selection.has(geometry);

                    if (geometry.isInside(boundsMin, boundsMax) && (!selectionOnly || selected)) {
                        if (func(geometry, selected) === false) {
                            return;
                        }
                    }
                }
            }
        }
    }

    iterateVertices(func, boundsMin = null, boundsMax = null, selectionOnly = false) {
        this.#iterateGeometry(this.#vertices, func, boundsMin, boundsMax, selectionOnly);
    }

    iterateLines(func, boundsMin = null, boundsMax = null, selectionOnly = false) {
        this.#iterateGeometry(this.#lines, func, boundsMin, boundsMax, selectionOnly);
    }

    iterateSectors(func, boundsMin = null, boundsMax = null, selectionOnly = false) {
        this.#iterateGeometry(this.#sectors, func, boundsMin, boundsMax, selectionOnly);
    }

    iterateThings(func, boundsMin = null, boundsMax = null, selectionOnly = false) {
        this.#iterateGeometry(this.#things, func, boundsMin, boundsMax, selectionOnly);
    }

    ////////////////////////////////////////////////////////////////////////////
    // Manipulation API

    addVertex(x, y, skipRebuild = false) {
        const vx = Math.round(x);
        const vy = Math.round(y);

        const key = DoomMap.createVertexKey(vx, vy);

        const existing = this.#vertexMap.get(key);
        if (existing !== undefined) {
            return existing;
        }

        const vertex = new Vertex(vx, vy);

        this.#addVertex(vertex);

        const linesToSplit = [];

        this.#lines.forEach(line => {
            const x0 = line.v0.x;
            const y0 = line.v0.y;
            const x1 = line.v1.x;
            const y1 = line.v1.y;

            const collinear = Utility.orientation(x0, y0, x1, y1, vx, vy) === 0;
            if (!collinear) {
                return;
            }
            if (!Utility.onSegment(x0, y0, vx, vy, x1, y1)) {
                return;
            }

            linesToSplit.push(line);
        });

        linesToSplit.forEach(line => {
            const lA = line.clone(this.#vertexMap, line.v0, vertex);
            const lB = line.clone(this.#vertexMap, vertex, line.v1);

            this.#addLine(lA);
            this.#addLine(lB);

            this.#removeLine(line);
        });

        if (!skipRebuild) {
            this.rebuildSectors();
        }

        return vertex;
    }

    removeVertex(x, y, skipRebuild = false) {
        const vx = Math.round(x);
        const vy = Math.round(y);

        const key = DoomMap.createVertexKey(vx, vy);

        const vertex = this.#vertexMap.get(key);
        if (vertex === undefined) {
            return false;
        }

        while (vertex.lines.length > 0) {
            this.#removeLine(vertex.lines[0]);
        }

        this.#removeVertex(vertex);

        if (!skipRebuild) {
            this.rebuildSectors();
        }

        return true;
    }

    moveVertex(fromX, fromY, toX, toY, skipRebuild = false) {
        const fx = Math.round(fromX);
        const fy = Math.round(fromY);
        const tx = Math.round(toX);
        const ty = Math.round(toY);

        if (fx === tx && fy === ty) {
            return true;
        }

        const fromKey = DoomMap.createVertexKey(fx, fy);

        const oldVertex = this.#vertexMap.get(fromKey);
        if (oldVertex === undefined) {
            return false;
        }

        let newVertex = this.#vertexMap.get(DoomMap.createVertexKey(tx, ty));
        if (newVertex === undefined) {
            newVertex = this.addVertex(tx, ty, true);
        }

        oldVertex.lines.slice().forEach(oldLine => {
            const other = oldLine.v0 === oldVertex ? oldLine.v1 : oldLine.v0;

            if (other === newVertex) {
                this.#removeLine(oldLine);
                return;
            }

            const newKey = DoomMap.createLineKey(newVertex.x, newVertex.y, other.x, other.y);

            const existing = this.#lineMap.get(newKey);

            if (existing !== undefined) {
                this.#removeLine(oldLine);
                return;
            }

            const newLine = oldLine.clone(
                this.#vertexMap,
                oldLine.v0 === oldVertex ? newVertex : null,
                oldLine.v1 === oldVertex ? newVertex : null
            );

            this.#addLine(newLine);

            this.#removeLine(oldLine);
        });

        this.#removeVertex(oldVertex);

        if (!skipRebuild) {
            this.rebuildSectors();
        }

        return true;
    }

    addLine(fromX, fromY, toX, toY, skipRebuild = false) {
        const epsilon = 1e-12;

        // Round inputs to integer grid
        const x0 = Math.round(fromX);
        const y0 = Math.round(fromY);
        const x1 = Math.round(toX);
        const y1 = Math.round(toY);

        // Degenerate: cannot create a point
        if (x0 === x1 && y0 === y1) {
            return false;
        }

        // Bounds of the intended segment (for efficient spatial iteration)
        const boundsMin = { x: Math.min(x0, x1), y: Math.min(y0, y1) };
        const boundsMax = { x: Math.max(x0, x1), y: Math.max(y0, y1) };

        // Reusable container for intersection calculation
        const intersection = { x: 0, y: 0, t: 0 };

        // Compute a proper intersection point (assumes segments properly intersect)
        const properIntersectionPoint = (ax, ay, bx, by, cx, cy, dx, dy) => {
            const rpx = bx - ax, rpy = by - ay;
            const spx = dx - cx, spy = dy - cy;
            const d = rpx * spy - rpy * spx;
            const t = ((cx - ax) * spy - (cy - ay) * spx) / d;
            const ix = ax + t * rpx;
            const iy = ay + t * rpy;
            intersection.x = Math.round(ix);
            intersection.y = Math.round(iy);
            intersection.t = t;
            return intersection;
        };

        // Add endpoints first; this inherently splits any line under them
        const vStart = this.addVertex(x0, y0, true);
        const vEnd = this.addVertex(x1, y1, true);

        // If the exact line already exists, nothing to do
        const lineKey = DoomMap.createLineKey(vStart.x, vStart.y, vEnd.x, vEnd.y);
        if (this.#lineMap.get(lineKey)) {
            if (!skipRebuild) {
                this.rebuildSectors();
            }
            return false;
        }

        // Find all proper intersection points with existing lines along the intended segment
        const hits = [];

        this.iterateLines(line => {
            const lx0 = line.v0.x;
            const ly0 = line.v0.y;
            const lx1 = line.v1.x;
            const ly1 = line.v1.y;

            // Allow touching at endpoints
            const sharesEndpoint =
                x0 === lx0 && y0 === ly0 || x0 === lx1 && y0 === ly1 ||
                x1 === lx0 && y1 === ly0 || x1 === lx1 && y1 === ly1;
            if (sharesEndpoint) {
                return true;
            }

            // Collect interior proper intersections
            if (Utility.segmentsProperlyIntersect(x0, y0, x1, y1, lx0, ly0, lx1, ly1)) {
                const hit = properIntersectionPoint(x0, y0, x1, y1, lx0, ly0, lx1, ly1);
                if (hit.t > 0 && hit.t < 1) {
                    hits.push(hit);
                }
            }

            return true;
        }, boundsMin, boundsMax);

        // Insert intersection vertices (splits crossed lines)
        hits.forEach(h => {
            this.addVertex(h.x, h.y, true);
        });

        // Parameterize the intended segment P(t) = P0 + t*(P1-P0), t in [0,1]
        const dx = vEnd.x - vStart.x;
        const dy = vEnd.y - vStart.y;
        const lengthSquared = dx * dx + dy * dy;

        // Project a point onto the intended segment and clamp to [0,1]
        const projectT = (qx, qy) => {
            if (lengthSquared === 0) {
                return 0;
            }
            const t = ((qx - vStart.x) * dx + (qy - vStart.y) * dy) / lengthSquared;
            return Math.max(0, Math.min(1, t));
        };

        // Collect coverage intervals along t where existing collinear lines already cover the segment
        const intervals = [];

        this.iterateLines(line => {
            const ax = line.v0.x, ay = line.v0.y;
            const bx = line.v1.x, by = line.v1.y;

            // Require collinearity with the intended segment
            if (Utility.orientation(vStart.x, vStart.y, vEnd.x, vEnd.y, ax, ay) !== 0) {
                return true;
            }
            if (Utility.orientation(vStart.x, vStart.y, vEnd.x, vEnd.y, bx, by) !== 0) {
                return true;
            }

            // Project endpoints of the collinear line onto our segment parameter t
            const ta = projectT(ax, ay);
            const tb = projectT(bx, by);

            // Normalize to [s,e], ignore zero-length and outside [0,1]
            const s = Math.min(ta, tb);
            const e = Math.max(ta, tb);

            if (e - s <= epsilon) {
                return true;
            }

            if (e <= 0 || s >= 1) {
                return true;
            }

            intervals.push([Math.max(0, s), Math.min(1, e)]);
            return true;
        }, boundsMin, boundsMax);

        // Merge coverage intervals
        intervals.sort((a, b) => a[0] - b[0]);
        const merged = [];
        intervals.forEach(interval => {
            if (!merged.length || interval[0] > merged[merged.length - 1][1] + epsilon) {
                merged.push(interval.slice());
            } else {
                merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], interval[1]);
            }
        });

        // Compute gaps (uncovered intervals) where we need to add line segments
        const gaps = [];
        let cursor = 0;
        for (const [s, e] of merged) {
            if (s > cursor + epsilon) {
                gaps.push([cursor, s]);
            }
            cursor = Math.max(cursor, e);
        }
        if (cursor < 1 - epsilon) {
            gaps.push([cursor, 1]);
        }

        // Evaluate a point on the intended segment at parameter t
        const pointAt = t => ({
            x: Math.round(vStart.x + t * dx),
            y: Math.round(vStart.y + t * dy),
        });

        // Create new lines for each uncovered gap
        const created = [];
        for (const [s, e] of gaps) {
            if (e - s <= epsilon) {
                continue;
            }

            const pA = pointAt(s);
            const pB = pointAt(e);

            // Ensure endpoints exist (safe if already present)
            const vA = this.addVertex(pA.x, pA.y, true);
            const vB = this.addVertex(pB.x, pB.y, true);

            // Avoid degenerate segment after rounding
            if (vA.x === vB.x && vA.y === vB.y) {
                continue;
            }

            // Skip if this exact segment already exists
            const k = DoomMap.createLineKey(vA.x, vA.y, vB.x, vB.y);
            if (this.#lineMap.get(k)) {
                continue;
            }

            // Create and register the gap line
            const line = new Line(vA, vB);
            this.#addLine(line);
            created.push(line);
        }

        // Merge helper: given a line and a shared vertex, try to merge it with a collinear neighbor
        const otherOf = (line, vertex) => line.v0 === vertex ? line.v1 : line.v0;
        const tryMergeAtVertex = (line, sharedVertex) => {
            for (const candidate of sharedVertex.lines.slice()) {
                if (candidate === line) {
                    continue;
                }

                const a = otherOf(line, sharedVertex);
                const b = sharedVertex;
                const c = otherOf(candidate, sharedVertex);

                // Only consider collinear neighbors
                if (Utility.orientation(a.x, a.y, b.x, b.y, c.x, c.y) !== 0) {
                    continue;
                }

                // Check that replacing the two segments with (a,c) won't cross other geometry
                const ignore = new Set([line, candidate]);

                // Local bounds for the candidate merged segment (a,c)
                const lm = Math.min(a.x, c.x), rm = Math.max(a.x, c.x);
                const bm = Math.min(a.y, c.y), tm = Math.max(a.y, c.y);
                const localMin = { x: lm, y: bm };
                const localMax = { x: rm, y: tm };

                if (this.#wouldSegmentCrossAny(a.x, a.y, c.x, c.y, localMin, localMax, ignore)) {
                    continue;
                }

                // If the long segment already exists, drop the two short ones
                const mergedKey = DoomMap.createLineKey(a.x, a.y, c.x, c.y);
                const existing = this.#lineMap.get(mergedKey);
                if (existing !== undefined) {
                    this.#removeLine(line);
                    this.#removeLine(candidate);
                    return existing;
                }

                // Build the merged segment preserving style from the older candidate
                const base = candidate;
                const merged = base.clone(
                    this.#vertexMap,
                    (base.v0 === b ? a : null),
                    (base.v1 === b ? c : null)
                );

                this.#addLine(merged);
                this.#removeLine(line);
                this.#removeLine(candidate);
                return merged;
            }
            return line;
        };

        // Try to repeatedly merge outward for every newly created line
        created.forEach(line => {
            if (!this.#lines.includes(line)) {
                return;
            }
            let changed = true;
            while (changed) {
                changed = false;
                const vA = line.v0;
                const vB = line.v1;
                const m1 = tryMergeAtVertex(line, vA);
                if (m1 !== line) {
                    line = m1;
                    changed = true;
                    continue;
                }
                const m2 = tryMergeAtVertex(line, vB);
                if (m2 !== line) {
                    line = m2;
                    changed = true;
                    continue;
                }
            }
        });

        // Rebuild sector topology if requested
        if (!skipRebuild) {
            this.rebuildSectors();
        }

        // Return created lines (or false if nothing was added)
        return created.length > 0 ? created : false;
    }

    removeLine(fromX, fromY, toX, toY, skipRebuild = false) {
        const x0 = Math.round(fromX);
        const y0 = Math.round(fromY);
        const x1 = Math.round(toX);
        const y1 = Math.round(toY);

        const key = DoomMap.createLineKey(x0, y0, x1, y1);

        const line = this.#lineMap.get(key);
        if (line === undefined) {
            return false;
        }

        this.#removeLine(line);

        if (!skipRebuild) {
            this.rebuildSectors();
        }

        return true;
    }

    /**
     * Retrieves a line between (x0, y0) and (x1, y1), if it exists.
     *
     * @param {number} x0 - Start X coordinate
     * @param {number} y0 - Start Y coordinate
     * @param {number} x1 - End X coordinate
     * @param {number} y1 - End Y coordinate
     * @returns {?Line} The line if found, otherwise null.
     */
    getLine(x0, y0, x1, y1) {
        const key = DoomMap.createLineKey(x0, y0, x1, y1);
        return this.#lineMap.get(key) ?? null;
    }

    /**
     * Returns the sector that contains the point (x, y), if any.
     *
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {?Sector} The containing sector, or null if none found.
     */
    getSector(x, y) {
        const p = { x: Math.round(x), y: Math.round(y) };

        for (const sector of this.#sectors) {
            if (sector.isInside(p, p)) {
                return sector;
            }
        }
        return null;
    }

    /**
     * Adds a Thing (entity) to the map at the specified position.
     *
     * @param {number} x - X coordinate in map units.
     * @param {number} y - Y coordinate in map units.
     * @param {number} [z=0] - Height (Z position).
     * @param {number} [typeId=1] - Doom thing type identifier.
     * @param {number} [clone=null] - Thing to clone.
     * @returns {Thing} The newly created Thing instance.
     */
    addThing(x, y, z = 0, typeId = 1, clone = null) {
        const thing = clone !== null ? clone.clone(x, y) : new Thing(x, y, z, typeId);
        this.#addThing(thing);
        return thing;
    }

    /**
     * Removes the specified Thing from the map.
     *
     * @param {Thing} thing - The Thing instance to remove.
     * @returns {boolean} True if the Thing was found and removed.
     */
    removeThing(thing) {
        if (!this.#things.includes(thing)) {
            throw new Error('Attempted to remove non-existing thing');
        }
        this.#removeThing(thing);
        return true;
    }

    /**
     * Pastes the contents of another DoomMap into this one,
     * applying translation, scaling, and rotation.
     *
     * @param {DoomMap} submap - The source map to paste from.
     * @param {number} [offsetX=0] - Translation along X.
     * @param {number} [offsetY=0] - Translation along Y.
     * @param {number} [scaleX=1] - Scale factor along X.
     * @param {number} [scaleY=1] - Scale factor along Y.
     * @param {number} [pivotX=0] - Pivot X coordinate for scaling/rotation.
     * @param {number} [pivotY=0] - Pivot Y coordinate for scaling/rotation.
     * @param {number} [rotation=0] - Rotation in radians.
     */
    pasteMap(submap, offsetX = 0, offsetY = 0, scaleX = 1, scaleY = 1, pivotX = 0, pivotY = 0, rotation = 0) {
        const vertexMap = new Map();

        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);

        submap.#vertices.forEach(vertex => {
            const dx = (vertex.x - pivotX) * scaleX;
            const dy = (vertex.y - pivotY) * scaleY;
            const newX = Math.round(dx * cos - dy * sin + pivotX + offsetX);
            const newY = Math.round(dx * sin + dy * cos + pivotY + offsetY);

            let vertexNew = this.#vertexMap.get(DoomMap.createVertexKey(newX, newY));
            if (!vertexNew) {
                vertexNew = new Vertex(newX, newY);
                this.#addVertex(vertexNew);
            }

            vertexMap.set(vertex, vertexNew);
        });

        submap.#lines.forEach(line => {
            const v0 = vertexMap.get(line.v0);
            const v1 = vertexMap.get(line.v1);
            if (v0 === undefined || v1 === undefined || v0 === v1) {
                return;
            }

            const key = DoomMap.createLineKey(v0.x, v0.y, v1.x, v1.y);
            let lineNew = this.#lineMap.get(key);

            if (lineNew === undefined) {
                lineNew = line.clone(this.#vertexMap, v0, v1);
                this.#addLine(lineNew);
            }

            vertexMap.set(line, lineNew);
        });

        submap.#sectors.forEach(sector => {
            sector.lines.forEach(line => {
                const key = DoomMap.createLineKey(line.v0.x, line.v0.y, line.v1.x, line.v1.y);
                const createdLine = this.#lineMap.get(key);
                if (!createdLine) {
                  throw new Error('Sector contains an invalid line (not pasted)');
                }
                if (line.front.sector === sector) {
                    createdLine.front.sectorOverride = sector;
                } else {
                    createdLine.back.sectorOverride = sector;
                }
            });
        });

        submap.#things.forEach(thing => {
            const dx = (thing.x - pivotX) * scaleX;
            const dy = (thing.y - pivotY) * scaleY;
            const newX = Math.round(dx * cos - dy * sin + pivotX + offsetX);
            const newY = Math.round(dx * sin + dy * cos + pivotY + offsetY);

            const thingNew = thing.clone(newX, newY);
            this.#addThing(thingNew);

            vertexMap.set(thing, thingNew);
        });

        this.rebuildSectors();
    }

    ////////////////////////////////////////////////////////////////////////////
    // Selection API

    select(geometries = []) {
        geometries.forEach(geometry => {
            if (geometry && !this.#selection.has(geometry)) {
                this.#selection.add(geometry);
                if (geometry instanceof Line) {
                    this.#selection.add(geometry.v0);
                    this.#selection.add(geometry.v1);
                } else if (geometry instanceof Sector) {
                    geometry.lines.forEach(line => {
                        this.#selection.add(line.v0);
                        this.#selection.add(line.v1);
                        this.#selection.add(line);
                    });
                }
            }
        });

        this.#emitChange('select', { selection: this.#selection });
    }

    deselect(geometries = null) {
        let changed = false;

        if (geometries === null) {
            if (this.#selection.size > 0) {
                this.#selection.clear();
                changed = true;
            }
        } else {
            geometries.forEach(geometry => {
                if (this.#selection.delete(geometry)) {
                    changed = true;
                }
            });
        }

        if (changed) {
            this.#emitChange('deselect');
        }
    }

    /**
     * Creates a new DoomMap containing only the currently selected geometry.
     * All vertices, lines, sectors, and things are deep-cloned into the submap.
     *
     * @returns {DoomMap} A new map containing the copied selection.
     */
    copySelection() {
        const submap = new DoomMap();

        this.#vertices.forEach(vertex => {
            if (this.#selection.has(vertex)) {
                submap.#addVertex(new Vertex(vertex.x, vertex.y));
            }
        });

        this.#lines.forEach(line => {
            if (this.#selection.has(line)) {
                submap.#addLine(line.clone(submap.#vertexMap));
            }
        });

        this.#sectors.forEach(sector => {
            if (this.#selection.has(sector)) {
                submap.#addSector(sector.clone(submap.#lineMap, sector.lines.map(line => ({
                    v0: { x: line.v0.x, y: line.v0.y },
                    v1: { x: line.v1.x, y: line.v1.y },
                    front: line.front.sector === sector,
                }))));
            }
        });

        this.#things.forEach(thing => {
            if (this.#selection.has(thing)) {
                submap.#addThing(thing.clone(thing.x, thing.y));
            }
        });

        return submap;
    }

    ////////////////////////////////////////////////////////////////////////////
    // Serialization

    serialize() {
        return {
            vertices: this.#vertices.map(vertex => vertex.serialize()),
            lines: this.#lines.map(line => line.serialize()),
            sectors: this.#sectors.map(sector => sector.serialize()),
            things: this.#things.map(thing => thing.serialize()),
            metadata: { ...this.#metadata },
        };
    }

    /**
     * Restores a map from serialized data.
     * All vertices, lines, sectors, and things are rebuilt and registered into the map.
     *
     * @param {object} data - Serialized map data.
     */
    deserialize(data) {
        this.#vertices.length = 0;
        this.#vertexMap.clear();
        this.#lines.length = 0;
        this.#lineMap.clear();
        this.#sectors.length = 0;
        this.#things.length = 0;
        this.#spatialGrid.clear();
        this.#metadata = JSON.parse(JSON.stringify(data.metadata));

        data.vertices.forEach(vData => {
            this.#addVertex(Vertex.deserialize(vData));
        });

        data.lines.forEach(lData => {
            this.#addLine(Line.deserialize(lData, this.#vertexMap));
        });

        data.sectors.forEach(sData => {
            this.#addSector(Sector.deserialize(sData, this.#lineMap));
        });

        data.things.forEach(tData => {
            this.#addThing(Thing.deserialize(tData));
        });

        this.rebuildSectors();
    }
}
