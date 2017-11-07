import iosDevice from 'node-ios-device';

import { EventEmitter } from 'events';
import { mutex } from 'appcd-util';

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
		handle.on('devices', devices => this.emit('devices', devices));
		handle.on('error', err => this.emit('error', err));
	}
}

/**
 * Detects all attached devices.
 *
 * @returns {Promise<Array.<Object>>}
 */
export function getDevices() {
	return mutex('ioslib/devices', () => new Promise((resolve, reject) => {
		iosDevice.devices((err, devices) => {
			return err ? reject(err) : resolve(devices);
		});
	}));
}

/**
 * Starts listening for devices being connected or disconnected.
 *
 * @returns {TrackDeviceHandle}
 */
export function trackDevices() {
	return new TrackDeviceHandle(iosDevice.trackDevices());
}
