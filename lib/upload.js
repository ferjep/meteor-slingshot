/**
 * @fileOverview Defines client side API in which files can be uploaded.
 */

/**
 *
 * @param {String} image - URL of image to preload.
 * @param {Function} callback
 */

function preloadImage(image, callback) {
  const preloader = new window.Image();

  preloader.onload = callback;

  preloader.src = image;
}

function readDataUrl(file, callback) {
  const reader = new window.FileReader();

  reader.onloadend = function () {
    callback(reader.result);
  };

  reader.readAsDataURL(file);
}

/**
 *
 * @param {string} directive - Name of server-directive to use.
 * @param {object} [metaData] - Data to be sent to directive.
 * @constructor
 */

Slingshot.Upload = function (directive, metaData) {
  if (!window.File || !window.FormData) {
    if (!cordova || !cordova.file || !FileTransfer) {
      throw new Error(
        'Browser does not support HTML5 uploads and cordova file transfer is not available',
      );
    }
  }

  const self = this;
  const loaded = new ReactiveVar();
  const total = new ReactiveVar();
  const status = new ReactiveVar('idle');

  let dataUri;
  let preloaded;

  function buildFormData() {
    const formData = new window.FormData();

    if (Array.isArray(self.instructions.postData)) {
      self.instructions.postData.forEach(function (field) {
        formData.append(field.name, field.value);
      });
    }

    formData.append('file', self.file, self.file.name);

    return formData;
  }

  function cordovaTransfer(callback) {
    status.set('transferring');
    loaded.set(0);

    const ft = new FileTransfer();

    ft.onprogress = function (progressEvent) {
      if (progressEvent.lengthComputable) {
        loaded.set(progressEvent.loaded);
        total.set(progressEvent.total);
      }
    };

    /* global FileUploadOptions */
    const options = new FileUploadOptions();
    options.headers = {};
    self.instructions.headers.forEach((value, key) => {
      options.headers[key] = value;
    });
    options.headers['Content-Length'] = self.file.size;

    options.params = {};
    self.instructions.postData.forEach((value) => {
      options.params[value.name] = value.value;
    });

    const fileUrl = self.file.nativeURL;
    options.fileKey = 'file';
    options.fileName = self.file.name;
    options.mimeType = self.file.type;
    options.httpMethod = (self.instructions.method || 'POST').toLowerCase();

    ft.upload(
      fileUrl,
      encodeURI(self.instructions.upload),
      (/* result */) => {
        status.set('done');
        loaded.set(total.get());
        callback(null, self.instructions.download);
      },
      (err) => {
        status.set('failed');
        callback(
          new Meteor.Error(
            err.http_status,
            'Failed to upload file to cloud storage',
            err.exception,
          ),
        );
      },
      options,
    );

    self.xhr = ft;

    return self;
  }
  Object.assign(self, {
    /**
     * @returns {string}
     */

    status: function () {
      return status.get();
    },

    /**
     * @returns {number}
     */

    progress: function () {
      return self.uploaded() / total.get();
    },

    /**
     * @returns {number}
     */

    uploaded: function () {
      return loaded.get();
    },

    /**
     * @param {File} file
     * @returns {Promise<null|Error>} Returns null on success, Error on failure.
     */
    validate: async function (file) {
      const context = {
        userId: Meteor.userId && Meteor.userId(),
      };

      try {
        const validators = Slingshot.Validators;
        const restrictions = Slingshot.getRestrictions(directive);

        if (await validators.checkAll(context, file, metaData, restrictions)) {
          return null
        }

        throw new Meteor.Error('Upload denied', 'Validators failed');
      } catch (error) {
        return error;
      }
    },

    /**
     * @param {(File|Blob)} file
     * @param {Function} [callback]
     * @returns {Promise<string>} Resolves with the download URL on success.
     */

    send: function (file, callback) {
      if (
        !(file instanceof window.File)
        && !(file instanceof window.Blob)
        && !(typeof file === 'string' && /^file:\/\/.*$/i.test(file))
      ) {
        throw new Error('Not a file');
      }

      const promise = new Promise((resolve, reject) => {
        function _send() {
          self.request(function (error, instructions) {
            if (error) {
              callback && callback(error);
              return reject(error);
            }

            self.instructions = instructions;

            self.transfer().then(resolve, reject);
          });
        }

        if (/^file:\/\/.*$/i.test(file)) {
          window.resolveLocalFileSystemURL(file, function (fileEntry) {
            fileEntry.file(function (f) {
              self.file = f;
              self.file.nativeURL = fileEntry.nativeURL;
              _send();
            });
          });
        } else {
          self.file = file;
          _send();
        }
      });

      if (callback) {
        promise.then(
          (url) => callback(null, url),
          (error) => callback(error),
        );
      }

      return promise;
    },

    /**
     * @param {Function} [callback]
     * @returns {Promise<Slingshot.Upload>}
     */

    request: async function (callback) {
      if (!self.file) {
        callback(new Error('No file to request upload for'));
        return self
      }

      const file = {
        name: self.file.name,
        size: self.file.size,
        type: self.file.type,
      };

      status.set('authorizing');

      const error = await this.validate(file);

      if (error) {
        status.set('failed');
        callback(error);
        return self;
      }

      try {
        const instructions = await Meteor.callAsync(
          'slingshot/uploadRequest',
          directive,
          file,
          metaData,
        );

        status.set('authorized');

        callback(null, instructions);
      } catch (error) {
        status.set('failed');

        callback(error);
      }

      return self;
    },

    /**
     * @param {Function} [callback]
     * @returns {Promise<string>} Resolves with the download URL on success.
     */

    transfer: function (callback) {
      if (status.curValue !== 'authorized') {
        throw new Error(
          'Cannot transfer file at upload status: ' + status.curValue,
        );
      }
      if (self.file.nativeURL) {
        // cordova File — wrap callback-based cordovaTransfer in a Promise
        return new Promise((resolve, reject) => {
          cordovaTransfer((error, url) => {
            if (error) {
              callback && callback(error);
              return reject(error);
            }
            callback && callback(null, url);
            resolve(url);
          });
        });
      }

      status.set('transferring');
      loaded.set(0);

      return new Promise((resolve, reject) => {
        try {
          const xhr = new XMLHttpRequest();

          xhr.upload.addEventListener(
            'progress',
            function (event) {
              if (event.lengthComputable) {
                loaded.set(event.loaded);
                total.set(event.total);
              }
            },
            false,
          );

          const getError = () => new Meteor.Error(
            xhr.statusText + ' - ' + xhr.status,
            'Failed to upload file to cloud storage',
          );

          xhr.addEventListener('load', function () {
            if (xhr.status < 400) {
              status.set('done');
              loaded.set(total.get());
              callback && callback(null, self.instructions.download);
              resolve(self.instructions.download);
            } else {
              status.set('failed');
              const error = getError();
              callback && callback(error);
              reject(error);
            }
          });

          xhr.addEventListener('error', function () {
            status.set('failed');
            const error = getError();
            callback && callback(error);
            reject(error);
          });

          xhr.addEventListener('abort', function () {
            status.set('aborted');
            const error = new Meteor.Error(
              'Aborted',
              'The upload has been aborted by the user',
            );
            callback && callback(error);
            reject(error);
          });

          xhr.open(self.instructions.method || 'POST', self.instructions.upload, true);

          if (Array.isArray(self.instructions.headers)) {
            self.instructions.headers.forEach(function (value, key) {
              xhr.setRequestHeader(key, value);
            });
          }

          if ((self.instructions.method || 'POST').toUpperCase() === 'PUT') {
            xhr.setRequestHeader('Content-Type', self.file.type);
            xhr.send(self.file);
          } else {
            xhr.send(buildFormData());
          }
          self.xhr = xhr;
        } catch (error) {
          callback && callback(error);
          reject(error);
        }
      });
    },

    /**
     * @returns {boolean}
     */

    isImage: function () {
      self.status(); // React to status change.
      return Boolean(self.file && self.file.type.split('/')[0] === 'image');
    },

    /**
     * Latency compensated url of the file to be uploaded.
     *
     * @param {boolean} preload
     *
     * @returns {string}
     */

    url: function (preload) {
      if (!dataUri) {
        const localUrl = new ReactiveVar();
        const URL = window.URL || window.webkitURL;

        dataUri = new ReactiveVar();

        Tracker.nonreactive(function () {
          /*
           It is important that we generate the local url not more than once
           throughout the entire lifecycle of `self` to prevent flickering.
           */

          const previewRequirement = new Tracker.Dependency();

          Tracker.autorun(function (computation) {
            if (self.file) {
              if (URL) {
                localUrl.set(URL.createObjectURL(self.file));
                computation.stop();
              } else if (Tracker.active && window.FileReader) {
                readDataUrl(self.file, function (result) {
                  localUrl.set(result);
                  computation.stop();
                });
              }
            } else {
              previewRequirement.depend();
            }
          });

          Tracker.autorun(function (computation) {
            const currentStatus = self.status();

            if (self.instructions && currentStatus === 'done') {
              computation.stop();
              dataUri.set(self.instructions.download);
            } else if (currentStatus === 'failed' || currentStatus === 'aborted') {
              computation.stop();
            } else if (self.file && !dataUri.curValue) {
              previewRequirement.changed();
              dataUri.set(localUrl.get());
            }
          });
        });
      }

      if (preload) {
        if (self.file && !self.isImage()) throw new Error('Cannot pre-load anything other than images');

        if (!preloaded) {
          Tracker.nonreactive(function () {
            preloaded = new ReactiveVar();

            Tracker.autorun(function (computation) {
              const url = dataUri.get();

              if (self.instructions) {
                preloadImage(url, () => {
                  computation.stop();
                  preloaded.set(url);
                });
              } else {
                preloaded.set(url);
              }
            });
          });
        }

        return preloaded.get();
      } return dataUri.get();
    },

    /** Gets an upload parameter for the directive.
     *
     * @param {String} name
     * @returns {String|Number|Undefined}
     */

    param: function (name) {
      self.status(); // React to status changes.

      const data = self.instructions && self.instructions.postData;
      const field = Array.isArray(data) && data.find((a) => a.name === name);

      return field && field.value;
    },
  });
};
