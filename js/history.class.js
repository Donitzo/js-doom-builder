/**
 * History system for reversible actions.
 */
class History {
    /**
     * Action representation.
     * @private
     */
    static #Action = class {
        /** @type {() => void|null} */
        doFunc = null;
        /** @type {() => void|null} */
        undoFunc = null;
        /** @type {object|null} */
        target = null;
        /** @type {string|null} */
        parameter = null;
        /** @type {boolean} */
        coalescing = false;

        constructor(doFunc, undoFunc, target, parameter, coalescing) {
            this.doFunc = doFunc;
            this.undoFunc = undoFunc;
            this.target = target;
            this.parameter = parameter;
            this.coalescing = coalescing;
        }
    };

    /**
     * @returns {number} Number of available undo steps.
     */
    get undoCount() {
        return this.stack.length;
    }

    /**
     * @returns {number} Number of available redo steps.
     */
    get redoCount() {
        return this.redoStack.length;
    }

    /** @private @type {History.#Action[]} */
    stack = [];
    /** @private @type {History.#Action[]} */
    redoStack = [];

    /**
     * Execute a reversible action.
     *
     * @param {() => void} doFunc            Function that applies the change
     * @param {() => void} undoFunc          Function that reverts the change
     * @param {object|null} [target=null]    Object being modified
     * @param {string|null} [parameter=null] Name of parameter modified
     * @param {boolean} [coalescing=true]    Whether the next action can overwrite this action if same target+parameter
     */
    do(doFunc, undoFunc, target = null, parameter = null, coalescing = true) {
        const action = new History.#Action(doFunc, undoFunc, target, parameter, coalescing);

        const last = this.stack[this.stack.length - 1];
        const replace =
            last &&
            last.coalescing &&
            last.target === target &&
            last.parameter === parameter;

        if (replace) {
            this.stack[this.stack.length - 1] = action;
        } else {
            this.stack.push(action);
            this.redoStack.length = 0;
        }

        action.doFunc();
    }

    /**
     * Undo the most recent action, if any.
     */
    undo() {
        const action = this.stack.pop();
        if (action) {
            action.undoFunc();
            this.redoStack.push(action);
        }
    }

    /**
     * Redo the most recently undone action, if any.
     */
    redo() {
        const action = this.redoStack.pop();
        if (action) {
            action.doFunc();
            this.stack.push(action);
        }
    }

    /**
     * Clear all undo/redo history.
     */
    clear() {
        this.stack.length = 0;
        this.redoStack.length = 0;
    }
}

export default History;
