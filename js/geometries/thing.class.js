import Geometry from './geometry.class.js';

/**
 * Represents a Thing placed within the map such as a player start, monster, decoration, or pickup.
 */
export default class Thing extends Geometry {
    #x = 0;
    /** @type {number} X coordinate (read-only). */
    get x() {
        return this.#x;
    }

    #y = 0;
    /** @type {number} Y coordinate (read-only). */
    get y() {
        return this.#y;
    }

    /** @type {number} Z coordinate (height above floor). */
    z = 0;

    /** @type {number} Doom thing type ID (e.g., 1 = player start). */
    typeId = 1;

    /** @type {number} Facing angle in degrees (0 = east, 90 = north). */
    angle = 0;

    /**
     * Creates a new Thing at the given position and orientation.
     *
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {number} [z=0] - Z coordinate (height above floor).
     * @param {number} [typeId=1] - Doom thing type identifier.
     * @param {number} [angle=0] - Facing angle in degrees (0 = east).
     */
    constructor(x, y, z = 0, typeId = 1, angle = 0) {
        super({
            min: { x, y },
            max: { x, y },
        });

        this.#x = x;
        this.#y = y;
        this.z = z;
        this.typeId = typeId;
        this.angle = angle;
    }

    /**
     * Creates a clone of this Thing at a new position.
     *
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @returns {Thing} A cloned Thing instance.
     */
    clone(x, y) {
        return new Thing(x, y, this.z, this.typeId, this.angle);
    }

    /**
     * Serializes this Thing into a plain data object.
     *
     * @returns {object} Serialized Thing data.
     */
    serialize() {
        return {
            x: this.#x,
            y: this.#y,
            z: this.z,
            typeId: this.typeId,
            angle: this.angle,
        };
    }

    /**
     * Creates a new Thing instance from serialized data.
     *
     * @param {object} data - Serialized Thing data.
     * @returns {Thing} Deserialized Thing instance.
     */
    static deserialize(data) {
        return new Thing(data.x, data.y, data.z, data.typeId, data.angle);
    }
}
