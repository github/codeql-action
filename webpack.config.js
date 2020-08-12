const path = require('path');

module.exports = {
  entry: './src/cli.ts',
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  target: 'node',
  resolve: {
    extensions: [ '.ts', '.js' ],
  },
  output: {
    filename: 'code-scanning-cli.js',
    path: path.resolve(__dirname, 'cli'),
  },
  optimization: {
		minimize: false
	},
};
