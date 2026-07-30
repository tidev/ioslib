/**
 * A lookup table of valid iOS Simulator -> Watch Simulator pairings.
 *
 * This table MUST be maintained!
 *
 * The actual device pairing is done by the CoreSimulator private framework.
 * I have no idea how it determines what iOS Simulators are compatible with
 * what Watch Simulator. It's a mystery!
 */
export const simulatorDevicePairCompatibility = {
	'15.x': {
		// Xcode 15.x
		'13.x': {
			// iOS 13.x
			'7.x': true, // watchOS 7.x
			'8.x': true, // watchOS 8.x
			'9.x': true, // watchOS 9.x
			'10.x': true, // watchOS 10.x
		},
		'14.x': {
			// iOS 14.x
			'7.x': true, // watchOS 7.x
			'8.x': true, // watchOS 8.x
			'9.x': true, // watchOS 9.x
			'10.x': true, // watchOS 10.x
		},
		'15.x': {
			'7.x': true, // watchOS 7.x
			'8.x': true, // watchOS 8.x
			'9.x': true, // watchOS 9.x
			'10.x': true, // watchOS 10.x
		},
		'16.x': {
			'7.x': true, // watchOS 7.x
			'8.x': true, // watchOS 8.x
			'9.x': true, // watchOS 9.x
			'10.x': true, // watchOS 10.x
		},
		'17.x': {
			'7.x': true, // watchOS 7.x
			'8.x': true, // watchOS 8.x
			'9.x': true, // watchOS 9.x
			'10.x': true, // watchOS 10.x
		},
	},
	'16.x': {
		// Xcode 16.x
		'15.x': {
			// iOS 15.x
			'8.x': true, // watchOS 8.x
			'9.x': true, // watchOS 9.x
			'10.x': true, // watchOS 10.x
			'11.x': true, // watchOS 11.x
		},
		'16.x': {
			// iOS 16.x
			'8.x': true, // watchOS 8.x
			'9.x': true, // watchOS 9.x
			'10.x': true, // watchOS 10.x
			'11.x': true, // watchOS 11.x
		},
		'17.x': {
			// iOS 18.x
			'8.x': true, // watchOS 8.x
			'9.x': true, // watchOS 9.x
			'10.x': true, // watchOS 10.x
			'11.x': true, // watchOS 11.x
		},
		'18.x': {
			// iOS 18.x
			'8.x': true, // watchOS 8.x
			'9.x': true, // watchOS 9.x
			'10.x': true, // watchOS 10.x
			'11.x': true, // watchOS 11.x
		},
	},
	'26.x': {
		// Xcode 26.x
		'17.x': {
			// iOS 17.x
			'9.x': true, // watchOS 9.x
			'10.x': true, // watchOS 10.x
			'11.x': true, // watchOS 11.x
			'26.x': true, // watchOS 26.x
		},
		'18.x': {
			// iOS 18.x
			'9.x': true, // watchOS 9.x
			'10.x': true, // watchOS 10.x
			'11.x': true, // watchOS 11.x
			'26.x': true, // watchOS 26.x
		},
		'26.x': {
			// iOS 26.x
			'9.x': true, // watchOS 9.x
			'10.x': true, // watchOS 10.x
			'11.x': true, // watchOS 11.x
			'26.x': true, // watchOS 26.x
		},
	},
	'27.x': {
		// Xcode 27.x
		'26.x': {
			// iOS 26.x
			'26.x': true, // watchOS 26.x
			'27.x': true, // watchOS 27.x
		},
		'27.x': {
			// iOS 27.x
			'26.x': true, // watchOS 26.x
			'27.x': true, // watchOS 27.x
		},
	},
};
