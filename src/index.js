/* istanbul ignore if */
if (!Error.prepareStackTrace) {
	require('source-map-support/register');
}

export { default as options } from './options';

import * as certs from './certs';
import * as devices from './devices';
import * as keychains from './keychains';
import * as provisioning from './provisioning';
import * as simulator from './simulator';
import * as teams from './teams';
import * as xcode from './xcode';

export {
	certs,
	devices,
	keychains,
	provisioning,
	simulator,
	teams,
	xcode
};
