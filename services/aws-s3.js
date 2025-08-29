import { setDefaults } from '../lib/helpers';

function formatNumber(num, digits) {
  const string = String(num);

  return Array(digits - string.length + 1)
    .join('0')
    .concat(string);
}

const crypto = Npm.require('crypto');

function md5(data, encoding) {
  return crypto.createHash('md5').update(Buffer.from(data, 'utf-8')).digest(encoding);
}

function hmac256(key, data, encoding) {
  return crypto
    .createHmac('sha256', key)
    .update(Buffer.from(data, 'utf-8'))
    .digest(encoding);
}

Slingshot.S3Storage = {
  accessId: 'AWSAccessKeyId',
  secretKey: 'AWSSecretAccessKey',

  directiveMatch: {
    bucket: Match.OneOf(String, Function),
    bucketUrl: Match.OneOf(String, Function),

    region: Match.Where(function (region) {
      return (
        (Match.test(region, String) && /^[a-z]{2}-\w+-\d+$/.test(region))
        || Match.test(region, Function)
      );
    }),

    AWSAccessKeyId: String,
    AWSSecretAccessKey: String,

    // STANDARD or REDUCED_REDUNDANCY
    storageClass: Match.Optional(String),

    acl: Match.Optional(
      Match.Where(function (acl) {
        check(acl, String);

        return (
          [
            'private',
            'public-read',
            'public-read-write',
            'authenticated-read',
            'bucket-owner-read',
            'bucket-owner-full-control',
            'log-delivery-write',
          ].indexOf(acl) >= 0
        );
      }),
    ),

    key: Match.OneOf(String, Function),

    expire: Match.Where(function (expire) {
      check(expire, Number);

      return expire > 0;
    }),

    cacheControl: Match.Optional(String),
    contentDisposition: Match.Optional(Match.OneOf(String, Function, null)),
  },

  directiveDefault: {
    AWSAccessKeyId: Meteor.settings.AWSAccessKeyId,
    AWSSecretAccessKey: Meteor.settings.AWSSecretAccessKey,
    bucket: Meteor.settings.S3Bucket,
    bucketUrl: function (bucket, region) {
      let bucketDomain = 's3-' + region + '.amazonaws.com';
      if (region === 'us-east-1') bucketDomain = 's3.amazonaws.com';
      if (region === 'cn-north-1') bucketDomain = 's3.cn-north-1.amazonaws.com.cn';

      if (bucket.indexOf('.') !== -1) return 'https://' + bucketDomain + '/' + bucket;

      return 'https://' + bucket + '.' + bucketDomain;
    },
    region: Meteor.settings.AWSRegion || 'us-east-1',
    expire: 5 * 60 * 1000, // in 5 minutes
  },
  getContentDisposition: function (method, directive, file, meta) {
    let getContentDisposition = directive.contentDisposition;

    if (typeof getContentDisposition !== 'function') {
      getContentDisposition = function () {
        const filename = file.name && encodeURIComponent(file.name);

        return (
          directive.contentDisposition
          || (filename
            && 'inline; filename="' + filename + '"; filename*=utf-8\'\'' + filename)
        );
      };
    }

    return getContentDisposition.call(method, file, meta);
  },

  /**
   *
   * @param {{userId: String}} method
   * @param {Directive} directive
   * @param {FileInfo} file
   * @param {Object} [meta]
   *
   * @returns {Promise<UploadInstructions>}
   */

  upload: async function (method, directive, file, meta) {
    const bucket = typeof directive.bucket === 'function'
      ? await directive.bucket.call(method, file, meta)
      : directive.bucket;

    const region = typeof directive.region === 'function'
      ? await directive.region.call(method, file, meta)
      : directive.region;

    const policy = new Slingshot.StoragePolicy()
      .expireIn(directive.expire)
      .contentLength(0, Math.min(file.size, directive.maxSize || Infinity));

    const payload = {
      key: typeof directive.key === 'function'
            ? await directive.key.call(method, file, meta)
            : directive.key,

      bucket,

      'Content-Type': file.type,
      acl: directive.acl,

      'Cache-Control': directive.cacheControl,
      'Content-Disposition': await this.getContentDisposition(method, directive, file, meta),
    };

    const bucketUrl = typeof directive.bucketUrl === 'function'
      ? await directive.bucketUrl(bucket, region)
      : directive.bucketUrl;

    const downloadUrl = [directive.cdn || bucketUrl, payload.key]
      .map((part) => part.replace(/\/+$/, ''))
      .join('/');

    // The type of storage to use for the object. Defaults to 'STANDARD'.
    // Possible values include:
    // "STANDARD"
    // "REDUCED_REDUNDANCY"
    const storeClass = directive.storageClass || 'STANDARD';
    payload['x-amz-storage-class'] = storeClass;

    await this.applyEncryption(payload, meta);

    await this.applySignature(region, payload, policy, directive);

    return {
      upload: bucketUrl,
      download: downloadUrl,
      postData: [
        {
          name: 'key',
          value: payload.key,
        },
      ].concat(
        Object.entries(payload)
          .map(([name, value]) => {
            // Ignore 'key' as it is already included
            if (name !== 'key' && value !== undefined) {
              return { name, value };
            }
            return null;
          })
          .filter((item) => item !== null),
      ),
    };
  },

  /** Applies signature an upload payload
   *
   * @param {Object} payload - Data to be upload along with file
   * @param {Slingshot.StoragePolicy} policy
   * @param {Directive} directive
   */

  applySignature: function (region, payload, policy, directive) {
    const now = new Date();
    const today =        now.getUTCFullYear()
        + formatNumber(now.getUTCMonth() + 1, 2)
        + formatNumber(now.getUTCDate(), 2);
    const service = 's3';

    Object.assign(payload, {
      'x-amz-algorithm': 'AWS4-HMAC-SHA256',
      'x-amz-credential': [
        directive[this.accessId],
        today,
        region,
        service,
        'aws4_request',
      ].join('/'),
      'x-amz-date': today + 'T000000Z',
    });

    payload.policy = policy.match(payload).stringify();
    payload['x-amz-signature'] = this.signAwsV4(
      payload.policy,
      directive[this.secretKey],
      today,
      region,
      service,
    );
  },

  /** Generate a AWS Signature Version 4
   *
   * @param {String} policy - Base64 encoded policy to sign.
   * @param {String} secretKey - AWSSecretAccessKey
   * @param {String} date - Signature date (yyyymmdd)
   * @param {String} region - AWS Data-Center region
   * @param {String} service - type of service to use
   * @returns {String} hex encoded HMAC-256 signature
   */

  signAwsV4: function (policy, secretKey, date, region, service) {
    const dateKey = hmac256('AWS4' + secretKey, date);
    const dateRegionKey = hmac256(dateKey, region);
    const dateRegionServiceKey = hmac256(dateRegionKey, service);
    const signingKey = hmac256(dateRegionServiceKey, 'aws4_request');

    return hmac256(signingKey, policy, 'hex');
  },

  /** Generate AWS Server-Side Encryption headers
   *
   * @param {Object} payload - Data to be upload along with file
   * @param {Object} meta - Includes SSE encryption settings in meta.sse
   */

  applyEncryption: function (payload, meta) {
    let encryptionData = {};
    let sse;

    if (meta && meta.sse) {
      sse = meta.sse;

      if (sse.key) {
        encryptionData = {
          'x-amz-server-side-encryption-customer-algorithm': 'AES256',
          'x-amz-server-side-encryption-customer-key': Buffer.from(sse.key).toString(
            'base64',
          ),
          'x-amz-server-side-encryption-customer-key-MD5': md5(sse.key, 'base64'),
        };
      } else if (sse.kms && sse.kmsKeyId) {
        encryptionData = {
          'x-amz-server-side-encryption': 'aws:kms',
          'x-amz-server-side-encryption-aws-kms-key-id': sse.kmsKeyId,
        };
      } else if (sse.kms) {
        encryptionData = {
          'x-amz-server-side-encryption': 'aws:kms',
        };
      } else if (sse) {
        encryptionData = {
          'x-amz-server-side-encryption': 'AES256',
        };
      }

      Object.assign(payload, encryptionData);
    }
  },
};

