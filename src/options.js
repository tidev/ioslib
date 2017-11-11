/**
 * A list of options that can be changed by the parent program.
 * @type {Object}
 */
const options = {
	coreSimulatorDevicesDir: null,
	env: {
		path: null
	},
	executables: {
		security:    'security',
		xcodeSelect: 'xcode-select'
	},
	provisioningProfileDir: null,
	xcode: {
		searchPaths: null
	}
};

export default options;
