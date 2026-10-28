# EasyTier portable core for LinAI

EasyTier is run as a separate process. LinAI does not link against its libraries.
EasyTier copyright belongs to the EasyTier contributors; its license is LGPL-3.0,
with GPL-3.0 incorporated by reference. Both license texts are included here.
Users may replace the independently executable EasyTier programs with compatible
modified versions; update manifest.json with the replacement files' SHA-256 values.
This does not restrict users' modification or reverse engineering rights under LGPL.

## Corresponding source

- Upstream: https://github.com/EasyTier/EasyTier
- Fixed commit: `6487a5e4638ef9129909c062722142928645adaf`
- Version: `2.7.0` development snapshot, independently compiled for LinAI.
- This is NOT the v2.6.4 or v2.7.0 official Windows release binary.
- Source archive: `EasyTier-2.7.0-linai-gateway1.6487a5e-source.zip`, stored in the LinAI
  repository under `release-resources/easytier/`. It is not included in the LinAI ZIP
  or required to run LinAI. It contains the modified upstream source,
  Cargo.lock, local build instructions and any necessary patches. Unused upstream
  precompiled DLL/SYS/LIB artifacts are excluded; no Npcap binary is redistributed.
- Upstream source reference:
  https://github.com/EasyTier/EasyTier/tree/6487a5e4638ef9129909c062722142928645adaf
- The build fetches dependencies at Cargo.lock's exact versions/checksums and git
  revisions. Third-party license texts and source references accompany the source
  archive. Cargo registries and fixed git repositories provide dependency source.

## Build configuration

Windows x64 (`x86_64-pc-windows-gnu`), Rust 1.95.0, MinGW-w64 GCC from
w64devkit 2.10.1, protoc 36.2. No system installation is needed to use the resulting programs.
The `build-portable.ps1` file accepts local source, portable Rust, GCC and protoc
directories. It also supplies Rust's own `libgcc_eh.a`, absent from w64devkit.
Release LTO is disabled and codegen-units is 8. Source patches change
`easytier-core/Cargo.toml` crate-type from `["rlib", "cdylib"]` to `["rlib"]`
and include the `smoltcp` feature in the native host's `proxy_enabled` capability
in `easytier/src/instance/config.rs`. This activates the existing inbound packet
proxy for no-tun TCP forwarding without enabling KCP, QUIC or raw ICMP. No wire
protocol or authentication changes are made. Patched sources and PATCHES.md are
included in the source archive; the unused shared library is not built.

```
cargo +1.95.0-x86_64-pc-windows-gnu build --release --locked --no-default-features --features cli,smoltcp,socks5,tcp-hole-punch,aes-gcm,endpoint-discovery --package easytier --bin easytier-core --bin easytier-cli --target x86_64-pc-windows-gnu
```

Default features are disabled. The build keeps the native CLI, management RPC,
TCP/UDP peer transports, authenticated AES-GCM, endpoint discovery, Secure Mode
credentials and user-space TCP forwarding.
The upstream `socks5` feature activates the gateway lifecycle needed by TCP port
forwarding; `smoltcp` alone compiles the stack without starting that gateway.
LinAI configures only its fixed TCP forward and never enables a SOCKS listener.
It excludes TUN, fake TCP / packet capture, system DNS, UPnP, WireGuard,
KCP, QUIC and WebSocket feature sets. LinAI generates restrictive no-tun settings
and ACLs; it does not install services/drivers or change firewall or system routing.
The upstream optional Windows broadcast implementation is never enabled by LinAI.

Compiler distribution reference:
https://github.com/skeeto/w64devkit/releases/tag/v2.10.1
`w64devkit-x64-2.10.1.7z.exe` SHA-256:
`add1edf984ce4d473cfeb7c52e0ab38db73a855bba6c7f564d5e16648eb2896a`

protoc reference: https://github.com/protocolbuffers/protobuf/releases/tag/v36.2
`protoc-36.2-win64.zip` SHA-256:
`f0c128dc0d8492eceece83bb459a4c0e316764b929ffbf1aa416357fd644edd3`

Rust standard library source and runtime notices:
https://github.com/rust-lang/rust/tree/59807616e1fa2540724bfbac14d7976d7e4a3860/library
MinGW-w64 runtime notices are included in `LICENSE-MINGW.txt`.
The source archive includes dependency crate source archives, fixed git dependency
source checkouts and Rust runtime license notices for redistribution and rebuilding.

## Integrity and lifecycle

`manifest.json` records fixed source identity, build parameters and SHA-256 of all
packaged runtime files in `files`. The application checks only those files before
launching the core and CLI. `correspondingSource` records the repository source archive
name, byte size and SHA-256, binding it to this exact core version and commit.
The release script verifies both runtime files and the source archive before
packaging. No core or source downloads occur at runtime.
`watch-parent.ps1` is LinAI's small process cleanup helper, not part of EasyTier.
No MCTier source or MCTier signaling implementation is included.

## Obtaining source and redistribution

The corresponding source is kept in the LinAI project, not emitted by the build
or uploaded as a Release attachment. Open https://github.com/libudu/LinAI and
select the tag matching your LinAI release, then open:

`release-resources/easytier/EasyTier-2.7.0-linai-gateway1.6487a5e-source.zip`

Use the file's download action to obtain the archive. The LinAI Release notes
also link to this file at the matching tag. Verify it against `manifest.json` ->
`correspondingSource` (SHA-256 and size). For a local checkout, the same path
contains the archive directly. Both private and public builds use this source.

When distributing the program, keep this exact source archive accessible at no
further charge and provide clear directions alongside the program to its download
location (GPLv3 section 6(d), incorporated by LGPLv3). Preserve the source,
dependency source, licenses and build instructions. A local-only copy inaccessible
to recipients does not provide source access; distributors using another repository
or download site must provide an accessible source location for their recipients.