Slingshot.S3Storage.TempCredentials = setDefaults(
  {
    directiveMatch: {
      ...Slingshot.S3Storage.directiveMatch,
      temporaryCredentials: Function,
      AWSAccessKeyId: undefined,
      AWSSecretAccessKey: undefined,
    },

    directiveDefault: {
      ...Slingshot.S3Storage.directiveDefault,
      AWSAccessKeyId: undefined,
      AWSSecretAccessKey: undefined,
    },

    applySignature: async function (region, payload, policy, directive) {
      const credentials = await directive.temporaryCredentials(directive.expire);

      check(
        credentials,
        Match.ObjectIncluding({
          AccessKeyId: Slingshot.S3Storage.directiveMatch.AWSAccessKeyId,
          SecretAccessKey: Slingshot.S3Storage.directiveMatch.AWSSecretAccessKey,
          SessionToken: String,
        }),
      );

      payload['x-amz-security-token'] = credentials.SessionToken;

      return Slingshot.S3Storage.applySignature.call(
        this,
        region,
        payload,
        policy,
        setDefaults(
          {
            AWSAccessKeyId: credentials.AccessKeyId,
            AWSSecretAccessKey: credentials.SecretAccessKey,
          },
          directive,
        ),
      );
    },
  },
  Slingshot.S3Storage,
);
