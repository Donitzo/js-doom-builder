/**
 * Abstract base class for all geometry types in the map.
 */
export default class Geometry {
    #bounds = null;
    /**
     * Read-only axis-aligned bounding box.
     * @type {{ min: {x:number, y:number}, max: {x:number, y:number} }}
     */
    get bounds() {
        return this.#bounds;
    }

    /**
     * Constructs a new geometry object.
     *
     * @param {{ min: {x:number, y:number}, max: {x:number, y:number} }} bounds
     *        Precomputed axis-aligned bounds for this geometry.
     */
    constructor(bounds) {
        this.#bounds = bounds;
    }
}
