set shell := ["bash", "-euo", "pipefail", "-c"]

# Show available recipes grouped by workflow.
[group('Help')]
default:
    just --list

# List recipe groups.
[group('Help')]
groups:
    just --groups --unsorted

# Start the TanStack Start console dev server.
[group('Development')]
dev:
    vp -C apps/console dev

# Build the console app.
[group('Development')]
build:
    vp -C apps/console build

# Run every package's test suite.
[group('Quality')]
test:
    vp run -r test

# Run the workspace linter.
[group('Quality')]
lint:
    vp lint

# Check formatting across packages.
[group('Quality')]
fmt-check:
    vp fmt --check

# Format the workspace.
[group('Quality')]
fmt:
    vp fmt --write

# Run the normal local handoff checks (fmt, lint, typecheck, test).
[group('Quality')]
check:
    vp check
    vp run -r test

# Run console tests.
[group('Packages')]
test-console:
    vp -C apps/console test run

# Run core package tests.
[group('Packages')]
test-core:
    vp -C packages/core test run

# Run provider package tests.
[group('Packages')]
test-providers:
    vp -C packages/providers test run

# Run destination package tests.
[group('Packages')]
test-destinations:
    vp -C packages/destinations test run

# Scaffold a destination adapter directory (see docs/contributing/destination-adapter.md).
[group('Destinations')]
new-destination kind *args:
    node scripts/new-destination-adapter.mjs {{kind}} {{args}}

# Build the image, bring the stack up, wait for readiness, tear it down.
# Slow on purpose (it builds an image) so it stays out of the fast CI gate.
[group('Docker')]
docker-smoke:
    bash scripts/docker-smoke.sh

# Build and push a multi-platform image.
[group('Docker')]
docker-buildx image tag:
    docker buildx build \
        --platform "linux/amd64,linux/arm64" \
        --tag "{{ image }}:{{ tag }}" \
        --push \
        .

# Tag a local image for a registry.
[group('Docker')]
docker-tag source image tag:
    docker tag "{{ source }}" "{{ image }}:{{ tag }}"

# Push a tagged local image.
[group('Docker')]
docker-push image tag:
    docker push "{{ image }}:{{ tag }}"
