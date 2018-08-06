# v2.2.3 (Aug 6, 2018)

 * Workaround for sim runtimes that have a bad version number in the runtime's `profile.plist`
   [(DAEMON-259)](https://jira.appcelerator.org/browse/DAEMON-259).
 * Moved simctl path into executables under xcode info.

# v2.2.2 (Aug 6, 2018)

 * Added path to global Xcode license file.
 * Updated npm dependencies.

# v2.2.1 (Jun 11, 2018)

 * Added the `ioslib detect-device-pairs` command.
 * Updated the device pair compatibility table.
 * Updated npm dependencies.

# v2.2.0 (Jun 5, 2018)

 * Added Xcode 10 to device pair lookup
   [(TIMOB-26089)](https://jira.appcelerator.org/browse/TIMOB-26089).

# v2.1.0 (May 30, 2018)

 * Updated npm dependencies.
   - Update node-ios-device to 1.6.1 which includes Node 10 support.
 * Updated `ioslib` bin to use `cli-kit`'s help, version, and aliases.

# v2.0.7 (Apr 9, 2018)

 * Updated npm dependencies.

# v2.0.6 (Dec 14, 2017)

 * Fixed bug where extract teams from provisioning profiles would fail if any provisioning profiles
   didn't have any associated teams [(DAEMON-209)](https://jira.appcelerator.org/browse/DAEMON-209).

# v2.0.5 (Dec 12, 2017)

 * Updated to node-ios-device@1.5.0 which added support for Node.js 9.

# v2.0.4 (Dec 11, 2017)

 * Fixed bug where a failure to parse a cert name would cause no certs to be found and an error to
   be thrown.

# v2.0.3 (Dec 6, 2017)

 * Updated npm dependencies to GA release of `appcd-*` packages.

# v2.0.2 (Nov 22, 2017)

 * Updated npm dependencies.

# v2.0.1 (Nov 17, 2017)

 * Removed hard coded path that was used for debugging.

# v2.0.0 (Nov 17, 2017)

 * Initial release of the v2 rewrite.
 * Updated code to ES2015.
 * Support for detecting Xcode, iOS SDKs, simulators, devices, keychains, certs, provisioning
   profiles, and teams.
