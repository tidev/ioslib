# 2.5.2 (Nov 7, 2019)

 * fix(simulator): Fixed watchOS sim semver ranges for device pair compatibility lookup and added a
   truthiness check in case we ever need to blacklist a version.
 * fix(simulator): Added `simctl` and `simualator` executables to simulator info handles.
 * fix(cli): Fixed simulator info to display generated data instead of just the unsorted sims.
 * fix(xcode): Fix Xcode sim runtime compatiblity lookup.
   [(TIMOB-27463)](https://jira.appcelerator.org/browse/TIMOB-27463)
 * chore: Updated dependencies.

# v2.5.1 (Aug 29, 2019)

 * fix: Added support for Apple developer certificates.
   [(TIMOB-27358)](https://jira.appcelerator.org/browse/TIMOB-27358)

# v2.5.0 (Aug 14, 2019)

 * feat: Added teamId to certificate info.
 * feat: Added info and reset-sims commands to ioslib CLI.
 * feat: Added coreSimulatorProfilesPaths to Xcode info object. (DAEMON-250)
 * feat(simulator): Added support for Xcode 11.
 * fix: Removed global simulator profiles directory from Xcode coreSimulatorProfilesPaths.
 * fix: Added new Xcode 11 simulator runtime and device types search paths.
 * fix(simulator): Added check for the existence of the simulator device directory before walking.

# v2.4.0 (Mar 29, 2019)

 * chore: Updated dependencies.

# v2.3.1 (Jan 25, 2019)

 * chore: Updated dependencies.

# v2.3.0 (Jan 16, 2019)

 * refactor: Upgraded to Gulp 4.
 * refactor: Refactored promises to use async/await.
 * fix: Added pluralize dependency since it was removed from snooplogg 2.
 * chore: Updated dependencies.

# v2.2.3 (Aug 6, 2018)

 * fix: Workaround for sim runtimes that have a bad version number in the runtime's
   `profile.plist`. [(DAEMON-259)](https://jira.appcelerator.org/browse/DAEMON-259)
 * refactor: Moved simctl path into executables under xcode info.

# v2.2.2 (Aug 6, 2018)

 * fix: Added path to global Xcode license file.
 * chore: Updated dependencies.

# v2.2.1 (Jun 11, 2018)

 * feat: Added the `ioslib detect-device-pairs` command.
 * chore: Updated the device pair compatibility table.
 * chore: Updated dependencies.

# v2.2.0 (Jun 5, 2018)

 * chore: Added Xcode 10 to device pair lookup.
   [(TIMOB-26089)](https://jira.appcelerator.org/browse/TIMOB-26089)

# v2.1.0 (May 30, 2018)

 * chore: Updated `ioslib` bin to use `cli-kit`'s help, version, and aliases.
 * chore: Updated dependencies.

# v2.0.7 (Apr 9, 2018)

 * chore: Updated dependencies.

# v2.0.6 (Dec 14, 2017)

 * fix: Fixed bug where extract teams from provisioning profiles would fail if any provisioning
   profiles didn't have any associated teams.
   [(DAEMON-209)](https://jira.appcelerator.org/browse/DAEMON-209)

# v2.0.5 (Dec 12, 2017)

 * chore: Updated dependencies.

# v2.0.4 (Dec 11, 2017)

 * fix: Fixed bug where a failure to parse a cert name would cause no certs to be found and an
   error to be thrown.

# v2.0.3 (Dec 6, 2017)

 * chore: Updated dependencies.

# v2.0.2 (Nov 22, 2017)

 * chore: Updated dependencies.

# v2.0.1 (Nov 17, 2017)

 * chore: Removed hard coded path that was used for debugging.

# v2.0.0 (Nov 17, 2017)

 * Initial release of the v2 rewrite.
 * Updated code to ES2015.
 * Support for detecting Xcode, iOS SDKs, simulators, devices, keychains, certs, provisioning
   profiles, and teams.
