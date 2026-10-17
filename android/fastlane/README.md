fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## Android

### android beta

```sh
[bundle exec] fastlane android beta
```

versionCode 증가 → 빌드 → 내부 테스트 트랙 업로드

### android release

```sh
[bundle exec] fastlane android release
```

versionCode 증가 → 빌드 → 프로덕션 트랙 업로드

### android promote

```sh
[bundle exec] fastlane android promote
```

내부 테스트 빌드를 프로덕션으로 승격

### android upload_internal

```sh
[bundle exec] fastlane android upload_internal
```

이미 빌드된 AAB를 내부 테스트 트랙에 업로드

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
