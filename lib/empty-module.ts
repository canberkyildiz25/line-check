// Stands in for Node-only modules that a browser bundle never calls.
export const createRequire = () => () => ({});
const empty = {};
export default empty;
