const path = require('path');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    entry: './src/sdk/FileUploader.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'bundle.js',
      library: 'FileUploader',
      libraryTarget: 'umd',
      globalObject: 'this',
      publicPath: '/dist/',
      clean: true // 在每次构建前清理输出目录
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                "declaration": false
              }
            }
          }
        }
      ]
    },
    resolve: {
      extensions: ['.ts', '.js'],
      fallback: {
        "crypto": false
      }
    },
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    optimization: {
      minimize: isProduction
    },
    performance: {
      hints: isProduction ? "warning" : false
    }
  };
};