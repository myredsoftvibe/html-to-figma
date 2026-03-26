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
        exclude: /node_modules/,
        test: /\.tsx?$/,
        use: "ts-loader"
      },
      {
        exclude: /node_modules/,
        test: /\.scss$/,
        use: [
          {
            loader: "style-loader"
          },
          {
            loader: "css-loader"
          },
          {
            loader: "sass-loader"
          }
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
      // Point to the local lib so our fetchImagesInLayers changes are picked up
      // instead of the published npm package.
      "@builder.io/html-to-figma": path.resolve(__dirname, "../lib/html-to-figma/index.ts")
    }
  }
};
