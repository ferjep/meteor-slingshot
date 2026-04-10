Slingshot.RackspaceFiles = {

  directiveMatch: {
    RackspaceAccountId: String,
    RackspaceMetaDataKey: String,
    container: String,
    region: String,
    pathPrefix: Match.OneOf(String, Function),
    expire: Match.Where(function (expire) {
      check(expire, Number);

      return expire > 0;
    }),
    deleteAt: Match.Optional(Date),
    deleteAfter: Match.Optional(Number),
  },

  directiveDefault: {
    RackspaceAccountId: Meteor.settings?.RackspaceAccountId,
    RackspaceMetaDataKey: Meteor.settings?.RackspaceMetaDataKey,
    region: 'iad3',
    expire: 5 * 60 * 1000, // in 5 minutes
  },

  version: 'v1',

  path: function (directive, prefix) {
    return '/' + [
      this.version,
      'MossoCloudFS_' + directive.RackspaceAccountId,
      directive.container,
      prefix,
    ].join('/').replace(/\/+/, '/');
  },

  pathPrefix: function (method, directive, file, meta) {
    if ('pathPrefix' in directive) {
      return typeof directive.pathPrefix === 'function'
        ? directive.pathPrefix.call(method, file, meta)
        : directive.pathPrefix;
    }

    return '';
  },

  host: function (region) {
    return 'https://storage101.' + region + '.clouddrive.com';
  },

  maxSize: 0x140000000, // 5GB

  upload: async function (method, directive, file, meta) {
    const pathPrefix = typeof directive.pathPrefix === 'function'
      ? await directive.pathPrefix.call(method, file, meta)
      : this.pathPrefix(method, directive, file, meta);
    const path = this.path(directive, pathPrefix);
    const host = this.host(directive.region);
    const url = host + path;
    const data = [
      {
        name: 'redirect',
        value: '',
      },
      {
        name: 'max_file_size',
        value: Math.min(file.size, directive.maxSize || this.maxSize),
      },
      {
        name: 'max_file_count',
        value: 1,
      },
      {
        name: 'expires',
        value: Date.now() + directive.expire,
      },
    ];

    data.push({
      name: 'signature',
      value: this.sign(directive.RackspaceMetaDataKey, path, data),
    });

    if ('deleteAt' in directive) {
      data.push({
        name: 'x_delete_at',
        value: directive.deleteAt.getTime(),
      });
    }

    if ('deleteAfter' in directive) {
      data.push({
        name: 'x_delete_after',
        value: Math.round(directive.deleteAfter / 1000),
      });
    }

    const {cdn} = directive;

    return {
      upload: url,
      download: (cdn && cdn + '/' + pathPrefix || host + path) + file.name,
      postData: data,
    };
  },

  sign: function (secretkey, path, data) {
    const policy = path + '\n' + data.map((item) => item.value).join('\n');

    return Npm.require('crypto')
      .createHmac('sha1', secretkey)
      .update(Buffer.from(policy, 'utf-8'))
      .digest('hex');
  },

};
