import iosDevice from 'node-ios-device';

/**
 * Device information.
 */
export class Device {
	/**
	 * Sets the device information.
	 *
	 * @param {Object} [info] - The device info.
	 * @access public
	 */
	constructor(info = {}) {
		Object.assign(this, info);
	}
}

/**
 * Detects all attached devices.
 *
 * @returns {Array.<Object>}
 */
export function list() {
	return iosDevice.list().map(d => new Device(d));
}

/**
 * Starts listening for devices being connected or disconnected.
 *
 * @returns {WatchDeviceHandle}
 */
export function watch() {
	const handle = iosDevice.watch();
	handle.on('change', devices => handle.emit('devices', devices.map(d => new Device(d))));
	return handle;
}
