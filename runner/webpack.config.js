const path = require('path');

module.exports = {
  entry: '../src/runner.ts',
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
    filename: 'codeql-runner.js',
    path: path.resolve(__dirname, 'dist'),
  },
  optimization: {
		minimize: false
	},
};
