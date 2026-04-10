# Slingshot Changelog

## Version 3.2.0

### New Features

- Added `Slingshot.S3Storage.PresignedUrl` — server-side presigned PUT URL using static long-lived AWS keys. No credentials are sent to the browser.
- Added `Slingshot.S3Storage.TempCredentials.PresignedUrl` — server-side presigned PUT URL using temporary credentials. Drop-in upgrade from `S3Storage.TempCredentials`; reuses the `temporaryCredentials` function as-is. No credentials are sent to the browser.

### Enhancements

- `upload.js`: `transfer()` and `cordovaTransfer()` now support `method: 'PUT'` in upload instructions, sending the raw file body instead of a multipart form.
- `directive.js`: instructions check now accepts optional `method` field.
- `Npm.depends` added for `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.

### Documentation

- README fully updated for Meteor 3: async/await examples, `updateAsync`, `Assets.getTextAsync`, `this.userId` in directives, AWS SDK v3 for TempCredentials examples.
- New "S3 Presigned PUT URLs" section with code examples and CORS notes.
- Updated Security section to explain presigned URL approach.
- API Reference entries added for both new service types.

## Version 3.1.0

### Enhancements

- Async/await support: all directive callbacks (`authorize`, `key`, `pathPrefix`, `temporaryCredentials`, etc.) may now be `async` functions.
- `send()` now returns a `Promise` that resolves with the download URL.
- `validate()` is now async.

## Version 1.0.0A

### Announcements

- The package is mature enough to merit a 1.0 version
- New maintainers ferjep

### Enhancements

- Updated README

## Version 0.7.1

### Enhancements

- Added support for dynamic content-disposition for S3 and Google Cloud ([#64](https://github.com/CulturalMe/meteor-slingshot/issues/64))

## Version 0.7.0

### Enhancements

- Added `Slingshot.S3Storage.TempCredentials` ([#95](https://github.com/CulturalMe/meteor-slingshot/issues/95)). Thanks @jossoco

### Bug Fixes

- Fixed character encoding for content-disposition for AWS-S3 based directives. Thanks @timtch.

## Version 0.6.2

Removed debugging log.

## Version 0.6.1

### Enhancements

- Added a way to get the server response to the uploader. ([#82](https://github.com/CulturalMe/meteor-slingshot/issues/82))

### Bug Fixes

- Fixed bad S3 download url generation where the download url would start with `https:/` instead of `https://`. ([#84](https://github.com/CulturalMe/meteor-slingshot/issues/84))

## Version 0.6.0

### Bug Fixes

- Fixed error when `accounts-base` is not enabled. ([#65](https://github.com/CulturalMe/meteor-slingshot/issues/65))

### Enhancements

- Allow SSL to work for when the S3 bucket name contains a dot.

## Version 0.5.0

No changes. (incorrectly released)

## Version 0.4.1

### Bug Fixes

- Fixed `us-east-1` default bucket url for S3 ([#53](https://github.com/CulturalMe/meteor-slingshot/issues/53))

## Version 0.4.0

### New Features and Enhancements

- Added region parameters to S3. The default is `us-east-1`. This fixes bucketUrl problems [#33](https://github.com/CulturalMe/meteor-slingshot/issues/33).
- Upgrade to `AWS4-HMAC-256` for S3 policy signing to make slingshot compatible with new AWS datacenters, such as Frankfurt. [#33](https://github.com/CulturalMe/meteor-slingshot/issues/33)
- Added Rackspace Cloud Files support [#17](https://github.com/CulturalMe/meteor-slingshot/issues/17).

## Version 0.3.0

### New Features and Enhancements

- Added file-restriction sharing with client ([#32](https://github.com/CulturalMe/meteor-slingshot/issues/32))
- Use blob object url instead of base64 encoded files for latency compensation ([#6](https://github.com/CulturalMe/meteor-slingshot/issues/6))
- Added .param() method to Slingshot.Upload ([#11](https://github.com/CulturalMe/meteor-slingshot/issues/6))
- Added image pre-loading for smoother, flicker-less latency compensation ([#4](https://github.com/CulturalMe/meteor-slingshot/issues/4))
- Added support for uploading Blob objects instead of Files. ([#22](https://github.com/CulturalMe/meteor-slingshot/issues/22)) file.name is no longer a required property for uploads.
- Removed code duplication in Gougle Cloud and AWS S3 service implementation (they have a lot in common)
- Added the cdn directive parameter.
- Removed domain directive parameter.
- Added bucketUrl directive parameter to Google Cloud and AWS S3.

### Bug Fixes

- Fixed uploads for undetectable mime-type ([#34](https://github.com/CulturalMe/meteor-slingshot/issues/34))

## Version 0.2.0

Fixes [#3](https://github.com/CulturalMe/meteor-slingshot/issues/3): Providing 0 or null for maxSize means that there will be no file size limit exposed.
