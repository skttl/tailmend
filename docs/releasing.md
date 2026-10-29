# Releasing Tailmend

The package is prepared as `tailmend@0.1.0` for the public repository [skttl/tailmend](https://github.com/skttl/tailmend). Release preparation does not publish anything by itself.

## One-time repository setup

1. Put these files in the GitHub repository and commit both `package.json` and `package-lock.json`.
2. Keep the repository public. The workflow explicitly requests npm provenance, which requires a public source repository and a public package.
3. Enable GitHub Actions and let the CI workflow pass on the intended release commit.
4. Ensure the publishing npm account owns the package name and has two-factor authentication enabled. A missing package in a registry lookup does not guarantee the name can be registered.

There is no build step. The `files` allowlist includes only runtime modules and the CLI reference; npm also includes `package.json`, README and LICENSE. Tests, fixtures and workflows are excluded.

## First publication

npm trusted publishing is configured in an existing package's settings. For a new name, first publish a bootstrap prerelease interactively, then configure trusted publishing for the stable release. These commands publish a real public package, so run them only when you intend to create it.

From a clean checkout, after reviewing the package and passing the checks:

```sh
npm ci
npm test
npm run check:package
npm login
npm version 0.1.0-bootstrap.0 --no-git-tag-version
npm publish --access public --tag bootstrap
npm version 0.1.0 --no-git-tag-version
```

The bootstrap version uses a separate dist-tag and does not set `latest`. The last command restores the planned stable version in both package files; review the diff before committing. If publication fails, restore the version before continuing. No npm token needs to be stored in GitHub.

If the package already exists under your account, skip the bootstrap and configure its trusted publisher directly.

## Configure npm trusted publishing

In the npm package settings, add a GitHub Actions trusted publisher with these exact values:

| Setting | Value |
| --- | --- |
| Organization or user | `skttl` |
| Repository | `tailmend` |
| Workflow filename | `release.yml` |
| Environment | Leave empty; the workflow does not use a GitHub environment. |
| Allowed actions | Enable direct `npm publish`. |

This workflow publishes directly. A configuration that allows only staged publishing will not work. Complete the first successful trusted publish within npm's configuration expiry window, currently two days, or recreate the configuration.

The workflow uses a GitHub-hosted runner, Node.js 24, `id-token: write` and npm OIDC authentication. Trusted publishing requires npm 11.5.1+; Node.js 24 supplies a compatible npm version. Do not add `NODE_AUTH_TOKEN` or an `NPM_TOKEN` secret for this workflow.

The `repository.url` in `package.json` must match the repository. If ownership or repository name changes, update the package metadata, release guard and trusted publisher settings together.

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and [provenance requirements](https://docs.npmjs.com/generating-provenance-statements/).

## Publish 0.1.0

1. Confirm that the restored package and lockfile version is `0.1.0`.
2. Review `CHANGELOG.md` and run `npm test` and `npm run check:package`.
3. Commit and push the release files. Wait for CI on Linux/Windows and Node.js 22/24 to pass.
4. Create and push the tag `v0.1.0` on that commit.
5. Publish a regular GitHub Release for `v0.1.0`. Copy the changelog entry into its release notes.

Publishing the GitHub Release starts `.github/workflows/release.yml`. Pushing a tag alone does not publish to npm. Draft releases do not publish, and releases marked as prereleases are skipped.

The workflow checks out the tag, verifies that it matches the package version and repository, installs locked dependencies, runs integration and packaged-install checks, then publishes to npm with provenance and the `latest` dist-tag.

After a successful run, verify the registry:

```sh
npm view tailmend@0.1.0 version dist-tags --json
```

Check the provenance link on the npm package page and try installation in a separate Tailwind CSS 4 project.

## Later versions

From a clean checkout, choose the appropriate version bump:

```sh
npm version patch --no-git-tag-version
```

Update the changelog, commit both package files, and repeat the tagged GitHub Release process with the new version.

Only stable `vMAJOR.MINOR.PATCH` tags are supported by this workflow. Prerelease automation, automatic version bumps and automatic changelog generation are intentionally omitted.

## Failed releases

Read the first failing step before retrying. Tag/version mismatches, incorrect trusted publisher settings and an expired publisher configuration must be fixed before publishing can succeed.

npm versions cannot be overwritten. If publication succeeded but a later check failed, verify the registry before retrying. If the package needs a correction, prepare a new version rather than reusing a published version.

Do not move an already published tag. Fix and version the package again.
