import Geometry from './geometry.class.js';

/**
 * Represents a 2D vertex in the map.
 */
export default class Vertex extends Geometry {
    #lines = [];
    /** @type {Line[]} Lines currently connected to this vertex (read-only). */
    get lines() {
        return this.#lines;
    }

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

    /**
     * Constructs a new immutable vertex at the given position.
     *
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     */
    constructor(x, y) {
        super({
            min: { x, y },
            max: { x, y },
        });

        this.#x = x;
        this.#y = y;
    }

    /**
     * Serializes this  {@link Vertex} to a plain data object.
     *
     * @returns {object} Serialized vertex representation.
     */
    serialize() {
        return { x: this.#x, y: this.#y };
    }

    /**
     * Creates a {@link Vertex} instance from serialized data.
     *
     * @param {object} data - Serialized vertex coordinates.
     * @returns {Vertex} A new vertex instance.
     */
    static deserialize(data) {
        return new Vertex(data.x, data.y);
    }

    /**
     * Adds a line to this vertex’s connectivity list.
     *
     * @param {Line} line - The line to associate with this vertex.
     */
    addLine(line) {
        this.#lines.push(line);
    }

    /**
     * Removes a line from this vertex’s connectivity list.
     *
     * @param {Line} line - The line to detach from this vertex.
     */
    removeLine(line) {
        const i = this.#lines.indexOf(line);
        if (i === -1) {
            throw new Error('Attempted to remove non-existent line from vertex');
        }
        this.#lines.splice(i, 1);
    }
}
