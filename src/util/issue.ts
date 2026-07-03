export class Issue extends Error {
	id: string;
	type: 'error' | 'warning';
	details?: string;

	constructor(
		message: string,
		options: {
			id: string;
			type: 'error' | 'warning';
			details?: string;
		}
	) {
		super(message);
		this.id = options.id;
		this.type = options.type;
		this.details = options.details;
	}
}
