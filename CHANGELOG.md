## Unreleased

### Features

* federated grants in the profile: optional `federatedResources` (`FederatedResource` = licensed resource + `issuer`), ignored by every existing filter; opt in with `withFederated()` or `fromIssuer(issuerId)`
* `withFederated()` / `fromIssuer()` must open a chain: after any other filter they yield no licensed resources
* contract vectors synced with the gateway (adds `valid_with_federated_resources`)

## [2.1.0](https://github.com/LepistaBioinformatics/mycelium-sdk-js/compare/v2.0.0...v2.1.0) (2026-11-21)

### Features

* harden profile signature verification and accept the gateway base URL ([9e0354e](https://github.com/LepistaBioinformatics/mycelium-sdk-js/commit/9e0354e9ccb8c4256900107865b3e2f9d4142df3))
* verify profile signatures with the gateway JWKS ([b952fb8](https://github.com/LepistaBioinformatics/mycelium-sdk-js/commit/b952fb8300a5fb5080560c9ae4a81471ccc61238)), closes [LepistaBioinformatics/mycelium#224](https://github.com/LepistaBioinformatics/mycelium/issues/224)
* verify the gateway profile signature ([68da618](https://github.com/LepistaBioinformatics/mycelium-sdk-js/commit/68da61813253dabac2d5fc54fb6d635c97e9de4b)), closes [LepistaBioinformatics/mycelium#224](https://github.com/LepistaBioinformatics/mycelium/issues/224)

### Bug Fixes

* accept the profile wire format emitted by the gateway ([15e5be5](https://github.com/LepistaBioinformatics/mycelium-sdk-js/commit/15e5be50df58e031affed9f957f1c7bc244109b7)), closes [LepistaBioinformatics/mycelium#224](https://github.com/LepistaBioinformatics/mycelium/issues/224)

## [2.0.0](https://github.com/LepistaBioinformatics/mycelium-sdk-js/compare/v1.0.0...v2.0.0) (2026-07-12)

### ⚠ BREAKING CHANGES

* package name changed from @mycelium/mycelium-sdk to
@lepistabioinformatics/mycelium-sdk.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>

### Miscellaneous Chores

* rename package scope to [@lepistabioinformatics](https://github.com/lepistabioinformatics) ([8d15d2d](https://github.com/LepistaBioinformatics/mycelium-sdk-js/commit/8d15d2d71b928dbad443ae6dbe8b179483e9e1d9))

## 1.0.0 (2026-07-12)

### Features

* add Express middleware adapter ([24ea288](https://github.com/LepistaBioinformatics/mycelium-sdk-js/commit/24ea288d358b5249142609bfa2beea7771f477fb))
* add Fastify plugin adapter ([32b7fcb](https://github.com/LepistaBioinformatics/mycelium-sdk-js/commit/32b7fcbdbabad9103535d6932ff7904b5885b073))
* add header key constants and configure vitest ([bfdb5dd](https://github.com/LepistaBioinformatics/mycelium-sdk-js/commit/bfdb5dd7c6ae6fdc4e957c65ac84039c6828cd66))
* add MyceliumError hierarchy and core primitive models ([aff387d](https://github.com/LepistaBioinformatics/mycelium-sdk-js/commit/aff387d51b036655d038fe202a1d76befb7a20a7))
* add Owner, LicensedResource, and LicensedResources models ([f021db4](https://github.com/LepistaBioinformatics/mycelium-sdk-js/commit/f021db48dc10fd508e256fecff8534d02b0ccc7b))
* add Profile schema and core fluent filter chain ([8e47edf](https://github.com/LepistaBioinformatics/mycelium-sdk-js/commit/8e47edf83698d412fd8eec58ccf0050d04e98dda))
* add TenantOwnership, TenantsOwnership, and RelatedAccounts models ([17ba069](https://github.com/LepistaBioinformatics/mycelium-sdk-js/commit/17ba0694301f31dc07cdbc229b2f72b50863025b))
* implement decodeAndDecompressProfileFromBase64 — P1 MVP complete ([9b5b39a](https://github.com/LepistaBioinformatics/mycelium-sdk-js/commit/9b5b39a7e611a5c054353dc924c6d245f94a4ff9))
