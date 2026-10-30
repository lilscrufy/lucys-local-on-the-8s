# Install on an LG TV

This is a Developer Mode install of the same static app in `app/`. It has been
tested on an LG C3. Other models and older webOS browsers need verification.

## You need

- An LG webOS TV and computer on the same local network.
- A free LG Developer account and the **Developer Mode** app on the TV.
- Node.js and npm. [LG recommends Node 14.15.1–16.20.2 for its CLI](https://webostv.developer.lge.com/develop/tools/cli-installation).
- This repository cloned locally.

## Prepare the TV

1. Install **Developer Mode** from LG Apps, sign in, enable Dev Mode, and let
   the TV reboot.
2. Reopen Developer Mode, turn on **Key Server**, and note the TV's IP address
   and the passphrase shown there.
3. Keep the TV on the same network as your computer. Developer Mode sessions
   expire; renew the session in the TV app to keep sideloaded apps installed.

LG's [Developer Mode guide](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app)
has the current TV screen instructions.

## Pair and install

In a terminal on the computer:

```sh
npm install -g @webos-tools/cli
ares -V
ares-setup-device
```

Add a device with a name you choose (the commands below use `tv`), the TV's
current IP address, port `9922`, SSH user `prisoner`, and a blank password.
Then retrieve its key and enter the passphrase shown on the TV:

```sh
ares-novacom --device tv --getkey
ares-setup-device --list
```

From the repository root, package the app without minification, then install
the exact filename printed by `ares-package`:

```sh
ares-package --no-minify -e ".DS_Store" ./app
ares-install --device tv ./com.lilscrufy.retro-weather_0.1.1_all.ipk
ares-launch --device tv com.lilscrufy.retro-weather
```

The filename shown is for the current `app/appinfo.json` version. If it changes,
use the new package filename. The resulting `.ipk` is ignored by Git.

On first launch, focus the ZIP field, enter a US five-digit ZIP using the TV's
native keyboard, move focus to **Tune In**, and press OK. Sound requires an
explicit interaction.

## Troubleshooting

- **Connection fails:** check the IP address, same-network connection, Dev Mode,
  Key Server, and session time. Repeat `ares-novacom --device tv --getkey` if the
  TV key changed.
- **CLI says `isDate is not a function`:** use LG's recommended Node version;
  this has occurred with newer Node releases.
- **App loads without live data:** check the TV internet connection. The app
  uses public HTTPS endpoints and can fall back to cached or demo weather.
- **Need logs:** run `ares-inspect --device tv com.lilscrufy.retro-weather`.

See LG's [CLI guide](https://webostv.developer.lge.com/develop/tools/cli-dev-guide)
for full command reference.
