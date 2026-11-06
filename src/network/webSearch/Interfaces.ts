export type WebSearchRequest = {
	query: string;
	limit?: number;
};

export type WebSearchResult = {
	rank: number;
	engine: string;
	title: string;
	url: string;
	snippet: string;
};

export interface IWebSearchAdapter {
	search(request: WebSearchRequest): Promise<WebSearchResult[]>;
}
