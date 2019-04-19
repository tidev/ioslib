import iosDevice from 'node-ios-device';

import { EventEmitter } from 'events';
import { tailgate } from 'appcd-util';

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
 * Exposes an event emitter for device changes and a method to stop tracking.
 */
export class TrackDeviceHandle extends EventEmitter {
	/**
	 * Wraps the ios-device handle.
	 *
	 * @param {Handle} handle - An ios-device track handle.
	 * @access public
	 */
	constructor(handle) {
		super();
		this.stop = () => handle.stop();
		handle.on('devices', devices => this.emit('devices', devices.map(d => new Device(d))));
		handle.on('error', err => this.emit('error', err));
	}
}

/**
 * Detects all attached devices.
 *
 * @returns {Promise<Array.<Object>>}
 */
export function getDevices() {
	return tailgate('ioslib:devices', async () => {
		const devices = await iosDevice.devices();
		return devices.map(d => new Device(d));
	});
}

/**
 * Starts listening for devices being connected or disconnected.
 *
 * @returns {TrackDeviceHandle}
 */
export function trackDevices() {
	return new TrackDeviceHandle(iosDevice.trackDevices());
}
