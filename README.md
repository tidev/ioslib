# iOS Utility Library

> This is a library of utilities for dealing programmatically with iOS applications,
used namely for tools like [Hyperloop](https://github.com/tidev/hyperloop)
and [Titanium SDK](https://github.com/tidev/titanium-sdk).

ioslib supports Xcode 6 and newer.

## Installation

From NPM:

	npm install ioslib

## Examples

### Detect all the connected iOS devices:

```javascript
var ioslib = require('ioslib');

ioslib.device.detect(function (err, devices) {
	if (err) {
		console.error(err);
	} else {
		console.log(devices);
	}
});
```

### Install an application on device

```javascript
var deviceUDID = null; // string or null to pick first device

ioslib.device.install(deviceUDID, '/path/to/name.app', 'com.company.appname')
	.on('installed', function () {
		console.log('App successfully installed on device');
	})
	.on('appStarted', function () {
		console.log('App has started');
	})
	.on('log', function (msg) {
		console.log('[LOG] ' + msg);
	})
	.on('appQuit', function () {
		console.log('App has quit');
	})
	.on('error', function (err) {
		console.error(err);
	});
```

### Launch the iOS Simulator

```javascript
ioslib.simulator.launch(null, function (err, simHandle) {
	console.log('Simulator launched');
	ioslib.simulator.stop(simHandle, function () {
		console.log('Simulator stopped');
	});
});
```

### Launch, install, and run an application on simulator

```javascript
var simUDID = null; // string or null to pick a simulator

ioslib.simulator.launch(simUDID, {
		appPath: '/path/to/name.app'
	})
	.on('launched', function (msg) {
		console.log('Simulator has launched');
	})
	.on('appStarted', function (msg) {
		console.log('App has started');
	})
	.on('log', function (msg) {
		console.log('[LOG] ' + msg);
	})
	.on('error', function (err) {
		console.error(err);
	});
```

### Force stop an application running on simulator

```javascript
ioslib.simulator.launch(simUDID, {
		appPath: '/path/to/name.app'
	})
	.on('launched', function (simHandle) {
		console.log('Simulator launched');
		ioslib.simulator.stop(simHandle).on('stopped', function () {
			console.log('Simulator stopped');
		});
	});
```

### Find a valid device/cert/provisioning profile combination

```javascript
ioslib.findValidDeviceCertProfileCombos({
	appId: 'com.company.appname'
}, function (err, results) {
	if (err) {
		console.error(err);
	} else {
		console.log(results);
	}
});
```

### Detect everything

```javascript
ioslib.detect(function (err, info) {
	if (err) {
		console.error(err);
	} else {
		console.log(info);
	}
});
```

### Detect iOS certificates

```javascript
ioslib.certs.detect(function (err, certs) {
	if (err) {
		console.error(err);
	} else {
		console.log(certs);
	}
});
```

### Detect provisioning profiles

```javascript
ioslib.provisioning.detect(function (err, profiles) {
	if (err) {
		console.error(err);
	} else {
		console.log(profiles);
	}
});
```

### Detect Xcode installations

```javascript
ioslib.xcode.detect(function (err, xcodeInfo) {
	if (err) {
		console.error(err);
	} else {
		console.log(xcodeInfo);
	}
});
```

## Running Tests

For best results, connect an iOS device.

To run all tests:

```
npm test
```

To see debug logging, set the `DEBUG` environment variable:

```
DEBUG=1 npm test
```

To run a specific test suite:

```
npm run-script test-certs

npm run-script test-device

npm run-script test-env

npm run-script test-ioslib

npm run-script test-provisioning

npm run-script test-simulator

npm run-script test-xcode
```

## Contributing

Interested in contributing? There are several ways you can help contribute to this project.

### New Features, Improvements, Bug Fixes, & Documentation

Source code contributions are always welcome! Before we can accept your pull request, you must sign a Contributor License Agreement (CLA). Please visit https://tidev.io/contribute for more information.

### Donations

Please consider supporting this project by making a charitable [donation](https://tidev.io/donate). The money you donate goes to compensate the skilled engineeers and maintainers that keep this project going.

### Code of Conduct

TiDev wants to provide a safe and welcoming community for everyone to participate. Please see our [Code of Conduct](https://tidev.io/code-of-conduct) that applies to all contributors.

## Security

If you find a security related issue, please send an email to [security@tidev.io](mailto:security@tidev.io) instead of publicly creating a ticket.

## Stay Connected

For the latest information, please find us on Twitter: [Titanium SDK](https://twitter.com/titaniumsdk) and [TiDev](https://twitter.com/tidevio).

Join our growing Slack community by visiting https://slack.tidev.io!

## Legal

Titanium is a registered trademark of TiDev Inc. All Titanium trademark and patent rights were transferred and assigned to TiDev Inc. on 4/7/2022. Please see the LEGAL information about using our trademarks, privacy policy, terms of usage and other legal information at https://tidev.io/legal.