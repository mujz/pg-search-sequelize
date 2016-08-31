'use strict';

const Util = {
  isEmptyObject(obj) {
    return obj === undefined || obj === null || typeof obj !== 'object' || Object.keys(obj).length < 1;
  },

  polyfillAllIndicesOf() {
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