/**
 * A list of options that can be changed by the parent program.
 * @type {Object}
 */
const options = {
	env: {
		path: null
	},
	executables: {
		security:    'security',
		xcodeSelect: 'xcode-select'
	},
	provisioning: {
		path: null
	},
	simulator: {
		devicesDir: null
	},
	xcode: {
		searchPaths: null
	}
};

export default options;
