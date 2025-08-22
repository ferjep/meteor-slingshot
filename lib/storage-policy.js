/**
 * @constructor
 */

Slingshot.StoragePolicy = function () {

  /**
   * @type {{[expiration]: String, conditions: Array.<(Object|Array)>}}
   */

  var policy = {conditions: []};

  var self = this;

  Object.assign(self, {

    /** Set policy expiration time (as an absolute value).
     *
     * Subsequent calls override previous expiration values.
     *
     * @param {Date} deadline
     *
     * @returns {Slingshot.StoragePolicy}
     */

    expire: function (deadline) {
      check(deadline, Date);

      policy.expiration = deadline.toISOString();

      return self;
    },


    /** Adds a constraint in which a property must equal a value.
     *
     * @param {(String|Object.<String, String>)} property
     * @param {String} [value]
     *
     * @returns {Slingshot.StoragePolicy}
     */

    match: function (property, value) {
      // A simple check for an object that handles null
      if (typeof property === 'object' && property !== null) {
        // Option 2: Using Object.entries() (a more modern and functional approach)
        // This is generally preferred as it is safer and avoids issues with prototype chains.
        for (const [key, value] of Object.entries(property)) {
          self.match(key, value);
        }
      } else if (property && value !== undefined) {
        const constraint = {};

        constraint[property] = value;

        policy.conditions.push(constraint);
      }

      return self;
    },

    /** Set expiration time to a future value (relative from now)
     *
     * Subsequent calls override previous expiration values.
     *
     * @param {Number} ms - Number of milliseconds in the future.
     *
     * @return {Slingshot.StoragePolicy}
     */

    expireIn: function (ms) {
      return self.expire(new Date(Date.now() + ms));
    },

    /** Adds a starts-with constraint.
     *
     * @param {string} field - Name of the field without the preceding '$'
     * @param {string} constraint - Value that the field must start with
     * @returns {Slingshot.StoragePolicy}
     */

    startsWith: function (field, constraint) {
      policy.conditions.push(["starts-with", "$" + field, constraint]);
      return self;
    },

    /** Adds a file-size constraint
     *
     * @param minimum {Number} Minimum file-size
     * @param maximum {Number} Maximum file-size
     * @returns {Slingshot.StoragePolicy}
     */

    contentLength: function (minimum, maximum) {
      policy.conditions.push(["content-length-range", minimum, maximum]);
      return self;
    },

    /**
     * @returns {string}
     */

    stringify: function (encoding) {
      /* global Buffer: false */
      return Buffer.from(JSON.stringify(policy), "utf-8")
        .toString(encoding || "base64");
    }
  });
};
