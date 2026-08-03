export interface INotice {
	title: string
	type: "always" | "once"
	content: string
	timestamp: number
	expired: number
}

export interface INoticesResponse {
	notices: INotice[]
}
