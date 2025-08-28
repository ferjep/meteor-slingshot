import { setDefaults } from '../lib/helpers';

// GoogleCloud is based on the very same api as AWS S3, so we extend it:

Slingshot.GoogleCloud = setDefaults({

  accessId: 'GoogleAccessId',
  secretKey: 'GoogleSecretKey',

  directiveMatch: {
    ...Slingshot.S3Storage.directiveMatch,
    AWSAccessKeyId: undefined,
    AWSSecretAccessKey: undefined,
    region: undefined,

    GoogleAccessId: String,
    GoogleSecretKey: String,

    acl: Match.Optional(Match.Where(function (acl) {
      check(acl, String);

      return [
        'project-private',
        'private',
        'public-read',
        'public-read-write',
        'authenticated-read',
        'bucket-owner-read',
        'bucket-owner-full-control',
      ].indexOf(acl) >= 0;
    })),
  },

  directiveDefault: {
    ...Slingshot.S3Storage.directiveDefault,
    AWSAccessKeyId: undefined,
    AWSSecretAccessKey: undefined,
    region: undefined,

    GoogleAccessId: Meteor.settings?.GoogleAccessId,
    bucketUrl: function (bucket) {
      return 'https://' + bucket + '.storage.googleapis.com';
    },
  },

  applySignature: function (payload, policy, directive) {
    payload[this.accessId] = directive[this.accessId];

    const payloadToSign = { ...payload };
    delete payloadToSign[this.accessId];

    payload.policy = policy.match(payloadToSign).stringify();
    payload.signature = this.sign(directive[this.secretKey], payload.policy);
  },

  /**
   * @param {String} secretKey - pem private key
   * @param {String} policy
   * @returns {*|String}
   */

  sign: function (secretKey, policy) {
    return Npm.require('crypto')
      .createSign('RSA-SHA256')
      .update(policy)
      .sign(secretKey, 'base64');
  },
}, Slingshot.S3Storage);
