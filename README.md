# portainer-repull

A Firefox add-on that lists your Portainer stacks and redeploys one with a fresh image pull in a single click.

## What it does

- Lists every stack on your Portainer server, grouped by environment, with its status.
- Redeploys a stack with "Re-pull image and redeploy" turned on. Compose stacks are sent back with their current compose file, environment variables and prune setting. Git stacks are redeployed from their repository.
- Shows a browser notification with the result, so you can close the popup while the images download.

Login uses your Portainer username and password. The add-on keeps only the session token, in memory (`storage.session`), so restarting Firefox logs you out. Your password is never stored.

The add-on asks for access to your Portainer host when you save its address. Firefox ignores a port in a host permission, so the grant covers every port on that host. Nothing is sent anywhere else.

Tested with Portainer CE 2.45. Requires Firefox 140 or newer.

## Development

Requires Node 22 or newer.

```bash
npm install
npm run dev      # opens Firefox with the add-on loaded and reloads on change
npm test
npm run compile  # type check
npm run build    # writes .output/firefox-mv3
npm run lint     # web-ext lint on the build
```

To load a build by hand, open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on" and pick `.output/firefox-mv3/manifest.json`.

If Portainer uses a self-signed certificate, open it in a tab once and accept the certificate. The add-on's requests rely on that exception.

## License

MIT
