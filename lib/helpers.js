/**
 * Set default values for an object.
 *
 * @param {Object} obj - The object to modify.
 * @param {...Object} args - Default objects to use for setting default values.
 *
 * @returns {Object} The modified object.
 */
export function setDefaults(obj, ...args) {
  // Use a for...of loop to iterate over the default objects
  for (const defaultObj of args) {
    // Check if the default object is not null or undefined
    if (defaultObj) {
      // Use Object.keys() to get an array of the default object's own property names
      for (const key of Object.keys(defaultObj)) {
        // Check if the property does not exist or is undefined in the original object
        if (obj[key] === undefined) {
          obj[key] = defaultObj[key];
        }
      }
    }
  }

  // Return the modified object
  return obj;
}
