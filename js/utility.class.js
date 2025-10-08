/**
 * Geometry utilities.
 */
export default class Utility {
    /** @type {number} Epsilon for floating-point tests */
    static #EPSILON = 1e-12;

    /**
     * Orientation of three points (p, q, r) via 2D cross product of (q - p) × (r - p).
     * Returns:
     *   1 = counter-clockwise (CCW)
     *  -1 = clockwise (CW)
     *   0 = collinear
     *
     * @param {number} px
     * @param {number} py
     * @param {number} qx
     * @param {number} qy
     * @param {number} rx
     * @param {number} ry
     * @returns {number} -1, 0 or 1
     */
    static orientation(px, py, qx, qy, rx, ry) {
        const cross = (qx - px) * (ry - py) - (qy - py) * (rx - px);
        return Math.abs(cross) < Utility.#EPSILON ? 0 : cross > 0 ? 1 : -1;
    }

    /**
     * True if (qx, qy) lies on segment (px, py) – (rx, ry).
     * Assumes collinearity has already been established.
     *
     * @param {number} px
     * @param {number} py
     * @param {number} qx
     * @param {number} qy
     * @param {number} rx
     * @param {number} ry
     * @returns {boolean}
     */
    static onSegment(px, py, qx, qy, rx, ry) {
        return (
            Math.min(px, rx) - Utility.#EPSILON <= qx && qx <= Math.max(px, rx) + Utility.#EPSILON &&
            Math.min(py, ry) - Utility.#EPSILON <= qy && qy <= Math.max(py, ry) + Utility.#EPSILON
        );
    }

    /**
     * True if segments AB and CD intersect at a proper interior point
     * (i.e., not just touching at endpoints and not collinear overlap).
     *
     * @param {number} ax
     * @param {number} ay
     * @param {number} bx
     * @param {number} by
     * @param {number} cx
     * @param {number} cy
     * @param {number} dx
     * @param {number} dy
     * @returns {boolean}
     */
    static segmentsProperlyIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
      const o1 = Utility.orientation(ax, ay, bx, by, cx, cy);
      const o2 = Utility.orientation(ax, ay, bx, by, dx, dy);
      const o3 = Utility.orientation(cx, cy, dx, dy, ax, ay);
      const o4 = Utility.orientation(cx, cy, dx, dy, bx, by);
      return (o1 * o2 < 0) && (o3 * o4 < 0);
    }

    /**
     * True if collinear segments AB and CD overlap by more than a single shared endpoint.
     * Touching exactly at one shared endpoint is allowed (returns false).
     *
     * @param {number} ax
     * @param {number} ay
     * @param {number} bx
     * @param {number} by
     * @param {number} cx
     * @param {number} cy
     * @param {number} dx
     * @param {number} dy
     * @returns {boolean}
     */
    static collinearOverlapMoreThanEndpoint(ax, ay, bx, by, cx, cy, dx, dy) {
        // Must be collinear
        const o1 = Utility.orientation(ax, ay, bx, by, cx, cy);
        const o2 = Utility.orientation(ax, ay, bx, by, dx, dy);
        if (o1 !== 0 || o2 !== 0) {
            return false;
        }

        // Choose dominant axis to avoid vertical special cases
        const useX = Math.abs(ax - bx) >= Math.abs(ay - by);

        const a0 = useX ? ax : ay;
        const a1 = useX ? bx : by;
        const c0 = useX ? cx : cy;
        const c1 = useX ? dx : dy;

        // Normalize intervals so start <= end
        let s1;
        let e1;
        if (a0 <= a1) {
            s1 = a0;
            e1 = a1;
        } else {
            s1 = a1;
            e1 = a0;
        }
        let s2;
        let e2;
        if (c0 <= c1) {
            s2 = c0;
            e2 = c1;
        } else {
            s2 = c1;
            e2 = c0;
        }

        // Overlap length
        const left = Math.max(s1, s2);
        const right = Math.min(e1, e2);
        const overlapLength = right - left;

        // More than a single point means strictly positive length
        return overlapLength > Utility.#EPSILON;
    }

    /**
     * Distance from (ax, ay) to (bx, by).
     *
     * @param {number} ax
     * @param {number} ay
     * @param {number} bx
     * @param {number} by
     * @returns {number}
     */
    static distanceTo(ax, ay, bx, by) {
        return Math.hypot(bx - ax, by - ay);
    }

    /**
     * Angle from (ax, ay) to (bx, by) in radians [-PI, PI].
     *
     * @param {number} ax
     * @param {number} ay
     * @param {number} bx
     * @param {number} by
     * @returns {number}
     */
    static angleTo(ax, ay, bx, by) {
        return Math.atan2(by - ay, bx - ax);
    }

    /**
     * Counter-clockwise angle from a to b in radians, normalized to [0, 2*PI].
     *
     * @param {number} a - from angle in radians
     * @param {number} b - to angle in radians
     * @returns {number}
     */
    static angleToCcw(a, b) {
        const tau = Math.PI * 2;
        return ((b - a) % tau + tau) % tau;
    }

    /**
     * Signed area of a simple polygon defined by a flat XY array.
     * Positive = CCW winding, negative = CW.
     *
     * @param {number[]} flatXY - flat array [x0,y0, x1,y1, ..., xn,yn]
     * @returns {number}
     */
    static signedArea2d(flatXY) {
        const n = flatXY.length;
        if (n < 3 * 2) {
            // < 3 vertices
            return 0;
        }

        let sum = 0;
        for (let i = 0; i < n; i += 2) {
            const j = (i + 2) % n;
            sum += flatXY[i] * flatXY[j + 1] - flatXY[i + 1] * flatXY[j];
        }
        return 0.5 * sum;
    }

    /**
     * Returns true only for strictly interior points (boundary excluded).
     *
     * @param {number[]} flatXY - Flat array [x0,y0, x1,y1, ..., xn,yn]
     * @param {number} px - Point X
     * @param {number} py - Point Y
     * @returns {boolean}
     */
    static polygonContainsPoint(flatXY, px, py) {
        if (flatXY.length < 6) {
            return false;
        }

        let inside = false;
        for (let i = 0, n = flatXY.length; i < n; i += 2) {
            const j = (i + 2) % n;
            const xi = flatXY[i];
            const yi = flatXY[i + 1];
            const xj = flatXY[j];
            const yj = flatXY[j + 1];
            const intersects =
                ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
            if (intersects) {
                inside = !inside;
            }
        }

        return inside;
    }

    /**
     * Returns true if every vertex of innerFlatXY lies inside outerFlatXY.
     *
     * @param {number[]} innerFlatXY - inner polygon vertices [xi,yi,...]
     * @param {number[]} outerFlatXY - outer polygon vertices [xo,yo,...]
     * @returns {boolean}
     */
    static polygonContainsAllVertices(innerFlatXY, outerFlatXY) {
        const ni = innerFlatXY.length;
        const no = outerFlatXY.length;

        if (ni < 2 || no < 6) {
            return false;
        }

        for (let i = 0; i < ni; i += 2) {
            const px = innerFlatXY[i];
            const py = innerFlatXY[i + 1];

            if (!Utility.polygonContainsPoint(outerFlatXY, px, py)) {
                return false;
            }
        }

        return true;
    }
}
