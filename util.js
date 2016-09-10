'use strict';

const Util = {
  /**
   * Checks if obj is an object and it has no properties
   * @param {Object|*} obj the variable to check.
   * @return {boolean} false if obj is an object and has values, otherwise return true.
   */
  isEmptyObject(obj) {
    return obj === undefined || obj === null || typeof obj !== 'object' || Object.keys(obj).length < 1;
  },

  /**
   * Adds `allIndicesOf(substring)` function to the string prototype
   */
  polyfillAllIndicesOf() {
    /**
     * Gets the indices of a string in another string.
     * Finds the first index of the substring in the string using String.indexOf,
     * then calls String.substring(index) to cut out the already searched part of the string.
     * This repeats until there are no more instances of the substring.
     * @param {String} substring the string to get the indices of
     * @return {Array<Number>} indices of the substring in the string
     */
    String.prototype.allIndicesOf = function(substring) {
      let indices = [this.indexOf(substring)];
      do {
        let prevIndex = indices[indices.length - 1] + 1;
        var index = this.substring(prevIndex).indexOf(substring);
        if (index > -1) {
          indices.push(index + prevIndex);
        }
      } while (index > -1);
      return indices;
    };
  }
};

module.exports = Util;