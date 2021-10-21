declare namespace codeExcerpt {
	interface Options {
		/**
		 * Number of surrounding lines to extract.
		 *
		 * @default 3
		 */
		readonly around?: number;
	}

	interface ExcerptLine {
		/**
		 * Line number
		 */
		readonly line: number;

		/**
		 * Line itself
		 */
		readonly value: string;
	}
}

/**
 * Extract code excerpts
 */
declare function codeExcerpt(
	/**
	 * Source code
	 */
	source: string,

	/**
	 * Line number to extract excerpt for.
	 */
	line: number,

	/**
	 * Options
	 */
	options?: codeExcerpt.Options
): codeExcerpt.ExcerptLine[] | undefined;

export = codeExcerpt;
