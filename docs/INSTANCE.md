# Intent Linux instance

Intent bundles its React frontend, HTTP/API server, agent middleware, TinyBase database engine and Node runtime. No Docker, npm install, external database or system Node is required on the destination. AI inference still needs network access and your configured provider key.

## Run

Extract the archive, then create a private instance directory:

```sh
mkdir -m 700 "$HOME/intent-home"
cp config.env.example "$HOME/intent-home/config.env"
chmod 600 "$HOME/intent-home/config.env"
# Edit config.env and set your model key, host and port.
./intent run "$HOME/intent-home"
```

For background operation use `./intent start "$HOME/intent-home"`; inspect `server.log`, `./intent status "$HOME/intent-home"`, and `curl http://127.0.0.1:5199/healthz`. Stop with `./intent stop "$HOME/intent-home"`. Start reports a request, not readiness: healthz verifies startup. For automatic restart use a systemd service with `ExecStart=/absolute/path/intent run /absolute/path/instance`, `Restart=on-failure`, and a dedicated unprivileged user.

Each instance directory owns config.env, data/store.json, the session signing key, logs and its process lock. Multiple instances require different directories AND ports. Data is persisted by TinyBase table snapshots, atomically replaced and fsynced before mutations complete. Nested agent payloads are JSON cells. Existing legacy JSON data is migrated on first access with an exclusive .legacy-backup copy; keep that backup. Database access remains server-side behind signed sessions. There is no public database sync endpoint.

Stop before moving or backing up an instance. Move the entire instance directory to retain sessions and data; the application package can live elsewhere. Do not share one database between processes. A crash may leave process.json; after verifying the process is dead, remove that lock before restarting. Normal shutdown removes it. The launcher validates Linux process start time before stop/status to avoid signaling a recycled PID.

## Cloud and compatibility

This is process-level packaging, not an OS sandbox or virtual machine. It does not isolate untrusted code, impose CPU/memory quotas or replace tenant security. The application currently serves browser sessions, not authenticated named cloud accounts; put it behind authenticated HTTPS ingress before exposing it to the internet. Configure INTENT_PUBLIC_ORIGIN to the external HTTPS origin and HOST=0.0.0.0 only when your ingress/firewall is ready.

Archives are architecture-specific. Build with `npm run package:linux` on the target Linux architecture. build.json records Node and build-host glibc; destination must support that Node binary and its system libraries. Alpine/musl and other architectures are not covered by the x64 glibc artifact. This release does not claim to run on every Linux distribution. System shell and compatible Linux libraries are prerequisites.

The archive deliberately excludes provider credentials, user data, node_modules and development tools. The server dependencies are bundled at build time. Runtime data and logs are not included in the distributable. For an offline scripted smoke test explicitly set INTENT_PROVIDER=fake; that is not real AI inference.
