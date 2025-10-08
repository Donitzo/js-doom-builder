import DoomMap from '../doommap.class.js';
import Geometry from './geometry.class.js';

/**
 * Represents a line segment between two vertices.
 */
export default class Line extends Geometry {
    /**
     * Internal class representing one side of a line (front or back).
     * @private
     */
    static #Side = class Side {
        /** @type {?Sector} Sector associated with this side. */
        sector = null;
        /** @type {?Sector} Previous sector reference used during rebuilds. */
        sectorOld = null;
        /** @type {?Sector} Sector override used when new lines. */
        sectorOverride = null;
        /** @type {string} Upper texture name. */
        textureUpper = '';
        /** @type {string} Middle texture name. */
        textureMiddle = '';
        /** @type {string} Lower texture name. */
        textureLower = '';
        /** @type {number} Horizontal texture offset. */
        xOffset = 0;
        /** @type {number} Vertical texture offset. */
        yOffset = 0;

        /**
         * Copy side data.
         *
         * @param {Line.#Side} side - Side to copy.
         */
        copy(side) {
            this.textureUpper = side.textureUpper;
            this.textureMiddle = side.textureMiddle;
            this.textureLower = side.textureLower;
            this.xOffset = side.xOffset;
            this.yOffset = side.yOffset;
        }

        /** @returns {object} Serialized side data. */
        serialize() {
            return {
                textureUpper: this.textureUpper,
                textureMiddle: this.textureMiddle,
                textureLower: this.textureLower,
                xOffset: this.xOffset,
                yOffset: this.yOffset,
            };
        }

        /**
         * Deserializes side data.
         *
         * @param {object} data - Serialized side data.
         */
        deserialize(data) {
            this.textureUpper = data.textureUpper ?? '';
            this.textureMiddle = data.textureMiddle ?? '';
            this.textureLower = data.textureLower ?? '';
            this.xOffset = data.xOffset ?? 0;
            this.yOffset = data.yOffset ?? 0;
        }
    };

    /**
     * Internal class representing line rendering and gameplay flags.
     * @private
     */
    static #Flags = class Flags {
        impassable = false;
        twoSided = false;
        upperUnpegged = false;
        lowerUnpegged = false;
        secret = false;
        blockSound = false;
        dontDraw = false;

        /**
         * Copy flag data.
         *
         * @param {Line.#Flags} flags - Flags to copy.
         */
        copy(flags) {
            this.impassable = flags.impassable;
            this.twoSided = flags.twoSided;
            this.upperUnpegged = flags.upperUnpegged;
            this.lowerUnpegged = flags.lowerUnpegged;
            this.secret = flags.secret;
            this.blockSound = flags.blockSound;
            this.dontDraw = flags.dontDraw;
        }

        /** @returns {object} Serialized flag data. */
        serialize() {
            return {
                impassable: this.impassable,
                twoSided: this.twoSided,
                upperUnpegged: this.upperUnpegged,
                lowerUnpegged: this.lowerUnpegged,
                secret: this.secret,
                blockSound: this.blockSound,
                dontDraw: this.dontDraw,
            };
        }

        /**
         * Deserializes flag data.
         *
         * @param {object} data - Serialized flag data.
         */
        deserialize(data) {
            this.impassable = data.impassable;
            this.twoSided = data.twoSided;
            this.upperUnpegged = data.upperUnpegged;
            this.lowerUnpegged = data.lowerUnpegged;
            this.secret = data.secret;
            this.blockSound = data.blockSound;
            this.dontDraw = data.dontDraw;
        }
    };

    #v0 = null;
    /** @type {Vertex} Starting vertex (read-only). */
    get v0() {
        return this.#v0;
    }

    #v1 = null;
    /** @type {Vertex} Ending vertex (read-only). */
    get v1() {
        return this.#v1;
    }

    #front = new Line.#Side();
    /** @type {Line.#Side} Front side data. */
    get front() {
        return this.#front;
    }

    #back = new Line.#Side();
    /** @type {Line.#Side} Back side data. */
    get back() {
        return this.#back;
    }

    #flags = new Line.#Flags();
    /** @type {Line.#Flags} Rendering and gameplay flags. */
    get flags() {
        return this.#flags;
    }

    /**
     * Constructs a new line between two vertices.
     *
     * @param {Vertex} v0 - Starting vertex.
     * @param {Vertex} v1 - Ending vertex.
     */
    constructor(v0, v1) {
        super({
            min: {
                x: Math.min(v0.x, v1.x),
                y: Math.min(v0.y, v1.y),
            },
            max: {
                x: Math.max(v0.x, v1.x),
                y: Math.max(v0.y, v1.y),
            },
        });

        this.#v0 = v0;
        this.#v1 = v1;

        v0.addLine(this);
        v1.addLine(this);
    }

    /**
     * Creates a clone of this line, remapping vertices via a vertex map.
     *
     * @param {Map<string, Vertex>} vertexMap - Map of vertex keys to Vertex instances.
     * @param {?Vertex} [v0=null] - Optional override for the first vertex.
     * @param {?Vertex} [v1=null] - Optional override for the second vertex.
     * @returns {Line} A cloned line.
     */
    clone(vertexMap, v0 = null, v1 = null) {
        const key0 = DoomMap.createVertexKey(v0?.x ?? this.#v0.x, v0?.y ?? this.#v0.y);
        const key1 = DoomMap.createVertexKey(v1?.x ?? this.#v1.x, v1?.y ?? this.#v1.y);

        const v0_ = vertexMap.get(key0);
        const v1_ = vertexMap.get(key1);

        if (v0_ === undefined || v1_ === undefined) {
            throw new Error(`Missing vertex for ${key0} or ${key1}`);
        }

        const line = new Line(v0_, v1_);
        line.#front.copy(this.#front);
        line.#back.copy(this.#back);
        line.#flags.copy(this.#flags);
        return line;
    }

    /**
     * Serializes this line into a plain data object.
     *
     * @returns {object} Serialized line data.
     */
    serialize() {
        return {
            v0: { x: this.#v0.x, y: this.#v0.y },
            v1: { x: this.#v1.x, y: this.#v1.y },
            front: this.#front.serialize(),
            back: this.#back.serialize(),
            flags: this.#flags.serialize(),
        };
    }

    /**
     * Deserializes a line from serialized data.
     *
     * @param {object} data - Serialized line data.
     * @param {Map<string, Vertex>} vertexMap - Map of vertex keys to Vertex instances.
     * @returns {Line} Deserialized line.
     */
    static deserialize(data, vertexMap) {
        const key0 = DoomMap.createVertexKey(data.v0.x, data.v0.y);
        const key1 = DoomMap.createVertexKey(data.v1.x, data.v1.y);

        const v0 = vertexMap.get(key0);
        const v1 = vertexMap.get(key1);

        if (v0 === undefined || v1 === undefined) {
            throw new Error(`Missing vertex ${key0} or ${key1}`);
        }

        const line = new Line(v0, v1);
        line.#front.deserialize(data.front);
        line.#back.deserialize(data.back);
        line.#flags.deserialize(data.flags);
        return line;
    }

    /**
     * Detaches this line from its connected vertices.
     */
    clearVertices() {
        const i0 = this.#v0.lines.indexOf(this);
        const i1 = this.#v1.lines.indexOf(this);

        if (i0 === -1 || i1 === -1) {
            throw new Error('Line missing from vertices');
        }

        this.#v0.lines.splice(i0, 1);
        this.#v1.lines.splice(i1, 1);
    }
}
