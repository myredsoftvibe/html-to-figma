const path = require("path");
const { copySync } = require("fs-extra-promise");

function copyInfoToDist() {
  copySync("./info", "./dist", {
    overwrite: true,
    recursive: true
  });
}

copyInfoToDist();

module.exports = {
  optimization: {
    minimize: false
  },
  entry: {
    popup: path.join(__dirname, "src/popup/index.tsx"),
    inject: path.join(__dirname, "src/inject.ts"),
    background: path.join(__dirname, "src/background.ts")
  },
  output: {
    path: path.join(__dirname, "dist/js"),
    filename: "[name].js"
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          options: {
            // Force all files (including ../lib/**) to use this tsconfig
            // so the paths alias for @builder.io/html-to-figma is respected.
            configFile: path.resolve(__dirname, "tsconfig.json"),
            // Allow importing files outside rootDir (../lib)
            transpileOnly: false
          }
        },
        exclude: /node_modules/
      },
      {
        exclude: /node_modules/,
        test: /\.scss$/,
        use: [
          { loader: "style-loader" },
          { loader: "css-loader" },
          { loader: "sass-loader" }
        ]
      },
      {
        test: /\.(png|jpg|gif|webp|svg)$/,
        loader: [{ loader: "url-loader" }]
      }
    ]
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
    alias: {
      "@builder.io/html-to-figma": path.resolve(__dirname, "../lib/html-to-figma/index.ts")
    }
  }
};
